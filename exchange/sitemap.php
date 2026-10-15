<?php
/**
 * XML sitemap of the public, indexable pages (served at /sitemap.xml via
 * .htaccess). Only pages that are not behind login and are not set to
 * noindex belong here — see robots.php for the matching Disallow list.
 */
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: application/xml; charset=utf-8');

$pages = [
    ['path' => '', 'changefreq' => 'daily', 'priority' => '1.0'],
    ['path' => 'send-money-to-somalia.php', 'changefreq' => 'weekly', 'priority' => '0.9'],
    ['path' => 'horn-of-africa-money-transfer.php', 'changefreq' => 'weekly', 'priority' => '0.8'],
    ['path' => 'terms.php', 'changefreq' => 'monthly', 'priority' => '0.3'],
];

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<?php foreach ($pages as $p): ?>
  <url>
    <loc><?= e(full_url($p['path'])) ?></loc>
    <xhtml:link rel="alternate" hreflang="en" href="<?= e(full_url($p['path'] . '?lang=en')) ?>"/>
    <xhtml:link rel="alternate" hreflang="so" href="<?= e(full_url($p['path'] . '?lang=so')) ?>"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="<?= e(full_url($p['path'])) ?>"/>
    <changefreq><?= e($p['changefreq']) ?></changefreq>
    <priority><?= e($p['priority']) ?></priority>
  </url>
<?php endforeach; ?>
</urlset>
