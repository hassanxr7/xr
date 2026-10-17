<?php
/**
 * Withdraw the merchant's SovaMoney balance to one of the merchant's own
 * saved withdrawal destinations: methods → amount → confirm → (OTP) →
 * "request submitted". A request is never shown as paid: the API has no
 * documented status mapping, status endpoint or webhook.
 */
require dirname(__DIR__) . '/app/bootstrap.php';

$adm = require_admin();
upgrade_sovamoney_withdrawals();
$self = 'admin/sovamoney_withdraw.php';
$hasKey = setting('sovamoney_public_key') !== '';

$statusBadge = [
    'sending'       => 'processing',
    'otp_pending'   => 'awaiting_payment',
    'otp_verifying' => 'processing',
    'submitted'     => 'processing',
    'unknown'       => 'pending',
    'failed'        => 'rejected',
    'otp_expired'   => 'expired',
    'cancelled'     => 'cancelled',
];
$badge = fn (string $s) => '<span class="badge badge-' . ($statusBadge[$s] ?? 'cancelled') . '">' . e(t('a_swd_st_' . $s)) . '</span>';

if (is_post()) {
    csrf_check();
    $action = input('action');
    $id = (int) input('id');
    try {
        if ($action === 'preview') {
            $list = sovamoney_withdraw_methods();
            if (!$list['ok']) {
                throw new RuntimeException(t('a_swd_err_methods', ['msg' => $list['message']]));
            }
            $m = $list['methods'][(int) input('user_method_id')] ?? null;
            if (!$m) {
                throw new RuntimeException(t('a_swd_err_method'));
            }
            $amountRaw = str_replace(',', '', input('amount'));
            $amount = is_numeric($amountRaw) ? round((float) $amountRaw, 2) : 0.0;
            if ($amount <= 0) {
                throw new RuntimeException(t('a_swd_err_amount'));
            }
            if ($amount < $m['min'] || ($m['max'] > 0 && $amount > $m['max'])) {
                throw new RuntimeException(t('a_swd_err_limits', ['min' => fmt_amount($m['min']), 'max' => $m['max'] > 0 ? fmt_amount($m['max']) : '∞', 'cur' => $m['currency']]));
            }
            $otpMethod = null;
            if ($list['otp_required']) {
                $otpMethod = input('otp_method');
                if (!in_array($otpMethod, $list['otp_methods'], true)) {
                    throw new RuntimeException(t('a_swd_err_otp_method'));
                }
            }
            $quote = sovamoney_withdraw_quote($m, $amount);
            if ($quote['final'] <= 0) {
                throw new RuntimeException(t('a_swd_err_amount'));
            }
            $_SESSION['_swd_preview'] = [
                'nonce'      => bin2hex(random_bytes(16)),
                'method'     => $m,
                'amount'     => $amount,
                'otp_method' => $otpMethod,
                'quote'      => $quote,
            ];
            redirect($self . '?confirm=1');
        }

        if ($action === 'submit') {
            $p = $_SESSION['_swd_preview'] ?? null;
            $nonce = input('nonce');
            $existing = $nonce !== '' ? row('SELECT id FROM sovamoney_withdrawals WHERE nonce = ?', [$nonce]) : null;
            if ($existing) {
                // Same confirmation form posted again: show the original request.
                redirect($self . '?id=' . $existing['id']);
            }
            if (!$p || !hash_equals($p['nonce'], $nonce)) {
                throw new RuntimeException(t('a_swd_err_stale'));
            }
            $w = sovamoney_withdraw_create((int) $adm['id'], $p['nonce'], $p['method'], (float) $p['amount'], $p['otp_method']);
            unset($_SESSION['_swd_preview']);
            redirect($self . '?id=' . $w['id']);
        }

        if ($action === 'verify_otp' && $id) {
            $otp = preg_replace('/\D/', '', input('otp'));
            if (strlen($otp) < 4 || strlen($otp) > 8) {
                throw new RuntimeException(t('a_swd_err_otp_format'));
            }
            sovamoney_withdraw_verify_otp($id, $otp);
            redirect($self . '?id=' . $id);
        }

        if ($action === 'cancel' && $id) {
            sovamoney_withdraw_cancel($id);
            redirect($self . '?id=' . $id);
        }

        if (in_array($action, ['reconcile_found', 'reconcile_missing'], true) && $id) {
            sovamoney_withdraw_reconcile($id, $action === 'reconcile_found', (string) ($adm['name'] ?? 'admin'));
            redirect($self . '?id=' . $id);
        }

        if ($action === 'discard_preview') {
            unset($_SESSION['_swd_preview']);
        }
    } catch (RuntimeException $ex) {
        flash('error', $ex->getMessage());
        redirect($id ? $self . '?id=' . $id : $self);
    }
    redirect($self);
}

