<?php
/* ==========================================================================
   SPENDMINDAI - PRODUCTION SECURITY & CONFIGURATION SYSTEM
   ========================================================================== */

// Prevent raw PHP error leakage to client
ini_set('display_errors', '0');
error_reporting(E_ALL);

// Safe JSON Error Handling: Intercept fatal user errors without breaking try-catch on warnings
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
    return false;
});

// Clean JSON Exception Handler
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

// Register Shutdown Handler for fatal engine errors
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

// Environment Variable Helpers
if (!function_exists('loadEnv')) {
    function loadEnv($path) {
        if (!file_exists($path)) return;
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || strpos($trimmed, '#') === 0) continue;
            $parts = explode('=', $line, 2);
            if (count($parts) === 2) {
                $key = trim($parts[0]);
                $val = trim($parts[1]);
                if (preg_match('/^"(.*)"$/', $val, $m) || preg_match('/^\'(.*)\'$/', $val, $m)) {
                    $val = $m[1];
                }
                if (getenv($key) === false) {
                    putenv("$key=$val");
                    $_ENV[$key] = $val;
                    $_SERVER[$key] = $val;
                }
            }
        }
    }
}

if (!function_exists('getEnvVar')) {
    function getEnvVar($key, $default = null) {
        $val = getenv($key);
        if ($val !== false && $val !== '') return $val;
        if (isset($_ENV[$key]) && $_ENV[$key] !== '') return $_ENV[$key];
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') return $_SERVER[$key];
        return $default;
    }
}

// Load local .env files if present
loadEnv(__DIR__ . '/../../.env');
loadEnv(__DIR__ . '/../.env');

// Set Timezone
date_default_timezone_set('Asia/Ho_Chi_Minh');

// CORS & HTTP Headers
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowedOriginsStr = getEnvVar('ALLOWED_ORIGINS', '');
$allowedOrigins = array_filter(array_map('trim', explode(',', $allowedOriginsStr)));

if (!empty($allowedOrigins)) {
    if (in_array($origin, $allowedOrigins)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else {
        header("Access-Control-Allow-Origin: " . $allowedOrigins[0]);
    }
} else {
    if ($origin) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else {
        header("Access-Control-Allow-Origin: *");
    }
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight OPTIONS request
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// HTTPS & Secure Cookie Detection
$isSecure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
            (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
            (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

// Dynamic App URL resolution
$appUrl = getEnvVar('APP_URL');
if (empty($appUrl)) {
    $protocol = $isSecure ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost:8081';
    $scriptName = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '';
    $dir = str_replace('\\', '/', dirname($scriptName));
    $dir = rtrim($dir, '/');
    if ($dir === '' || $dir === '/' || $dir === '/api') {
        $appUrl = "$protocol://$host";
    } else {
        $appUrl = "$protocol://$host$dir";
    }
}
$appUrl = rtrim($appUrl, '/');
