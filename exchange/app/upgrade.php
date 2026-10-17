<?php
/**
 * One-shot runtime upgrades for sites that are already installed, guarded by
 * settings flags so each runs exactly once. Fresh installs get the same end
 * state straight from the install/schema seeds.
 */

/**
 * Make every Somali mobile wallet (EVC Plus, ZAAD, eDahab, Sahal) available
 * as both a "send" and a "receive" option: create the gateways that are
 * missing, activate them, and generate every missing pair — 1:1 between the
 * USD wallets, and clones of the EVC Plus pairs (same rate/fee/limits) for
 * the other wallets against MoneyGo, USDT, PayPal, etc.
 */
function upgrade_local_wallets(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    if (setting('local_wallets_v1', '0') === '1') {
        return;
    }
    try {
        $defs = [
            'zaad'   => ['ZAAD', '#dc2626', 'ZAAD number', 'e.g. 63xxxxxxx'],
            'edahab' => ['eDahab', '#f59e0b', 'eDahab number', 'e.g. 65xxxxxxx'],
            'sahal'  => ['Sahal', '#7c3aed', 'Sahal number', 'e.g. 90xxxxxxx'],
        ];
        $maxGwSort = (int) (row('SELECT COALESCE(MAX(sort_order), 0) AS m FROM gateways')['m'] ?? 0);
        foreach ($defs as $code => [$name, $color, $label, $placeholder]) {
            if (!row('SELECT id FROM gateways WHERE code = ?', [$code])) {
                insert('gateways', [
                    'code'                => $code,
                    'name'                => $name,
                    'currency'            => 'USD',
                    'decimals'            => 2,
                    'color'               => $color,
                    'reserve'             => 10000,
                    'account_label'       => $label,
                    'account_placeholder' => $placeholder,
                    'account_pattern'     => '^\+?[0-9]{7,15}$',
                    'is_active'           => 1,
                    'sort_order'          => ++$maxGwSort,
                ]);
            }
        }
        q("UPDATE gateways SET is_active = 1 WHERE code IN ('evc','zaad','edahab','sahal')");

        $byCode = [];
        foreach (rows('SELECT * FROM gateways') as $g) {
            $byCode[$g['code']] = $g;
        }
        $walletIds = [];
        foreach (['evc', 'zaad', 'edahab', 'sahal'] as $code) {
            if (isset($byCode[$code])) {
                $walletIds[] = (int) $byCode[$code]['id'];
            }
        }
        $evcId = isset($byCode['evc']) ? (int) $byCode['evc']['id'] : 0;

        $pairs = rows('SELECT * FROM pairs');
        $have = [];
        foreach ($pairs as $p) {
            $have[$p['from_gateway_id'] . ':' . $p['to_gateway_id']] = true;
        }
        $maxPairSort = (int) (row('SELECT COALESCE(MAX(sort_order), 0) AS m FROM pairs')['m'] ?? 0);
        $addPair = function (int $from, int $to, array $tpl) use (&$have, &$maxPairSort): void {
            if ($from === $to || isset($have[$from . ':' . $to])) {
                return;
            }
            insert('pairs', [
                'from_gateway_id' => $from,
                'to_gateway_id'   => $to,
                'rate'            => $tpl['rate'],
                'fee_percent'     => $tpl['fee_percent'],
                'fee_fixed'       => $tpl['fee_fixed'],
                'min_amount'      => $tpl['min_amount'],
                'max_amount'      => $tpl['max_amount'],
                'is_active'       => 1,
                'sort_order'      => ++$maxPairSort,
            ]);
            $have[$from . ':' . $to] = true;
        };

        // Wallet ↔ wallet: all USD, so 1:1 with a flat fee.
        $flat = ['rate' => 1, 'fee_percent' => 2, 'fee_fixed' => 0, 'min_amount' => 5, 'max_amount' => 5000];
        foreach ($walletIds as $a) {
            foreach ($walletIds as $b) {
                $addPair($a, $b, $flat);
            }
        }

        // Clone EVC Plus' pairs against non-wallet gateways for the other wallets.
        if ($evcId) {
            foreach ($pairs as $p) {
                $from = (int) $p['from_gateway_id'];
                $to = (int) $p['to_gateway_id'];
                foreach ($walletIds as $w) {
                    if ($from === $evcId && !in_array($to, $walletIds, true)) {
                        $addPair($w, $to, $p);
                    }
                    if ($to === $evcId && !in_array($from, $walletIds, true)) {
                        $addPair($from, $w, $p);
                    }
                }
            }
        }

        // Every pair that touches a wallet goes live so each wallet can be
        // chosen as send or receive right away. Admin can disable any later.
        if ($walletIds !== []) {
            $in = implode(',', $walletIds);
            q("UPDATE pairs SET is_active = 1 WHERE from_gateway_id IN ($in) OR to_gateway_id IN ($in)");
        }

        save_setting('local_wallets_v1', '1');
        settings(true);
    } catch (Throwable $e) {
        error_log('[Hufan] Local wallets upgrade failed: ' . $e->getMessage());
    }
}

/**
 * Add SovaMoney as a "receive" gateway with pairs from every local wallet.
 * SovaMoney's API has no send-to-customer endpoint (merchant withdrawals only
 * go to the merchant's own methods), so payouts are sent by the admin like
 * MoneyGo/PayPal. Reuses a SovaMoney gateway the admin may have added by hand.
 */
