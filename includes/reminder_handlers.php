<?php
/* ==========================================================================
   REMINDER CONFIG & LAZY CRON ACTION HANDLERS
   ========================================================================== */

if (!defined('PDO_CONNECT_VERIFIED')) {
    exit("Access Denied");
}

// Get notification settings
if ($action === 'get_notification_settings' && $method === 'GET') {
    try {
        $stmt = $pdo->prepare("SELECT email, google_id, reminder_time, email_notifications, avatar_url FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            "success" => true,
            "email" => $user['email'],
            "google_id" => $user['google_id'],
            "reminder_time" => $user['reminder_time'] ? substr($user['reminder_time'], 0, 5) : '',
            "email_notifications" => intval($user['email_notifications']),
            "avatar_url" => $user['avatar_url']
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi CSDL: " . $e->getMessage()]);
    }
    exit();
}

// Save notification settings
if ($action === 'save_notification_settings' && $method === 'POST') {
    if (empty($input['email'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "message" => "Email không được để trống"]);
        exit();
    }

    $email = trim($input['email']);
    $emailNotifications = isset($input['email_notifications']) ? intval($input['email_notifications']) : 0;
    $reminderTime = !empty($input['reminder_time']) ? trim($input['reminder_time']) . ":00" : null;

    try {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = :email AND id != :id");
        $stmt->execute([':email' => $email, ':id' => $userId]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(["success" => false, "message" => "Địa chỉ email này đã được sử dụng bởi người dùng khác"]);
            exit();
        }

        $stmt = $pdo->prepare("UPDATE users SET email = :email, reminder_time = :rtime, email_notifications = :enotif WHERE id = :id");
        $stmt->execute([
            ':email' => $email,
            ':rtime' => $reminderTime,
            ':enotif' => $emailNotifications,
            ':id' => $userId
        ]);

        echo json_encode(["success" => true, "message" => "Cấu hình nhắc nhở đã được lưu thành công"]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi CSDL: " . $e->getMessage()]);
    }
    exit();
}

// Check and send reminder via Lazy Cron
if ($action === 'check_and_send_reminder') {
    try {
        $stmt = $pdo->prepare("SELECT id, username, email, reminder_time, email_notifications, last_reminder_sent FROM users WHERE id = :id");
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && $user['email_notifications'] && !empty($user['reminder_time'])) {
            $today = date('Y-m-d');

            if ($user['last_reminder_sent'] !== $today) {
                // Check if user has entered any transactions today
                $txCheck = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE user_id = :uid AND date = :today");
                $txCheck->execute([':uid' => $userId, ':today' => $today]);
                $hasTxToday = intval($txCheck->fetchColumn()) > 0;

                if ($hasTxToday) {
                    $stmt = $pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
                    $stmt->execute([':today' => $today, ':id' => $userId]);
                } else {
                    $currentTime = date('H:i:s');
                    if ($currentTime >= $user['reminder_time']) {
                        require_once __DIR__ . '/reminder_helper.php';
                        $mailResult = sendReminderEmailToUser($user, $appUrl, $pdo);

                        echo json_encode([
                            "success" => $mailResult['success'],
                            "sent" => $mailResult['sent'],
                            "simulated" => isset($mailResult['simulated']) ? $mailResult['simulated'] : false,
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

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(["success" => false, "message" => "Lỗi Lazy Cron: " . $e->getMessage()]);
    }
    exit();
}
