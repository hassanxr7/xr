<?php
require __DIR__ . '/_init.php';

require_role('admin');

$text = ['site_name', 'site_url', 'tagline', 'site_description', 'contact_email', 'mail_from', 'whatsapp', 'timezone', 'founding_year', 'footer_note',
    'social_facebook', 'social_x', 'social_instagram', 'social_youtube', 'social_tiktok', 'social_telegram', 'social_linkedin', 'fb_app_id',
    'google_verification', 'bing_verification', 'yandex_verification', 'fb_domain_verification', 'robots_extra', 'sitemap_size',
    'ai_model', 'ai_effort', 'analytics_retention_days', 'ga_measurement_id', 'vapid_subject', 'store_currency', 'download_days', 'download_limit',
    'page_cache_ttl', 'head_code', 'admin_lang'];
$checks = ['indexnow_enabled', 'analytics_enabled', 'geoip_auto', 'imports_auto'];
$secrets = ['ai_api_key', 'stripe_secret', 'stripe_webhook_secret'];

if (is_post()) {
    csrf_check();
    $do = (string) input('do');
    if ($do === 'geoip') {
        flash('success', 'GeoIP: ' . geoip_download());
    } elseif ($do === 'geoip_upload' && !empty($_FILES['mmdb']['tmp_name'])) {
        try {
            new MaxMindReader($_FILES['mmdb']['tmp_name']);
            @mkdir(GEOIP_DIR, 0755, true);
            foreach (glob(GEOIP_DIR . '/*.mmdb') ?: [] as $old) {
                @unlink($old);
            }
            move_uploaded_file($_FILES['mmdb']['tmp_name'], GEOIP_DIR . '/uploaded-' . date('Ymd') . '.mmdb');
            save_setting('geoip_updated', now());
            flash('success', __('City database installed.'));
        } catch (Throwable $e) {
            flash('error', __('That file is not a valid .mmdb database.'));
        }
    } elseif ($do === 'clear_cache') {
        content_changed();
        foreach (glob(cache_dir('pages') . '/*/*.html') ?: [] as $f) {
            @unlink($f);
        }
        flash('success', __('Cache cleared.'));
    } elseif ($do === 'vapid') {
        vapid_generate();
        q('DELETE FROM push_subscriptions');
        flash('success', __('New push keys created. Readers need to turn alerts on again.'));
    } elseif ($do === 'test_ai') {
        try {
            $r = ai_http(['model' => setting('ai_model', 'claude-opus-5-5'), 'max_tokens' => 64, 'output_config' => ['effort' => 'low'], 'messages' => [['role' => 'user', 'content' => 'Reply with the single word: OK']]]);
            flash('success', __('AI connection works') . ' (' . ($r['model'] ?? '') . ').');
        } catch (Throwable $e) {
            flash('error', $e->getMessage());
        }
    } else {
        foreach ($text as $k) {
            if (array_key_exists($k, $_POST)) {
                save_setting($k, trim((string) $_POST[$k]));
            }
        }
        foreach ($checks as $k) {
            if (array_key_exists($k, $_POST)) {
                save_setting($k, $_POST[$k] === '1' ? '1' : '0');
            }
        }
        foreach ($secrets as $k) {
            if (trim((string) ($_POST[$k] ?? '')) !== '') {
                save_setting($k, trim((string) $_POST[$k]));
            }
            if (($_POST[$k . '_clear'] ?? '') === '1') {
                save_setting($k, '');
            }
        }
        if (!in_array(setting('timezone'), timezone_identifiers_list(), true)) {
            save_setting('timezone', 'America/Toronto');
        }
        content_changed();
        audit('settings');
        flash('success', __('Settings saved.'));
    }
    redirect('admin/settings.php' . (input('tab') ? '#' . preg_replace('~\W~', '', (string) input('tab')) : ''));
}

