<?php
require __DIR__ . '/app/bootstrap.php';

$pageTitle = t('terms');
require APP_PATH . '/views/header.php';
?>
<div class="page">
  <div class="container medium">
    <div class="page-head"><div><h1><?= e(t('terms')) ?></h1><p><?= e(setting('site_name')) ?></p></div></div>
    <div class="card card-body"><div class="prose"><?= e(setting('terms_text')) ?></div></div>
  </div>
</div>
<?php require APP_PATH . '/views/footer.php'; ?>
