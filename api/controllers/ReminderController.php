<?php
/* ==========================================================================
   SPENDMINDAI - REMINDER CONTROLLER
   Notification settings, Zalo API reminders, Lazy Cron and System Cron scheduling
   ========================================================================== */

require_once __DIR__ . '/../services/ZaloService.php';
require_once __DIR__ . '/../services/MailerService.php';

class ReminderController {
    private ?PDO $pdo;
    private string $appUrl;

    public function __construct(?PDO $pdo, string $appUrl) {
        $this->pdo = $pdo;
        $this->appUrl = $appUrl;
    }

    /**
     * Self-healing migration: dynamically ensure Zalo columns exist on MySQL users table.
     */
    private function ensureZaloColumns(): void {
        if (!$this->pdo) return;
        static $ensured = false;
        if ($ensured) return;

        try {
            $stmt = $this->pdo->query("SHOW COLUMNS FROM users LIKE 'zalo_phone'");
            $cols = $stmt->fetchAll(PDO::FETCH_ASSOC);
            if (empty($cols)) {
                $this->pdo->exec("
                    ALTER TABLE users 
                    ADD COLUMN zalo_phone VARCHAR(20) NULL DEFAULT NULL AFTER email_notifications,
                    ADD COLUMN zalo_user_id VARCHAR(50) NULL DEFAULT NULL AFTER zalo_phone,
                    ADD COLUMN zalo_notifications TINYINT(1) DEFAULT 0 AFTER zalo_user_id
                ");
            }
            $ensured = true;
        } catch (Throwable $e) {
            // Already added or non-fatal DDL permission limit
            $ensured = true;
        }
    }

    /**
     * Get user notification & reminder settings (Zalo & Email).
     */
    public function getSettings(int $userId): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        try {
            $stmt = $this->pdo->prepare("
                SELECT email, google_id, reminder_time, email_notifications, 
                       zalo_phone, zalo_user_id, zalo_notifications, avatar_url 
                FROM users WHERE id = :id
            ");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendError("Không tìm thấy người dùng", 404);
                return;
            }

            sendJson([
                "success" => true,
                "email" => $user['email'],
                "google_id" => $user['google_id'],
                "reminder_time" => $user['reminder_time'] ? substr($user['reminder_time'], 0, 5) : '',
                "email_notifications" => intval($user['email_notifications']),
                "zalo_phone" => $user['zalo_phone'] ?? '',
                "zalo_user_id" => $user['zalo_user_id'] ?? '',
                "zalo_notifications" => intval($user['zalo_notifications'] ?? 0),
                "avatar_url" => $user['avatar_url']
            ]);
        } catch (Throwable $e) {
            error_log("getSettings error: " . $e->getMessage());
            sendError("Lỗi hệ thống khi tải cài đặt nhắc nhở", 500);
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
                $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email = :email AND id != :id");
                $stmt->execute([':email' => $email, ':id' => $userId]);
                if ($stmt->fetch()) {
                    sendError("Địa chỉ email này đã được sử dụng bởi tài khoản khác", 409);
                    return;
                }
            }

            // Update user record
            $sql = "
                UPDATE users 
                SET reminder_time = :rtime, 
                    zalo_phone = :zphone, 
                    zalo_user_id = :zuid, 
                    zalo_notifications = :znotif, 
                    email_notifications = :enotif, 
                    last_reminder_sent = NULL 
            ";
            $params = [
                ':rtime' => $reminderTime,
                ':zphone' => !empty($zaloPhone) ? $zaloPhone : null,
                ':zuid' => !empty($zaloUserId) ? $zaloUserId : null,
                ':znotif' => $zaloNotifications,
                ':enotif' => $emailNotifications,
                ':id' => $userId
            ];

            if (!empty($email)) {
                $sql .= ", email = :email";
                $params[':email'] = $email;
            }
            $sql .= " WHERE id = :id";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);

