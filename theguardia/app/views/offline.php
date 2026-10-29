<?php
defined('APP') || exit;
seo(['title' => 'You are offline', 'robots' => 'noindex']);
?>
<div class="wrap page-wrap notfound">
  <h1>You’re offline</h1>
  <p class="standfirst">Check your connection — stories you opened recently are still available.</p>
  <p><a class="btn" href="<?= e(url('')) ?>">Try again</a></p>
</div>
