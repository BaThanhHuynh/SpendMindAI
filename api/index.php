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
        $authCtrl->handleGoogleAuth($input);
        exit();

    case 'register':
        $authCtrl->handleRegister($input);
        exit();

    case 'login':
        $authCtrl->handleLogin($input);
        exit();

    case 'logout':
        $authCtrl->handleLogout();
        exit();

    case 'get_gemini_key':
        $chatbotCtrl->getGeminiKey();
        exit();
}

// 6. Database Guard for Protected Endpoints
if (!$pdo) {
    sendError("Chưa kết nối cơ sở dữ liệu trên máy chủ. Vui lòng cấu hình biến môi trường DATABASE_URL trong Settings Vercel.", 503);
    exit();
}

// 7. Authentication Guard for Protected User Endpoints
$userId = AuthController::getLoggedInUserId();
if (!$userId) {
    sendError("Vui lòng đăng nhập để thực hiện thao tác", 401);
    exit();
}

// 8. AI Chatbot Endpoint (Protected)
if ($action === 'chat' && $method === 'POST') {
    $chatbotCtrl->handleChat($userId, $input, $pdo);
    exit();
}

// 9. Reminder & Settings Endpoints
if ($action === 'get_notification_settings' && $method === 'GET') {
    $reminderCtrl->getSettings($userId);
    exit();
}
if ($action === 'save_notification_settings' && $method === 'POST') {
    $reminderCtrl->saveSettings($userId, $input);
    exit();
}
if ($action === 'test_zalo_reminder' && $method === 'POST') {
    $reminderCtrl->testZaloReminder($userId, $input);
    exit();
}
if ($action === 'check_and_send_reminder') {
    $reminderCtrl->checkAndSend($userId);
    exit();
}

// 10. Transaction & Budget Endpoints
if ($method === 'GET') {
    $transCtrl->list($userId);
    exit();
}

if ($method === 'POST') {
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
