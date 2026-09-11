<?php
/* ==========================================================================
   SPENDMINDAI - DATABASE & PERSISTENT SESSION SYSTEM
   Supports Local MySQL, Docker, TiDB Cloud Serverless & Cloud MySQL (SSL)
   ========================================================================== */

require_once __DIR__ . '/security.php';

class Database {
    private static ?PDO $instance = null;
    private static ?string $connectionError = null;
    private static bool $initialized = false;

    public static function getConnection(): ?PDO {
        if (self::$initialized) {
            return self::$instance;
        }

        self::$initialized = true;

        $dbUrl = getEnvVar('DATABASE_URL') ?: getEnvVar('MYSQL_URL');
        $dbHost = getEnvVar('DB_HOST', '127.0.0.1');
        $dbPort = getEnvVar('DB_PORT', '3306');
        $dbUser = getEnvVar('DB_USER', 'root');
        $dbPass = getEnvVar('DB_PASS') !== null ? getEnvVar('DB_PASS') : '';
        $dbName = getEnvVar('DB_NAME', 'quan_ly_chi_tieu');

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

        // Automatic SSL for Remote Hosts (TiDB Cloud, AWS, Aiven, PlanetScale)
        $isLocalHost = in_array(strtolower($dbHost), ['127.0.0.1', 'localhost', '::1', 'db', 'mysql']);
        $useSsl = (getEnvVar('DB_SSL') === 'true') || (!empty($dbUrl) && strpos($dbUrl, 'ssl') !== false) || (!$isLocalHost && getEnvVar('DB_SSL') !== 'false');

        if ($useSsl) {
            if (defined('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT')) {
                $pdoOptions[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] = false;
            }
            if (defined('PDO::MYSQL_ATTR_SSL_CA')) {
                $possibleCas = [
                    '/etc/ssl/certs/ca-certificates.crt',
                    '/etc/pki/tls/certs/ca-bundle.crt',
                    '/etc/ssl/ca-bundle.pem',
                    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem'
                ];
                foreach ($possibleCas as $ca) {
                    if (file_exists($ca)) {
                        $pdoOptions[PDO::MYSQL_ATTR_SSL_CA] = $ca;
                        break;
                    }
                }
            }
        }

        try {
            $dsn = "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4";
            self::$instance = @new PDO($dsn, $dbUser, $dbPass, $pdoOptions);
        } catch (Throwable $e) {
            // If local DB doesn't exist yet, attempt auto-creation
            if ($isLocalHost && (strpos($e->getMessage(), '1049') !== false || strpos($e->getMessage(), 'Unknown database') !== false)) {
                try {
                    $rootDsn = "mysql:host=$dbHost;port=$dbPort;charset=utf8mb4";
                    $rootPdo = @new PDO($rootDsn, $dbUser, $dbPass, $pdoOptions);
                    $rootPdo->exec("CREATE DATABASE IF NOT EXISTS `$dbName` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                    self::$instance = @new PDO($dsn, $dbUser, $dbPass, $pdoOptions);
                } catch (Throwable $e2) {
                    self::$connectionError = $e2->getMessage();
                }
            } else {
                self::$connectionError = $e->getMessage();
            }
        }

        if (self::$instance) {
            $shouldInit = (getEnvVar('INIT_DB_SCHEMA') === 'true');
            if ($shouldInit) {
                self::initSchema(self::$instance);
            }
        } else {
            error_log("Database connection failure: " . (self::$connectionError ?: "Connection parameters not configured"));
        }

        return self::$instance;
    }

    public static function getError(): ?string {
        $isDev = (getenv('APP_ENV') === 'development');
        if ($isDev) {
            return self::$connectionError;
        }
        return self::$connectionError ? "Không thể kết nối đến cơ sở dữ liệu." : null;
    }

    public static function initSchema(PDO $pdo): void {
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

            // Transactions table with high-performance composite index
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
                    INDEX `idx_user_date` (`user_id`, `date`, `id`),
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

            // Schema migrations check
            $colCheck = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'google_id'");
            if ($colCheck && $colCheck->rowCount() === 0) {
                $pdo->exec("ALTER TABLE `users` ADD `google_id` VARCHAR(100) NULL DEFAULT NULL UNIQUE");
                $pdo->exec("ALTER TABLE `users` ADD `reminder_time` TIME NULL DEFAULT NULL");
                $pdo->exec("ALTER TABLE `users` ADD `email_notifications` TINYINT(1) DEFAULT 0");
                $pdo->exec("ALTER TABLE `users` ADD `last_reminder_sent` DATE NULL DEFAULT NULL");
                $pdo->exec("ALTER TABLE `users` ADD `avatar_url` TEXT NULL DEFAULT NULL");
            }
        } catch (Throwable $e) {
            error_log("Schema auto-init notice: " . $e->getMessage());
        }
    }
}

