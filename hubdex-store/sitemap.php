<?php
require_once __DIR__ . '/includes/functions.php';

$page_title       = 'Sitemap | Hubdex Store - All Pages';
$page_description = 'HTML sitemap of the Hubdex Store website by Hubdex Store LTD. Browse every page of the Hubdex online store, including about, contact and legal pages.';
$page_keywords    = 'Hubdex Store sitemap, Hubdex pages, Hubdex Store LTD website, ecommerce, online store';
$page_path        = 'sitemap.php';
$page_id          = 'sitemap';
$breadcrumb_name  = 'Sitemap';

$sitemap_groups = [
    'Main pages' => [
        ['./',          'Home - Hubdex Store is Coming Soon', 'The Hubdex Store launch page with countdown and early-access sign-up.'],
        ['about.php',   'About Hubdex Store',                  'Our story, mission and values at Hubdex Store LTD.'],
        ['contact.php', 'Contact Hubdex Store',                'Send a message to the Hubdex team.'],
    ],
    'Legal' => [
        ['privacy.php', 'Privacy Policy',       'How Hubdex Store LTD protects your personal data.'],
        ['terms.php',   'Terms and Conditions', 'Rules for using the Hubdex Store website.'],
    ],
    'Website' => [
        ['sitemap.php', 'HTML Sitemap', 'This page - an overview of all Hubdex Store pages.'],
        ['sitemap.xml', 'XML Sitemap',  'Machine-readable sitemap for search engines.'],
    ],
];

require __DIR__ . '/includes/header.php';
?>

<section class="page-hero" aria-labelledby="page-title">
    <div class="container narrow">
        <nav class="breadcrumb reveal" aria-label="Breadcrumb"><a href="./">Home</a><span>/</span><span aria-current="page">Sitemap</span></nav>
        <h1 id="page-title" class="reveal">Hubdex Store Sitemap</h1>
        <p class="lead reveal">Every page of the Hubdex Store website in one place.</p>
    </div>
</section>

<section class="section section-tight">
    <div class="container sitemap-grid">
        <?php foreach ($sitemap_groups as $group => $links): ?>
            <div class="content-card reveal">
                <h2><?= e($group) ?></h2>
                <ul class="sitemap-list">
                    <?php foreach ($links as [$href, $title, $desc]): ?>
                        <li>
                            <a href="<?= e($href) ?>"><h3><?= e($title) ?></h3></a>
                            <p><?= e($desc) ?></p>
                        </li>
                    <?php endforeach; ?>
                </ul>
            </div>
        <?php endforeach; ?>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
