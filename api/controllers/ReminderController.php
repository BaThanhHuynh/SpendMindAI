<?php
/* ==========================================================================
   SPENDMINDAI - REMINDER CONTROLLER
   Notification settings, Zalo API reminders, Lazy Cron and System Cron scheduling
   ========================================================================== */

require_once __DIR__ . '/../services/ZaloService.php';
require_once __DIR__ . '/../services/MailerService.php';
require_once __DIR__ . '/../services/WebPushService.php';

class ReminderController {
    private ?PDO $pdo;
    private string $appUrl;

    public function __construct(?PDO $pdo, string $appUrl) {
        $this->pdo = $pdo;
        $this->appUrl = $appUrl;
    }

    /**
     * Self-healing migration: dynamically ensure columns and tables exist on MySQL.
     */
    private function ensureZaloColumns(): void {
        if (!$this->pdo) return;
        static $ensured = false;
        if ($ensured) return;

        $columnsToAdd = [
            'zalo_phone' => "ALTER TABLE `users` ADD COLUMN `zalo_phone` VARCHAR(20) NULL DEFAULT NULL",
            'zalo_user_id' => "ALTER TABLE `users` ADD COLUMN `zalo_user_id` VARCHAR(50) NULL DEFAULT NULL",
            'zalo_notifications' => "ALTER TABLE `users` ADD COLUMN `zalo_notifications` TINYINT(1) DEFAULT 0",
            'app_notifications' => "ALTER TABLE `users` ADD COLUMN `app_notifications` TINYINT(1) DEFAULT 1",
            'last_app_reminder_sent' => "ALTER TABLE `users` ADD COLUMN `last_app_reminder_sent` DATE NULL DEFAULT NULL"
        ];

        foreach ($columnsToAdd as $colName => $alterSql) {
            try {
                $check = $this->pdo->query("SHOW COLUMNS FROM `users` LIKE '{$colName}'");
                $existing = $check ? $check->fetchAll(PDO::FETCH_ASSOC) : [];
                if (empty($existing)) {
                    $this->pdo->exec($alterSql);
                }
            } catch (Throwable $e) {
                // Non-fatal permission limitation or already added
                error_log("ensureZaloColumns notice for {$colName}: " . $e->getMessage());
            }
        }

        // Ensure push_subscriptions table exists for Web Push notifications
        try {
            $this->pdo->exec("
                CREATE TABLE IF NOT EXISTS `push_subscriptions` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `user_id` INT NOT NULL,
                    `endpoint` VARCHAR(500) NOT NULL UNIQUE,
                    `p256dh` VARCHAR(255) NOT NULL,
                    `auth` VARCHAR(100) NOT NULL,
                    `user_agent` VARCHAR(255) NULL DEFAULT NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX `idx_push_user` (`user_id`),
                    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ");
        } catch (Throwable $e) {
            error_log("ensurePushSubscriptionsTable notice: " . $e->getMessage());
        }

        $ensured = true;
    }

    /**
     * Get user notification & reminder settings (Zalo, App & Email).
     */
    public function getSettings(int $userId): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM `users` WHERE id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendError("Không tìm thấy người dùng", 404);
                return;
            }