$view = null;
if (isset($_GET['id'])) {
    $view = row('SELECT w.*, a.name AS admin_name FROM sovamoney_withdrawals w LEFT JOIN admins a ON a.id = w.admin_id WHERE w.id = ?', [(int) $_GET['id']]);
}
$preview = isset($_GET['confirm']) ? ($_SESSION['_swd_preview'] ?? null) : null;
$blocking = sovamoney_withdraw_blocking();
$list = (!$view && !$preview && $hasKey) ? sovamoney_withdraw_methods() : null;
$history = rows('SELECT * FROM sovamoney_withdrawals ORDER BY id DESC LIMIT 25');

$pageTitle = t('a_swd_title');
require APP_PATH . '/views/admin_header.php';
?>
<div class="toolbar-row">
  <p class="muted mb-0"><?= e(t('a_swd_intro')) ?></p>
  <?php if ($view || $preview): ?><a class="btn btn-ghost btn-sm" href="<?= e(url($self)) ?>"><?= icon('arrow-left', 16) ?> <?= e(t('a_swd_new')) ?></a><?php endif; ?>
</div>

<div class="alert alert-info"><?= icon('info') ?><span><?= e(t('a_swd_scope_note')) ?></span></div>

<?php if (!$hasKey): ?>
  <div class="alert alert-error"><?= icon('alert') ?><span><?= e(t('a_swd_no_key')) ?> <a href="<?= e(url('admin/settings.php')) ?>"><?= e(t('a_settings')) ?></a></span></div>

