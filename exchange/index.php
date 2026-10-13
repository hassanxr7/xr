<?php
require __DIR__ . '/app/bootstrap.php';

$pairs = active_pairs();
$jsPairs = pairs_for_js($pairs);

// Gateways that can be received (for the reserves section)
$reserves = rows('SELECT DISTINCT g.* FROM gateways g JOIN pairs p ON p.to_gateway_id = g.id AND p.is_active = 1 WHERE g.is_active = 1 ORDER BY g.sort_order, g.id');
$completedCount = (int) val("SELECT COUNT(*) FROM orders WHERE status = 'completed'");

require APP_PATH . '/views/header.php';
?>
<section class="hero">
  <div class="container hero-grid">
    <div class="hero-copy">
      <span class="eyebrow"><?= icon('bolt', 14) ?> <?= e(t('hero_eyebrow')) ?></span>
      <h1><?= e(t('hero_title')) ?></h1>
      <p class="lead"><?= e(t('hero_lead')) ?></p>
      <div class="hero-chips">
        <?php
        $seen = [];
        foreach ($pairs as $p) {
            if (isset($seen[$p['to_gateway_id']])) {
                continue;
            }
            $seen[$p['to_gateway_id']] = true;
            echo '<span class="chip">' . gw_badge($p['from_name'], $p['from_color'], $p['from_logo'], 'xs') . ' ' . e($p['from_name'])
                . ' ' . icon('arrow-right', 14) . ' ' . gw_badge($p['to_name'], $p['to_color'], $p['to_logo'], 'xs') . ' ' . e($p['to_name']) . '</span>';
        }
        ?>
      </div>
      <div class="hero-stats">
        <div><strong><?= icon('bolt', 16) ?> 5–30 min</strong><span><?= e(t('stat_speed')) ?></span></div>
        <div><strong><?= icon('shield', 16) ?> 100%</strong><span><?= e(t('stat_secure')) ?></span></div>
        <div><strong><?= icon('check-circle', 16) ?> <?= number_format($completedCount) ?>+</strong><span><?= e(t('stat_completed')) ?></span></div>
      </div>
    </div>

    <div class="calc card" id="exchange">
      <?php if (!$pairs): ?>
        <div class="empty"><?= icon('info', 28) ?><p><?= e(t('no_pairs')) ?></p></div>
      <?php else: ?>
      <form method="get" action="<?= e(url('exchange.php')) ?>" id="calc-form" data-calc>
        <h2 class="calc-title"><?= icon('swap', 20) ?> <?= e(t('calc_title')) ?></h2>
        <input type="hidden" name="pair" data-pair-id>

        <div class="calc-box">
          <label class="calc-label"><?= e(t('you_send')) ?></label>
          <div class="calc-row">
            <input class="calc-amount" type="text" inputmode="decimal" name="amount" data-send value="100" autocomplete="off" aria-label="<?= e(t('you_send')) ?>">
            <div class="gw-select">
              <span data-from-badge></span>
              <select data-from aria-label="<?= e(t('you_send')) ?>"></select>
            </div>
          </div>
        </div>

        <div class="calc-mid">
          <button type="button" class="swap-btn" data-swap title="<?= e(t('swap')) ?>"><?= icon('swap', 18) ?></button>
          <span class="calc-rate" data-rate-line></span>
        </div>

        <div class="calc-box">
          <label class="calc-label"><?= e(t('you_receive')) ?></label>
          <div class="calc-row">
            <input class="calc-amount" type="text" inputmode="decimal" data-receive autocomplete="off" aria-label="<?= e(t('you_receive')) ?>">
            <div class="gw-select">
              <span data-to-badge></span>
              <select data-to aria-label="<?= e(t('you_receive')) ?>"></select>
            </div>
          </div>
        </div>

        <dl class="calc-meta">
          <div><dt><?= e(t('fee')) ?></dt><dd data-fee>—</dd></div>
          <div><dt><?= e(t('limits')) ?></dt><dd data-limits>—</dd></div>
          <div><dt><?= e(t('reserve')) ?></dt><dd data-reserve>—</dd></div>
        </dl>
        <div class="calc-error" data-error hidden></div>
        <button type="submit" class="btn btn-primary btn-lg btn-block" data-submit><?= e(t('exchange_now')) ?> <?= icon('arrow-right', 18) ?></button>
      </form>
      <?php endif; ?>
    </div>
  </div>
</section>

