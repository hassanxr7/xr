<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

$textKeys = [
    'site_name' => 100, 'site_tagline' => 200, 'announcement' => 300,
    'contact_phone' => 40, 'contact_whatsapp' => 40, 'contact_email' => 150, 'contact_address' => 200, 'working_hours' => 100,
    'order_prefix' => 6, 'telegram_bot_token' => 120, 'telegram_chat_id' => 60,
    'statement_note' => 1000, 'terms_text' => 5000,
];

if (is_post()) {
    csrf_check();
    $action = input('action');

    if ($action === 'test_telegram') {
        telegram_notify('✅ ' . setting('site_name') . ': Telegram notifications are working.');
        flash('info', t('a_telegram_sent'));
        redirect('admin/settings.php');
    }
    if ($action === 'remove_logo') {
        save_setting('logo', '');
        flash('success', t('saved'));
        redirect('admin/settings.php');
    }

    foreach ($textKeys as $key => $max) {
        save_setting($key, mb_substr(input($key), 0, $max));
    }
    save_setting('order_expiry_minutes', (string) max(5, min(1440, (int) input('order_expiry_minutes'))));
    save_setting('default_lang', in_array(input('default_lang'), ['en', 'so'], true) ? input('default_lang') : 'en');
    save_setting('timezone', in_array(input('timezone'), timezone_identifiers_list(), true) ? input('timezone') : 'Africa/Mogadishu');
    save_setting('brand_color', preg_match('/^#[0-9a-fA-F]{6}$/', input('brand_color')) ? input('brand_color') : '#0e7c66');

    if (has_upload('logo')) {
        try {
            save_setting('logo', 'uploads/logos/' . store_image($_FILES['logo'], UPLOAD_PATH . '/logos', 1048576));
        } catch (RuntimeException $ex) {
            flash('error', $ex->getMessage());
        }
    }
    flash('success', t('saved'));
    redirect('admin/settings.php');
}