function upgrade_sovamoney_receive(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    if (setting('sovamoney_receive_v1', '0') === '1') {
        return;
    }
    try {
        $gw = row("SELECT * FROM gateways WHERE code = 'sovamoney' OR LOWER(name) LIKE 'sova%' ORDER BY id LIMIT 1");
        if ($gw) {
            $sovaId = (int) $gw['id'];
            q('UPDATE gateways SET is_active = 1 WHERE id = ?', [$sovaId]);
        } else {
            $maxGwSort = (int) (row('SELECT COALESCE(MAX(sort_order), 0) AS m FROM gateways')['m'] ?? 0);
            $sovaId = insert('gateways', [
                'code'                => 'sovamoney',
                'name'                => 'SovaMoney',
                'currency'            => 'USD',
                'decimals'            => 2,
                'color'               => '#0ea5e9',
                'reserve'             => 5000,
                'account_label'       => 'SovaMoney account (email or phone)',
                'account_placeholder' => 'e.g. name@email.com or 2526xxxxxxx',
                'is_active'           => 1,
                'sort_order'          => $maxGwSort + 1,
            ]);
        }

        $maxPairSort = (int) (row('SELECT COALESCE(MAX(sort_order), 0) AS m FROM pairs')['m'] ?? 0);
        foreach (rows("SELECT id FROM gateways WHERE code IN ('evc','zaad','edahab','sahal')") as $w) {
            $from = (int) $w['id'];
            $existing = row('SELECT id FROM pairs WHERE from_gateway_id = ? AND to_gateway_id = ?', [$from, $sovaId]);
            if ($existing) {
                q('UPDATE pairs SET is_active = 1 WHERE id = ?', [$existing['id']]);
                continue;
            }
            insert('pairs', [
                'from_gateway_id' => $from,
                'to_gateway_id'   => $sovaId,
                'rate'            => 1,
                'fee_percent'     => 2,
                'fee_fixed'       => 0,
                'min_amount'      => 5,
                'max_amount'      => 5000,
                'is_active'       => 1,
                'sort_order'      => ++$maxPairSort,
            ]);
        }

        save_setting('sovamoney_receive_v1', '1');
        settings(true);
    } catch (Throwable $e) {
        error_log('[Hufan] SovaMoney receive upgrade failed: ' . $e->getMessage());
    }
}

/**
 * Payout log table for automatic SovaMoney payouts (one row per order; the
 * UNIQUE order_id is what guarantees an order is never paid out twice), and
 * switch the SovaMoney receive field to the U-ID the payout API expects.
 */
function upgrade_sovamoney_payout(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    if (setting('sovamoney_payout_v1', '0') === '1') {
        return;
    }
    try {
        if (db_driver() === 'sqlite') {
            q('CREATE TABLE IF NOT EXISTS sovamoney_payouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
                uid TEXT NOT NULL,
                amount NUMERIC NOT NULL,
                reference TEXT NOT NULL,
                status TEXT NOT NULL,
                trx TEXT NULL,
                message TEXT NULL,
                response TEXT NULL,
                attempts INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )');
        } else {
            q('CREATE TABLE IF NOT EXISTS `sovamoney_payouts` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `order_id` INT UNSIGNED NOT NULL,
                `uid` VARCHAR(190) NOT NULL,
                `amount` DECIMAL(18,2) NOT NULL,
                `reference` VARCHAR(40) NOT NULL,
                `status` VARCHAR(20) NOT NULL,
                `trx` VARCHAR(190) NULL,
                `message` VARCHAR(500) NULL,
                `response` TEXT NULL,
                `attempts` INT NOT NULL DEFAULT 1,
                `created_at` DATETIME NOT NULL,
                `updated_at` DATETIME NOT NULL,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uq_sovamoney_payouts_order` (`order_id`),
                CONSTRAINT `fk_sovamoney_payouts_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        }
        q("UPDATE gateways SET account_label = 'SovaMoney U-ID', account_placeholder = 'e.g. U827389',
              instructions = 'Your U-ID is shown in your SovaMoney wallet (e.g. U827389).'
           WHERE code = 'sovamoney' AND account_label = 'SovaMoney account (email or phone)'");
        save_setting('sovamoney_payout_v1', '1');
        settings(true);
    } catch (Throwable $e) {
        error_log('[Hufan] SovaMoney payout schema upgrade failed: ' . $e->getMessage());
    }
}

/**
 * Let customers send FROM SovaMoney (paid through SovaMoney hosted checkout)
 * and receive any local wallet: adds/activates SovaMoney → EVC/ZAAD/eDahab/Sahal.
 */
function upgrade_sovamoney_send(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }
    $checked = true;
    if (setting('sovamoney_send_v1', '0') === '1') {
        return;
    }
    try {
        $sova = row("SELECT id FROM gateways WHERE code = 'sovamoney'");
        if ($sova) {
            $sovaId = (int) $sova['id'];
            $maxPairSort = (int) (row('SELECT COALESCE(MAX(sort_order), 0) AS m FROM pairs')['m'] ?? 0);
            foreach (rows("SELECT id FROM gateways WHERE code IN ('evc','zaad','edahab','sahal')") as $w) {
                $to = (int) $w['id'];
                $existing = row('SELECT id FROM pairs WHERE from_gateway_id = ? AND to_gateway_id = ?', [$sovaId, $to]);
                if ($existing) {
                    q('UPDATE pairs SET is_active = 1 WHERE id = ?', [$existing['id']]);
                    continue;
                }
                insert('pairs', [
                    'from_gateway_id' => $sovaId,
                    'to_gateway_id'   => $to,
                    'rate'            => 1,
                    'fee_percent'     => 2,
                    'fee_fixed'       => 0,
                    'min_amount'      => 5,
                    'max_amount'      => 5000,
                    'is_active'       => 1,
                    'sort_order'      => ++$maxPairSort,
                ]);
            }
        }
        save_setting('sovamoney_send_v1', '1');
        settings(true);
    } catch (Throwable $e) {
        error_log('[Hufan] SovaMoney send upgrade failed: ' . $e->getMessage());
    }
}
