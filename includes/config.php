<?php
/* ==========================================================================
   PRODUCTION CONFIGURATION & CORE INITIALIZATION
   SpendMindAI - Quản Lý Tài Chính Cá Nhân Thông Minh
   ========================================================================== */

// 1. Helper function to load .env variables and get environment values safely
if (!function_exists('loadEnv')) {
    function loadEnv($path) {
        if (!file_exists($path)) {
            return;
        }
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || strpos($trimmed, '#') === 0) {
                continue;
            }
            $parts = explode('=', $line, 2);
            if (count($parts) === 2) {
                $key = trim($parts[0]);
                $val = trim($parts[1]);
                if (preg_match('/^"(.*)"$/', $val, $matches) || preg_match('/^\'(.*)\'$/', $val, $matches)) {
                    $val = $matches[1];
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
        if ($val !== false && $val !== '') {
            return $val;
        }
        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return $_ENV[$key];
        }
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return $_SERVER[$key];
        }
        return $default;
    }
}

// Load .env from workspace root if exists
loadEnv(__DIR__ . '/../.env');

// 2. Environment Mode Configuration
$appEnv = getEnvVar('APP_ENV', 'production');

if (strtolower($appEnv) === 'development') {
    ini_set('display_errors', '1');
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

// Default Timezone
date_default_timezone_set('Asia/Ho_Chi_Minh');

// 3. Security Headers & CORS Config
$allowedOriginsStr = getEnvVar('ALLOWED_ORIGINS', '');
$allowedOrigins = array_filter(array_map('trim', explode(',', $allowedOriginsStr)));
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';

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

// Check HTTPS / Secure connection
$isSecure = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
            (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ||
            (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);

// 4. Database Connection (Dynamic Config supporting Local, Docker & Cloud MySQL / TiDB)
$dbUrl = getEnvVar('DATABASE_URL') ?: getEnvVar('MYSQL_URL');
$dbHost = getEnvVar('DB_HOST', '127.0.0.1');
$dbPort = getEnvVar('DB_PORT', '3306');
$dbUser = getEnvVar('DB_USER', 'root');
$dbPass = getEnvVar('DB_PASS') !== null ? getEnvVar('DB_PASS') : '';
$dbName = getEnvVar('DB_NAME', 'quan_ly_chi_tieu');

// Parse DATABASE_URL / MYSQL_URL if provided (e.g. from Vercel / Railway / Cloud providers)
if (!empty($dbUrl)) {
    $parsed = parse_url($dbUrl);
    if ($parsed) {
        if (isset($parsed['host'])) $dbHost = $parsed['host'];
        if (isset($parsed['port'])) $dbPort = (string)$parsed['port'];
        if (isset($parsed['user'])) $dbUser = urldecode($parsed['user']);
        if (isset($parsed['pass'])) $dbPass = urldecode($parsed['pass']);
        if (isset($parsed['path'])) $dbName = ltrim($parsed['path'], '/');
    }
}

$pdoOptions = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
];

// Automatically enable SSL for remote/cloud MySQL hosts (TiDB Serverless, Aiven, PlanetScale, etc.)
$isLocalHost = in_array(strtolower($dbHost), ['127.0.0.1', 'localhost', '::1', 'db', 'mysql']);
$useSsl = (getEnvVar('DB_SSL') === 'true') || (!empty($dbUrl) && strpos($dbUrl, 'ssl') !== false) || (!$isLocalHost && getEnvVar('DB_SSL') !== 'false');

if ($useSsl && defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) {
    $pdoOptions[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
}

try {
    $dsn = "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4";
    $pdo = new PDO($dsn, $dbUser, $dbPass, $pdoOptions);
} catch (PDOException $e) {
    // If database does not exist on local environment, attempt auto-creation
    if ($isLocalHost && (strpos($e->getMessage(), '1049') !== false || strpos($e->getMessage(), 'Unknown database') !== false)) {
        try {
            $rootDsn = "mysql:host=$dbHost;port=$dbPort;charset=utf8mb4";
            $rootPdo = new PDO($rootDsn, $dbUser, $dbPass, $pdoOptions);
            $rootPdo->exec("CREATE DATABASE IF NOT EXISTS `$dbName` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $pdo = new PDO($dsn, $dbUser, $dbPass, $pdoOptions);
        } catch (Exception $e2) {
            error_log("Database auto-creation error: " . $e2->getMessage());
            http_response_code(500);
            echo json_encode([
                "success" => false,
                "message" => "Có lỗi xảy ra khi kết nối cơ sở dữ liệu. Vui lòng kiểm tra lại cấu hình DB."
            ]);
            exit();
        }
    } else {
        error_log("Database connection error: " . $e->getMessage());
        http_response_code(500);
        echo json_encode([
            "success" => false,
            "message" => "Có lỗi xảy ra khi kết nối cơ sở dữ liệu. Vui lòng kiểm tra lại cấu hình DB."
        ]);
        exit();
    }
}

// 5. Automatic Schema & Tables Initialization
try {
    // Users table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `username` VARCHAR(50) NOT NULL UNIQUE,
            `password` VARCHAR(255) NOT NULL,
            `email` VARCHAR(100) NOT NULL UNIQUE,
            `google_id` VARCHAR(100) NULL DEFAULT NULL UNIQUE,
            `reminder_time` TIME NULL DEFAULT NULL,
            `email_notifications` TINYINT(1) DEFAULT 0,
            `last_reminder_sent` DATE NULL DEFAULT NULL,
            `avatar_url` TEXT NULL DEFAULT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // Transactions table
    $pdo->exec("
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
    ");

    // Budgets table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `budgets` (
            `user_id` INT NOT NULL,
            `category` VARCHAR(50) NOT NULL,
            `limit_amount` DECIMAL(15, 2) NOT NULL,
            PRIMARY KEY (`user_id`, `category`),
            FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // Serverless Persistent Sessions table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `sessions` (
            `id` VARCHAR(128) NOT NULL PRIMARY KEY,
            `data` MEDIUMTEXT NOT NULL,
            `expiry` INT UNSIGNED NOT NULL,
            INDEX (`expiry`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // Backward compatibility migration for older users table schema
    $colCheck = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'google_id'");
    if ($colCheck && $colCheck->rowCount() === 0) {
        $pdo->exec("ALTER TABLE `users` ADD `google_id` VARCHAR(100) NULL DEFAULT NULL UNIQUE");
        $pdo->exec("ALTER TABLE `users` ADD `reminder_time` TIME NULL DEFAULT NULL");
        $pdo->exec("ALTER TABLE `users` ADD `email_notifications` TINYINT(1) DEFAULT 0");
        $pdo->exec("ALTER TABLE `users` ADD `last_reminder_sent` DATE NULL DEFAULT NULL");
        $pdo->exec("ALTER TABLE `users` ADD `avatar_url` TEXT NULL DEFAULT NULL");
    }
} catch (Exception $schemaErr) {
    error_log("Schema initialization notice: " . $schemaErr->getMessage());
}

// 6. PDO Database Session Handler (Essential for Serverless / Vercel multi-instance persistence)
if (!class_exists('PdoSessionHandler')) {
    class PdoSessionHandler implements SessionHandlerInterface {
        private $pdo;
        public function __construct(PDO $pdo) {
            $this->pdo = $pdo;
        }
        public function open(string $path, string $name): bool {
            return true;
        }
        public function close(): bool {
            return true;
        }
        public function read(string $id): string|false {
            try {
                $stmt = $this->pdo->prepare("SELECT `data` FROM `sessions` WHERE `id` = :id AND `expiry` > :now");
                $stmt->execute([':id' => $id, ':now' => time()]);
                $data = $stmt->fetchColumn();
                return $data !== false ? (string)$data : '';
            } catch (Exception $e) {
                return '';
            }
        }
        public function write(string $id, string $data): bool {
            try {
                $expiry = time() + 2592000; // 30 days
                $stmt = $this->pdo->prepare("REPLACE INTO `sessions` (`id`, `data`, `expiry`) VALUES (:id, :data, :expiry)");
                return $stmt->execute([':id' => $id, ':data' => $data, ':expiry' => $expiry]);
            } catch (Exception $e) {
                return false;
            }
        }
        public function destroy(string $id): bool {
            try {
                $stmt = $this->pdo->prepare("DELETE FROM `sessions` WHERE `id` = :id");
                return $stmt->execute([':id' => $id]);
            } catch (Exception $e) {
                return false;
            }
        }
        public function gc(int $max_lifetime): int|false {
            try {
                $stmt = $this->pdo->prepare("DELETE FROM `sessions` WHERE `expiry` < :now");
                $stmt->execute([':now' => time()]);
                return $stmt->rowCount();
            } catch (Exception $e) {
                return false;
            }
        }
    }
}

// Initialize Session with Database Handler
if (session_status() === PHP_SESSION_NONE) {
    if (isset($pdo) && $pdo instanceof PDO) {
        session_set_save_handler(new PdoSessionHandler($pdo), true);
    }
    $cookieLifetime = isset($_COOKIE['remember_me']) ? 2592000 : 0;
    ini_set('session.gc_maxlifetime', '2592000');
    session_start([
        'cookie_lifetime' => $cookieLifetime,
        'cookie_httponly' => true,
        'cookie_secure'   => $isSecure,
        'cookie_samesite' => 'Lax'
    ]);
}

// 7. Dynamic Application URL Resolution
$appUrl = getEnvVar('APP_URL');
if (empty($appUrl)) {
    $protocol = $isSecure ? 'https' : 'http';
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost:8081';
    
    $scriptName = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '';
    $dir = dirname($scriptName);
    $dir = str_replace('\\', '/', $dir);
    $dir = rtrim($dir, '/');
    
    if ($dir === '' || $dir === '/' || $dir === '/api') {
        $appUrl = "$protocol://$host";
    } else {
        $appUrl = "$protocol://$host$dir";
    }
}
$appUrl = rtrim($appUrl, '/');
