<?php
/** Dynamic XML sitemap served at /sitemap.xml */
declare(strict_types=1);
require __DIR__ . '/includes/bootstrap.php';
header('Content-Type: application/xml; charset=utf-8');
$today = gmdate('Y-m-d');
$urls = [
    ['/', '1.0', 'weekly'], ['/gps-tracking-services', '0.9', 'monthly'], ['/fleet-management', '0.9', 'monthly'],
    ['/ai-dashcam-video-telematics', '0.9', 'monthly'], ['/supported-gps-trackers', '0.9', 'weekly'], ['/solutions', '0.8', 'monthly'],
    ['/pricing', '0.8', 'monthly'], ['/demo', '0.8', 'monthly'], ['/contact-sales', '0.8', 'monthly'], ['/about-us', '0.7', 'yearly'],
    ['/faq', '0.7', 'monthly'], ['/blog', '0.6', 'weekly'], ['/privacy-policy', '0.3', 'yearly'], ['/terms-and-conditions', '0.3', 'yearly'], ['/delete-account', '0.3', 'yearly'],
];
foreach (data('countries')['items'] ?? [] as $c) { $urls[] = ['/' . $c['slug'], '0.8', 'monthly']; }
foreach (data('blog')['posts'] ?? [] as $p) { $urls[] = ['/blog/' . $p['slug'], '0.6', 'yearly', $p['date']]; }
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as $u) {
    echo "  <url><loc>" . e(abs_url($u[0])) . "</loc><lastmod>" . e($u[3] ?? $today) . "</lastmod><changefreq>{$u[2]}</changefreq><priority>{$u[1]}</priority></url>\n";
}
echo '</urlset>' . "\n";
