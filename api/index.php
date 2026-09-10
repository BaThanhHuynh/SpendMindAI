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
    case 'check_session':
        $authCtrl->checkSession();
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
    http_response_code(503);
    $dbErr = Database::getError();
    echo json_encode([
        "success" => false,
        "authenticated" => false,
        "db_connected" => false,
        "db_error" => $dbErr,
        "message" => $dbErr ? "Lỗi kết nối cơ sở dữ liệu: $dbErr" : "Chưa kết nối cơ sở dữ liệu Cloud trên Vercel. Vui lòng cấu hình biến môi trường DATABASE_URL hoặc DB_HOST, DB_USER, DB_PASS (TiDB Cloud) trong mục Settings -> Environment Variables."
    ]);
    exit();
}

// 7. Authentication Guard for Protected User Endpoints
$userId = AuthController::getLoggedInUserId();
if (!$userId) {
    http_response_code(401);
    echo json_encode([
        "success" => false,
        "authenticated" => false,
        "message" => "Vui lòng đăng nhập để thực hiện thao tác"
    ]);
    exit();
}

// 8. Reminder & Settings Endpoints
if ($action === 'get_notification_settings' && $method === 'GET') {
    $reminderCtrl->getSettings($userId);
    exit();
}
if ($action === 'save_notification_settings' && $method === 'POST') {
    $reminderCtrl->saveSettings($userId, $input);
    exit();
}
if ($action === 'check_and_send_reminder') {
    $reminderCtrl->checkAndSend($userId);
    exit();
}

// 9. Transaction & Budget Endpoints
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

// 10. Fallback for Unmatched Endpoints
http_response_code(404);
echo json_encode([
    "success" => false,
    "message" => "Hành động API không hợp lệ hoặc không được hỗ trợ"
]);
exit();
