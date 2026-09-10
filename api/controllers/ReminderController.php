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
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        try {
            $stmt = $this->pdo->prepare("SELECT email, google_id, reminder_time, email_notifications, avatar_url FROM users WHERE id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user) {
                http_response_code(404);
                echo json_encode(["success" => false, "message" => "Không tìm thấy người dùng"]);
                exit();
            }

            echo json_encode([
                "success" => true,
                "email" => $user['email'],
                "google_id" => $user['google_id'],
                "reminder_time" => $user['reminder_time'] ? substr($user['reminder_time'], 0, 5) : '',
                "email_notifications" => intval($user['email_notifications']),
                "avatar_url" => $user['avatar_url']
            ]);
            exit();

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi CSDL: " . $e->getMessage()]);
            exit();
        }
    }

    /**
     * Save user notification & reminder settings.
     */
    public function saveSettings(int $userId, array $input): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        if (empty($input['email'])) {
            http_response_code(400);
            echo json_encode(["success" => false, "message" => "Email không được để trống"]);
            exit();
        }

        $email = trim($input['email']);
        $emailNotifications = isset($input['email_notifications']) ? intval($input['email_notifications']) : 0;
        $reminderTime = !empty($input['reminder_time']) ? trim($input['reminder_time']) . ":00" : null;

        try {
            $stmt = $this->pdo->prepare("SELECT id FROM users WHERE email = :email AND id != :id");
            $stmt->execute([':email' => $email, ':id' => $userId]);
            if ($stmt->fetch()) {
                http_response_code(409);
                echo json_encode(["success" => false, "message" => "Địa chỉ email này đã được sử dụng bởi tài khoản khác"]);
                exit();
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

            echo json_encode(["success" => true, "message" => "Cấu hình nhắc nhở đã được lưu thành công"]);
            exit();

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi CSDL: " . $e->getMessage()]);
            exit();
        }
    }

    /**
     * Lazy Cron trigger executed from frontend client.
     */
    public function checkAndSend(int $userId): void {
        if (!$this->pdo) {
            http_response_code(503);
            echo json_encode(["success" => false, "message" => "Cơ sở dữ liệu chưa sẵn sàng"]);
            exit();
        }

        try {
            $stmt = $this->pdo->prepare("SELECT id, username, email, reminder_time, email_notifications, last_reminder_sent FROM users WHERE id = :id");
            $stmt->execute([':id' => $userId]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($user && $user['email_notifications'] && !empty($user['reminder_time'])) {
                $today = date('Y-m-d');

                if ($user['last_reminder_sent'] !== $today) {
                    // Check if user has entered any transactions today
                    $txCheck = $this->pdo->prepare("SELECT COUNT(*) FROM transactions WHERE user_id = :uid AND date = :today");
                    $txCheck->execute([':uid' => $userId, ':today' => $today]);
                    $hasTxToday = intval($txCheck->fetchColumn()) > 0;

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

                            echo json_encode([
                                "success" => $mailResult['success'],
                                "sent" => $mailResult['success'],
                                "simulated" => $mailResult['simulated'] ?? false,
                                "message" => $mailResult['message']
                            ]);
                            exit();
                        }
                    }
                }
            }

            echo json_encode([
                "success" => true,
                "sent" => false,
                "message" => "Không cần gửi nhắc nhở tại thời điểm này"
            ]);
            exit();

        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(["success" => false, "message" => "Lỗi Lazy Cron: " . $e->getMessage()]);
            exit();
        }
    }

    /**
     * System Cron batch execution for all users due for notification.
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

        try {
            $stmt = $this->pdo->prepare("
                SELECT id, username, email, reminder_time 
                FROM users 
                WHERE email_notifications = 1 
                  AND reminder_time IS NOT NULL 
                  AND (last_reminder_sent IS NULL OR last_reminder_sent != :today)
                  AND :current_time >= reminder_time
            ");
            $stmt->execute([
                ':today' => $today,
                ':current_time' => $currentTime
            ]);
            $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $skippedCount = 0;
            $sentCount = 0;
            $failedCount = 0;

            foreach ($users as $user) {
                $uid = intval($user['id']);

                // Check active transactions today
                $txCheck = $this->pdo->prepare("SELECT COUNT(*) FROM transactions WHERE user_id = :uid AND date = :today");
                $txCheck->execute([':uid' => $uid, ':today' => $today]);
                $hasTxToday = intval($txCheck->fetchColumn()) > 0;

                if ($hasTxToday) {
                    $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
                    $updateStmt->execute([':today' => $today, ':id' => $uid]);
                    $skippedCount++;
                    continue;
                }

                $template = MailerService::buildDailyReminder($user['username'], $user['reminder_time'], $this->appUrl);
                $mailResult = MailerService::send($user['email'], $template['subject'], $template['body']);

                if ($mailResult['success']) {
                    $updateStmt = $this->pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
                    $updateStmt->execute([':today' => $today, ':id' => $uid]);
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

        } catch (PDOException $e) {
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
