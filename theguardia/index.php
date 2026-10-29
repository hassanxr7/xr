<?php
/**
 * The Guardia — front controller for every public URL (see .htaccess).
 */
require __DIR__ . '/app/bootstrap.php';
require APP_PATH . '/theme.php';
require APP_PATH . '/public.php';

$path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if (base_url() !== '' && strpos($path, base_url()) === 0) {
    $path = substr($path, strlen(base_url()));
}
$path = trim($path, '/');

// Cheap, at most once a minute: publish stories whose scheduled time has passed.
if (cache_get('scheduled_check') === null) {
    cache_set('scheduled_check', 1, 60);
    publish_scheduled();
}

route($path);
