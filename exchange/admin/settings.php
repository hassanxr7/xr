<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

$textKeys = [
    'site_name' => 100, 'site_tagline' => 200, 'announcement' => 300,
    'contact_phone' => 40, 'contact_whatsapp' => 40, 'contact_email' => 150, 'contact_address' => 200, 'working_hours' => 100,
    'order_prefix' => 6, 'telegram_bot_token' => 120, 'telegram_chat_id' => 60,
    'statement_note' => 1000, 'terms_text' => 5000,
    'seo_meta_description' => 300, 'gsc_verification' => 150, 'bing_verification' => 150, 'ga_measurement_id' => 20,
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
    if ($action === 'nebdex_fetch_methods') {
        $fetchResult = nebdex_fetch_payment_methods(setting('nebdex_public_key'));
        if ($fetchResult['success'] && $fetchResult['methods']) {
            $fetchResult['import'] = nebdex_import_methods($fetchResult['methods']);
        }
        $_SESSION['_nebdex_methods_result'] = $fetchResult;
        redirect('admin/settings.php');
    }
    if ($action === 'nebdex_add_method') {
        $gatewayId = (int) input('gateway_id');
        $label = mb_substr(input('method_label'), 0, 60);
        $code = preg_replace('/[^0-9]/', '', input('method_code'));
        if ($gatewayId && $label !== '' && $code !== '') {
            nebdex_add_method($gatewayId, $label, $code);
            flash('success', t('saved'));
        } else {
            flash('error', t('a_err_nebdex_method_required'));
        }
        redirect('admin/settings.php');
    }
    if ($action === 'nebdex_delete_method') {
        nebdex_delete_method((int) input('id'));
        flash('success', t('deleted'));
        redirect('admin/settings.php');
    }

    foreach ($textKeys as $key => $max) {
        save_setting($key, mb_substr(input($key), 0, $max));
    }
    save_setting('order_expiry_minutes', (string) max(5, min(1440, (int) input('order_expiry_minutes'))));
    save_setting('default_lang', in_array(input('default_lang'), ['en', 'so'], true) ? input('default_lang') : 'en');
    save_setting('timezone', in_array(input('timezone'), timezone_identifiers_list(), true) ? input('timezone') : 'Africa/Mogadishu');
    save_setting('brand_color', preg_match('/^#[0-9a-fA-F]{6}$/', input('brand_color')) ? input('brand_color') : '#0e7c66');

    $wpEnabled = empty($_POST['waafipay_enabled']) ? '0' : '1';
    $wpMerchant = mb_substr(input('waafipay_merchant_uid'), 0, 60);
    $wpApiUser = mb_substr(input('waafipay_api_user_id'), 0, 60);
    $wpApiKeyInput = input('waafipay_api_key');
    $wpApiKey = $wpApiKeyInput !== '' ? mb_substr($wpApiKeyInput, 0, 190) : setting('waafipay_api_key');
    if ($wpEnabled === '1' && ($wpMerchant === '' || $wpApiUser === '' || $wpApiKey === '')) {
        $wpEnabled = '0';
        flash('error', t('a_err_waafipay_required'));
    }
    save_setting('waafipay_enabled', $wpEnabled);
    save_setting('waafipay_environment', input('waafipay_environment') === 'live' ? 'live' : 'sandbox');
    save_setting('waafipay_merchant_uid', $wpMerchant);
    save_setting('waafipay_api_user_id', $wpApiUser);
    save_setting('waafipay_api_key', $wpApiKey);
    save_setting('waafipay_gateway_id', (string) (int) input('waafipay_gateway_id'));

    $smEnabled = empty($_POST['sovamoney_enabled']) ? '0' : '1';
    $smPublicKey = mb_substr(input('sovamoney_public_key'), 0, 60);
    $smSecretKeyInput = input('sovamoney_secret_key');
    $smSecretKey = $smSecretKeyInput !== '' ? mb_substr($smSecretKeyInput, 0, 190) : setting('sovamoney_secret_key');
    if ($smEnabled === '1' && ($smPublicKey === '' || $smSecretKey === '')) {
        $smEnabled = '0';
        flash('error', t('a_err_sovamoney_required'));
    }
    save_setting('sovamoney_enabled', $smEnabled);
    save_setting('sovamoney_environment', input('sovamoney_environment') === 'live' ? 'live' : 'sandbox');
    save_setting('sovamoney_public_key', $smPublicKey);
    save_setting('sovamoney_secret_key', $smSecretKey);
    save_setting('sovamoney_gateway_id', (string) (int) input('sovamoney_gateway_id'));

    $ndEnabled = empty($_POST['nebdex_enabled']) ? '0' : '1';
    $ndMerchantId = mb_substr(input('nebdex_merchant_id'), 0, 60);
    $ndPublicKey = mb_substr(input('nebdex_public_key'), 0, 60);
    $ndSecretKeyInput = input('nebdex_secret_key');
    $ndSecretKey = $ndSecretKeyInput !== '' ? mb_substr($ndSecretKeyInput, 0, 190) : setting('nebdex_secret_key');
    if ($ndEnabled === '1' && ($ndMerchantId === '' || $ndPublicKey === '' || $ndSecretKey === '')) {
        $ndEnabled = '0';
        flash('error', t('a_err_nebdex_required'));
    }
    save_setting('nebdex_enabled', $ndEnabled);
    save_setting('nebdex_merchant_id', $ndMerchantId);
    save_setting('nebdex_public_key', $ndPublicKey);
    save_setting('nebdex_secret_key', $ndSecretKey);

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
$gateways = rows('SELECT id, name FROM gateways ORDER BY sort_order, id');
$v = fn ($k) => e($s[$k] ?? '');
$nebdexMethodsResult = $_SESSION['_nebdex_methods_result'] ?? null;
unset($_SESSION['_nebdex_methods_result']);
nebdex_ensure_schema();
$nebdexMethodsByGateway = [];
foreach (rows('SELECT * FROM nebdex_methods ORDER BY gateway_id, sort_order, id') as $nm) {
    $nebdexMethodsByGateway[(int) $nm['gateway_id']][] = $nm;
}
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
      <div class="card-head"><h3><?= icon('search', 18) ?> <?= e(t('a_seo')) ?></h3></div>
      <div class="card-body">
        <p class="small muted"><?= e(t('a_seo_help')) ?></p>
        <div class="form-group"><label><?= e(t('a_seo_meta_description')) ?></label><textarea class="input" name="seo_meta_description" rows="2" maxlength="300"><?= $v('seo_meta_description') ?></textarea><div class="help"><?= e(t('a_seo_meta_description_help')) ?></div></div>
        <div class="form-group"><label><?= e(t('a_seo_gsc')) ?></label><input class="input mono" name="gsc_verification" value="<?= $v('gsc_verification') ?>" placeholder="abcDEF123..."><div class="help"><?= e(t('a_seo_gsc_help')) ?></div></div>
        <div class="form-group"><label><?= e(t('a_seo_bing')) ?></label><input class="input mono" name="bing_verification" value="<?= $v('bing_verification') ?>"><div class="help"><?= e(t('a_seo_bing_help')) ?></div></div>
        <div class="form-group"><label><?= e(t('a_seo_ga')) ?></label><input class="input mono" name="ga_measurement_id" value="<?= $v('ga_measurement_id') ?>" placeholder="G-XXXXXXXXXX"><div class="help"><?= e(t('a_seo_ga_help')) ?></div></div>
        <p class="help"><?= e(t('a_seo_sitemap_help', ['url' => full_url('sitemap.xml')])) ?></p>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('bolt', 18) ?> <?= e(t('a_waafipay')) ?></h3></div>
      <div class="card-body">
        <p class="small muted"><?= e(t('a_waafipay_help')) ?></p>
        <label class="check"><input type="checkbox" name="waafipay_enabled" value="1" <?= ($s['waafipay_enabled'] ?? '') === '1' ? 'checked' : '' ?>> <?= e(t('a_waafipay_enabled')) ?></label>
        <div class="form-row mt-2">
          <div class="form-group">
            <label><?= e(t('a_waafipay_environment')) ?></label>
            <select class="input" name="waafipay_environment">
              <option value="sandbox" <?= ($s['waafipay_environment'] ?? 'sandbox') === 'sandbox' ? 'selected' : '' ?>><?= e(t('a_waafipay_sandbox')) ?></option>
              <option value="live" <?= ($s['waafipay_environment'] ?? '') === 'live' ? 'selected' : '' ?>><?= e(t('a_waafipay_live')) ?></option>
            </select>
          </div>
          <div class="form-group">
            <label><?= e(t('a_waafipay_gateway')) ?></label>
            <select class="input" name="waafipay_gateway_id">
              <?php foreach ($gateways as $g): ?>
                <option value="<?= (int) $g['id'] ?>" <?= (int) ($s['waafipay_gateway_id'] ?? 0) === (int) $g['id'] ? 'selected' : '' ?>><?= e($g['name']) ?></option>
              <?php endforeach; ?>
            </select>
            <div class="help"><?= e(t('a_waafipay_gateway_help')) ?></div>
          </div>
        </div>
        <div class="form-group"><label><?= e(t('a_waafipay_merchant_uid')) ?></label><input class="input mono" name="waafipay_merchant_uid" value="<?= $v('waafipay_merchant_uid') ?>" autocomplete="off"></div>
        <div class="form-group"><label><?= e(t('a_waafipay_api_user_id')) ?></label><input class="input mono" name="waafipay_api_user_id" value="<?= $v('waafipay_api_user_id') ?>" autocomplete="off"></div>
        <div class="form-group">
          <label><?= e(t('a_waafipay_api_key')) ?></label>
          <input class="input mono" type="password" name="waafipay_api_key" placeholder="<?= !empty($s['waafipay_api_key']) ? '••••••••••••' : '' ?>" autocomplete="off">
          <div class="help"><?= e(t('a_waafipay_api_key_help')) ?> <?= !empty($s['waafipay_api_key']) ? e(t('a_waafipay_key_saved')) : e(t('a_waafipay_key_missing')) ?></div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('bolt', 18) ?> <?= e(t('a_sovamoney')) ?></h3></div>
      <div class="card-body">
        <p class="small muted"><?= e(t('a_sovamoney_help')) ?></p>
        <label class="check"><input type="checkbox" name="sovamoney_enabled" value="1" <?= ($s['sovamoney_enabled'] ?? '') === '1' ? 'checked' : '' ?>> <?= e(t('a_sovamoney_enabled')) ?></label>
        <div class="form-row mt-2">
          <div class="form-group">
            <label><?= e(t('a_sovamoney_environment')) ?></label>
            <select class="input" name="sovamoney_environment">
              <option value="sandbox" <?= ($s['sovamoney_environment'] ?? 'sandbox') === 'sandbox' ? 'selected' : '' ?>><?= e(t('a_waafipay_sandbox')) ?></option>
              <option value="live" <?= ($s['sovamoney_environment'] ?? '') === 'live' ? 'selected' : '' ?>><?= e(t('a_waafipay_live')) ?></option>
            </select>
          </div>
          <div class="form-group">
            <label><?= e(t('a_sovamoney_gateway')) ?></label>
            <select class="input" name="sovamoney_gateway_id">
              <?php foreach ($gateways as $g): ?>
                <option value="<?= (int) $g['id'] ?>" <?= (int) ($s['sovamoney_gateway_id'] ?? 0) === (int) $g['id'] ? 'selected' : '' ?>><?= e($g['name']) ?></option>
              <?php endforeach; ?>
            </select>
            <div class="help"><?= e(t('a_sovamoney_gateway_help')) ?></div>
          </div>
        </div>
        <div class="form-group"><label><?= e(t('a_sovamoney_public_key')) ?></label><input class="input mono" name="sovamoney_public_key" value="<?= $v('sovamoney_public_key') ?>" autocomplete="off"></div>
        <div class="form-group">
          <label><?= e(t('a_sovamoney_secret_key')) ?></label>
          <input class="input mono" type="password" name="sovamoney_secret_key" placeholder="<?= !empty($s['sovamoney_secret_key']) ? '••••••••••••' : '' ?>" autocomplete="off">
          <div class="help"><?= e(t('a_waafipay_api_key_help')) ?> <?= !empty($s['sovamoney_secret_key']) ? e(t('a_waafipay_key_saved')) : e(t('a_waafipay_key_missing')) ?></div>
        </div>
        <p class="help"><?= e(t('a_sovamoney_ipn_help', ['url' => full_url('sovamoney_ipn.php')])) ?></p>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3><?= icon('bolt', 18) ?> <?= e(t('a_nebdex')) ?></h3></div>
      <div class="card-body">
        <p class="small muted"><?= e(t('a_nebdex_help')) ?></p>
        <label class="check"><input type="checkbox" name="nebdex_enabled" value="1" <?= ($s['nebdex_enabled'] ?? '') === '1' ? 'checked' : '' ?>> <?= e(t('a_nebdex_enabled')) ?></label>
        <div class="form-group mt-2"><label><?= e(t('a_nebdex_merchant_id')) ?></label><input class="input mono" name="nebdex_merchant_id" value="<?= $v('nebdex_merchant_id') ?>" autocomplete="off"></div>
        <div class="form-group"><label><?= e(t('a_nebdex_public_key')) ?></label><input class="input mono" name="nebdex_public_key" value="<?= $v('nebdex_public_key') ?>" autocomplete="off"></div>
        <div class="form-group">
          <label><?= e(t('a_nebdex_secret_key')) ?></label>
          <input class="input mono" type="password" name="nebdex_secret_key" placeholder="<?= !empty($s['nebdex_secret_key']) ? '••••••••••••' : '' ?>" autocomplete="off">
          <div class="help"><?= e(t('a_waafipay_api_key_help')) ?> <?= !empty($s['nebdex_secret_key']) ? e(t('a_waafipay_key_saved')) : e(t('a_waafipay_key_missing')) ?></div>
        </div>
        <h4 class="mt-3"><?= e(t('a_nebdex_methods')) ?></h4>
        <p class="help"><?= e(t('a_nebdex_methods_help')) ?></p>
        <button class="btn btn-outline btn-sm" type="submit" form="nebdex-fetch"><?= icon('search', 15) ?> <?= e(t('a_nebdex_fetch')) ?></button>
        <p class="help"><?= e(t('a_nebdex_fetch_help')) ?></p>
        <?php if ($nebdexMethodsResult): ?>
          <?php if ($nebdexMethodsResult['success']): ?>
            <div class="alert alert-success"><?= icon('check-circle') ?><span><?= e(t('a_nebdex_merchant_id_found', ['id' => $nebdexMethodsResult['merchant_id'] ?? '—'])) ?></span></div>
            <?php if (isset($nebdexMethodsResult['import'])): $imp = $nebdexMethodsResult['import']; ?>
              <?php if ($imp['imported']): ?>
                <div class="alert alert-success"><?= icon('check-circle') ?><span><?= e(t('a_nebdex_imported', ['list' => implode(', ', $imp['imported'])])) ?></span></div>
              <?php endif; ?>
              <?php if ($imp['skipped']): ?>
                <div class="alert alert-info"><?= icon('info') ?><span><?= e(t('a_nebdex_already_added', ['list' => implode(', ', $imp['skipped'])])) ?></span></div>
              <?php endif; ?>
              <?php if ($imp['unmatched']): ?>
                <div class="alert alert-warning"><?= icon('info') ?><span><?= e(t('a_nebdex_unmatched', ['list' => implode(', ', $imp['unmatched'])])) ?></span></div>
              <?php endif; ?>
              <?php if (!$imp['imported'] && !$imp['skipped'] && !$imp['unmatched']): ?>
                <div class="alert alert-info"><?= icon('info') ?><span><?= e(t('a_nebdex_no_methods')) ?></span></div>
              <?php endif; ?>
            <?php endif; ?>
            <?php if ($nebdexMethodsResult['methods']): ?>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th><?= e(t('a_name')) ?></th><th><?= e(t('a_currency')) ?></th><th>method_code</th><th><?= e(t('min')) ?></th><th><?= e(t('max')) ?></th></tr></thead>
                <tbody>
                <?php foreach ($nebdexMethodsResult['methods'] as $m): ?>
                  <tr><td><?= e((string) ($m['name'] ?? '')) ?></td><td><?= e((string) ($m['currency'] ?? '')) ?></td><td class="mono"><?= e((string) ($m['method_code'] ?? '')) ?></td><td><?= e((string) ($m['min_amount'] ?? '')) ?></td><td><?= e((string) ($m['max_amount'] ?? '')) ?></td></tr>
                <?php endforeach; ?>
                </tbody>
              </table>
            </div>
            <?php else: ?>
              <div class="alert alert-info"><?= icon('info') ?><span><?= e(t('a_nebdex_no_methods')) ?></span></div>
            <?php endif; ?>
          <?php else: ?>
            <div class="alert alert-error"><?= icon('alert') ?><span><?= e($nebdexMethodsResult['message']) ?></span></div>
          <?php endif; ?>
        <?php endif; ?>
        <?php foreach ($gateways as $g): ?>
        <div class="form-group mt-2">
          <label><?= e($g['name']) ?></label>
          <?php foreach (($nebdexMethodsByGateway[$g['id']] ?? []) as $nm): ?>
            <div class="pay-target">
              <div><strong><?= e($nm['label']) ?></strong><div class="small muted mono">method_code: <?= e($nm['method_code']) ?></div></div>
              <button class="btn btn-outline btn-sm" type="submit" form="nebdex-delete-<?= (int) $nm['id'] ?>"><?= icon('x', 14) ?></button>
            </div>
          <?php endforeach; ?>
          <div class="form-row">
            <div class="form-group"><input class="input" form="nebdex-add-<?= (int) $g['id'] ?>" name="method_label" placeholder="<?= e(t('a_nebdex_method_label_ph')) ?>" maxlength="60"></div>
            <div class="form-group"><input class="input mono" form="nebdex-add-<?= (int) $g['id'] ?>" name="method_code" placeholder="<?= e(t('a_nebdex_method_ph')) ?>" inputmode="numeric"></div>
            <div class="form-group" style="flex:0 0 auto"><button class="btn btn-outline btn-sm" type="submit" form="nebdex-add-<?= (int) $g['id'] ?>"><?= icon('plus', 15) ?> <?= e(t('a_nebdex_add_method')) ?></button></div>
          </div>
        </div>
        <?php endforeach; ?>
        <p class="help"><?= e(t('a_nebdex_ipn_help', ['url' => full_url('nebdex_ipn.php')])) ?></p>
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
<form method="post" id="nebdex-fetch" class="hidden"><?= csrf_field() ?><input type="hidden" name="action" value="nebdex_fetch_methods"></form>
<?php foreach ($gateways as $g): ?>
  <?php foreach (($nebdexMethodsByGateway[$g['id']] ?? []) as $nm): ?>
<form method="post" id="nebdex-delete-<?= (int) $nm['id'] ?>" class="hidden" data-confirm="<?= e(t('a_confirm_delete')) ?>"><?= csrf_field() ?><input type="hidden" name="action" value="nebdex_delete_method"><input type="hidden" name="id" value="<?= (int) $nm['id'] ?>"></form>
  <?php endforeach; ?>
<form method="post" id="nebdex-add-<?= (int) $g['id'] ?>" class="hidden"><?= csrf_field() ?><input type="hidden" name="action" value="nebdex_add_method"><input type="hidden" name="gateway_id" value="<?= (int) $g['id'] ?>"></form>
<?php endforeach; ?>

<?php if (!empty($s['logo'])): ?>
<form method="post" class="mt-2"><?= csrf_field() ?><input type="hidden" name="action" value="remove_logo"><button class="btn btn-ghost btn-sm" type="submit"><?= e(t('a_remove_logo')) ?></button></form>
<?php endif; ?>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
