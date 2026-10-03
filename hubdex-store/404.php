<?php
require_once __DIR__ . '/includes/functions.php';

http_response_code(404);

$page_title       = 'Page Not Found | Hubdex Store';
$page_description = 'The page you are looking for could not be found on Hubdex Store.';
$page_path        = '';
$page_id          = '404';
$robots           = 'noindex, follow';

require __DIR__ . '/includes/header.php';
?>
<section class="page-hero error-page" aria-labelledby="page-title">
    <div class="container narrow">
        <p class="error-code reveal">404</p>
        <h1 id="page-title" class="reveal">Page not found</h1>
        <p class="lead reveal">Sorry, this page doesn't exist. Hubdex Store is still being built &mdash; try one of the links below.</p>
        <div class="btn-row reveal">
            <a class="btn btn-primary" href="./">Back to Hubdex Store <?= icon('arrow', 18) ?></a>
            <a class="btn btn-ghost" href="sitemap.php">View sitemap</a>
        </div>
    </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
