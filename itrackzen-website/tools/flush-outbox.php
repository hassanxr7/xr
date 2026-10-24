<?php
/**
 * Retry enquiries / deletion requests that could not be delivered to the management system.
 * Run from cron every 5 minutes, for example on Hostinger (hPanel > Advanced > Cron Jobs):
 *    php /home/USER/domains/itrackzen.net/public_html/../tools/flush-outbox.php
 * (adjust the path so it points to this file)
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../public_html/includes/bootstrap.php';
require __DIR__ . '/../public_html/includes/odoo.php';
if (!odoo_enabled()) { echo "Management system not configured.\n"; exit(0); }
echo 'Delivered ' . odoo_outbox_flush(50) . " queued event(s).\n";
$left = (int)db_val('SELECT COUNT(*) FROM odoo_outbox WHERE sent_at IS NULL');
echo "Still waiting: $left\n";
