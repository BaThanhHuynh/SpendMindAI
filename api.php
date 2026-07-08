<?php
/* ==========================================================================
   BACKEND PHP API - MULTIUSER AUTH & SCALED CRUD (QUAN LY CHI TIEU)
   ========================================================================== */

// Include production-ready configuration
require_once __DIR__ . '/includes/config.php';

// Define verification constant for security in handler files
define('PDO_CONNECT_VERIFIED', true);

// Get HTTP Request Details
$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

// Decode JSON input for POST/PUT methods
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);

// Helper to check user login status
function getLoggedInUserId()
{
    return isset($_SESSION['user_id']) ? $_SESSION['user_id'] : null;
}

// 1. Route Authentication Actions (Session check, Google auth, login, register, logout)
if (in_array($action, ['check_session', 'get_google_client_id', 'google_auth', 'register', 'login', 'logout'])) {
    require_once __DIR__ . '/includes/auth_handlers.php';
    exit();
}

// 2. Auth Session Guard Check for all remaining endpoints
$userId = getLoggedInUserId();
if (!$userId) {
    http_response_code(401);
    echo json_encode(["success" => false, "authenticated" => false, "message" => "Vui lòng đăng nhập để thực hiện"]);
    exit();
}

// 3. Route Settings & Reminder Actions
if (in_array($action, ['get_notification_settings', 'save_notification_settings', 'check_and_send_reminder'])) {
    require_once __DIR__ . '/includes/reminder_handlers.php';
    exit();
}

// 4. Route Chatbot Actions (Gemini API LLM)
if ($action === 'get_gemini_key') {
    $geminiApiKey = getenv('GEMINI_API_KEY');
    echo json_encode([
        "success" => !empty($geminiApiKey),
        "key" => $geminiApiKey,
        "message" => empty($geminiApiKey) ? "GEMINI_API_KEY chưa được cấu hình trong file .env" : ""
    ]);
    exit();
}

// 4. Route Transaction & Budget Actions
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