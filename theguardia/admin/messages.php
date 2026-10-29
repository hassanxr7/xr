<?php
require __DIR__ . '/_init.php';

require_role('editor');

if (is_post()) {
    csrf_check();
    $id = (int) input('id');
    input('do') === 'delete' ? q('DELETE FROM contact_messages WHERE id = ?', [$id]) : q('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [$id]);
    redirect('admin/messages.php');
}
$list = rows('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 200');
admin_header(__('Messages'));
?>
<div class="page-head"><h1><?= __('Messages from readers') ?></h1></div>
<?php foreach ($list as $m): ?>
  <section class="card msg-card<?= $m['is_read'] ? '' : ' unread' ?>">
    <div class="card-head"><div><strong><?= e($m['subject'] ?: __('Message')) ?></strong> · <?= e($m['name']) ?> &lt;<a href="mailto:<?= e($m['email']) ?>?subject=<?= e(rawurlencode('Re: ' . $m['subject'])) ?>"><?= e($m['email']) ?></a>&gt;
      <div class="muted small"><?= e(fmt_date($m['created_at'], 'M j, Y H:i')) ?></div></div>
      <form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="id" value="<?= (int) $m['id'] ?>">
        <?php if (!$m['is_read']): ?><button class="a-btn a-btn-sm" name="do" value="read"><?= __('Mark read') ?></button><?php endif; ?>
        <button class="a-btn a-btn-sm a-btn-danger js-confirm" name="do" value="delete" data-confirm="<?= e(__('Delete this message?')) ?>"><?= __('Delete') ?></button></form></div>
    <p><?= nl2br(e($m['message'])) ?></p>
  </section>
<?php endforeach; ?>
<?php if (!$list): ?><p class="muted"><?= __('No messages yet.') ?></p><?php endif; ?>
<?php admin_footer(); ?>