<?php elseif ($view): ?>
  <div class="card">
    <div class="card-head"><h3><?= icon('download', 18) ?> <?= e(t('a_swd_request')) ?> #<?= (int) $view['id'] ?></h3><?= $badge($view['status']) ?></div>
    <div class="card-body">
      <?php if ($view['status'] === 'submitted'): ?>
        <div class="alert alert-success"><?= icon('check-circle') ?><span><?= e(t('a_swd_submitted_note')) ?></span></div>
      <?php elseif ($view['status'] === 'unknown' || sovamoney_withdraw_reconcilable($view)): ?>
        <div class="alert alert-error"><?= icon('alert') ?><span><?= e(t('a_swd_unknown_note')) ?></span></div>
      <?php elseif (in_array($view['status'], ['failed', 'otp_expired'], true) && $view['message']): ?>
        <div class="alert alert-error"><?= icon('x-circle') ?><span><?= e($view['message']) ?></span></div>
      <?php endif; ?>

      <dl class="kv">
        <div><dt><?= e(t('a_swd_destination')) ?></dt><dd><?= e($view['method_name']) ?><?= $view['destination'] ? ' — ' . e($view['destination']) : '' ?> <span class="muted small">(method <?= (int) $view['method_id'] ?> / user_method <?= (int) $view['user_method_id'] ?>)</span></dd></div>
        <div><dt><?= e(t('amount')) ?></dt><dd><?= e(money($view['amount'], (string) $view['currency'])) ?></dd></div>
        <div><dt><?= e(t('a_swd_est_charge')) ?></dt><dd><?= e(money($view['est_charge'], (string) $view['currency'])) ?></dd></div>
        <div><dt><?= e(t('a_swd_est_final')) ?></dt><dd><?= e(money($view['est_final'], (string) $view['currency'])) ?></dd></div>
        <?php if ($view['otp_method']): ?><div><dt>OTP</dt><dd><?= e($view['otp_method']) ?></dd></div><?php endif; ?>
        <?php if ($view['transaction_no']): ?><div><dt><?= e(t('a_swd_transaction_no')) ?></dt><dd class="mono"><?= e($view['transaction_no']) ?></dd></div><?php endif; ?>
        <?php if ($view['sm_id'] !== null || $view['sm_trx'] !== null): ?>
          <div><dt><?= e(t('a_swd_sm_id')) ?></dt><dd class="mono"><?= e($view['sm_id'] ?? '—') ?></dd></div>
          <div><dt>Trx</dt><dd class="mono"><?= e($view['sm_trx'] ?? '—') ?></dd></div>
          <div><dt><?= e(t('a_swd_sm_amounts')) ?></dt><dd><?= e(t('a_swd_sm_amounts_val', ['amount' => trim_num($view['sm_amount'] ?? '0'), 'charge' => trim_num($view['sm_charge'] ?? '0'), 'final' => trim_num($view['sm_final_amount'] ?? '0'), 'cur' => $view['sm_currency'] ?? $view['currency']])) ?></dd></div>
          <div><dt><?= e(t('a_swd_sm_status')) ?></dt><dd><span class="mono"><?= e($view['sm_status'] ?? '—') ?></span> <span class="muted small"><?= e(t('a_swd_sm_status_note')) ?></span></dd></div>
        <?php endif; ?>
        <?php if ($view['message'] && !in_array($view['status'], ['failed', 'otp_expired'], true)): ?><div><dt><?= e(t('note')) ?></dt><dd><?= e($view['message']) ?></dd></div><?php endif; ?>
        <div><dt><?= e(t('date')) ?></dt><dd><?= e(fmt_date($view['created_at'])) ?> · <?= e($view['admin_name'] ?? '—') ?></dd></div>
      </dl>

      <?php if ($view['status'] === 'otp_pending'): ?>
        <form method="post" class="mt-3" data-paywait="<?= e(t('a_swd_verifying')) ?>">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="verify_otp">
          <input type="hidden" name="id" value="<?= (int) $view['id'] ?>">
          <div class="form-group">
            <label for="otp"><?= e(t('a_swd_otp_label', ['method' => $view['otp_method']])) ?></label>
            <input class="input mono" id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" required autofocus>
            <div class="help"><?= e(t('a_swd_otp_help', ['time' => $view['otp_expires_at'] ? fmt_date(date('Y-m-d H:i:s', (int) strtotime((string) $view['otp_expires_at']))) : '—'])) ?></div>
          </div>
          <button class="btn btn-primary" type="submit"><?= icon('lock', 16) ?> <?= e(t('a_swd_otp_verify')) ?></button>
        </form>
        <form method="post" class="mt-2" data-confirm="<?= e(t('a_swd_cancel_confirm')) ?>">
          <?= csrf_field() ?>
          <input type="hidden" name="action" value="cancel">
          <input type="hidden" name="id" value="<?= (int) $view['id'] ?>">
          <button class="btn btn-ghost btn-sm" type="submit"><?= icon('x', 14) ?> <?= e(t('a_swd_cancel')) ?></button>
        </form>
      <?php endif; ?>

      <?php if (sovamoney_withdraw_reconcilable($view)): ?>
        <div class="btn-group mt-3">
          <form method="post" data-confirm="<?= e(t('a_swd_reconcile_found_confirm')) ?>"><?= csrf_field() ?><input type="hidden" name="action" value="reconcile_found"><input type="hidden" name="id" value="<?= (int) $view['id'] ?>"><button class="btn btn-outline btn-sm" type="submit"><?= icon('check', 14) ?> <?= e(t('a_swd_reconcile_found')) ?></button></form>
          <form method="post" data-confirm="<?= e(t('a_swd_reconcile_missing_confirm')) ?>"><?= csrf_field() ?><input type="hidden" name="action" value="reconcile_missing"><input type="hidden" name="id" value="<?= (int) $view['id'] ?>"><button class="btn btn-outline btn-sm" type="submit"><?= icon('x', 14) ?> <?= e(t('a_swd_reconcile_missing')) ?></button></form>
        </div>
      <?php endif; ?>

      <?php if ($view['response']): ?>
        <details class="mt-3"><summary class="small muted"><?= e(t('a_swd_raw')) ?></summary><pre class="small mono" style="white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto;background:rgba(127,127,127,.08);padding:10px;border-radius:8px"><?= e($view['response']) ?></pre></details>
      <?php endif; ?>
    </div>
  </div>

