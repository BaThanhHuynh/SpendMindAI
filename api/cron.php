<?php
/* ==========================================================================
   SPENDMINDAI - SYSTEM CRON SCHEDULER
   Serverless Function for Vercel Cron or CLI Trigger
   ========================================================================== */

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
$expectedToken = function_exists('getEnvVar') ? getEnvVar('CRON_TOKEN', '') : (getenv('CRON_TOKEN') ?: '');

$authHeader = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
$cronSecret = function_exists('getEnvVar') ? getEnvVar('CRON_SECRET', '') : (getenv('CRON_SECRET') ?: '');
$isVercelCron = (!empty($cronSecret) && $authHeader === 'Bearer ' . $cronSecret);
$isValidToken = (!empty($expectedToken) && hash_equals($expectedToken, $token));

// Rate limit cron triggers: max 10 per minute per IP
$clientIp = getClientIp();
if (!$isCli && !enforceRateLimit('cron_trigger', $clientIp, 10, 60, $pdo)) {
    sendError("Quá nhiều yêu cầu kích hoạt cron. Vui lòng thử lại sau.", 429, "RATE_LIMIT_EXCEEDED");
    exit();
}

if (!$isCli && !$isValidToken && !$isVercelCron) {
    if (empty($expectedToken) && empty($cronSecret)) {
        sendError("Lỗi bảo mật hệ thống: CRON_TOKEN hoặc CRON_SECRET chưa được cấu hình.", 500);
    } else {
        sendError("Truy cập bị từ chối. Token xác thực cron không hợp lệ.", 403);
    }
    exit();
}

$reminderCtrl = new ReminderController($pdo, $appUrl);
$result = $reminderCtrl->executeSystemCron();

sendJson($result, ($result['success'] ? 200 : 500));

