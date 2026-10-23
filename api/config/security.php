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
        error_log("PHP Error [$errno]: $errstr in $errfile on line $errline");
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=UTF-8');
            http_response_code(500);
        }
        $isDev = (getenv('APP_ENV') === 'development');
        echo json_encode([
            "success" => false,
            "message" => $isDev ? "Lỗi xử lý API: $errstr" : "Lỗi xử lý hệ thống. Vui lòng thử lại sau."
        ], JSON_UNESCAPED_UNICODE);
        exit();
    }
    return false;
});

// Clean JSON Exception Handler: Never leak database credentials or internal stack to client
set_exception_handler(function (Throwable $ex) {
    error_log("Uncaught Exception: " . $ex->getMessage() . "\n" . $ex->getTraceAsString());
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=UTF-8');
        http_response_code(500);
    }
    $isDev = (getenv('APP_ENV') === 'development');
    echo json_encode([
        "success" => false,
        "message" => $isDev ? ("Lỗi hệ thống: " . $ex->getMessage()) : "Đã xảy ra lỗi trong quá trình xử lý. Vui lòng thử lại sau."
    ], JSON_UNESCAPED_UNICODE);
    exit();
});

// Register Shutdown Handler for fatal engine errors
register_shutdown_function(function () {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        error_log("Fatal Engine Error: " . $error['message'] . " in " . $error['file'] . " on line " . $error['line']);
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=UTF-8');
            http_response_code(500);
        }
        $isDev = (getenv('APP_ENV') === 'development');
        echo json_encode([
            "success" => false,
            "message" => $isDev ? ("Lỗi nghiêm trọng: " . $error['message'] . " (dòng " . $error['line'] . ")") : "Lỗi máy chủ nghiêm trọng. Vui lòng thử lại sau."
        ], JSON_UNESCAPED_UNICODE);
    }
});

/**
 * Standardized JSON API response helpers
 */
