<?php
/* ==========================================================================
   SPENDMINDAI - SYSTEM CRON SCHEDULER
   Serverless Function for Vercel Cron or CLI Trigger
   ========================================================================== */

// Prevent timeout for batch processing
set_time_limit(0);

// Load Configurations, Database and Controllers
require_once __DIR__ . '/config/security.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/services/MailerService.php';
require_once __DIR__ . '/controllers/ReminderController.php';

// Force default timezone
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Ensure execution is authorized (CLI, valid token, or Vercel Cron Bearer header)
$isCli = (php_sapi_name() === 'cli');
$token = isset($_GET['token']) ? trim($_GET['token']) : '';
$expectedToken = function_exists('getEnvVar') ? getEnvVar('CRON_TOKEN', 'safe_cron_token_2026') : (getenv('CRON_TOKEN') ?: 'safe_cron_token_2026');

$authHeader = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
$cronSecret = function_exists('getEnvVar') ? getEnvVar('CRON_SECRET', '') : (getenv('CRON_SECRET') ?: '');
$isVercelCron = (!empty($cronSecret) && $authHeader === 'Bearer ' . $cronSecret);

if (!$isCli && $token !== $expectedToken && !$isVercelCron) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Truy cập bị từ chối"]);
    exit();
}

$reminderCtrl = new ReminderController($pdo, $appUrl);
$result = $reminderCtrl->executeSystemCron();

if (!$result['success']) {
    http_response_code(500);
}

echo json_encode($result);
exit();