$s = fn ($k, $d = '') => setting($k, $d);
$secret = function (string $k, string $label, string $hint = '') {
    $saved = setting($k) !== '';
    return field($k, $label, '', 'password', ['autocomplete' => 'off', 'placeholder' => $saved ? '•••••••• ' . __('saved — leave empty to keep') : '', 'data-hint' => $hint])
        . ($saved ? checkbox($k . '_clear', __('Remove the saved key'), false) : '');
};
$cronCmd = '/usr/bin/php ' . BASE_PATH . '/cron.php';
$cronUrl = abs_url('cron.php') . '?key=' . setting('cron_key');
admin_header(__('Settings'));
?>
<div class="page-head"><h1><?= __('Settings') ?></h1></div>
<nav class="tabs"><a href="#general"><?= __('General') ?></a><a href="#seo">SEO</a><a href="#ai"><?= __('AI assistant') ?></a><a href="#analytics"><?= __('Analytics') ?></a><a href="#push"><?= __('Push') ?></a><a href="#store"><?= __('Photo store') ?></a><a href="#cron">Cron</a><a href="#advanced"><?= __('Advanced') ?></a></nav>

<form method="post" class="a-form settings-form">
  <?= csrf_field() ?>
  <section class="card" id="general"><h2><?= __('General') ?></h2>
    <div class="row-2">
      <?= field('site_name', __('Site name'), $s('site_name', 'The Guardia')) ?>
      <?= field('site_url', __('Site address'), $s('site_url'), 'url', ['data-hint' => 'https://theguardia.ca']) ?>
      <?= field('tagline', __('Tagline'), $s('tagline')) ?>
      <?= field('founding_year', __('Founded (year)'), $s('founding_year', '2015'), 'number') ?>
      <?= field('contact_email', __('Newsroom email'), $s('contact_email'), 'email') ?>
      <?= field('mail_from', __('Send emails from'), $s('mail_from'), 'email', ['data-hint' => __('A mailbox on your domain, e.g. no-reply@theguardia.ca')]) ?>
      <?= field('whatsapp', __('WhatsApp number (tips)'), $s('whatsapp'), 'text', ['placeholder' => '+1 416 555 0100']) ?>
      <?= select_field('timezone', __('Time zone'), array_combine(timezone_identifiers_list(), timezone_identifiers_list()), $s('timezone', 'America/Toronto')) ?>
    </div>
    <?= field('site_description', __('Site description (home page in Google)'), $s('site_description'), 'textarea', ['rows' => 2]) ?>
    <?= field('footer_note', __('Footer note'), $s('footer_note')) ?>
    <h3><?= __('Social media') ?></h3>
    <div class="row-2">
      <?php foreach (['social_facebook' => 'Facebook', 'social_x' => 'X (Twitter)', 'social_instagram' => 'Instagram', 'social_youtube' => 'YouTube', 'social_tiktok' => 'TikTok', 'social_telegram' => 'Telegram', 'social_linkedin' => 'LinkedIn', 'fb_app_id' => 'Facebook App ID'] as $k => $l): ?>
        <?= field($k, $l, $s($k), $k === 'fb_app_id' ? 'text' : 'url') ?>
      <?php endforeach; ?>
    </div>
    <?= select_field('admin_lang', __('Default dashboard language'), ['en' => 'English', 'so' => 'Soomaali'], $s('admin_lang', 'en')) ?>
  </section>

  <section class="card" id="seo"><h2>SEO</h2>
    <ul class="steps small">
      <li><?= __('Google Search Console: add the site, copy the HTML tag code (content="…") below, then submit the sitemap:') ?> <code><?= e(abs_url('sitemap.xml')) ?></code></li>
      <li><?= __('Google News: apply in Google Publisher Center with your site address and sections.') ?> <?= __('News sitemap:') ?> <code><?= e(abs_url('news-sitemap.xml')) ?></code></li>
      <li><?= __('Bing Webmaster Tools: verify below; new stories are sent to Bing and Yandex instantly via IndexNow.') ?></li>
    </ul>
    <div class="row-2">
      <?= field('google_verification', __('Google verification code'), $s('google_verification')) ?>
      <?= field('bing_verification', __('Bing verification code'), $s('bing_verification')) ?>
      <?= field('yandex_verification', __('Yandex verification code'), $s('yandex_verification')) ?>
      <?= field('fb_domain_verification', __('Facebook domain verification'), $s('fb_domain_verification')) ?>
      <?= field('sitemap_size', __('URLs per sitemap file (max 50,000)'), $s('sitemap_size', '50000'), 'number', ['min' => 1000, 'max' => 50000]) ?>
    </div>
    <?= checkbox('indexnow_enabled', __('IndexNow: notify search engines instantly when a story is published'), $s('indexnow_enabled', '1') === '1', __('Key file') . ': ' . abs_url($s('indexnow_key') . '.txt')) ?>
    <?= field('robots_extra', __('Extra robots.txt rules'), $s('robots_extra'), 'textarea', ['rows' => 3]) ?>
    <p class="hint"><a href="<?= e(url('robots.txt')) ?>" target="_blank" rel="noopener">robots.txt</a> · <a href="<?= e(url('sitemap.xml')) ?>" target="_blank" rel="noopener">sitemap.xml</a> · <a href="<?= e(url('news-sitemap.xml')) ?>" target="_blank" rel="noopener">news-sitemap.xml</a> · <a href="<?= e(url('feed')) ?>" target="_blank" rel="noopener">RSS</a></p>
  </section>

  <section class="card" id="ai"><h2><?= __('AI assistant') ?> (Claude)</h2>
    <p class="hint"><?= __('Create an API key at console.anthropic.com → API keys, and add credit to your account. The key is stored on your server only.') ?></p>
    <?= $secret('ai_api_key', __('Anthropic API key'), 'sk-ant-…') ?>
    <div class="row-2">
      <?= select_field('ai_model', __('Model'), ['claude-opus-5-5' => 'Claude Opus 5.5 (best quality)', 'claude-sonnet-5-5' => 'Claude Sonnet 5.5 (faster, cheaper)', 'claude-haiku-5-5' => 'Claude Haiku 5.5 (cheapest)'], $s('ai_model', 'claude-opus-5-5')) ?>
      <?= select_field('ai_effort', __('Effort'), ['low' => 'Low', 'medium' => 'Medium', 'high' => 'High'], $s('ai_effort', 'medium')) ?>
    </div>
    <p class="hint"><?= __('Tokens used so far') ?>: <?= fmt_num((int) $s('ai_tokens_used', '0')) ?></p>
  </section>

  <section class="card" id="analytics"><h2><?= __('Analytics') ?></h2>
    <?= checkbox('analytics_enabled', __('Count visitors (built-in analytics)'), $s('analytics_enabled', '1') === '1') ?>
    <div class="row-2">
      <?= field('analytics_retention_days', __('Keep detailed visit data for (days)'), $s('analytics_retention_days', '120'), 'number', ['min' => 14, 'data-hint' => __('Daily totals are kept forever.')]) ?>
      <?= field('ga_measurement_id', __('Google Analytics 4 ID (optional)'), $s('ga_measurement_id'), 'text', ['placeholder' => 'G-XXXXXXX']) ?>
    </div>
    <?= checkbox('geoip_auto', __('Update the city database every month (cron)'), $s('geoip_auto', '1') === '1') ?>
    <p class="hint"><?= __('City database') ?>: <?= geoip_file() ? e(basename((string) geoip_file())) . ' · ' . e(time_ago($s('geoip_updated'))) : __('not installed') ?></p>
  </section>

  <section class="card" id="push"><h2><?= __('Push alerts') ?></h2>
    <?= field('vapid_subject', __('Contact for push services'), $s('vapid_subject'), 'text', ['placeholder' => 'mailto:newsroom@theguardia.ca']) ?>
    <p class="hint"><?= __('Public key') ?>: <code class="break"><?= e($s('vapid_public')) ?></code></p>
  </section>

  <section class="card" id="store"><h2><?= __('Photo store payments') ?> (Stripe)</h2>
    <ol class="steps small">
      <li><?= __('Create a Stripe account (stripe.com) and copy the Secret key (sk_live_…).') ?></li>
      <li><?= __('Stripe → Developers → Webhooks → Add endpoint:') ?> <code><?= e(abs_url('api/stripe-webhook')) ?></code> <?= __('with the event checkout.session.completed; copy the signing secret (whsec_…).') ?></li>
    </ol>
    <?= $secret('stripe_secret', __('Stripe secret key')) ?>
    <?= $secret('stripe_webhook_secret', __('Webhook signing secret')) ?>
    <div class="row-3">
      <?= select_field('store_currency', __('Currency'), ['CAD' => 'CAD', 'USD' => 'USD', 'EUR' => 'EUR', 'GBP' => 'GBP'], $s('store_currency', 'CAD')) ?>
      <?= field('download_days', __('Download link valid (days)'), $s('download_days', '7'), 'number', ['min' => 1]) ?>
      <?= field('download_limit', __('Downloads allowed'), $s('download_limit', '5'), 'number', ['min' => 1]) ?>
    </div>
  </section>

  <section class="card" id="cron"><h2><?= __('Cron job (automatic tasks)') ?></h2>
    <p><?= __('hPanel → Advanced → Cron Jobs → Custom: run every 10 minutes:') ?></p>
    <p><code class="break"><?= e($cronCmd) ?></code> <button type="button" class="a-btn a-btn-sm js-copy" data-copy="<?= e($cronCmd) ?>"><?= __('Copy') ?></button></p>
    <?php if (preg_match('~^/home/[^/]+/(.+)$~', BASE_PATH, $hm)): ?><p class="hint"><?= __('If you choose the type “PHP” instead, enter only:') ?> <code class="break"><?= e($hm[1] . '/cron.php') ?></code></p><?php endif; ?>
    <p class="hint"><?= __('Or, if only URL cron is possible:') ?> <code class="break"><?= e($cronUrl) ?></code></p>
    <p class="hint"><?= __('Last run') ?>: <?= $s('cron_last_run') ? e(time_ago($s('cron_last_run'))) : __('never') ?></p>
    <?= checkbox('imports_auto', __('Import new official stories on every cron run'), $s('imports_auto', '1') === '1') ?>
  </section>

  <section class="card" id="advanced"><h2><?= __('Advanced') ?></h2>
    <?= field('page_cache_ttl', __('Page cache (seconds, 0 = off)'), $s('page_cache_ttl', '120'), 'number', ['min' => 0, 'data-hint' => __('Keeps the site fast when many people read at once.')]) ?>
    <?= field('head_code', __('Extra code in <head> (e.g. a consent tool) — only paste code from trusted providers'), $s('head_code'), 'textarea', ['rows' => 3]) ?>
  </section>
  <div class="sticky-save"><button class="a-btn a-btn-primary"><?= __('Save settings') ?></button></div>
