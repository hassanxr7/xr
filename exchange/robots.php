<?php
/**
 * robots.txt — generated dynamically so the Sitemap: line always points at
 * this install's real domain/sub-folder (served at /robots.txt via .htaccess).
 */
require __DIR__ . '/app/bootstrap.php';

header('Content-Type: text/plain; charset=utf-8');
?>
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /app/
Disallow: /install/
Disallow: /account.php
Disallow: /order.php
Disallow: /exchange.php
Disallow: /profile.php
Disallow: /login.php
Disallow: /register.php
Disallow: /track.php
Disallow: /statement.php
Disallow: /receipt.php
Disallow: /proof.php

Sitemap: <?= full_url('sitemap.xml') ?>