<?php elseif ($preview): ?>
  <?php $pm = $preview['method']; ?>
  <form method="post" class="card" data-paywait="<?= e(t('a_swd_sending')) ?>">
    <?= csrf_field() ?>
    <input type="hidden" name="action" value="submit">
    <input type="hidden" name="nonce" value="<?= e($preview['nonce']) ?>">
    <div class="card-head"><h3><?= icon('check-circle', 18) ?> <?= e(t('a_swd_confirm_title')) ?></h3></div>
    <div class="card-body">
      <dl class="kv">
        <div><dt><?= e(t('a_swd_destination')) ?></dt><dd><strong><?= e($pm['method_name']) ?></strong><?= $pm['destination'] ? ' — ' . e($pm['destination']) : '' ?></dd></div>
        <div><dt><?= e(t('amount')) ?></dt><dd><?= e(money($preview['amount'], $pm['currency'])) ?></dd></div>
        <div><dt><?= e(t('a_swd_est_charge')) ?></dt><dd><?= e(money($preview['quote']['charge'], $pm['currency'])) ?> <span class="muted small">(<?= e(trim_num((string) $pm['fixed_charge'])) ?> + <?= e(trim_num((string) $pm['percent_charge'])) ?>%)</span></dd></div>
        <div><dt><?= e(t('a_swd_est_final')) ?></dt><dd class="big"><?= e(money($preview['quote']['final'], $pm['currency'])) ?></dd></div>
        <?php if ($preview['otp_method']): ?><div><dt>OTP</dt><dd><?= e(t('a_swd_otp_will_send', ['method' => $preview['otp_method']])) ?></dd></div><?php endif; ?>
      </dl>
      <p class="help"><?= e(t('a_swd_estimate_note')) ?></p>
      <?php if ($blocking): ?>
        <div class="alert alert-error"><?= icon('alert') ?><span><?= e(t('a_swd_err_blocked')) ?> <a href="<?= e(url($self . '?id=' . $blocking['id'])) ?>">#<?= (int) $blocking['id'] ?></a></span></div>
      <?php else: ?>
        <button class="btn btn-primary btn-lg" type="submit"><?= icon('download', 18) ?> <?= e(t('a_swd_confirm_btn')) ?></button>
      <?php endif; ?>
    </div>
  </form>

<?php else: ?>
  <?php if ($blocking): ?>
    <div class="alert alert-error"><?= icon('alert') ?><span><?= e(t('a_swd_err_blocked')) ?> <a href="<?= e(url($self . '?id=' . $blocking['id'])) ?>">#<?= (int) $blocking['id'] ?></a></span></div>
  <?php endif; ?>
  <?php if (!$list['ok']): ?>
    <div class="card"><div class="card-body">
      <div class="alert alert-error"><?= icon('alert') ?><span><?= e(t('a_swd_err_methods', ['msg' => $list['message']])) ?></span></div>
      <pre class="small mono" style="white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;background:rgba(127,127,127,.08);padding:10px;border-radius:8px">POST <?= e($list['debug']['url']) ?>

HTTP <?= (int) $list['debug']['http'] ?>

