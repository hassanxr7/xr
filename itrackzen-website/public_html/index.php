<?php
/**
 * ITrackZen front controller - clean URLs for every page.
 */
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
require __DIR__ . '/includes/layout.php';
require __DIR__ . '/includes/forms.php';

$path = request_path();
if ($path === '/index.php') { header('Location: /', true, 301); exit; }

$routes = [
    '/'                            => ['home', 'home'],
    '/about-us'                    => ['about', 'about'],
    '/gps-tracking-services'       => ['services', 'services'],
    '/fleet-management'            => ['fleet', 'fleet'],
    '/ai-dashcam-video-telematics' => ['dashcam', 'dashcam'],
    '/supported-gps-trackers'      => ['trackers', 'trackers'],
    '/solutions'                   => ['solutions', 'solutions'],
    '/pricing'                     => ['pricing', 'pricing'],
    '/demo'                        => ['demo', 'demo'],
    '/contact-sales'               => ['contact', 'contact'],
    '/faq'                         => ['faq', 'faq'],
    '/privacy-policy'              => ['legal', 'privacy'],
    '/terms-and-conditions'        => ['legal', 'terms'],
    '/blog'                        => ['blog', 'blog'],
    '/delete-account'              => ['delete', 'delete'],
    '/thank-you'                   => ['thanks', 'thanks'],
];
$aliases = [
    '/about' => '/about-us', '/contact' => '/contact-sales', '/contact-us' => '/contact-sales', '/services' => '/gps-tracking-services',
    '/gps-tracking' => '/gps-tracking-services', '/trackers' => '/supported-gps-trackers', '/supported-trackers' => '/supported-gps-trackers',
    '/dashcam' => '/ai-dashcam-video-telematics', '/ai-dashcam' => '/ai-dashcam-video-telematics', '/video-telematics' => '/ai-dashcam-video-telematics',
    '/plans' => '/pricing', '/privacy' => '/privacy-policy', '/terms' => '/terms-and-conditions', '/terms-of-service' => '/terms-and-conditions',
    '/request-demo' => '/demo', '/fleet' => '/fleet-management', '/delete' => '/delete-account', '/account-deletion' => '/delete-account',
];
if (isset($aliases[$path])) { header('Location: ' . $aliases[$path], true, 301); exit; }
if ($_SERVER['REQUEST_URI'] !== '/' && preg_match('#^[^?]*/(\?.*)?$#', $_SERVER['REQUEST_URI']) && $path !== '/') {
    header('Location: ' . $path . (isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? '?' . $_SERVER['QUERY_STRING'] : ''), true, 301); exit;
}
if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) { http_response_code(405); header('Allow: GET, HEAD'); exit; }

$slug = ltrim($path, '/');

if (isset($routes[$path])) {
    [$file, $key] = $routes[$path];
    $PAGE_KEY = $key;
    require __DIR__ . '/pages/' . $file . '.php';
    exit;
}
foreach (data('countries')['items'] ?? [] as $c) {
    if ($c['slug'] === $slug) { $COUNTRY = $c; require __DIR__ . '/pages/country.php'; exit; }
}
if (preg_match('#^blog/([a-z0-9-]+)$#', $slug, $m)) {
    foreach (data('blog')['posts'] ?? [] as $p) {
        if ($p['slug'] === $m[1]) { $POST = $p; require __DIR__ . '/pages/blog-post.php'; exit; }
    }
}
http_response_code(404);
require __DIR__ . '/pages/404.php';
