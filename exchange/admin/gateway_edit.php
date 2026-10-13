<?php
require dirname(__DIR__) . '/app/bootstrap.php';

require_admin();

$id = (int) ($_GET['id'] ?? 0);
$gw = $id ? row('SELECT * FROM gateways WHERE id = ?', [$id]) : null;
if ($id && !$gw) {
    redirect('admin/gateways.php');
}
$data = $gw ?: [
    'code' => '', 'name' => '', 'currency' => 'USD', 'decimals' => 2, 'color' => '#0e7c66', 'logo' => null, 'reserve' => 0,
    'account_label' => '', 'account_placeholder' => '', 'account_pattern' => '', 'pay_to' => '', 'pay_to_name' => '',
    'ussd_template' => '', 'instructions' => '', 'is_active' => 1, 'sort_order' => 0,
];
$errors = [];

if (is_post()) {
    csrf_check();
    if (input('action') === 'delete' && $gw) {
        if (val('SELECT 1 FROM orders WHERE from_gateway_id = ? OR to_gateway_id = ? LIMIT 1', [$gw['id'], $gw['id']])) {
            flash('error', t('a_err_gateway_used'));
            redirect('admin/gateway_edit.php?id=' . $gw['id']);
        }
        q('DELETE FROM gateways WHERE id = ?', [$gw['id']]);
        flash('success', t('deleted'));
        redirect('admin/gateways.php');
    }
    if (input('action') === 'remove_logo' && $gw) {
        update('gateways', ['logo' => null], 'id = ?', [$gw['id']]);
        flash('success', t('saved'));
        redirect('admin/gateway_edit.php?id=' . $gw['id']);
    }

    $data = array_merge($data, [
        'code'                => strtolower(preg_replace('/[^a-z0-9_]/i', '', input('code'))),
        'name'                => mb_substr(input('name'), 0, 80),
        'currency'            => strtoupper(mb_substr(preg_replace('/[^A-Za-z0-9]/', '', input('currency')), 0, 10)),
        'decimals'            => max(0, min(8, (int) input('decimals'))),
        'color'               => preg_match('/^#[0-9a-fA-F]{6}$/', input('color')) ? input('color') : '#0e7c66',
        'reserve'             => is_numeric(input('reserve')) ? max(0, (float) input('reserve')) : 0,
        'account_label'       => mb_substr(input('account_label'), 0, 120),
        'account_placeholder' => mb_substr(input('account_placeholder'), 0, 120) ?: null,
        'account_pattern'     => mb_substr(input('account_pattern'), 0, 255) ?: null,
        'pay_to'              => mb_substr(input('pay_to'), 0, 190) ?: null,
        'pay_to_name'         => mb_substr(input('pay_to_name'), 0, 120) ?: null,
        'ussd_template'       => mb_substr(input('ussd_template'), 0, 120) ?: null,
        'instructions'        => mb_substr(input('instructions'), 0, 2000) ?: null,
        'is_active'           => empty($_POST['is_active']) ? 0 : 1,
        'sort_order'          => (int) input('sort_order'),
    ]);
    if ($data['code'] === '' || $data['name'] === '' || $data['currency'] === '' || $data['account_label'] === '') {
        $errors[] = t('a_err_required');
    }
    if (val('SELECT id FROM gateways WHERE code = ? AND id <> ?', [$data['code'], $id])) {
        $errors[] = t('a_err_code_taken');
    }
    if ($data['account_pattern'] && @preg_match('~' . str_replace('~', '\~', $data['account_pattern']) . '~u', '') === false) {
        $errors[] = t('a_err_pattern');
    }
    if (!$errors && has_upload('logo')) {
        try {
            $data['logo'] = 'uploads/logos/' . store_image($_FILES['logo'], UPLOAD_PATH . '/logos', 1048576);
        } catch (RuntimeException $ex) {
            $errors[] = $ex->getMessage();
        }
    }
    if (!$errors) {
        $save = $data;
        unset($save['id']);
        if ($gw) {
            update('gateways', $save, 'id = ?', [$id]);
        } else {
            $id = insert('gateways', $save);
        }
        flash('success', t('saved'));
        redirect('admin/gateways.php');
    }
}

