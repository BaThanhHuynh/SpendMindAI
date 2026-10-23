<?php
/* ==========================================================================
   SPENDMINDAI - PRODUCTION API ROUTER & FRONT CONTROLLER
   Serverless PHP Architecture for Vercel & Web Servers
   ========================================================================== */

// 1. Load Configurations & Persistent Database / Session
require_once __DIR__ . '/config/security.php';
require_once __DIR__ . '/config/database.php';

// 2. Load Controllers & Services
require_once __DIR__ . '/services/MailerService.php';
require_once __DIR__ . '/controllers/AuthController.php';
require_once __DIR__ . '/controllers/TransactionController.php';
require_once __DIR__ . '/controllers/BudgetController.php';
require_once __DIR__ . '/controllers/ReminderController.php';
require_once __DIR__ . '/controllers/ChatbotController.php';

// 3. Parse HTTP Request
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = isset($_GET['action']) ? trim($_GET['action']) : '';

$inputRaw = file_get_contents('php://input');
$input = json_decode($inputRaw, true);
if (!is_array($input)) {
    $input = [];
}

// 4. Initialize Controllers
$authCtrl = new AuthController($pdo, $isSecure);
$transCtrl = new TransactionController($pdo);
$budgetCtrl = new BudgetController($pdo);
$reminderCtrl = new ReminderController($pdo, $appUrl);
$chatbotCtrl = new ChatbotController();

// 5. Public Authentication Endpoints (Works even if Database is not yet configured)
switch ($action) {
    case 'health':
    case 'healthz':
        sendJson([
            "status" => "ok",
            "service" => "SpendMindAI API",
            "timestamp" => time(),
            "environment" => getenv('APP_ENV') ?: 'production'
        ]);
        exit();

    case 'readyz':
        $dbOk = false;
        if ($pdo) {
            try {
                $check = $pdo->query("SELECT 1");
                $dbOk = ($check !== false);
            } catch (Throwable $e) {
                $dbOk = false;
            }
        }
        if ($dbOk) {
            sendJson([
                "status" => "ready",
                "database" => "connected",
                "timestamp" => time()
            ]);
        } else {
            sendError("Cơ sở dữ liệu chưa sẵn sàng", 503, "NOT_READY");
        }
        exit();

    case 'check_session':
        $includeState = !empty($_GET['include_state']) && $_GET['include_state'] == '1';
        $authCtrl->checkSession($includeState);
        exit();

    case 'get_google_client_id':
        $authCtrl->getGoogleClientId();
        exit();

    case 'google_auth':
        $clientIp = getClientIp();
        if (!enforceRateLimit('google_auth', $clientIp, 10, 60, $pdo)) {
            sendError("Quá nhiều yêu cầu đăng nhập Google từ IP này. Vui lòng đợi 1 phút.", 429, "RATE_LIMIT_EXCEEDED");
        }
        $authCtrl->handleGoogleAuth($input);
        exit();

    case 'register':
        $clientIp = getClientIp();
        if (!enforceRateLimit('register', $clientIp, 4, 300, $pdo)) {
            sendError("Quá nhiều lượt đăng ký tài khoản từ IP của bạn. Vui lòng thử lại sau 5 phút.", 429, "RATE_LIMIT_EXCEEDED");
        }
        $authCtrl->handleRegister($input);
        exit();

    case 'login':
        $clientIp = getClientIp();
        if (!enforceRateLimit('login', $clientIp, 6, 60, $pdo)) {
            sendError("Quá nhiều lần thử đăng nhập từ IP của bạn. Vui lòng đợi 1 phút và thử lại.", 429, "RATE_LIMIT_EXCEEDED");
        }
        $authCtrl->handleLogin($input);
        exit();

    case 'logout':
        $authCtrl->handleLogout();
        exit();

    case 'get_gemini_key':
        $chatbotCtrl->getGeminiKey();
        exit();

    case 'get_vapid_public_key':
        $reminderCtrl->getVapidPublicKey();
        exit();
}

