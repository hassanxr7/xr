<?php
require __DIR__ . '/_init.php';

require_role('admin');

if (is_post()) {
    csrf_check();
    $do = (string) input('do');
    if ($do === 'adsense') {
        $client = trim((string) input('adsense_client'));
        if ($client !== '' && !preg_match('~^(ca-)?pub-\d{10,20}$~', $client)) {
            flash('error', __('The publisher ID looks like pub-1234567890123456.'));
            redirect('admin/ads.php');
        }
        save_setting('adsense_client', $client);
        save_setting('ads_enabled', input('ads_enabled') === '1' ? '1' : '0');
        save_setting('in_article_after', (string) max(2, min(12, (int) input('in_article_after', 3))));
        save_setting('ads_txt_extra', trim((string) input('ads_txt_extra')));
        // One-click setup: an AdSense unit in every position that has none yet.
        if (input('quick') === '1' && $client !== '') {
            foreach (AD_POSITIONS as $pos => $label) {
                $slot = trim((string) ($_POST['slot'][$pos] ?? ''));
                if ($slot !== '') {
                    q('DELETE FROM ads WHERE position = ? AND type = ?', [$pos, 'adsense']);
                    insert('ads', ['name' => 'AdSense – ' . $label, 'position' => $pos, 'type' => 'adsense', 'adsense_slot' => $slot,
                        'adsense_format' => in_array($pos, ['in_article', 'in_article_2'], true) ? 'in-article' : 'auto', 'active' => 1, 'created_at' => now()]);
                }
            }
        }
        flash('success', __('Advertising settings saved.'));
    } elseif ($do === 'save') {
        $id = (int) input('id');
        $data = [
            'name' => mb_substr(trim((string) input('name')), 0, 120) ?: 'Ad', 'position' => array_key_exists((string) input('position'), AD_POSITIONS) ? (string) input('position') : 'sidebar',
            'type' => in_array(input('type'), ['adsense', 'image', 'html'], true) ? (string) input('type') : 'image',
            'adsense_slot' => trim((string) input('adsense_slot')) ?: null, 'adsense_format' => (string) input('adsense_format', 'auto'),
            'link_url' => filter_var(trim((string) input('link_url')), FILTER_VALIDATE_URL) ?: null, 'html' => (string) ($_POST['html'] ?? ''),
            'advertiser' => trim((string) input('advertiser')) ?: null, 'starts_at' => input('starts_at') ? date('Y-m-d H:i:s', strtotime((string) input('starts_at'))) : null,
            'ends_at' => input('ends_at') ? date('Y-m-d H:i:s', strtotime((string) input('ends_at'))) : null, 'weight' => max(1, (int) input('weight', 1)),
            'active' => (int) (input('active') === '1'),
        ];
        if (!empty($_FILES['image']['name'])) {
            try {
                $m = media(media_save_upload($_FILES['image'], ['alt' => $data['advertiser'] ?? $data['name']]));
                $data['image'] = $m['file'] . '.' . $m['ext'];
            } catch (Throwable $e) {
                flash('error', $e->getMessage());
            }
        }
        $id ? update('ads', $data, 'id = ?', [$id]) : insert('ads', $data + ['created_at' => now()]);
        flash('success', __('Ad saved.'));
    } elseif ($do === 'delete') {
        q('DELETE FROM ads WHERE id = ?', [(int) input('id')]);
        flash('success', __('Ad deleted.'));
    }
    content_changed();
    redirect('admin/ads.php');
}