if (!function_exists('sendJson')) {
    function sendJson(array $data, int $statusCode = 200): void {
        if (!headers_sent()) {
            http_response_code($statusCode);
            header('Content-Type: application/json; charset=UTF-8');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit();
    }
}

if (!function_exists('sendError')) {
    function sendError(string $message, int $statusCode = 400, ?string $code = null): void {
        $errorCode = $code ?? match ($statusCode) {
            400 => "BAD_REQUEST",
            401 => "UNAUTHORIZED",
            403 => "FORBIDDEN",
            404 => "NOT_FOUND",
            409 => "CONFLICT",
            500 => "INTERNAL_SERVER_ERROR",
            502 => "BAD_GATEWAY",
            503 => "SERVICE_UNAVAILABLE",
            default => "ERROR"
        };
        $payload = [
            "success" => false,
            "message" => $message,
            "error" => [
                "code" => $errorCode,
                "message" => $message
            ]
        ];
        sendJson($payload, $statusCode);
    }
}

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

// Client IP Resolution
if (!function_exists('getClientIp')) {
    function getClientIp(): string {
        $headers = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'];
        foreach ($headers as $h) {
            if (!empty($_SERVER[$h])) {
                $ipList = explode(',', $_SERVER[$h]);
                $ip = trim($ipList[0]);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        return '127.0.0.1';
    }
}

// Distributed Rate Limiter for Serverless & Web Environments
if (!function_exists('enforceRateLimit')) {
    function enforceRateLimit(string $action, string $identifier, int $maxAttempts, int $windowSeconds, ?PDO $pdo = null): bool {
        $now = time();
        $key = "rl:" . substr(hash('sha256', "{$action}:{$identifier}"), 0, 32);

        // 1. Try MySQL-based rate limiting if PDO is available
        if ($pdo) {
            try {
                static $tableChecked = false;
                if (!$tableChecked) {
                    $pdo->exec("
                        CREATE TABLE IF NOT EXISTS `rate_limits` (
                            `rate_key` VARCHAR(64) NOT NULL PRIMARY KEY,
                            `hits` INT UNSIGNED NOT NULL DEFAULT 1,
                            `expires_at` INT UNSIGNED NOT NULL,
                            INDEX `idx_rl_exp` (`expires_at`)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                    ");
                    if (mt_rand(1, 100) === 1) {
                        $pdo->exec("DELETE FROM `rate_limits` WHERE `expires_at` < $now");
                    }
                    $tableChecked = true;
                }

                $stmt = $pdo->prepare("
                    INSERT INTO `rate_limits` (`rate_key`, `hits`, `expires_at`) 
                    VALUES (:k, 1, :exp) 
                    ON DUPLICATE KEY UPDATE 
                        `hits` = IF(`expires_at` < :now, 1, `hits` + 1),
                        `expires_at` = IF(`expires_at` < :now, :exp, `expires_at`)
                ");
                $stmt->execute([
                    ':k' => $key,
                    ':exp' => $now + $windowSeconds,
                    ':now' => $now
                ]);

                $chk = $pdo->prepare("SELECT `hits`, `expires_at` FROM `rate_limits` WHERE `rate_key` = :k");
                $chk->execute([':k' => $key]);
                $row = $chk->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    $hits = (int)$row['hits'];
                    $retryAfter = max(1, (int)$row['expires_at'] - $now);
                    header("X-RateLimit-Limit: $maxAttempts");
                    header("X-RateLimit-Remaining: " . max(0, $maxAttempts - $hits));
                    if ($hits > $maxAttempts) {
                        header("Retry-After: $retryAfter");
                        return false;
                    }
                    return true;
                }
            } catch (Throwable $e) {
                error_log("RateLimit PDO notice: " . $e->getMessage());
            }
        }

        // 2. Fallback to PHP Session bucket if PDO is temporarily unavailable
        if (session_status() === PHP_SESSION_ACTIVE) {
            if (!isset($_SESSION['__rl'])) $_SESSION['__rl'] = [];
            $bucket = $_SESSION['__rl'][$key] ?? null;
            if (!$bucket || $bucket['exp'] < $now) {
                $_SESSION['__rl'][$key] = ['hits' => 1, 'exp' => $now + $windowSeconds];
                return true;
            }
            $bucket['hits']++;
            $_SESSION['__rl'][$key] = $bucket;
            if ($bucket['hits'] > $maxAttempts) {
                return false;
            }
            return true;
        }

        return true;
    }
}

// Set Timezone
date_default_timezone_set('Asia/Ho_Chi_Minh');

// Strict CORS Whitelist Configuration (Prevents Cross-Site Credential Leakage)
$origin = isset($_SERVER['HTTP_ORIGIN']) ? trim($_SERVER['HTTP_ORIGIN']) : '';
$allowedOriginsStr = getEnvVar('ALLOWED_ORIGINS', '');
$envOrigins = array_filter(array_map('trim', explode(',', $allowedOriginsStr)));

$defaultTrustedOrigins = [
    'https://huynhbathanh.site',
    'https://www.huynhbathanh.site',
    'https://spend-mind-ai.vercel.app'
];
if (getenv('APP_ENV') === 'development' || (!empty($_SERVER['HTTP_HOST']) && (str_contains($_SERVER['HTTP_HOST'], 'localhost') || str_contains($_SERVER['HTTP_HOST'], '127.0.0.1')))) {
    $defaultTrustedOrigins[] = 'http://localhost:8081';
    $defaultTrustedOrigins[] = 'http://127.0.0.1:8081';
    $defaultTrustedOrigins[] = 'http://localhost:3000';
}

$trustedOrigins = array_unique(array_merge($defaultTrustedOrigins, $envOrigins));

if (!empty($origin) && in_array($origin, $trustedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
} else {
    // Untrusted or absent Origin: never reflect arbitrary Origin with credentials
    header("Access-Control-Allow-Origin: " . $trustedOrigins[0]);
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Standard HTTP Security Headers (Defence in Depth for all environments)
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: SAMEORIGIN");
header("X-XSS-Protection: 1; mode=block");
header("Referrer-Policy: strict-origin-when-cross-origin");

// Handle preflight OPTIONS request
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// HTTPS & Secure Cookie Detection
$isSecure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
            (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
            (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

// Hardened Session Cookie Configuration
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_httponly', '1');
    if ($isSecure) {
        ini_set('session.cookie_secure', '1');
    }
    ini_set('session.cookie_samesite', 'Lax');
}

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
