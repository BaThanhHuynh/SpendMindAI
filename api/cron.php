<?php
/* ==========================================================================
   SYSTEM CRON JOB - SEND EMAIL REMINDERS (SpendMindAI)
   Self-contained Serverless Function for Vercel Cron
   ========================================================================== */

// Set CLI execution timeout to unlimited
set_time_limit(0);

// Load configuration and mailer
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/mailer.php';
require_once __DIR__ . '/includes/reminder_helper.php';

// Force default timezone
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Ensure this script runs from CLI, has a secure token, or comes from Vercel Cron
$isCli = (php_sapi_name() === 'cli');
$token = isset($_GET['token']) ? $_GET['token'] : '';
$expectedToken = function_exists('getEnvVar') ? getEnvVar('CRON_TOKEN', 'safe_cron_token_2026') : (getenv('CRON_TOKEN') ?: 'safe_cron_token_2026');

// Check Vercel Cron authorization header (Bearer <CRON_SECRET>)
$authHeader = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
$cronSecret = function_exists('getEnvVar') ? getEnvVar('CRON_SECRET', '') : (getenv('CRON_SECRET') ?: '');
$isVercelCron = (!empty($cronSecret) && $authHeader === 'Bearer ' . $cronSecret);

if (!$isCli && $token !== $expectedToken && !$isVercelCron) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Access denied"]);
    exit();
}

try {
    $today = date('Y-m-d');
    $currentTime = date('H:i:s');

    // 1. Fetch all users who have enabled email reminders and haven't been processed today
    $stmt = $pdo->prepare("
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
        $userId = intval($user['id']);

        // 2. Check if this user has already recorded any transactions today
        $txCheck = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE user_id = :uid AND date = :today");
        $txCheck->execute([':uid' => $userId, ':today' => $today]);
        $hasTxToday = intval($txCheck->fetchColumn()) > 0;

        if ($hasTxToday) {
            // User already active today, no need to remind. Update log and skip email.
            $updateStmt = $pdo->prepare("UPDATE users SET last_reminder_sent = :today WHERE id = :id");
            $updateStmt->execute([':today' => $today, ':id' => $userId]);
            $skippedCount++;
            continue;
        }

        // 3. Send email reminder
        $mailResult = sendReminderEmailToUser($user, $appUrl, $pdo);

        if ($mailResult['sent']) {
            $sentCount++;
        } else {
            $failedCount++;
            error_log("Failed to send cron reminder to " . $user['email'] . ": " . $mailResult['message']);
        }
    }

    echo json_encode([
        "success" => true,
        "sent" => $sentCount,
        "skipped" => $skippedCount,
        "failed" => $failedCount,
        "message" => "Cron checked successfully"
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "message" => "Cron database error: " . $e->getMessage()]);
}