// Serverless PDO Session Handler
if (!class_exists('PdoSessionHandler')) {
    class PdoSessionHandler implements SessionHandlerInterface {
        private PDO $pdo;
        public function __construct(PDO $pdo) {
            $this->pdo = $pdo;
        }
        #[\ReturnTypeWillChange]
        public function open(string $path, string $name): bool {
            return true;
        }
        #[\ReturnTypeWillChange]
        public function close(): bool {
            return true;
        }
        #[\ReturnTypeWillChange]
        public function read(string $id): string|false {
            try {
                $stmt = $this->pdo->prepare("SELECT `data` FROM `sessions` WHERE `id` = :id AND `expiry` > :now");
                $stmt->execute([':id' => $id, ':now' => time()]);
                $data = $stmt->fetchColumn();
                return $data !== false ? (string)$data : '';
            } catch (Throwable $e) {
                return '';
            }
        }
        #[\ReturnTypeWillChange]
        public function write(string $id, string $data): bool {
            try {
                $expiry = time() + 2592000; // 30 days
                $stmt = $this->pdo->prepare("REPLACE INTO `sessions` (`id`, `data`, `expiry`) VALUES (:id, :data, :expiry)");
                return $stmt->execute([':id' => $id, ':data' => $data, ':expiry' => $expiry]);
            } catch (Throwable $e) {
                return false;
            }
        }
        #[\ReturnTypeWillChange]
        public function destroy(string $id): bool {
            try {
                $stmt = $this->pdo->prepare("DELETE FROM `sessions` WHERE `id` = :id");
                return $stmt->execute([':id' => $id]);
            } catch (Throwable $e) {
                return false;
            }
        }
        #[\ReturnTypeWillChange]
        public function gc(int $max_lifetime): int|false {
            try {
                $stmt = $this->pdo->prepare("DELETE FROM `sessions` WHERE `expiry` < :now");
                $stmt->execute([':now' => time()]);
                return $stmt->rowCount();
            } catch (Throwable $e) {
                return false;
            }
        }
    }
}

// Initialize Global Connection & Safe Session
$pdo = Database::getConnection();

if (session_status() === PHP_SESSION_NONE) {
    try {
        if ($pdo instanceof PDO) {
            session_set_save_handler(new PdoSessionHandler($pdo), true);
        } else {
            $tmp = sys_get_temp_dir();
            if (is_dir($tmp) && is_writable($tmp)) {
                session_save_path($tmp);
            }
        }
        $cookieLifetime = isset($_COOKIE['remember_me']) ? 2592000 : 0;
        ini_set('session.gc_maxlifetime', '2592000');
        @session_start([
            'cookie_lifetime' => $cookieLifetime,
            'cookie_httponly' => true,
            'cookie_secure'   => $isSecure,
            'cookie_samesite' => 'Lax'
        ]);
    } catch (Throwable $e) {
        error_log("Session start notice: " . $e->getMessage());
    }
}
