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
