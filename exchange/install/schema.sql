-- Hufan Exchange — database schema (MySQL 5.7+ / MariaDB 10.3+)
-- Run automatically by the web installer (install/index.php).

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `settings` (
  `key`   VARCHAR(64) NOT NULL,
  `value` TEXT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admins` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(100) NOT NULL,
  `username`      VARCHAR(50)  NOT NULL,
  `email`         VARCHAR(150) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL,
  `created_at`    DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_admin_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(100) NOT NULL,
  `phone`         VARCHAR(20)  NOT NULL,
  `email`         VARCHAR(150) NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `status`        VARCHAR(10)  NOT NULL DEFAULT 'active',
  `last_login_at` DATETIME NULL,
  `created_at`    DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_phone` (`phone`),
  KEY `idx_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `gateways` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                VARCHAR(40)  NOT NULL,
  `name`                VARCHAR(80)  NOT NULL,
  `currency`            VARCHAR(10)  NOT NULL,
  `decimals`            TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `color`               VARCHAR(7)   NOT NULL DEFAULT '#0e7c66',
  `logo`                VARCHAR(255) NULL,
  `reserve`             DECIMAL(20,8) NOT NULL DEFAULT 0,
  `account_label`       VARCHAR(120) NOT NULL,
  `account_placeholder` VARCHAR(120) NULL,
  `account_pattern`     VARCHAR(255) NULL,
  `pay_to`              VARCHAR(190) NULL,
  `pay_to_name`         VARCHAR(120) NULL,
  `ussd_template`       VARCHAR(120) NULL,
  `instructions`        TEXT NULL,
  `is_active`           TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order`          INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_gateway_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pairs` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `from_gateway_id` INT UNSIGNED NOT NULL,
  `to_gateway_id`   INT UNSIGNED NOT NULL,
  `rate`            DECIMAL(20,8) NOT NULL DEFAULT 1,
  `fee_percent`     DECIMAL(7,3)  NOT NULL DEFAULT 0,
  `fee_fixed`       DECIMAL(20,8) NOT NULL DEFAULT 0,
  `min_amount`      DECIMAL(20,8) NOT NULL DEFAULT 1,
  `max_amount`      DECIMAL(20,8) NOT NULL DEFAULT 10000,
  `is_active`       TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order`      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_pair` (`from_gateway_id`, `to_gateway_id`),
  KEY `idx_pair_to` (`to_gateway_id`),
  CONSTRAINT `fk_pair_from` FOREIGN KEY (`from_gateway_id`) REFERENCES `gateways` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pair_to`   FOREIGN KEY (`to_gateway_id`)   REFERENCES `gateways` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`         VARCHAR(30)  NOT NULL,
  `user_id`          INT UNSIGNED NOT NULL,
  `pair_id`          INT UNSIGNED NULL,
  `from_gateway_id`  INT UNSIGNED NULL,
  `to_gateway_id`    INT UNSIGNED NULL,
  `from_name`        VARCHAR(80)  NOT NULL,
  `from_currency`    VARCHAR(10)  NOT NULL,
  `from_decimals`    TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `to_name`          VARCHAR(80)  NOT NULL,
  `to_currency`      VARCHAR(10)  NOT NULL,
  `to_decimals`      TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `send_amount`      DECIMAL(20,8) NOT NULL,
  `fee_amount`       DECIMAL(20,8) NOT NULL DEFAULT 0,
  `rate`             DECIMAL(20,8) NOT NULL,
  `receive_amount`   DECIMAL(20,8) NOT NULL,
  `sender_account`   VARCHAR(190) NOT NULL,
  `receiver_account` VARCHAR(190) NOT NULL,
  `receiver_label`   VARCHAR(120) NULL,
  `pay_to`           VARCHAR(190) NULL,
  `payment_ref`      VARCHAR(120) NULL,
  `proof_file`       VARCHAR(255) NULL,
  `payout_ref`       VARCHAR(190) NULL,
  `customer_note`    VARCHAR(500) NULL,
  `admin_note`       TEXT NULL,
  `status`           VARCHAR(20)  NOT NULL DEFAULT 'awaiting_payment',
  `ip`               VARCHAR(45)  NULL,
  `created_at`       DATETIME NOT NULL,
  `paid_at`          DATETIME NULL,
  `completed_at`     DATETIME NULL,
  `updated_at`       DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_order_no` (`order_no`),
  KEY `idx_order_user` (`user_id`, `created_at`),
  KEY `idx_order_status` (`status`, `created_at`),
  KEY `idx_order_created` (`created_at`),
  CONSTRAINT `fk_order_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_order_pair` FOREIGN KEY (`pair_id`) REFERENCES `pairs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_order_from` FOREIGN KEY (`from_gateway_id`) REFERENCES `gateways` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_order_to`   FOREIGN KEY (`to_gateway_id`)   REFERENCES `gateways` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_logs` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`   INT UNSIGNED NOT NULL,
  `status`     VARCHAR(20)  NOT NULL,
  `note`       VARCHAR(500) NULL,
  `actor`      VARCHAR(10)  NOT NULL,
  `actor_id`   INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_log_order` (`order_id`),
  CONSTRAINT `fk_log_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scope`      VARCHAR(20) NOT NULL,
  `ident`      CHAR(64)    NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_attempt` (`scope`, `ident`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Seed data. Everything below can be changed later from the admin panel.
-- ---------------------------------------------------------------------------

INSERT IGNORE INTO `gateways`
  (`id`, `code`, `name`, `currency`, `decimals`, `color`, `reserve`, `account_label`, `account_placeholder`, `account_pattern`, `pay_to`, `pay_to_name`, `ussd_template`, `instructions`, `is_active`, `sort_order`)
VALUES
  (1, 'evc', 'EVC Plus', 'USD', 2, '#16a34a', 10000, 'EVC Plus number', '61xxxxxxx', '^\\+?[0-9]{7,15}$', '61xxxxxxx', 'Hufan Exchange', '*712*{to}*{amount}#', 'Send from your own EVC Plus number, then enter the Transaction ID from the confirmation SMS.', 1, 1),
  (2, 'moneygo', 'MoneyGo', 'USD', 2, '#2563eb', 5000, 'MoneyGo account / wallet ID', 'e.g. U12345678', NULL, NULL, NULL, NULL, NULL, 1, 2),
  (3, 'usdt_trc20', 'USDT (TRC20)', 'USDT', 2, '#26a17b', 5000, 'USDT TRC20 wallet address', 'T...', '^T[1-9A-HJ-NP-Za-km-z]{33}$', NULL, NULL, NULL, 'Make sure the address is on the TRON (TRC20) network.', 1, 3),
  (4, 'usdt_bep20', 'USDT (BEP20)', 'USDT', 2, '#d4a017', 5000, 'USDT BEP20 wallet address', '0x...', '^0x[a-fA-F0-9]{40}$', NULL, NULL, NULL, 'Make sure the address is on BNB Smart Chain (BEP20).', 1, 4),
  (5, 'paypal', 'PayPal', 'USD', 2, '#1d4ed8', 3000, 'PayPal email', 'name@email.com', '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', NULL, NULL, NULL, NULL, 1, 5);

INSERT IGNORE INTO `pairs`
  (`id`, `from_gateway_id`, `to_gateway_id`, `rate`, `fee_percent`, `fee_fixed`, `min_amount`, `max_amount`, `is_active`, `sort_order`)
VALUES
  (1, 1, 2, 1, 2.000, 0,  5, 5000, 1, 1),
  (2, 1, 3, 1, 3.000, 0, 10, 5000, 1, 2),
  (3, 1, 4, 1, 3.000, 0, 10, 5000, 1, 3),
  (4, 1, 5, 1, 6.000, 0, 10, 2000, 1, 4),
  (5, 2, 1, 1, 2.000, 0,  5, 5000, 0, 5),
  (6, 3, 1, 1, 2.000, 0, 10, 5000, 0, 6),
  (7, 4, 1, 1, 2.000, 0, 10, 5000, 0, 7),
  (8, 5, 1, 1, 8.000, 0, 10, 2000, 0, 8);

INSERT IGNORE INTO `settings` (`key`, `value`) VALUES
  ('site_name', 'Hufan Exchange'),
  ('site_tagline', 'Fast, secure and trusted money exchange'),
  ('brand_color', '#0e7c66'),
  ('logo', ''),
  ('contact_phone', ''),
  ('contact_whatsapp', ''),
  ('contact_email', ''),
  ('contact_address', 'Mogadishu, Somalia'),
  ('working_hours', '24/7'),
  ('timezone', 'Africa/Mogadishu'),
  ('default_lang', 'en'),
  ('order_prefix', 'HX'),
  ('order_expiry_minutes', '60'),
  ('telegram_bot_token', ''),
  ('telegram_chat_id', ''),
  ('statement_note', 'This statement was generated automatically by the system. If you notice any error, please contact us within 7 days.'),
  ('terms_text', '1. Payment must be sent from the number you entered on the order.\n2. Double-check the account/address you will receive on. Funds sent to a wrong address cannot be recovered.\n3. Orders are processed once your payment has been verified.\n4. Rates and fees may change at any time, but your order keeps the rate it was created with.'),
  ('announcement', '');
