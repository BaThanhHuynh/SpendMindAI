<?php
/* ==========================================================================
   SPENDMINDAI - REMINDER CONTROLLER
   Notification settings, Lazy Cron and System Cron scheduling
   ========================================================================== */

require_once __DIR__ . '/../services/MailerService.php';

class ReminderController {
    private ?PDO $pdo;
    private string $appUrl;

    public function __construct(?PDO $pdo, string $appUrl) {
        $this->pdo = $pdo;
        $this->appUrl = $appUrl;
    }

    /**
     * Get user notification & reminder settings.
     */
    public function getSettings(int $userId): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        try {
            $stmt = $this->pdo->prepare("SELECT email, google_id, reminder_time, email_notifications, avatar_url FROM users WHERE id = :id");
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
                "avatar_url" => $user['avatar_url']
            ]);
        } catch (Throwable $e) {
            error_log("getSettings error: " . $e->getMessage());
            sendError("Lỗi hệ thống khi tải cài đặt nhắc nhở", 500);
        }
    }

    /**
     * Save user notification & reminder settings.
     */
    public function saveSettings(int $userId, array $input): void {
        if (!$this->pdo) {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503);
            return;
        }

        if (empty($input['email'])) {
            sendError("Email không được để trống", 400);
            return;
        }

        $email = trim((string)$input['email']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            sendError("Địa chỉ email không hợp lệ", 400);
            return;
        }

        $emailNotifications = !empty($input['email_notifications']) ? 1 : 0;
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
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email = :email AND id != :id");
            $stmt->execute([':email' => $email, ':id' => $userId]);
            if ($stmt->fetch()) {
                sendError("Địa chỉ email này đã được sử dụng bởi tài khoản khác", 409);
                return;
            }

            $stmt = $this->pdo->prepare("
                UPDATE users 
                SET email = :email, reminder_time = :rtime, email_notifications = :enotif, last_reminder_sent = NULL 
                WHERE id = :id
            ");
            $stmt->execute([
                ':email' => $email,
                ':rtime' => $reminderTime,
                ':enotif' => $emailNotifications,
                ':id' => $userId
            ]);

            sendJson(["success" => true, "message" => "Cấu hình nhắc nhở đã được lưu thành công"]);
        } catch (Throwable $e) {
            error_log("saveSettings error: " . $e->getMessage());
            sendError("Lỗi lưu cấu hình nhắc nhở", 500);
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

        try {
            $stmt = $this->pdo->prepare("SELECT id, username, email, reminder_time, email_notifications, last_reminder_sent FROM users WHERE id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user && $user['email_notifications'] && !empty($user['reminder_time'])) {
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
                            $template = MailerService::buildDailyReminder($user['username'], $user['reminder_time'], $this->appUrl);
                            $mailResult = MailerService::send($user['email'], $template['subject'], $template['body']);

                            if ($mailResult['success']) {
                                $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
                                $updateStmt->execute([':today' => $today, ':id' => $userId]);
                            }

                            sendJson([
                                "success" => $mailResult['success'],
                                "sent" => $mailResult['success'],
                                "simulated" => $mailResult['simulated'] ?? false,
                                "message" => $mailResult['message']
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
     * System Cron batch execution: optimized single-batch query eliminating N+1 loop.
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

        $today = date('Y-m-d');
        $currentTime = date('H:i:s');
        $startTime = microtime(true);

        try {
            // 1. Bulk mark users who already logged transactions today as skipped in a single query
            $skipStmt = $this->pdo->prepare("
                UPDATE users u
                SET u.last_reminder_sent = :today
                WHERE u.email_notifications = 1 
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

            // 2. Fetch only users who need reminders (no transactions entered today), bounded by LIMIT 15
            $dueStmt = $this->pdo->prepare("
                SELECT u.id, u.username, u.email, u.reminder_time 
                FROM users u
                WHERE u.email_notifications = 1 
                  AND u.reminder_time IS NOT NULL 
                  AND (u.last_reminder_sent IS NULL OR u.last_reminder_sent != :today)
                  AND :current_time >= u.reminder_time
                  AND NOT EXISTS (
                      SELECT 1 FROM transactions t 
                      WHERE t.user_id = u.id AND t.date = :today_tx
                  )
                LIMIT 15
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

                $template = MailerService::buildDailyReminder($user['username'], $user['reminder_time'], $this->appUrl);
                $mailResult = MailerService::send($user['email'], $template['subject'], $template['body']);

                if ($mailResult['success']) {
                    $updateStmt->execute([':today' => $today, ':id' => $user['id']]);
                    $sentCount++;
                } else {
                    $failedCount++;
                    error_log("Failed cron reminder to " . $user['email'] . ": " . $mailResult['message']);
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
