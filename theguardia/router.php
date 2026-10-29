<?php
// Development router for PHP's built-in server: php -S localhost:8000 router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('~^/(app)(/|$)~', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
$file = __DIR__ . $path;
if ($path !== '/' && is_file($file)) {
    if (substr($path, -4) === '.php') {
        chdir(dirname($file));
        require $file;
        return true;
    }
    return false; // let the built-in server send the static file
}
if (is_dir($file) && is_file(rtrim($file, '/') . '/index.php')) {
    chdir($file);
    require rtrim($file, '/') . '/index.php';
    return true;
}
require __DIR__ . '/index.php';
