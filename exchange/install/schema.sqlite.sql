-- Hufan Exchange — database schema for SQLite (the automatic, zero-setup database).
-- Run automatically by the web installer (install/index.php). Keep in sync with schema.sql.

CREATE TABLE IF NOT EXISTS `settings` (
  `key`   TEXT PRIMARY KEY,
  `value` TEXT NULL
);

CREATE TABLE IF NOT EXISTS `admins` (
  `id`            INTEGER PRIMARY KEY AUTOINCREMENT,
  `name`          TEXT NOT NULL,
  `username`      TEXT NOT NULL UNIQUE,
  `email`         TEXT NULL,
  `password_hash` TEXT NOT NULL,
  `is_active`     INTEGER NOT NULL DEFAULT 1,
  `last_login_at` TEXT NULL,
  `created_at`    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS `users` (
  `id`            INTEGER PRIMARY KEY AUTOINCREMENT,
  `name`          TEXT NOT NULL,
  `phone`         TEXT NOT NULL UNIQUE,
  `email`         TEXT NULL,
  `password_hash` TEXT NOT NULL,
  `status`        TEXT NOT NULL DEFAULT 'active',
  `last_login_at` TEXT NULL,
  `created_at`    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_user_email` ON `users` (`email`);

CREATE TABLE IF NOT EXISTS `gateways` (
  `id`                  INTEGER PRIMARY KEY AUTOINCREMENT,
  `code`                TEXT NOT NULL UNIQUE,
  `name`                TEXT NOT NULL,
  `currency`            TEXT NOT NULL,
  `decimals`            INTEGER NOT NULL DEFAULT 2,
  `color`               TEXT NOT NULL DEFAULT '#0e7c66',
  `logo`                TEXT NULL,
  `reserve`             NUMERIC NOT NULL DEFAULT 0,
  `account_label`       TEXT NOT NULL,
  `account_placeholder` TEXT NULL,
  `account_pattern`     TEXT NULL,
  `pay_to`              TEXT NULL,
  `pay_to_name`         TEXT NULL,
  `ussd_template`       TEXT NULL,
  `instructions`        TEXT NULL,
  `is_active`           INTEGER NOT NULL DEFAULT 1,
  `sort_order`          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS `pairs` (
  `id`              INTEGER PRIMARY KEY AUTOINCREMENT,
  `from_gateway_id` INTEGER NOT NULL REFERENCES `gateways` (`id`) ON DELETE CASCADE,
  `to_gateway_id`   INTEGER NOT NULL REFERENCES `gateways` (`id`) ON DELETE CASCADE,
  `rate`            NUMERIC NOT NULL DEFAULT 1,
  `fee_percent`     NUMERIC NOT NULL DEFAULT 0,
  `fee_fixed`       NUMERIC NOT NULL DEFAULT 0,
  `min_amount`      NUMERIC NOT NULL DEFAULT 1,
  `max_amount`      NUMERIC NOT NULL DEFAULT 10000,
  `is_active`       INTEGER NOT NULL DEFAULT 1,
  `sort_order`      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (`from_gateway_id`, `to_gateway_id`)
);
CREATE INDEX IF NOT EXISTS `idx_pair_to` ON `pairs` (`to_gateway_id`);

CREATE TABLE IF NOT EXISTS `orders` (
  `id`               INTEGER PRIMARY KEY AUTOINCREMENT,
  `order_no`         TEXT NOT NULL UNIQUE,
  `user_id`          INTEGER NOT NULL REFERENCES `users` (`id`) ON DELETE RESTRICT,
  `pair_id`          INTEGER NULL REFERENCES `pairs` (`id`) ON DELETE SET NULL,
  `from_gateway_id`  INTEGER NULL REFERENCES `gateways` (`id`) ON DELETE SET NULL,
  `to_gateway_id`    INTEGER NULL REFERENCES `gateways` (`id`) ON DELETE SET NULL,
  `from_name`        TEXT NOT NULL,
  `from_currency`    TEXT NOT NULL,
  `from_decimals`    INTEGER NOT NULL DEFAULT 2,
  `to_name`          TEXT NOT NULL,
  `to_currency`      TEXT NOT NULL,
  `to_decimals`      INTEGER NOT NULL DEFAULT 2,
  `send_amount`      NUMERIC NOT NULL,
  `fee_amount`       NUMERIC NOT NULL DEFAULT 0,
  `rate`             NUMERIC NOT NULL,
  `receive_amount`   NUMERIC NOT NULL,
  `sender_account`   TEXT NOT NULL,
  `receiver_account` TEXT NOT NULL,
  `receiver_label`   TEXT NULL,
  `pay_to`           TEXT NULL,
  `payment_ref`      TEXT NULL,
  `proof_file`       TEXT NULL,
  `payout_ref`       TEXT NULL,
  `customer_note`    TEXT NULL,
  `admin_note`       TEXT NULL,
  `status`           TEXT NOT NULL DEFAULT 'awaiting_payment',
  `ip`               TEXT NULL,
  `created_at`       TEXT NOT NULL,
  `paid_at`          TEXT NULL,
  `completed_at`     TEXT NULL,
  `updated_at`       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_order_user` ON `orders` (`user_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_order_status` ON `orders` (`status`, `created_at`);
CREATE INDEX IF NOT EXISTS `idx_order_created` ON `orders` (`created_at`);

CREATE TABLE IF NOT EXISTS `order_logs` (
  `id`         INTEGER PRIMARY KEY AUTOINCREMENT,
  `order_id`   INTEGER NOT NULL REFERENCES `orders` (`id`) ON DELETE CASCADE,
  `status`     TEXT NOT NULL,
  `note`       TEXT NULL,
  `actor`      TEXT NOT NULL,
  `actor_id`   INTEGER NULL,
  `created_at` TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_log_order` ON `order_logs` (`order_id`);

CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id`         INTEGER PRIMARY KEY AUTOINCREMENT,
  `scope`      TEXT NOT NULL,
  `ident`      TEXT NOT NULL,
  `created_at` TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_attempt` ON `login_attempts` (`scope`, `ident`, `created_at`);

-- ---------------------------------------------------------------------------
-- Seed data. Everything below can be changed later from the admin panel.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO `gateways`
  (`id`, `code`, `name`, `currency`, `decimals`, `color`, `reserve`, `account_label`, `account_placeholder`, `account_pattern`, `pay_to`, `pay_to_name`, `ussd_template`, `instructions`, `is_active`, `sort_order`)
VALUES
  (1, 'evc', 'EVC Plus', 'USD', 2, '#16a34a', 10000, 'EVC Plus number', '61xxxxxxx', '^\+?[0-9]{7,15}$', '61xxxxxxx', 'Hufan Exchange', '*712*{to}*{amount}#', 'Send from your own EVC Plus number, then enter the Transaction ID from the confirmation SMS.', 1, 1),
  (2, 'moneygo', 'MoneyGo', 'USD', 2, '#2563eb', 5000, 'MoneyGo account / wallet ID', 'e.g. U12345678', NULL, NULL, NULL, NULL, NULL, 1, 2),
  (3, 'usdt_trc20', 'USDT (TRC20)', 'USDT', 2, '#26a17b', 5000, 'USDT TRC20 wallet address', 'T...', '^T[1-9A-HJ-NP-Za-km-z]{33}$', NULL, NULL, NULL, 'Make sure the address is on the TRON (TRC20) network.', 1, 3),
  (4, 'usdt_bep20', 'USDT (BEP20)', 'USDT', 2, '#d4a017', 5000, 'USDT BEP20 wallet address', '0x...', '^0x[a-fA-F0-9]{40}$', NULL, NULL, NULL, 'Make sure the address is on BNB Smart Chain (BEP20).', 1, 4),
  (5, 'paypal', 'PayPal', 'USD', 2, '#1d4ed8', 3000, 'PayPal email', 'name@email.com', '^[^@\s]+@[^@\s]+\.[^@\s]+$', NULL, NULL, NULL, NULL, 1, 5),
  (6, 'zaad', 'ZAAD', 'USD', 2, '#dc2626', 0, 'ZAAD number', 'e.g. 63xxxxxxx', '^\+?[0-9]{7,15}$', NULL, NULL, NULL, 'Send from your own ZAAD number, then enter the Transaction ID from the confirmation SMS.', 0, 6),
  (7, 'edahab', 'eDahab', 'USD', 2, '#f59e0b', 0, 'eDahab number', 'e.g. 90xxxxxxx', '^\+?[0-9]{7,15}$', NULL, NULL, NULL, 'Send from your own eDahab number, then enter the Transaction ID from the confirmation SMS.', 0, 7);

INSERT OR IGNORE INTO `pairs`
  (`id`, `from_gateway_id`, `to_gateway_id`, `rate`, `fee_percent`, `fee_fixed`, `min_amount`, `max_amount`, `is_active`, `sort_order`)
VALUES
  (1, 1, 2, 1, 2.000, 0,  5, 5000, 1, 1),
  (2, 1, 3, 1, 3.000, 0, 10, 5000, 1, 2),
  (3, 1, 4, 1, 3.000, 0, 10, 5000, 1, 3),
  (4, 1, 5, 1, 6.000, 0, 10, 2000, 1, 4),
  (5, 2, 1, 1, 2.000, 0,  5, 5000, 0, 5),
  (6, 3, 1, 1, 2.000, 0, 10, 5000, 0, 6),
  (7, 4, 1, 1, 2.000, 0, 10, 5000, 0, 7),
  (8, 5, 1, 1, 8.000, 0, 10, 2000, 0, 8),
  (9, 6, 2, 1, 2.000, 0,  5, 5000, 0, 9),
  (10, 6, 3, 1, 3.000, 0, 10, 5000, 0, 10),
  (11, 6, 4, 1, 3.000, 0, 10, 5000, 0, 11),
  (12, 6, 5, 1, 6.000, 0, 10, 2000, 0, 12),
  (13, 7, 2, 1, 2.000, 0,  5, 5000, 0, 13),
  (14, 7, 3, 1, 3.000, 0, 10, 5000, 0, 14),
  (15, 7, 4, 1, 3.000, 0, 10, 5000, 0, 15),
  (16, 7, 5, 1, 6.000, 0, 10, 2000, 0, 16);

INSERT OR IGNORE INTO `settings` (`key`, `value`) VALUES
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
  ('terms_text', '1. Payment must be sent from the number you entered on the order.
2. Double-check the account/address you will receive on. Funds sent to a wrong address cannot be recovered.
3. Orders are processed once your payment has been verified.
4. Rates and fees may change at any time, but your order keeps the rate it was created with.'),
  ('announcement', '');