// 6. Database Guard for Protected Endpoints
if (!$pdo) {
    sendError("Chưa kết nối cơ sở dữ liệu trên máy chủ. Vui lòng cấu hình biến môi trường DATABASE_URL trong Settings Vercel.", 503);
    exit();
}

// 7. Authentication Guard for Protected User Endpoints (Row Level Security Barrier)
$userId = AuthController::getLoggedInUserId();
if (!$userId) {
    sendError("Vui lòng đăng nhập để thực hiện thao tác", 401);
    exit();
}

// 8. AI Chatbot Endpoint (Protected + Rate Limited: max 15 requests/minute)
if ($action === 'chat' && $method === 'POST') {
    if (!enforceRateLimit('chat', "u_{$userId}", 15, 60, $pdo)) {
        sendError("Bạn đã gửi câu hỏi quá nhanh. Trợ lý AI cần nghỉ 1 phút trước khi tiếp tục.", 429, "RATE_LIMIT_EXCEEDED");
    }
    $chatbotCtrl->handleChat($userId, $input, $pdo);
    exit();
}

// 9. Reminder & Settings Endpoints (Strictly scoped to $userId)
if ($action === 'get_notification_settings' && $method === 'GET') {
    $reminderCtrl->getSettings($userId);
    exit();
}
if ($action === 'save_notification_settings' && $method === 'POST') {
    if (!enforceRateLimit('settings', "u_{$userId}", 20, 60, $pdo)) {
        sendError("Thao tác quá nhanh. Vui lòng đợi giây lát.", 429, "RATE_LIMIT_EXCEEDED");
    }
    $reminderCtrl->saveSettings($userId, $input);
    exit();
}
if ($action === 'test_zalo_reminder' && $method === 'POST') {
    if (!enforceRateLimit('test_zalo', "u_{$userId}", 3, 60, $pdo)) {
        sendError("Thao tác quá nhanh. Tối đa 3 lần thử Zalo mỗi phút.", 429, "RATE_LIMIT_EXCEEDED");
    }
    $reminderCtrl->testZaloReminder($userId, $input);
    exit();
}
if ($action === 'save_push_subscription' && $method === 'POST') {
    $reminderCtrl->savePushSubscription($userId, $input);
    exit();
}
if ($action === 'remove_push_subscription' && $method === 'POST') {
    $reminderCtrl->removePushSubscription($userId, $input);
    exit();
}
if ($action === 'test_app_push_notification' && $method === 'POST') {
    if (!enforceRateLimit('test_push', "u_{$userId}", 5, 60, $pdo)) {
        sendError("Thao tác quá nhanh. Tối đa 5 lần thử thông báo đẩy mỗi phút.", 429, "RATE_LIMIT_EXCEEDED");
    }
    $reminderCtrl->testAppPushNotification($userId, $input);
    exit();
}
if ($action === 'check_and_send_reminder') {
    $reminderCtrl->checkAndSend($userId);
    exit();
}

// 10. Transaction & Budget Endpoints (Strictly scoped to $userId - Row Level Security)
if ($method === 'GET') {
    $transCtrl->list($userId);
    exit();
}

if ($method === 'POST') {
    if (!enforceRateLimit('write_ops', "u_{$userId}", 60, 60, $pdo)) {
        sendError("Thao tác ghi nhận quá nhanh. Vui lòng đợi giây lát.", 429, "RATE_LIMIT_EXCEEDED");
    }
    switch ($action) {
        case 'save_transaction':
            $transCtrl->save($userId, $input);
            exit();

        case 'delete_transaction':
            $transCtrl->delete($userId, $input);
            exit();

        case 'clear_all_data':
            $transCtrl->clearAll($userId);
            exit();

        case 'save_budgets':
            $budgetCtrl->save($userId, $input);
            exit();
    }
}

// 11. Fallback for Unmatched Endpoints
sendError("Hành động API không hợp lệ hoặc không được hỗ trợ", 404);
exit();