$s = settings(true);
$v = fn ($k) => e($s[$k] ?? '');
$pageTitle = t('a_settings');
require APP_PATH . '/views/admin_header.php';
?>
<form method="post" enctype="multipart/form-data">
  <?= csrf_field() ?>
  <div class="grid grid-2">
    <div class="card">
      <div class="card-head"><h3><?= icon('settings', 18) ?> <?= e(t('a_general')) ?></h3></div>
      <div class="card-body">
        <div class="form-group"><label><?= e(t('a_site_name')) ?></label><input class="input" name="site_name" value="<?= $v('site_name') ?>" required></div>
        <div class="form-group"><label><?= e(t('a_tagline')) ?></label><input class="input" name="site_tagline" value="<?= $v('site_tagline') ?>"></div>
        <div class="form-group"><label><?= e(t('a_announcement')) ?></label><input class="input" name="announcement" value="<?= $v('announcement') ?>"><div class="help"><?= e(t('a_announcement_help')) ?></div></div>
        <div class="form-row">
          <div class="form-group"><label><?= e(t('a_default_lang')) ?></label>
            <select class="input" name="default_lang"><option value="en" <?= ($s['default_lang'] ?? 'en') === 'en' ? 'selected' : '' ?>>English</option><option value="so" <?= ($s['default_lang'] ?? '') === 'so' ? 'selected' : '' ?>>Soomaali</option></select>
          </div>
          <div class="form-group"><label><?= e(t('a_timezone')) ?></label><input class="input" name="timezone" value="<?= $v('timezone') ?>" list="tz-list"><datalist id="tz-list"><option value="Africa/Mogadishu"><option value="Africa/Nairobi"><option value="Africa/Djibouti"><option value="Africa/Addis_Ababa"><option value="Asia/Dubai"><option value="Europe/London"><option value="UTC"></datalist></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('phone', 18) ?> <?= e(t('footer_contact')) ?></h3></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label><?= e(t('phone')) ?></label><input class="input" name="contact_phone" value="<?= $v('contact_phone') ?>" placeholder="+252 61 xxx xxxx"></div>
          <div class="form-group"><label>WhatsApp</label><input class="input" name="contact_whatsapp" value="<?= $v('contact_whatsapp') ?>" placeholder="25261xxxxxxx"><div class="help"><?= e(t('a_whatsapp_help')) ?></div></div>
        </div>
        <div class="form-group"><label><?= e(t('email')) ?></label><input class="input" type="email" name="contact_email" value="<?= $v('contact_email') ?>"></div>
        <div class="form-group"><label><?= e(t('a_address')) ?></label><input class="input" name="contact_address" value="<?= $v('contact_address') ?>"></div>
        <div class="form-group"><label><?= e(t('working_hours')) ?></label><input class="input" name="working_hours" value="<?= $v('working_hours') ?>"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('list', 18) ?> <?= e(t('a_orders')) ?></h3></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label><?= e(t('a_order_prefix')) ?></label><input class="input mono" name="order_prefix" value="<?= $v('order_prefix') ?>" maxlength="6"><div class="help"><?= e(t('a_order_prefix_help')) ?></div></div>
          <div class="form-group"><label><?= e(t('a_expiry')) ?></label><input class="input" type="number" min="5" max="1440" name="order_expiry_minutes" value="<?= $v('order_expiry_minutes') ?>"><div class="help"><?= e(t('a_expiry_help')) ?></div></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('eye', 18) ?> <?= e(t('a_appearance')) ?></h3></div>
      <div class="card-body">
        <div class="form-row">
          <div class="form-group"><label><?= e(t('a_brand_color')) ?></label><input class="color-input" type="color" name="brand_color" value="<?= e(brand_color()) ?>"></div>
          <div class="form-group">
            <label><?= e(t('a_logo')) ?></label>
            <?php if (!empty($s['logo'])): ?><p><img class="logo-preview" src="<?= e(url($s['logo'])) ?>" alt=""></p><?php endif; ?>
            <label class="file-drop"><?= icon('upload', 20) ?> <span id="logo-label"><?= e(t('choose_image')) ?></span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" data-file-label="#logo-label"></label>
            <div class="help"><?= e(t('a_site_logo_help')) ?></div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('bolt', 18) ?> <?= e(t('a_notifications')) ?></h3></div>
      <div class="card-body">
        <p class="small muted"><?= e(t('a_telegram_help')) ?></p>
        <div class="form-group"><label>Telegram Bot Token</label><input class="input mono" name="telegram_bot_token" value="<?= $v('telegram_bot_token') ?>" autocomplete="off" placeholder="123456:ABC-DEF..."></div>
        <div class="form-group"><label>Telegram Chat ID</label><input class="input mono" name="telegram_chat_id" value="<?= $v('telegram_chat_id') ?>" placeholder="-100123456789"></div>
        <button class="btn btn-outline btn-sm" type="submit" form="tg-test"><?= icon('bolt', 15) ?> <?= e(t('a_test_telegram')) ?></button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('file', 18) ?> <?= e(t('a_documents')) ?></h3></div>
      <div class="card-body">
        <div class="form-group"><label><?= e(t('a_statement_note')) ?></label><textarea class="input" name="statement_note" rows="3"><?= $v('statement_note') ?></textarea></div>
        <div class="form-group"><label><?= e(t('terms')) ?></label><textarea class="input" name="terms_text" rows="6"><?= $v('terms_text') ?></textarea></div>
      </div>
    </div>
  </div>
  <div class="btn-group mt-3">
    <button class="btn btn-primary btn-lg" type="submit"><?= icon('check', 18) ?> <?= e(t('a_save_settings')) ?></button>
  </div>
</form>
<form method="post" id="tg-test" class="hidden"><?= csrf_field() ?><input type="hidden" name="action" value="test_telegram"></form>
<?php if (!empty($s['logo'])): ?>
<form method="post" class="mt-2"><?= csrf_field() ?><input type="hidden" name="action" value="remove_logo"><button class="btn btn-ghost btn-sm" type="submit"><?= e(t('a_remove_logo')) ?></button></form>
<?php endif; ?>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