<section class="section" id="rates">
  <div class="container">
    <div class="section-head">
      <h2><?= e(t('rates_title')) ?></h2>
      <p><?= e(t('rates_sub')) ?></p>
    </div>
    <div class="rate-grid">
      <?php foreach ($pairs as $p): ?>
      <a class="rate-card card" href="<?= e(url('exchange.php?pair=' . $p['id'])) ?>">
        <div class="rate-pair">
          <?= gw_badge($p['from_name'], $p['from_color'], $p['from_logo']) ?>
          <span class="rate-arrow"><?= icon('arrow-right', 16) ?></span>
          <?= gw_badge($p['to_name'], $p['to_color'], $p['to_logo']) ?>
        </div>
        <div class="rate-names"><?= e($p['from_name']) ?> <span>→</span> <?= e($p['to_name']) ?></div>
        <div class="rate-value">1 <?= e($p['from_currency']) ?> = <?= e(fmt_amount($p['rate'], 4)) ?> <?= e($p['to_currency']) ?></div>
        <ul class="rate-facts">
          <li><span><?= e(t('fee')) ?></span><b><?= e(rtrim(rtrim(number_format((float) $p['fee_percent'], 2), '0'), '.')) ?>%<?= (float) $p['fee_fixed'] > 0 ? ' + ' . e(money($p['fee_fixed'], $p['from_currency'], (int) $p['from_decimals'])) : '' ?></b></li>
          <li><span><?= e(t('min')) ?></span><b><?= e(money($p['min_amount'], $p['from_currency'], (int) $p['from_decimals'])) ?></b></li>
          <li><span><?= e(t('max')) ?></span><b><?= e(money($p['max_amount'], $p['from_currency'], (int) $p['from_decimals'])) ?></b></li>
        </ul>
        <span class="rate-cta"><?= e(t('exchange_now')) ?> <?= icon('arrow-right', 14) ?></span>
      </a>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<?php if ($reserves): ?>
<section class="section section-alt">
  <div class="container">
    <div class="section-head">
      <h2><?= e(t('reserves_title')) ?></h2>
      <p><?= e(t('reserves_sub')) ?></p>
    </div>
    <div class="reserve-grid">
      <?php foreach ($reserves as $g): ?>
      <div class="reserve card">
        <?= gw_badge($g['name'], $g['color'], $g['logo'], 'lg') ?>
        <div>
          <span class="reserve-name"><?= e($g['name']) ?></span>
          <strong class="reserve-amt"><?= e(money($g['reserve'], $g['currency'], (int) $g['decimals'])) ?></strong>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<section class="section">
  <div class="container">
    <div class="section-head">
      <h2><?= e(t('how_title')) ?></h2>
      <p><?= e(t('how_sub')) ?></p>
    </div>
    <div class="steps">
      <div class="step card"><span class="step-no">1</span><h3><?= e(t('how_1_t')) ?></h3><p><?= e(t('how_1_d')) ?></p></div>
      <div class="step card"><span class="step-no">2</span><h3><?= e(t('how_2_t')) ?></h3><p><?= e(t('how_2_d')) ?></p></div>
      <div class="step card"><span class="step-no">3</span><h3><?= e(t('how_3_t')) ?></h3><p><?= e(t('how_3_d')) ?></p></div>
      <div class="step card"><span class="step-no">4</span><h3><?= e(t('how_4_t')) ?></h3><p><?= e(t('how_4_d')) ?></p></div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="container features">
    <div class="feature"><span class="feature-ic"><?= icon('bolt', 22) ?></span><h3><?= e(t('feat_fast_t')) ?></h3><p><?= e(t('feat_fast_d')) ?></p></div>
    <div class="feature"><span class="feature-ic"><?= icon('shield', 22) ?></span><h3><?= e(t('feat_safe_t')) ?></h3><p><?= e(t('feat_safe_d')) ?></p></div>
    <div class="feature"><span class="feature-ic"><?= icon('print', 22) ?></span><h3><?= e(t('feat_stmt_t')) ?></h3><p><?= e(t('feat_stmt_d')) ?></p></div>
    <div class="feature"><span class="feature-ic"><?= icon('headset', 22) ?></span><h3><?= e(t('feat_support_t')) ?></h3><p><?= e(t('feat_support_d')) ?></p></div>
  </div>
</section>

<script>
window.XR = {
  pairs: <?= json_encode($jsPairs, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>,
  i18n: <?= json_encode([
      'min'      => t('js_min'),
      'max'      => t('js_max'),
      'reserve'  => t('js_reserve'),
      'invalid'  => t('js_invalid'),
  ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>
};
</script>
<?php require APP_PATH . '/views/footer.php'; ?>
