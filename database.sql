-- =========================================================================
-- SpendMindAI - Database Schema
-- Quản Lý Tài Chính Cá Nhân Thông Minh Tích Hợp Google Gemini AI
-- =========================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Bảng lưu thông tin người dùng
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `email` VARCHAR(100) NOT NULL UNIQUE,
    `google_id` VARCHAR(100) NULL DEFAULT NULL UNIQUE,
    `reminder_time` TIME NULL DEFAULT NULL,
    `email_notifications` TINYINT(1) DEFAULT 0,
    `zalo_phone` VARCHAR(20) NULL DEFAULT NULL,
    `zalo_user_id` VARCHAR(50) NULL DEFAULT NULL,
    `zalo_notifications` TINYINT(1) DEFAULT 0,
    `last_reminder_sent` DATE NULL DEFAULT NULL,
    `avatar_url` TEXT NULL DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng lưu danh sách thu chi / giao dịch
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
    INDEX (`date`),
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bảng thiết lập định mức chi tiêu theo danh mục
CREATE TABLE IF NOT EXISTS `budgets` (
    `user_id` INT NOT NULL,
    `category` VARCHAR(50) NOT NULL,
    `limit_amount` DECIMAL(15, 2) NOT NULL,
    PRIMARY KEY (`user_id`, `category`),
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng lưu trữ PHP Session (phục vụ Serverless Vercel / Multi-instance)
CREATE TABLE IF NOT EXISTS `sessions` (
    `id` VARCHAR(128) NOT NULL PRIMARY KEY,
    `data` MEDIUMTEXT NOT NULL,
    `expiry` INT UNSIGNED NOT NULL,
    INDEX (`expiry`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