            sendJson([
                "success" => true,
                "email" => $user['email'] ?? '',
                "google_id" => $user['google_id'] ?? null,
                "reminder_time" => !empty($user['reminder_time']) ? substr($user['reminder_time'], 0, 5) : '',
                "email_notifications" => intval($user['email_notifications'] ?? 0),
                "zalo_phone" => $user['zalo_phone'] ?? '',
                "zalo_user_id" => $user['zalo_user_id'] ?? '',
                "zalo_notifications" => intval($user['zalo_notifications'] ?? 0),
                "app_notifications" => intval($user['app_notifications'] ?? 1),
                "avatar_url" => $user['avatar_url'] ?? null
            ]);
        } catch (Throwable $e) {
            error_log("getSettings error: " . $e->getMessage());
            sendError("Lỗi hệ thống khi tải cài đặt nhắc nhở: " . $e->getMessage(), 500);
        }
    }

    /**
     * Save user notification & reminder settings with Zalo phone validation.
     */
    public function saveSettings(int $userId, array $input): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        // 1. Validate Email (preserved for profile integrity)
        $email = isset($input['email']) ? trim((string)$input['email']) : '';
        if (!empty($email) && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendError("Địa chỉ email không hợp lệ", 400);
            return;
        }

        // 2. Validate Zalo Phone & Notifications
        $zaloPhone = isset($input['zalo_phone']) ? trim((string)$input['zalo_phone']) : '';
        $zaloUserId = isset($input['zalo_user_id']) ? trim((string)$input['zalo_user_id']) : '';
        $zaloNotifications = !empty($input['zalo_notifications']) ? 1 : 0;
        $emailNotifications = !empty($input['email_notifications']) ? 1 : 0;
        $appNotifications = isset($input['app_notifications']) ? (!empty($input['app_notifications']) ? 1 : 0) : null;

        if ($zaloNotifications === 1 && empty($zaloPhone) && empty($zaloUserId)) {
            sendError("Vui lòng nhập Số điện thoại Zalo để nhận tin nhắn nhắc nhở", 400);
            return;
        }

        if (!empty($zaloPhone)) {
            if (!ZaloService::isValidVietnamesePhone($zaloPhone)) {
                sendError("Số điện thoại Zalo không hợp lệ. Vui lòng nhập số điện thoại Việt Nam 10 chữ số (VD: 0912345678)", 400);
                return;
            }
        }

        // 3. Validate Reminder Time (HH:MM)
        $reminderTime = null;
        if (!empty($input['reminder_time'])) {
            $rawTime = trim((string)$input['reminder_time']);
            if (preg_match('/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/', $rawTime, $matches)) {
                $hours = intval($matches[1]);
                $minutes = intval($matches[2]);
                if ($hours >= 0 && $hours <= 23 && $minutes >= 0 && $minutes <= 59) {
                    $reminderTime = sprintf('%02d:%02d:00', $hours, $minutes);
                } else {
                    sendError("Thời gian nhắc nhở không hợp lệ (Giờ 00-23, Phút 00-59)", 400);
                    return;
                }
            } else {
                sendError("Định dạng giờ nhắc nhở không hợp lệ (HH:MM)", 400);
                return;
            }
        }

        try {
            // Check unique email constraint if email changed
            if (!empty($email)) {
                $stmt = $this->pdo->prepare("SELECT id FROM `users` WHERE email = :email AND id != :id");
                $stmt->execute([':email' => $email, ':id' => $userId]);
                if ($stmt->fetch()) {
                    sendError("Địa chỉ email này đã được sử dụng bởi tài khoản khác", 409);
                    return;
                }
            }

            // Detect existing table columns dynamically for maximum database resilience
            $colsStmt = $this->pdo->query("SHOW COLUMNS FROM `users`");
            $tableCols = $colsStmt ? $colsStmt->fetchAll(PDO::FETCH_COLUMN) : [];

            $setClauses = [
                "reminder_time = :rtime",
                "last_reminder_sent = NULL"
            ];
            if (in_array('last_app_reminder_sent', $tableCols)) {
                $setClauses[] = "last_app_reminder_sent = NULL";
            }
            $params = [
                ':rtime' => $reminderTime,
                ':id' => $userId
            ];

            if (in_array('zalo_phone', $tableCols)) {
                $setClauses[] = "zalo_phone = :zphone";
                $params[':zphone'] = !empty($zaloPhone) ? $zaloPhone : null;
            }
            if (in_array('zalo_user_id', $tableCols)) {
                $setClauses[] = "zalo_user_id = :zuid";
                $params[':zuid'] = !empty($zaloUserId) ? $zaloUserId : null;
            }
            if (in_array('zalo_notifications', $tableCols)) {
                $setClauses[] = "zalo_notifications = :znotif";
                $params[':znotif'] = $zaloNotifications;
            }
            if ($appNotifications !== null && in_array('app_notifications', $tableCols)) {
                $setClauses[] = "app_notifications = :appnotif";
                $params[':appnotif'] = $appNotifications;
            }
            if (in_array('email_notifications', $tableCols)) {
                $setClauses[] = "email_notifications = :enotif";
                $params[':enotif'] = $emailNotifications;
            }
            if (!empty($email)) {
                $setClauses[] = "email = :email";
                $params[':email'] = $email;
            }

            $sql = "UPDATE `users` SET " . implode(", ", $setClauses) . " WHERE id = :id";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);

            sendJson([
                "success" => true, 
                "message" => "Cài đặt nhắc nhở qua Zalo đã được lưu thành công"
            ]);
        } catch (Throwable $e) {
            error_log("saveSettings error: " . $e->getMessage());
            sendError("Lỗi lưu cấu hình nhắc nhở: " . $e->getMessage(), 500);
        }
    }

    /**
     * Dispatch an immediate test reminder message via Zalo to verify customer setup.
     */
    public function testZaloReminder(int $userId, array $input = []): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM `users` WHERE id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendError("Không tìm thấy người dùng", 404);
                return;
            }

            // Priority: target phone from request input, fallback to saved DB record
            $target = '';
            if (!empty($input['zalo_phone'])) {
                $target = trim((string)$input['zalo_phone']);
            } elseif (!empty($user['zalo_phone'])) {
                $target = trim((string)$user['zalo_phone']);
            } elseif (!empty($user['zalo_user_id'])) {
                $target = trim((string)$user['zalo_user_id']);
            }

            if (empty($target)) {
                sendError("Vui lòng nhập Số điện thoại Zalo trước khi gửi thử nghiệm.", 400);
                return;
            }

            if (!ZaloService::isValidVietnamesePhone($target)) {
                sendError("Số điện thoại Zalo không hợp lệ. Vui lòng nhập số điện thoại Việt Nam 10 chữ số (VD: 0912345678)", 400);
                return;
            }

            $reminderTime = !empty($user['reminder_time']) ? substr($user['reminder_time'], 0, 5) : date('H:i');
            $result = ZaloService::sendReminder($target, $user['username'], $reminderTime, $this->appUrl, true);

            sendJson([
                "success" => $result['success'],
                "simulated" => $result['simulated'] ?? false,
                "channel" => $result['channel'] ?? 'personal',
                "zalo_link" => $result['zalo_link'] ?? ("https://zalo.me/" . ZaloService::normalizePhoneNumber($target)),
                "message" => $result['message'],
                "detail" => $result['detail'] ?? null
            ]);
        } catch (Throwable $e) {
            error_log("testZaloReminder error: " . $e->getMessage());
            sendError("Lỗi gửi tin nhắn Zalo thử nghiệm: " . $e->getMessage(), 500);
        }
    }

    /**
     * Get VAPID Public Key for Web Push subscription.
     */
    public function getVapidPublicKey(): void {
        sendJson([
            "success" => true,
            "publicKey" => WebPushService::getPublicKey()
        ]);
    }

    /**
     * Save or update Web Push subscription endpoint for user device.
     */
    public function savePushSubscription(int $userId, array $input): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        $endpoint = isset($input['endpoint']) ? trim((string)$input['endpoint']) : '';
        $p256dh = isset($input['p256dh']) ? trim((string)$input['p256dh']) : '';
        $auth = isset($input['auth']) ? trim((string)$input['auth']) : '';
        $userAgent = isset($_SERVER['HTTP_USER_AGENT']) ? substr($_SERVER['HTTP_USER_AGENT'], 0, 255) : null;

        if (empty($endpoint) || !filter_var($endpoint, FILTER_VALIDATE_URL)) {
            sendError("Endpoint Web Push không hợp lệ", 400);
            return;
        }

        if (empty($p256dh) || empty($auth)) {
            sendError("Khóa bảo mật Push (p256dh hoặc auth) không hợp lệ", 400);
            return;
        }

        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO `push_subscriptions` (`user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`)
                VALUES (:uid, :endpoint, :p256dh, :auth, :ua)
                ON DUPLICATE KEY UPDATE 
                    `user_id` = VALUES(`user_id`),
                    `p256dh` = VALUES(`p256dh`),
                    `auth` = VALUES(`auth`),
                    `user_agent` = VALUES(`user_agent`),
                    `updated_at` = CURRENT_TIMESTAMP
            ");
            $stmt->execute([
                ':uid' => $userId,
                ':endpoint' => $endpoint,
                ':p256dh' => $p256dh,
                ':auth' => $auth,
                ':ua' => $userAgent
            ]);

            // Ensure app_notifications is enabled for this user
            $this->pdo->prepare("UPDATE `users` SET app_notifications = 1 WHERE id = :uid")->execute([':uid' => $userId]);

            sendJson([
                "success" => true,
                "message" => "Thiết bị đã đăng ký nhận thông báo đẩy thành công"
            ]);
        } catch (Throwable $e) {
            error_log("savePushSubscription error: " . $e->getMessage());
            sendError("Lỗi lưu cấu hình thông báo đẩy: " . $e->getMessage(), 500);
        }
    }

    /**
     * Remove Web Push subscription when user disables notifications or device unregisters.
     */
    public function removePushSubscription(int $userId, array $input): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        $endpoint = isset($input['endpoint']) ? trim((string)$input['endpoint']) : '';

        try {
            if (!empty($endpoint)) {
                $stmt = $this->pdo->prepare("DELETE FROM `push_subscriptions` WHERE user_id = :uid AND endpoint = :endpoint");
                $stmt->execute([':uid' => $userId, ':endpoint' => $endpoint]);
            } else {
                $stmt = $this->pdo->prepare("DELETE FROM `push_subscriptions` WHERE user_id = :uid");
                $stmt->execute([':uid' => $userId]);
            }

            sendJson([
                "success" => true,
                "message" => "Đã xóa đăng ký thông báo đẩy của thiết bị"
            ]);
        } catch (Throwable $e) {
            error_log("removePushSubscription error: " . $e->getMessage());
            sendError("Lỗi hủy thông báo đẩy: " . $e->getMessage(), 500);
        }
    }

    /**
     * Send immediate test Web Push notification to user devices.
     */
    public function testAppPushNotification(int $userId, array $input = []): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM `users` WHERE id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendError("Không tìm thấy người dùng", 404);
                return;
            }

            $subStmt = $this->pdo->prepare("SELECT * FROM `push_subscriptions` WHERE user_id = :uid");
            $subStmt->execute([':uid' => $userId]);
            $subs = $subStmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($subs)) {
                sendError("Thiết bị này chưa đăng ký nhận thông báo đẩy trên máy chủ. Vui lòng cấp quyền thông báo và thêm app vào màn hình chính (trên iOS).", 400);
                return;
            }

            $timeStr = date('H:i');
            $payload = [
                'title' => 'SpendMindAI - Thông báo thử nghiệm ✨',
                'body' => "Đã kích hoạt lúc {$timeStr}! Web Push hoạt động ổn định khi bạn tắt màn hình hoặc thoát ứng dụng.",
                'icon' => '/images/logoapp-192.png',
                'badge' => '/images/logoapp-192.png',
                'tag' => 'spendmind-test-reminder',
                'data' => [
                    'url' => '/dashboard.html?action=add_transaction'
                ]
            ];

            $sentCount = 0;
            $failedCount = 0;
            foreach ($subs as $sub) {
                $res = WebPushService::send($sub['endpoint'], $sub['p256dh'], $sub['auth'], $payload);
                if ($res['success']) {
                    $sentCount++;
                } else {
                    $failedCount++;
                    if ($res['expired']) {
                        $this->pdo->prepare("DELETE FROM `push_subscriptions` WHERE id = :id")->execute([':id' => $sub['id']]);
                    }
                }
            }

            if ($sentCount > 0) {
                sendJson([
                    "success" => true,
                    "sent" => $sentCount,
                    "message" => "Đã gửi thông báo đẩy thử nghiệm tới {$sentCount} thiết bị thành công! Hãy khóa màn hình hoặc thoát app để kiểm tra."
                ]);
            } else {
                sendError("Không thể gửi thông báo đẩy tới thiết bị. Vui lòng cấp lại quyền thông báo trên trình duyệt.", 500);
            }
        } catch (Throwable $e) {
            error_log("testAppPushNotification error: " . $e->getMessage());
            sendError("Lỗi gửi thông báo đẩy thử nghiệm: " . $e->getMessage(), 500);
        }
    }

    /**
     * Helper to dispatch Web Push reminders to all registered devices of a user.
     */
    public function sendUserPushReminders(int $userId, string $username, ?string $reminderTime = null): bool {
        if (!$this->pdo) return false;
        $this->ensureZaloColumns();

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM `push_subscriptions` WHERE user_id = :uid");
            $stmt->execute([':uid' => $userId]);
            $subs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (empty($subs)) {
                return false;
            }

            $payload = [
                'title' => 'SpendMindAI - Nhắc nhở chi tiêu 🔔',
                'body' => "{$username} ơi, bạn chưa ghi chép chi tiêu hôm nay. Hãy dành 30 giây ghi lại để kiểm soát tài chính nhé!",
                'icon' => '/images/logoapp-192.png',
                'badge' => '/images/logoapp-192.png',
                'tag' => 'spendmind-daily-reminder-' . date('Y-m-d'),
                'data' => [
                    'url' => '/dashboard.html?action=add_transaction'
                ]
            ];

            $anySent = false;
            foreach ($subs as $sub) {
                $res = WebPushService::send($sub['endpoint'], $sub['p256dh'], $sub['auth'], $payload);
                if ($res['success']) {
                    $anySent = true;
                } elseif ($res['expired']) {
                    $this->pdo->prepare("DELETE FROM `push_subscriptions` WHERE id = :id")->execute([':id' => $sub['id']]);
                }
            }
            return $anySent;
        } catch (Throwable $e) {
            error_log("sendUserPushReminders error: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Lazy Cron trigger executed from frontend client.
     */
    public function checkAndSend(int $userId): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        try {
            $stmt = $this->pdo->prepare("SELECT * FROM `users` WHERE id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendJson(["success" => true, "sent" => false, "message" => "Không tìm thấy người dùng"]);
                return;
            }

            $isZaloActive = (!empty($user['zalo_notifications']) && (!empty($user['zalo_phone']) || !empty($user['zalo_user_id'])));
            $isEmailActive = (!empty($user['email_notifications']) && !empty($user['email']));
            $isAppActive = (!empty($user['app_notifications']));

            if (($isZaloActive || $isEmailActive || $isAppActive) && !empty($user['reminder_time'])) {
                $today = date('Y-m-d');

                if (($user['last_reminder_sent'] ?? null) !== $today) {
                    $txCheck = $this->pdo->prepare("SELECT 1 FROM transactions WHERE user_id = :uid AND date = :today LIMIT 1");
                    $txCheck->execute([':uid' => $userId, ':today' => $today]);
                    $hasTxToday = ($txCheck->fetch() !== false);

                    if ($hasTxToday) {
                        $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today, last_app_reminder_sent = :today_app WHERE id = :id");
                        $updateStmt->execute([':today' => $today, ':today_app' => $today, ':id' => $userId]);
                    } else {
                        $currentTime = date('H:i:s');
                        if ($currentTime >= $user['reminder_time']) {
                            $sentSuccess = false;
                            $messageOutput = "";
                            $isSimulated = false;

                            // 1. Send Web Push to devices if enabled
                            if ($isAppActive) {
                                $pushSent = $this->sendUserPushReminders($userId, $user['username'], $user['reminder_time']);
                                if ($pushSent) {
                                    $sentSuccess = true;
                                    $messageOutput = "Đã gửi thông báo đẩy đến ứng dụng của bạn";
                                }
                            }

                            // 2. Send via Zalo (Primary external channel)
                            if ($isZaloActive) {
                                $target = !empty($user['zalo_phone']) ? $user['zalo_phone'] : $user['zalo_user_id'];
                                $zaloRes = ZaloService::sendReminder($target, $user['username'], $user['reminder_time'], $this->appUrl);
                                if ($zaloRes['success']) {
                                    $sentSuccess = true;
                                    $messageOutput = $zaloRes['message'];
                                    $isSimulated = $zaloRes['simulated'] ?? false;
                                }
                            } 
                            // 3. Fallback to Email if Zalo not active and no push was sent
                            elseif ($isEmailActive && !$sentSuccess) {
                                $template = MailerService::buildDailyReminder($user['username'], $user['reminder_time'], $this->appUrl);
                                $mailResult = MailerService::send($user['email'], $template['subject'], $template['body']);
                                if ($mailResult['success']) {
                                    $sentSuccess = true;
                                    $messageOutput = $mailResult['message'];
                                    $isSimulated = $mailResult['simulated'] ?? false;
                                }
                            }

                            if ($sentSuccess) {
                                $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today, last_app_reminder_sent = :today_app WHERE id = :id");
                                $updateStmt->execute([':today' => $today, ':today_app' => $today, ':id' => $userId]);
                            }

                            sendJson([
                                "success" => $sentSuccess,
                                "sent" => $sentSuccess,
                                "simulated" => $isSimulated,
                                "message" => $messageOutput ?: "Đã kích hoạt gửi nhắc nhở thành công"
                            ]);
                            return;
                        }
                    }
                }
            }

            sendJson([
                "success" => true,
                "sent" => false,
                "message" => "Không cần gửi nhắc nhở tại thời điểm này"
            ]);
        } catch (Throwable $e) {
            error_log("checkAndSend error: " . $e->getMessage());
            sendError("Lỗi kiểm tra nhắc nhở: " . $e->getMessage(), 500);
        }
    }

    /**
     * System Cron batch execution: optimized query with Web Push, Zalo and Email dispatch.
     */
    public function executeSystemCron(): array {
        if (!$this->pdo) {
            return [
                "success" => false,
                "sent" => 0,
                "skipped" => 0,
                "failed" => 0,
                "message" => "Cơ sở dữ liệu chưa sẵn sàng"
            ];
        }

        $this->ensureZaloColumns();

        $today = date('Y-m-d');
        $currentTime = date('H:i:s');
        $startTime = microtime(true);

        try {
            $colsStmt = $this->pdo->query("SHOW COLUMNS FROM `users`");
            $tableCols = $colsStmt ? $colsStmt->fetchAll(PDO::FETCH_COLUMN) : [];

            $conditions = ["u.email_notifications = 1"];
            if (in_array('zalo_notifications', $tableCols)) {
                $conditions[] = "u.zalo_notifications = 1";
            }
            if (in_array('app_notifications', $tableCols)) {
                $conditions[] = "u.app_notifications = 1";
            }

            $conditionSql = "(" . implode(" OR ", $conditions) . ")";

            // 1. Bulk mark users who already logged transactions today as skipped in a single query
            $skipStmt = $this->pdo->prepare("
                UPDATE users u
                SET u.last_reminder_sent = :today,
                    u.last_app_reminder_sent = :today_app
                WHERE {$conditionSql}
                  AND u.reminder_time IS NOT NULL 
                  AND (u.last_reminder_sent IS NULL OR u.last_reminder_sent != :today_check)
                  AND :current_time >= u.reminder_time
                  AND EXISTS (
                      SELECT 1 FROM transactions t 
                      WHERE t.user_id = u.id AND t.date = :today_tx
                  )
            ");
            $skipStmt->execute([
                ':today' => $today,
                ':today_app' => $today,
                ':today_check' => $today,
                ':current_time' => $currentTime,
                ':today_tx' => $today
            ]);
            $skippedCount = $skipStmt->rowCount();

            // 2. Fetch users who need reminders (no transactions entered today), bounded by LIMIT 25
            $dueStmt = $this->pdo->prepare("
                SELECT u.*
                FROM users u
                WHERE {$conditionSql}
                  AND u.reminder_time IS NOT NULL 
                  AND (u.last_reminder_sent IS NULL OR u.last_reminder_sent != :today)
                  AND :current_time >= u.reminder_time
                  AND NOT EXISTS (
                      SELECT 1 FROM transactions t 
                      WHERE t.user_id = u.id AND t.date = :today_tx
                  )
                LIMIT 25
            ");
            $dueStmt->execute([
                ':today' => $today,
                ':current_time' => $currentTime,
                ':today_tx' => $today
            ]);
            $users = $dueStmt->fetchAll(PDO::FETCH_ASSOC);

            $sentCount = 0;
            $failedCount = 0;

            $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today, last_app_reminder_sent = :today_app WHERE id = :id");

            foreach ($users as $user) {
                // Safety guard: prevent exceeding serverless execution budget (12s threshold)
                if ((microtime(true) - $startTime) > 12.0) {
                    error_log("System cron time limit guard reached (12s). Stopping batch.");
                    break;
                }

                $sent = false;

                // 1. Dispatch Web Push to devices if user has app notifications enabled
                if (!empty($user['app_notifications'])) {
                    $pushSent = $this->sendUserPushReminders($user['id'], $user['username'], $user['reminder_time']);
                    if ($pushSent) {
                        $sent = true;
                    }
                }

                // 2. Dispatch Zalo if active
                if (!empty($user['zalo_notifications']) && (!empty($user['zalo_phone']) || !empty($user['zalo_user_id']))) {
                    $target = !empty($user['zalo_phone']) ? $user['zalo_phone'] : $user['zalo_user_id'];
                    $res = ZaloService::sendReminder($target, $user['username'], $user['reminder_time'], $this->appUrl);
                    if ($res['success']) {
                        $sent = true;
                    }
                } 
                // 3. Fallback to email if email active and no other channel succeeded
                elseif (!empty($user['email_notifications']) && !empty($user['email']) && !$sent) {
                    $template = MailerService::buildDailyReminder($user['username'], $user['reminder_time'], $this->appUrl);
                    $mailResult = MailerService::send($user['email'], $template['subject'], $template['body']);
                    if ($mailResult['success']) {
                        $sent = true;
                    }
                }

                if ($sent) {
                    $updateStmt->execute([':today' => $today, ':today_app' => $today, ':id' => $user['id']]);
                    $sentCount++;
                } else {
                    $failedCount++;
                }
            }

            return [
                "success" => true,
                "sent" => $sentCount,
                "skipped" => $skippedCount,
                "failed" => $failedCount,
                "message" => "Xử lý Cron hoàn tất"
            ];

        } catch (Throwable $e) {
            error_log("Cron batch error: " . $e->getMessage());
            return [
                "success" => false,
                "sent" => 0,
                "skipped" => 0,
                "failed" => 0,
                "message" => "Lỗi CSDL Cron: " . $e->getMessage()
            ];
        }
    }
}
