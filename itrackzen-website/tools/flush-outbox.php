<?php
/**
 * Retry enquiries / deletion requests that could not be delivered to the management system.
 * Run from cron every 5 minutes, for example on Hostinger (hPanel > Advanced > Cron Jobs):
 *    domains/itrackzen.net/public_html/tools/flush-outbox.php   (type only this path; Hostinger adds /usr/bin/php /home/USER/ in front)
 * (adjust the path so it points to this file)
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
// works both from the project layout (tools/ beside public_html/) and when tools/ was uploaded inside public_html/
$inc = is_file(__DIR__ . '/../includes/bootstrap.php') ? __DIR__ . '/../includes' : __DIR__ . '/../public_html/includes';
require $inc . '/bootstrap.php';
require $inc . '/odoo.php';
if (!odoo_enabled()) { echo "Management system not configured.\n"; exit(0); }
echo 'Delivered ' . odoo_outbox_flush(50) . " queued event(s).\n";
$left = (int)db_val('SELECT COUNT(*) FROM odoo_outbox WHERE sent_at IS NULL');
echo "Still waiting: $left\n";
