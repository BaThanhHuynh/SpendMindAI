<?php
/* ==========================================================================
   PRODUCTION CONFIGURATION & CORE INITIALIZATION
   ========================================================================== */

// 1. Helper function to load .env variables
function loadEnv($path) {
    if (!file_exists($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        // Skip comments
        if (strpos(trim($line), '#') === 0) {
            continue;
        }
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $val = trim($parts[1]);
            // Strip surrounding quotes
            if (preg_match('/^"(.*)"$/', $val, $matches) || preg_match('/^\'(.*)\'$/', $val, $matches)) {
                $val = $matches[1];
            }
            // Load into environment only if not already set (allows Docker settings to override)
            if (getenv($key) === false) {
                putenv("$key=$val");
                $_ENV[$key] = $val;
                $_SERVER[$key] = $val;
            }
        }
    }
}

// Load .env from workspace root
loadEnv(__DIR__ . '/../.env');

// 2. Load and define Environment Mode
$appEnv = getenv('APP_ENV') ?: 'production';

if (strtolower($appEnv) === 'development') {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

// Set default timezone
date_default_timezone_set('Asia/Ho_Chi_Minh');

// 3. Security Headers & CORS Config
$allowedOriginsStr = getenv('ALLOWED_ORIGINS') ?: '';
$allowedOrigins = array_filter(array_map('trim', explode(',', $allowedOriginsStr)));
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

if (!empty($allowedOrigins)) {
    if (in_array($origin, $allowedOrigins)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else {
        // Fallback to the first origin but do not permit credentials
        header("Access-Control-Allow-Origin: " . $allowedOrigins[0]);
    }
} else {
    // If no whitelist is defined, default to allowing current origin (useful for local development & Cloudflare tunnel)
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

// 4. Secure Session Configuration
$isSecure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
            (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
            (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

if (session_status() === PHP_SESSION_NONE) {
    $cookieLifetime = isset($_COOKIE['remember_me']) ? 2592000 : 0;
    ini_set('session.gc_maxlifetime', 2592000);
    session_start([
        'cookie_lifetime' => $cookieLifetime,
        'cookie_httponly' => true,
        'cookie_secure'   => $isSecure,
        'cookie_samesite' => 'Lax'
    ]);
}

// 5. Database Connection (Dynamic Config with fallback logic)
$dbHost = getenv('DB_HOST') ?: '127.0.0.1';
$dbPort = getenv('DB_PORT') ?: '3306';
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASS') !== false ? getenv('DB_PASS') : '';
$dbName = getenv('DB_NAME') ?: 'quan_ly_chi_tieu';

try {
    // Connect to database server (no DB name chosen yet)
    $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;charset=utf8mb4", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Auto-create database if not exists
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbName` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

    // Reconnect with database selected
    $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Auto-create users table if not exists
    $createUsersTable = "
        CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `password` VARCHAR(255) NOT NULL,
            `email` VARCHAR(100) NOT NULL UNIQUE,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($createUsersTable);

    // Migration helper for checking and adding columns
    $columnsToCheck = [
        'google_id' => "ALTER TABLE `users` ADD `google_id` VARCHAR(100) NULL DEFAULT NULL UNIQUE",
        'reminder_time' => "ALTER TABLE `users` ADD `reminder_time` TIME NULL DEFAULT NULL",
        'email_notifications' => "ALTER TABLE `users` ADD `email_notifications` TINYINT(1) DEFAULT 0",
        'last_reminder_sent' => "ALTER TABLE `users` ADD `last_reminder_sent` DATE NULL DEFAULT NULL",
        'avatar_url' => "ALTER TABLE `users` ADD `avatar_url` TEXT NULL DEFAULT NULL"
    ];

    $existingColumns = [];
    $q = $pdo->query("SHOW COLUMNS FROM `users`");
    while ($row = $q->fetch(PDO::FETCH_ASSOC)) {
        $existingColumns[] = strtolower($row['Field']);
    }

    foreach ($columnsToCheck as $colName => $alterSql) {
        if (!in_array(strtolower($colName), $existingColumns)) {
            $pdo->exec($alterSql);
        }
    }

    // Auto-create transactions table if not exists
    $createTransactionsTable = "
        CREATE TABLE IF NOT EXISTS `transactions` (
            `id` VARCHAR(50) NOT NULL,
            `user_id` INT NOT NULL,
            `type` VARCHAR(10) NOT NULL,
            `amount` DECIMAL(15, 2) NOT NULL,
            `category` VARCHAR(50) NOT NULL,
            `date` DATE NOT NULL,
            `description` TEXT,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($createTransactionsTable);

    // Auto-create budgets table if not exists
    $createBudgetsTable = "
        CREATE TABLE IF NOT EXISTS `budgets` (
            `user_id` INT NOT NULL,
            `category` VARCHAR(50) NOT NULL,
            `limit_amount` DECIMAL(15, 2) NOT NULL,
            PRIMARY KEY (`user_id`, `category`),
            FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";
    $pdo->exec($createBudgetsTable);

} catch (PDOException $e) {
    // Log exception details securely to server log (does not output to client)
    error_log("Database connection error: " . $e->getMessage());
    
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Có lỗi xảy ra khi kết nối cơ sở dữ liệu. Vui lòng thử lại sau."
    ]);
    exit();
}

// 6. Dynamic Application URL Resolution
$appUrl = getenv('APP_URL');
if (empty($appUrl)) {
    $protocol = $isSecure ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost:8081';
    
    $scriptName = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '';
    $dir = dirname($scriptName);
    $dir = str_replace('\\', '/', $dir);
    $dir = rtrim($dir, '/');
    
    if ($dir === '' || $dir === '/') {
        $appUrl = "$protocol://$host";
    } else {
        $appUrl = "$protocol://$host$dir";
    }
}
$appUrl = rtrim($appUrl, '/');