$pageTitle = $gw ? t('a_edit_gateway') . ': ' . $gw['name'] : t('a_add_gateway');
require APP_PATH . '/views/admin_header.php';
?>
<div class="toolbar-row"><a class="btn btn-ghost btn-sm" href="<?= e(url('admin/gateways.php')) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('a_gateways')) ?></a></div>
<?php foreach ($errors as $err): ?><div class="alert alert-error"><?= icon('alert') ?><span><?= e($err) ?></span></div><?php endforeach; ?>
<form method="post" enctype="multipart/form-data" class="grid grid-main">
  <?= csrf_field() ?>
  <div class="card">
    <div class="card-head"><h3><?= icon('wallet', 18) ?> <?= e(t('a_gateway')) ?></h3></div>
    <div class="card-body">
      <div class="form-row">
        <div class="form-group"><label><?= e(t('a_name')) ?></label><input class="input" name="name" value="<?= e($data['name']) ?>" required placeholder="EVC Plus"></div>
        <div class="form-group"><label><?= e(t('a_code')) ?></label><input class="input mono" name="code" value="<?= e($data['code']) ?>" required placeholder="evc"><div class="help"><?= e(t('a_code_help')) ?></div></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label><?= e(t('a_currency')) ?></label><input class="input" name="currency" value="<?= e($data['currency']) ?>" required placeholder="USD"></div>
        <div class="form-group"><label><?= e(t('a_decimals')) ?></label><input class="input" type="number" min="0" max="8" name="decimals" value="<?= (int) $data['decimals'] ?>"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label><?= e(t('reserve')) ?></label><input class="input" name="reserve" value="<?= e((string) (float) $data['reserve']) ?>" inputmode="decimal"><div class="help"><?= e(t('a_reserve_help')) ?></div></div>
        <div class="form-group"><label><?= e(t('a_sort')) ?></label><input class="input" type="number" name="sort_order" value="<?= (int) $data['sort_order'] ?>"></div>
      </div>

      <h4 class="mt-3"><?= e(t('a_customer_account_section')) ?></h4>
      <div class="form-group"><label><?= e(t('a_account_label')) ?></label><input class="input" name="account_label" value="<?= e($data['account_label']) ?>" required placeholder="USDT TRC20 Wallet Address"></div>
      <div class="form-row">
        <div class="form-group"><label><?= e(t('a_account_placeholder')) ?></label><input class="input" name="account_placeholder" value="<?= e($data['account_placeholder']) ?>"></div>
        <div class="form-group"><label><?= e(t('a_account_pattern')) ?></label><input class="input mono" name="account_pattern" value="<?= e($data['account_pattern']) ?>" placeholder="^T[1-9A-HJ-NP-Za-km-z]{33}$"><div class="help"><?= e(t('a_account_pattern_help')) ?></div></div>
      </div>

      <h4 class="mt-3"><?= e(t('a_payment_section')) ?></h4>
      <div class="form-row">
        <div class="form-group"><label><?= e(t('a_pay_to')) ?></label><input class="input mono" name="pay_to" value="<?= e($data['pay_to']) ?>" placeholder="61xxxxxxx"><div class="help"><?= e(t('a_pay_to_help')) ?></div></div>
        <div class="form-group"><label><?= e(t('a_pay_to_name')) ?></label><input class="input" name="pay_to_name" value="<?= e($data['pay_to_name']) ?>"></div>
      </div>
      <div class="form-group"><label><?= e(t('a_ussd')) ?></label><input class="input mono" name="ussd_template" value="<?= e($data['ussd_template']) ?>" placeholder="*712*{to}*{amount}#"><div class="help"><?= e(t('a_ussd_help')) ?></div></div>
      <div class="form-group"><label><?= e(t('a_instructions')) ?></label><textarea class="input" name="instructions" rows="3"><?= e($data['instructions']) ?></textarea></div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-head"><h3><?= icon('settings', 18) ?> <?= e(t('a_appearance')) ?></h3></div>
      <div class="card-body">
        <div class="form-group"><label><?= e(t('a_color')) ?></label><input class="color-input" type="color" name="color" value="<?= e($data['color']) ?>"></div>
        <div class="form-group">
          <label><?= e(t('a_logo')) ?></label>
          <?php if ($data['logo']): ?><p><img class="logo-preview" src="<?= e(url($data['logo'])) ?>" alt=""></p><?php endif; ?>
          <label class="file-drop"><?= icon('upload', 20) ?> <span id="logo-label"><?= e(t('choose_image')) ?></span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" data-file-label="#logo-label"></label>
          <div class="help"><?= e(t('a_logo_help')) ?></div>
        </div>
        <label class="check"><input type="checkbox" name="is_active" value="1" <?= $data['is_active'] ? 'checked' : '' ?>> <?= e(t('active')) ?></label>
        <button class="btn btn-primary btn-block mt-3" type="submit"><?= e(t('save')) ?></button>
      </div>
    </div>
  </div>
</form>
<?php if ($gw): ?>
<div class="btn-group mt-2">
  <?php if ($gw['logo']): ?><form method="post"><?= csrf_field() ?><input type="hidden" name="action" value="remove_logo"><button class="btn btn-outline btn-sm" type="submit"><?= e(t('a_remove_logo')) ?></button></form><?php endif; ?>
  <form method="post" data-confirm="<?= e(t('a_confirm_delete')) ?>"><?= csrf_field() ?><input type="hidden" name="action" value="delete"><button class="btn btn-danger btn-sm" type="submit"><?= icon('x', 15) ?> <?= e(t('delete')) ?></button></form>
</div>
<?php endif; ?>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
