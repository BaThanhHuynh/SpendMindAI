<?php
/* ==========================================================================
   BACKEND PHP API - MULTIUSER AUTH & SCALED CRUD (SpendMindAI)
   Self-contained Serverless Function for Vercel & Web Server
   ========================================================================== */

// Prevent raw error leaking to clients
ini_set('display_errors', '0');
error_reporting(E_ALL);

// Error Handler: Only catch fatal user/recoverable errors.
// DO NOT abort on warnings/notices/deprecations so standard try-catch blocks work as intended.
set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    if ($errno === E_USER_ERROR || $errno === E_RECOVERABLE_ERROR) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=UTF-8');
            http_response_code(500);
        }
        echo json_encode([
            "success" => false,
            "message" => "Lỗi xử lý API: $errstr"
        ]);
        exit();
    }
    // Return false for normal warnings/notices/deprecations so PHP handles them silently
    return false;
});

// Exception Handler: Catch unhandled exceptions cleanly and output valid JSON
set_exception_handler(function ($ex) {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=UTF-8');
        http_response_code(500);
    }
    echo json_encode([
        "success" => false,
        "message" => "Lỗi hệ thống: " . $ex->getMessage()
    ]);
    exit();
});

// Register Shutdown Function: Catch fatal PHP engine errors
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=UTF-8');
            http_response_code(500);
        }
        echo json_encode([
            "success" => false,
            "message" => "Lỗi nghiêm trọng: " . $error['message'] . " (dòng " . $error['line'] . ")"
        ]);
    }
});

// Include configuration
require_once __DIR__ . '/includes/config.php';

// Define verification constant for security in handler files
define('PDO_CONNECT_VERIFIED', true);

// Get HTTP Request Details
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Decode JSON input for POST/PUT methods
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);
if (!is_array($input)) {
    $input = [];
}

// Helper to check user login status
function getLoggedInUserId()
{
    return isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
}

// 1. Route Authentication Actions (Session check, Google client ID, Google auth, login, register, logout)
// check_session & get_google_client_id work gracefully even without database connection!
if (in_array($action, ['check_session', 'get_google_client_id', 'google_auth', 'register', 'login', 'logout'])) {
    require_once __DIR__ . '/includes/auth_handlers.php';
    exit();
}

// 2. Route Chatbot Actions (Gemini API LLM) - does not require DB!
if ($action === 'get_gemini_key') {
    $geminiApiKey = function_exists('getEnvVar') ? getEnvVar('GEMINI_API_KEY') : getenv('GEMINI_API_KEY');
    echo json_encode([
        "success" => !empty($geminiApiKey),
        "key" => $geminiApiKey,
        "message" => empty($geminiApiKey) ? "GEMINI_API_KEY chưa được cấu hình trong biến môi trường" : ""
    ]);
    exit();
}

// 3. Database Requirement Guard for remaining data operations
if (!$pdo) {
    http_response_code(503);
    echo json_encode([
        "success" => false,
        "authenticated" => false,
        "db_connected" => false,
        "message" => "Chưa kết nối cơ sở dữ liệu. Vui lòng cấu hình biến môi trường DB_HOST, DB_USER, DB_PASS hoặc DATABASE_URL (TiDB Cloud) trên Vercel."
    ]);
    exit();
}

// 4. Auth Session Guard Check for user-specific endpoints
$userId = getLoggedInUserId();
if (!$userId) {
    http_response_code(401);
    echo json_encode(["success" => false, "authenticated" => false, "message" => "Vui lòng đăng nhập để thực hiện"]);
    exit();
}

// 5. Route Settings & Reminder Actions
if (in_array($action, ['get_notification_settings', 'save_notification_settings', 'check_and_send_reminder'])) {
    require_once __DIR__ . '/includes/reminder_handlers.php';
    exit();
}

// 6. Route Transaction & Budget Actions
if ($method === 'GET') {
    require_once __DIR__ . '/includes/transaction_handlers.php';
    exit();
} elseif ($method === 'POST') {
    if (in_array($action, ['save_transaction', 'delete_transaction', 'clear_all_data'])) {
        require_once __DIR__ . '/includes/transaction_handlers.php';
        exit();
    } elseif ($action === 'save_budgets') {
        require_once __DIR__ . '/includes/budget_handlers.php';
        exit();
    }
}

// Fallback for unsupported endpoints
http_response_code(404);
echo json_encode(["success" => false, "message" => "Hành động không được hỗ trợ"]);
exit();
