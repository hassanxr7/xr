<?php
// Local development only:  php -S localhost:8080 -t public_html tools/dev-router.php
$root = dirname(__DIR__) . '/public_html';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/sitemap.xml') { require $root . '/sitemap.php'; return true; }
if (preg_match('#^/(data|includes|pages)/#', $path)) { http_response_code(403); echo 'Forbidden'; return true; }
$file = $root . $path;
if ($path !== '/' && is_file($file)) { return false; }
if (is_dir($file) && $path !== '/' && is_file($file . '/index.php')) { chdir($file); require $file . '/index.php'; return true; }
chdir($root);
require $root . '/index.php';
return true;