<?= e($list['debug']['body'] !== '' ? $list['debug']['body'] : '(empty reply)') ?></pre>
      <a class="btn btn-outline btn-sm" href="<?= e(url($self)) ?>"><?= icon('refresh', 15) ?> <?= e(t('a_swd_retry_load')) ?></a>
    </div></div>
  <?php elseif (!$list['methods']): ?>
    <div class="alert alert-info"><?= icon('info') ?><span><?= e(t('a_swd_no_methods')) ?></span></div>
  <?php else: ?>
    <form method="post" class="card" data-swd-form>
      <?= csrf_field() ?>
      <input type="hidden" name="action" value="preview">
      <div class="card-head"><h3><?= icon('download', 18) ?> <?= e(t('a_swd_new')) ?></h3></div>
      <div class="card-body">
        <div class="form-group">
          <label><?= e(t('a_swd_destination')) ?></label>
          <?php foreach ($list['methods'] as $m): ?>
          <label class="check" style="align-items:flex-start;margin-bottom:8px">
            <input type="radio" name="user_method_id" value="<?= (int) $m['user_method_id'] ?>" required
              data-fixed="<?= e((string) $m['fixed_charge']) ?>" data-pct="<?= e((string) $m['percent_charge']) ?>" data-rate="<?= e((string) $m['rate']) ?>"
              data-min="<?= e((string) $m['min']) ?>" data-max="<?= e((string) $m['max']) ?>" data-cur="<?= e($m['currency']) ?>"
              <?= count($list['methods']) === 1 ? 'checked' : '' ?>>
            <span><strong><?= e($m['method_name']) ?></strong><?= $m['destination'] ? ' — ' . e($m['destination']) : '' ?><br>
              <span class="small muted"><?= e(t('a_swd_method_line', ['min' => fmt_amount($m['min']), 'max' => $m['max'] > 0 ? fmt_amount($m['max']) : '∞', 'cur' => $m['currency'], 'fixed' => trim_num((string) $m['fixed_charge']), 'pct' => trim_num((string) $m['percent_charge'])])) ?></span></span>
          </label>
          <?php endforeach; ?>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="swd-amount"><?= e(t('amount')) ?></label>
            <input class="input" id="swd-amount" name="amount" inputmode="decimal" required autocomplete="off">
          </div>
          <?php if ($list['otp_required']): ?>
          <div class="form-group">
            <label for="swd-otp"><?= e(t('a_swd_otp_method')) ?></label>
            <select class="input" id="swd-otp" name="otp_method" required>
              <?php foreach ($list['otp_methods'] as $om): ?><option value="<?= e($om) ?>"><?= e($om) ?></option><?php endforeach; ?>
            </select>
            <div class="help"><?= e(t('a_swd_otp_required')) ?></div>
          </div>
          <?php endif; ?>
        </div>
        <div class="help" data-swd-estimate aria-live="polite"></div>
        <button class="btn btn-primary mt-2" type="submit"><?= icon('arrow-right', 16) ?> <?= e(t('a_swd_review')) ?></button>
      </div>
    </form>
    <script type="application/json" id="swd-i18n"><?= json_encode(['est' => t('a_swd_js_estimate'), 'limits' => t('a_swd_js_limits')], JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?></script>
  <?php endif; ?>
<?php endif; ?>

<div class="card mt-3">
  <div class="card-head"><h3><?= icon('list', 18) ?> <?= e(t('a_swd_history')) ?></h3></div>
  <?php if (!$history): ?>
    <div class="card-body"><p class="muted mb-0"><?= e(t('a_swd_history_empty')) ?></p></div>
  <?php else: ?>
  <div class="table-wrap">
    <table class="table">
      <thead><tr><th>#</th><th><?= e(t('date')) ?></th><th><?= e(t('a_swd_destination')) ?></th><th class="num"><?= e(t('amount')) ?></th><th>Trx</th><th><?= e(t('status')) ?></th></tr></thead>
      <tbody>
      <?php foreach ($history as $h): ?>
        <tr>
          <td><a href="<?= e(url($self . '?id=' . $h['id'])) ?>">#<?= (int) $h['id'] ?></a></td>
          <td class="small"><?= e(fmt_date($h['created_at'])) ?></td>
          <td><?= e($h['method_name']) ?><?= $h['destination'] ? ' — ' . e($h['destination']) : '' ?></td>
          <td class="num"><?= e(money($h['amount'], (string) $h['currency'])) ?></td>
          <td class="mono small"><?= e($h['sm_trx'] ?? $h['transaction_no'] ?? '—') ?></td>
          <td><?= $badge($h['status']) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
</div>
<?php require APP_PATH . '/views/admin_footer.php'; ?>