            sendJson([
                "success" => true, 
                "message" => "Cài đặt nhắc nhở qua Zalo đã được lưu thành công"
            ]);
        } catch (Throwable $e) {
            error_log("saveSettings error: " . $e->getMessage());
            sendError("Lỗi lưu cấu hình nhắc nhở", 500);
        }
    }

    /**
     * Dispatch an immediate test reminder message via Zalo to verify customer setup.
     */
    public function testZaloReminder(int $userId): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        $this->ensureZaloColumns();

        try {
            $stmt = $this->pdo->prepare("
                SELECT username, reminder_time, zalo_phone, zalo_user_id 
                FROM users WHERE id = :id
            ");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                sendError("Không tìm thấy người dùng", 404);
                return;
            }

            $target = !empty($user['zalo_phone']) ? $user['zalo_phone'] : ($user['zalo_user_id'] ?? '');
            if (empty($target)) {
                sendError("Bạn chưa nhập Số điện thoại Zalo. Vui lòng điền số điện thoại và lưu cài đặt trước.", 400);
                return;
            }

            $reminderTime = !empty($user['reminder_time']) ? substr($user['reminder_time'], 0, 5) : date('H:i');
            $result = ZaloService::sendReminder($target, $user['username'], $reminderTime, $this->appUrl, true);

            sendJson([
                "success" => $result['success'],
                "simulated" => $result['simulated'] ?? false,
                "message" => $result['message'],
                "detail" => $result['detail'] ?? null
            ]);
        } catch (Throwable $e) {
            error_log("testZaloReminder error: " . $e->getMessage());
            sendError("Lỗi gửi tin nhắn Zalo thử nghiệm", 500);
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
            $stmt = $this->pdo->prepare("
                SELECT id, username, email, reminder_time, 
                       zalo_phone, zalo_user_id, zalo_notifications, 
                       email_notifications, last_reminder_sent 
                FROM users WHERE id = :id
            ");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            $isZaloActive = (!empty($user['zalo_notifications']) && (!empty($user['zalo_phone']) || !empty($user['zalo_user_id'])));
            $isEmailActive = (!empty($user['email_notifications']) && !empty($user['email']));

            if (($isZaloActive || $isEmailActive) && !empty($user['reminder_time'])) {
                $today = date('Y-m-d');

                if ($user['last_reminder_sent'] !== $today) {
                    $txCheck = $this->pdo->prepare("SELECT 1 FROM transactions WHERE user_id = :uid AND date = :today LIMIT 1");
                    $txCheck->execute([':uid' => $userId, ':today' => $today]);
                    $hasTxToday = ($txCheck->fetch() !== false);

                    if ($hasTxToday) {
                        $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
                        $updateStmt->execute([':today' => $today, ':id' => $userId]);
                    } else {
                        $currentTime = date('H:i:s');
                        if ($currentTime >= $user['reminder_time']) {
                            $sentSuccess = false;
                            $messageOutput = "";
                            $isSimulated = false;

                            // 1. Send via Zalo (Primary)
                            if ($isZaloActive) {
                                $target = !empty($user['zalo_phone']) ? $user['zalo_phone'] : $user['zalo_user_id'];
                                $zaloRes = ZaloService::sendReminder($target, $user['username'], $user['reminder_time'], $this->appUrl);
                                $sentSuccess = $zaloRes['success'];
                                $messageOutput = $zaloRes['message'];
                                $isSimulated = $zaloRes['simulated'] ?? false;
                            } 
                            // 2. Fallback to Email if Zalo not enabled
                            elseif ($isEmailActive) {
                                $template = MailerService::buildDailyReminder($user['username'], $user['reminder_time'], $this->appUrl);
                                $mailResult = MailerService::send($user['email'], $template['subject'], $template['body']);
                                $sentSuccess = $mailResult['success'];
                                $messageOutput = $mailResult['message'];
                                $isSimulated = $mailResult['simulated'] ?? false;
                            }

                            if ($sentSuccess) {
                                $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
                                $updateStmt->execute([':today' => $today, ':id' => $userId]);
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
            sendError("Lỗi kiểm tra nhắc nhở", 500);
        }
    }

    /**
     * System Cron batch execution: optimized query with Zalo priority dispatch.
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
            // 1. Bulk mark users who already logged transactions today as skipped in a single query
            $skipStmt = $this->pdo->prepare("
                UPDATE users u
                SET u.last_reminder_sent = :today
                WHERE (u.zalo_notifications = 1 OR u.email_notifications = 1) 
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
                ':today_check' => $today,
                ':current_time' => $currentTime,
                ':today_tx' => $today
            ]);
            $skippedCount = $skipStmt->rowCount();

            // 2. Fetch users who need reminders (no transactions entered today), bounded by LIMIT 20
            $dueStmt = $this->pdo->prepare("
                SELECT u.id, u.username, u.email, u.reminder_time, 
                       u.zalo_phone, u.zalo_user_id, u.zalo_notifications, u.email_notifications 
                FROM users u
                WHERE (u.zalo_notifications = 1 OR u.email_notifications = 1) 
                  AND u.reminder_time IS NOT NULL 
                  AND (u.last_reminder_sent IS NULL OR u.last_reminder_sent != :today)
                  AND :current_time >= u.reminder_time
                  AND NOT EXISTS (
                      SELECT 1 FROM transactions t 
                      WHERE t.user_id = u.id AND t.date = :today_tx
                  )
                LIMIT 20
            ");
            $dueStmt->execute([
                ':today' => $today,
                ':current_time' => $currentTime,
                ':today_tx' => $today
            ]);
            $users = $dueStmt->fetchAll(PDO::FETCH_ASSOC);

            $sentCount = 0;
            $failedCount = 0;

            $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");

            foreach ($users as $user) {
                // Safety guard: prevent exceeding serverless execution budget (10s threshold)
                if ((microtime(true) - $startTime) > 10.0) {
                    error_log("System cron time limit guard reached (10s). Stopping batch.");
                    break;
                }

                $sent = false;
                // Dispatch Zalo if active
                if (!empty($user['zalo_notifications']) && (!empty($user['zalo_phone']) || !empty($user['zalo_user_id']))) {
                    $target = !empty($user['zalo_phone']) ? $user['zalo_phone'] : $user['zalo_user_id'];
                    $res = ZaloService::sendReminder($target, $user['username'], $user['reminder_time'], $this->appUrl);
                    $sent = $res['success'];
                } 
                // Otherwise fallback to email if email active
                elseif (!empty($user['email_notifications']) && !empty($user['email'])) {
                    $template = MailerService::buildDailyReminder($user['username'], $user['reminder_time'], $this->appUrl);
                    $mailResult = MailerService::send($user['email'], $template['subject'], $template['body']);
                    $sent = $mailResult['success'];
                }

                if ($sent) {
                    $updateStmt->execute([':today' => $today, ':id' => $user['id']]);
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