$ads = rows('SELECT * FROM ads ORDER BY position, id');
$edit = (int) input('edit') ? row('SELECT * FROM ads WHERE id = ?', [(int) input('edit')]) : (isset($_GET['new']) ? [] : null);
$slots = [];
foreach ($ads as $a) {
    if ($a['type'] === 'adsense') {
        $slots[$a['position']] = $a['adsense_slot'];
    }
}
admin_header(__('Advertising'));
?>
<div class="page-head"><h1><?= __('Advertising') ?></h1><a class="a-btn a-btn-primary" href="?new=1">＋ <?= __('New ad / campaign') ?></a></div>
<div class="grid-2">
  <form method="post" class="card a-form">
    <?= csrf_field() ?><input type="hidden" name="do" value="adsense"><input type="hidden" name="quick" value="1">
    <h2>Google AdSense</h2>
    <ol class="steps small">
      <li><?= __('Sign up at adsense.google.com with your site address and wait for approval (publish 20–30 good original stories first).') ?></li>
      <li><?= __('Copy your publisher ID (pub-…) below. The verification code and ads.txt are added automatically.') ?></li>
      <li><?= __('Turn on Auto ads in AdSense, and/or create “Display” ad units and paste each slot ID into a position below.') ?></li>
      <li><?= __('For visitors from Europe/UK, switch on the AdSense consent message (Privacy & messaging) in your AdSense account.') ?></li>
    </ol>
    <?= field('adsense_client', __('Publisher ID'), setting('adsense_client'), 'text', ['placeholder' => 'pub-1234567890123456']) ?>
    <?= checkbox('ads_enabled', __('Show ads on the website'), setting('ads_enabled', '1') === '1') ?>
    <?= field('in_article_after', __('First in-article ad after paragraph'), setting('in_article_after', '3'), 'number', ['min' => 2, 'max' => 12]) ?>
    <details><summary><?= __('Ad unit slot IDs per position') ?></summary>
      <?php foreach (AD_POSITIONS as $pos => $label): ?><?= field('slot[' . $pos . ']', __($label), $slots[$pos] ?? '', 'text', ['placeholder' => '1234567890']) ?><?php endforeach; ?>
    </details>
    <?= field('ads_txt_extra', __('Extra ads.txt lines (other ad networks)'), setting('ads_txt_extra'), 'textarea', ['rows' => 3]) ?>
    <p class="hint">ads.txt: <a href="<?= e(url('ads.txt')) ?>" target="_blank" rel="noopener"><?= e(abs_url('ads.txt')) ?></a></p>
    <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
  </form>

  <?php if ($edit !== null): ?>
  <form method="post" enctype="multipart/form-data" class="card a-form">
    <?= csrf_field() ?><input type="hidden" name="do" value="save"><input type="hidden" name="id" value="<?= (int) ($edit['id'] ?? 0) ?>">
    <h2><?= $edit ? __('Edit ad') : __('New ad / campaign') ?></h2>
    <?= field('name', __('Name'), $edit['name'] ?? '', 'text', ['required' => true]) ?>
    <?= select_field('position', __('Position'), array_map('__', AD_POSITIONS), $edit['position'] ?? 'sidebar') ?>
    <?= select_field('type', __('Type'), ['image' => __('Banner image (sold directly)'), 'adsense' => __('AdSense unit'), 'html' => __('HTML / ad network code')], $edit['type'] ?? 'image') ?>
    <?= field('advertiser', __('Advertiser'), $edit['advertiser'] ?? '') ?>
    <label class="f"><span><?= __('Banner image (e.g. 728×90, 300×250, 320×50)') ?></span><input type="file" name="image" accept="image/*"><?php if (!empty($edit['image'])): ?><img src="<?= e(url($edit['image'])) ?>" alt="" class="thumb-sm"><?php endif; ?></label>
    <?= field('link_url', __('Click-through link'), $edit['link_url'] ?? '', 'url') ?>
    <?= field('adsense_slot', __('AdSense slot ID'), $edit['adsense_slot'] ?? '') ?>
    <?= select_field('adsense_format', __('AdSense format'), ['auto' => 'Auto / responsive', 'in-article' => 'In-article', 'fluid' => 'In-feed (fluid)', 'rectangle' => 'Rectangle', 'horizontal' => 'Horizontal'], $edit['adsense_format'] ?? 'auto') ?>
    <?= field('html', __('HTML code (other networks)'), $edit['html'] ?? '', 'textarea', ['rows' => 4]) ?>
    <div class="row-3">
      <?= field('starts_at', __('Starts'), !empty($edit['starts_at']) ? date('Y-m-d\TH:i', strtotime($edit['starts_at'])) : '', 'datetime-local') ?>
      <?= field('ends_at', __('Ends'), !empty($edit['ends_at']) ? date('Y-m-d\TH:i', strtotime($edit['ends_at'])) : '', 'datetime-local') ?>
      <?= field('weight', __('Weight (rotation)'), $edit['weight'] ?? '1', 'number', ['min' => 1]) ?>
    </div>
    <?= checkbox('active', __('Active'), (bool) ($edit['active'] ?? 1)) ?>
    <button class="a-btn a-btn-primary"><?= __('Save') ?></button>
    <?php if ($edit): ?><button class="a-btn a-btn-danger js-confirm" name="do" value="delete" data-confirm="<?= e(__('Delete this ad?')) ?>"><?= __('Delete') ?></button><?php endif; ?>
  </form>
  <?php endif; ?>
</div>
<section class="card"><h2><?= __('All ads') ?></h2>
  <div class="table-wrap"><table class="list"><thead><tr><th><?= __('Ad') ?></th><th><?= __('Position') ?></th><th><?= __('Type') ?></th><th class="num"><?= __('Impressions') ?></th><th class="num"><?= __('Clicks') ?></th><th class="num">CTR</th><th><?= __('Active') ?></th></tr></thead><tbody>
  <?php foreach ($ads as $a): ?>
    <tr><td><a class="strong" href="?edit=<?= (int) $a['id'] ?>"><?= e($a['name']) ?></a><?= $a['advertiser'] ? '<div class="muted small">' . e($a['advertiser']) . '</div>' : '' ?></td>
      <td><?= e(__(AD_POSITIONS[$a['position']] ?? $a['position'])) ?></td><td><?= e($a['type']) ?></td>
      <td class="num"><?= $a['type'] === 'adsense' ? '—' : fmt_num($a['impressions']) ?></td><td class="num"><?= $a['type'] === 'adsense' ? '—' : fmt_num($a['clicks']) ?></td>
      <td class="num"><?= $a['type'] !== 'adsense' && $a['impressions'] ? round($a['clicks'] / $a['impressions'] * 100, 2) . '%' : '—' ?></td><td><?= $a['active'] ? '✔' : '' ?></td></tr>
  <?php endforeach; ?>
  <?php if (!$ads): ?><tr><td colspan="7" class="muted"><?= __('No ads yet.') ?></td></tr><?php endif; ?>
  </tbody></table></div>
  <p class="hint"><?= __('AdSense earnings and impressions are shown in your AdSense account.') ?></p>
</section>
<?php admin_footer(); ?>