</form>

<div class="grid-2">
  <form method="post" class="card a-form"><?= csrf_field() ?><input type="hidden" name="tab" value="ai"><h2><?= __('Test the AI connection') ?></h2><button class="a-btn" name="do" value="test_ai"><?= __('Test') ?></button></form>
  <form method="post" class="card a-form" enctype="multipart/form-data"><?= csrf_field() ?><input type="hidden" name="tab" value="analytics">
    <h2><?= __('Visitor city database') ?></h2>
    <p class="hint"><?= __('Free DB-IP City Lite (CC BY 4.0) — about 130 MB, downloaded straight to your server.') ?></p>
    <button class="a-btn" name="do" value="geoip"><?= __('Download now') ?></button>
    <label class="f"><span><?= __('…or upload a .mmdb file (e.g. MaxMind GeoLite2-City)') ?></span><input type="file" name="mmdb" accept=".mmdb"></label>
    <button class="a-btn" name="do" value="geoip_upload"><?= __('Upload') ?></button>
  </form>
  <form method="post" class="card a-form"><?= csrf_field() ?><h2><?= __('Cache') ?></h2><button class="a-btn" name="do" value="clear_cache"><?= __('Clear page cache') ?></button></form>
  <form method="post" class="card a-form"><?= csrf_field() ?><h2><?= __('Push keys') ?></h2><p class="hint"><?= __('Only if the keys were leaked: all subscribers are removed.') ?></p>
    <button class="a-btn a-btn-danger js-confirm" name="do" value="vapid" data-confirm="<?= e(__('Create new keys and remove all subscribers?')) ?>"><?= __('Create new keys') ?></button></form>
</div>
<?php admin_footer(); ?>
