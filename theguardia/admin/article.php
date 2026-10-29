<?php
require __DIR__ . '/_init.php';

$u = require_role('writer');
$id = (int) input('id');
$a = $id ? article($id) : null;
if ($id && !$a) {
    flash('error', __('Story not found.'));
    redirect('admin/articles.php');
}
if ($a && !can('editor') && (int) $a['author_id'] !== (int) $u['id']) {
    http_response_code(403);
    exit(__('You can only edit your own stories.'));
}
if ($a && !can('editor') && $a['status'] === 'published') {
    flash('error', __('This story is published. Ask an editor to change it.'));
    redirect('admin/articles.php');
}

if (is_post()) {
    csrf_check();
    $action = (string) input('do', 'draft');
    if (in_array($action, ['publish', 'schedule'], true) && !can('editor')) {
        $action = 'pending';
    }
    if ($action === 'delete' && $a && can('editor')) {
        q('DELETE FROM articles WHERE id = ?', [$a['id']]);
        content_changed();
        audit('delete story', $a['title']);
        flash('success', __('Story deleted.'));
        redirect('admin/articles.php');
    }
    $title = trim((string) input('title'));
    if ($title === '') {
        flash('error', __('A headline is required.'));
        $_SESSION['draft_form'] = $_POST;
        redirect('admin/article.php' . ($id ? '?id=' . $id : ''));
    }
    $when = trim((string) input('published_at'));
    $publishedAt = $when !== '' ? date('Y-m-d H:i:s', strtotime($when)) : ($a['published_at'] ?? null);
    $status = ['draft' => 'draft', 'pending' => 'pending', 'publish' => 'published', 'schedule' => 'scheduled'][$action] ?? 'draft';
    if ($status === 'published') {
        if (!$publishedAt || ($a && $a['status'] !== 'published' && $when === '')) {
            $publishedAt = now();
        }
        if ($publishedAt > now()) {
            $status = 'scheduled';
        }
    }
    if ($status === 'scheduled' && (!$publishedAt || $publishedAt <= now())) {
        $status = 'published';
        $publishedAt = $publishedAt ?: now();
    }
    $imageId = (int) input('image_id') ?: null;
    if (!empty($_FILES['image_file']['name'])) {
        try {
            $imageId = media_save_upload($_FILES['image_file'], ['alt' => input('image_alt'), 'caption' => input('image_caption'), 'credit' => input('image_credit')]);
        } catch (Throwable $e) {
            flash('error', $e->getMessage());
        }
    } elseif ($imageId) {
        update('media', ['alt' => mb_substr((string) input('image_alt'), 0, 250), 'caption' => mb_substr((string) input('image_caption'), 0, 500), 'credit' => mb_substr((string) input('image_credit'), 0, 120)], 'id = ?', [$imageId]);
    }
    $slug = slugify((string) input('slug')) ?: slugify($title);
    $data = [
        'title' => mb_substr($title, 0, 250),
        'slug' => unique_slug('articles', $slug, $id),
        'standfirst' => mb_substr(trim((string) input('standfirst')), 0, 600),
        'body' => (string) ($_POST['body'] ?? ''),
        'image_id' => $imageId,
        'category_id' => (int) input('category_id') ?: null,
        'byline' => trim((string) input('byline')) ?: null,
        'status' => $status,
        'published_at' => $publishedAt,
        'is_breaking' => (int) (input('is_breaking') === '1'),
        'is_featured' => (int) (input('is_featured') === '1'),
        'location' => trim((string) input('location')) ?: null,
        'lang' => input('lang') === 'so' ? 'so' : 'en',
        'seo_title' => mb_substr(trim((string) input('seo_title')), 0, 120) ?: null,
        'seo_description' => mb_substr(trim((string) input('seo_description')), 0, 320) ?: null,
        'focus_keyword' => mb_substr(trim((string) input('focus_keyword')), 0, 120) ?: null,
        'canonical_url' => filter_var(trim((string) input('canonical_url')), FILTER_VALIDATE_URL) ?: null,
        'noindex' => (int) (input('noindex') === '1'),
        'tags' => array_filter(array_map('trim', explode(',', (string) input('tags')))),
    ];
    if (!$a) {
        $data['author_id'] = (int) input('author_id') && can('editor') ? (int) input('author_id') : $u['id'];
    } elseif (can('editor') && (int) input('author_id')) {
        $data['author_id'] = (int) input('author_id');
    }
    if (!can('editor')) {
        unset($data['is_featured'], $data['is_breaking']);
    }
    $wasPublished = $a && $a['status'] === 'published';
    $newId = save_article($data, $id);
    audit($id ? 'edit story' : 'new story', $title);
    $saved = article($newId);
    if ($status === 'published') {
        after_publish($newId);
        if (input('send_push') === '1' && can('editor') && !$saved['push_sent']) {
            $mid = push_article($saved);
            push_process($mid, 8);
            flash('success', __('Push alert is being sent to subscribers.'));
        }
    }
    $msg = ['published' => $wasPublished ? __('Story updated.') : __('Story published.'), 'scheduled' => __('Story scheduled for {t}.', ['t' => fmt_date($publishedAt, 'M j, H:i')]),
        'pending' => __('Sent to an editor for review.'), 'draft' => __('Draft saved.')][$status];
    flash('success', $msg);
    unset($_SESSION['draft_form']);
    redirect('admin/article.php?id=' . $newId);
}

$form = $_SESSION['draft_form'] ?? null;
unset($_SESSION['draft_form']);
$v = $form ?: ($a ?: []);
$val = fn ($k, $d = '') => (string) ($v[$k] ?? $d);
$tags = $a ? implode(', ', array_column(article_tags((int) $a['id']), 'name')) : '';
if ($form) {
    $tags = (string) ($form['tags'] ?? '');
}
$m = media(isset($v['image_id']) ? (int) $v['image_id'] : null);
$authors = rows("SELECT id, name FROM users WHERE status = 'active' ORDER BY name");
$isNew = !$a;

admin_header($isNew ? __('Write a story') : __('Edit story'), $isNew ? 'article.php' : 'articles.php');
?>
<form method="post" enctype="multipart/form-data" class="editor-form" id="editor-form" data-site="<?= e(abs_url('')) ?>">
  <?= csrf_field() ?>
  <input type="hidden" name="id" value="<?= (int) ($a['id'] ?? 0) ?>">
  <div class="page-head">
    <h1><?= $isNew ? __('Write a story') : __('Edit story') ?></h1>
    <?php if ($a): ?><div><?= status_badge($a['status']) ?> <a href="<?= e(article_url($a)) ?><?= $a['status'] !== 'published' ? '?preview=1' : '' ?>" target="_blank" rel="noopener"><?= $a['status'] === 'published' ? __('View on site') : __('Preview') ?> ↗</a></div><?php endif; ?>
  </div>

  <div class="editor-grid">
    <div class="editor-main">

      <details class="card ai-panel"<?= $isNew ? ' open' : '' ?>>
        <summary><span class="ai-badge">AI</span> <?= __('Writing assistant — turn your notes into a full SEO story') ?></summary>
        <?php if (!ai_enabled()): ?>
          <p class="hint"><?= __('Add your Anthropic API key in Settings → AI assistant to use this.') ?></p>
        <?php endif; ?>
        <label class="f"><span><?= __('Your notes: all the facts (who, what, when, where, why, quotes, numbers, sources)') ?></span>
          <textarea id="ai-notes" rows="8" placeholder="<?= e(__('Paste or type everything you know. The assistant only uses these facts — it will not invent anything.')) ?>"></textarea></label>
        <div class="row-4">
          <?= select_field('ai_type', __('Type'), ['news' => __('News report'), 'court' => __('Court / justice report'), 'analysis' => __('Analysis'), 'explainer' => __('Explainer'), 'opinion' => __('Opinion')], 'news') ?>
          <?= select_field('ai_length', __('Length'), ['short' => __('Short (300 words)'), 'medium' => __('Medium (550 words)'), 'long' => __('Long (1,000 words)')], 'medium') ?>
          <?= select_field('ai_lang', __('Language'), ['en' => 'English', 'so' => 'Soomaali'], 'en') ?>
          <?= field('ai_source', __('Source (optional)'), '', 'text', ['placeholder' => __('e.g. Ontario Court of Justice')]) ?>
        </div>
        <div class="btn-row">
          <button type="button" class="a-btn a-btn-primary js-ai-write"<?= ai_enabled() ? '' : ' disabled' ?>>✦ <?= __('Write the story') ?></button>
          <button type="button" class="a-btn js-ai-seo"<?= ai_enabled() ? '' : ' disabled' ?>><?= __('Only improve SEO of my text') ?></button>
          <span class="ai-status" aria-live="polite"></span>
        </div>
        <div class="ai-result" hidden>
          <div class="ai-verify" hidden><strong><?= __('Check before publishing:') ?></strong><ul></ul></div>
          <div class="ai-alts" hidden><strong><?= __('Other headline ideas (click to use):') ?></strong><ul></ul></div>
        </div>
      </details>

      <div class="card">
        <label class="f"><span><?= __('Headline') ?></span><input name="title" id="f-title" value="<?= e($val('title')) ?>" required maxlength="250" class="input-xl" placeholder="<?= e(__('Clear, specific headline')) ?>"></label>
        <label class="f"><span><?= __('Summary under the headline (standfirst)') ?></span><textarea name="standfirst" id="f-standfirst" rows="2" maxlength="600"><?= e($val('standfirst')) ?></textarea></label>

        <div class="rte">
          <div class="rte-bar" role="toolbar" aria-label="<?= e(__('Formatting')) ?>">
            <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
            <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
            <button type="button" data-block="h2" title="<?= e(__('Heading')) ?>">H2</button>
            <button type="button" data-block="h3" title="<?= e(__('Subheading')) ?>">H3</button>
            <button type="button" data-block="p" title="<?= e(__('Paragraph')) ?>">¶</button>
            <button type="button" data-block="blockquote" title="<?= e(__('Quote')) ?>">❝</button>
            <button type="button" data-cmd="insertUnorderedList" title="<?= e(__('List')) ?>">•</button>
            <button type="button" data-cmd="insertOrderedList" title="<?= e(__('Numbered list')) ?>">1.</button>
            <button type="button" data-act="link" title="<?= e(__('Link')) ?>">🔗</button>
            <button type="button" data-cmd="unlink" title="<?= e(__('Remove link')) ?>">⛓</button>
            <button type="button" data-act="image" title="<?= e(__('Insert image')) ?>">🖼</button>
            <button type="button" data-act="video" title="<?= e(__('YouTube video')) ?>">▶</button>
            <button type="button" data-act="keypoints" title="<?= e(__('Key points box')) ?>">☰</button>
            <button type="button" data-cmd="removeFormat" title="<?= e(__('Clear formatting')) ?>">⌫</button>
            <button type="button" data-act="source" title="HTML">&lt;/&gt;</button>
          </div>
          <div class="rte-area article-preview" contenteditable="true" id="rte" data-placeholder="<?= e(__('Write the story here…')) ?>"></div>
          <textarea name="body" id="f-body" rows="18" class="rte-source"><?= e($val('body')) ?></textarea>
        </div>
        <div class="rte-foot"><span id="wordcount">0</span> <?= __('words') ?> · <span id="readtime">1</span> <?= __('min read') ?></div>
      </div>

      <div class="card seo-card">
        <h2><?= __('Search engines & sharing (SEO)') ?> <span class="seo-score" id="seo-score">–</span></h2>
        <div class="serp" aria-label="<?= e(__('Google preview')) ?>">
          <div class="serp-url"><?= e(parse_url(site_origin(), PHP_URL_HOST)) ?> › <span id="serp-path"></span></div>
          <div class="serp-title" id="serp-title"></div>
          <div class="serp-desc" id="serp-desc"></div>
        </div>
        <?= field('focus_keyword', __('Focus keyword (what people search for)'), $val('focus_keyword'), 'text', ['id' => 'f-kw', 'maxlength' => 120]) ?>
        <label class="f"><span><?= __('SEO title') ?> <small class="count" data-for="f-seo-title" data-max="60"></small></span><input name="seo_title" id="f-seo-title" value="<?= e($val('seo_title')) ?>" maxlength="120" placeholder="<?= e(__('Defaults to the headline')) ?>"></label>
        <label class="f"><span><?= __('Meta description') ?> <small class="count" data-for="f-seo-desc" data-max="155"></small></span><textarea name="seo_description" id="f-seo-desc" rows="2" maxlength="320" placeholder="<?= e(__('Defaults to the summary')) ?>"><?= e($val('seo_description')) ?></textarea></label>
        <label class="f"><span><?= __('URL slug') ?></span><input name="slug" id="f-slug" value="<?= e($val('slug')) ?>" maxlength="100" placeholder="<?= e(__('made from the headline')) ?>"></label>
        <ul class="seo-checks" id="seo-checks"></ul>
        <details><summary><?= __('Advanced') ?></summary>
          <?= field('canonical_url', __('Canonical URL (only if the story first appeared elsewhere)'), $val('canonical_url'), 'url') ?>
          <?= checkbox('noindex', __('Hide from search engines (noindex)'), $val('noindex') === '1') ?>
        </details>
      </div>
    </div>

    <aside class="editor-side">
      <div class="card sticky-card">
        <h2><?= __('Publish') ?></h2>
        <label class="f"><span><?= __('Publish date & time') ?></span><input type="datetime-local" name="published_at" value="<?= $val('published_at') ? e(date('Y-m-d\TH:i', strtotime($val('published_at')))) : '' ?>"><small class="hint"><?= __('Leave empty to publish now. A future time schedules the story.') ?></small></label>
        <?php if (can('editor')): ?>
          <?= checkbox('is_breaking', __('Breaking news (red banner for 24 h)'), $val('is_breaking') === '1') ?>
          <?= checkbox('is_featured', __('Feature on the home page'), $val('is_featured') === '1') ?>
          <?= checkbox('send_push', __('Send a push alert to subscribers'), false, ($a['push_sent'] ?? 0) ? __('An alert was already sent for this story.') : fmt_num((int) val('SELECT COUNT(*) FROM push_subscriptions')) . ' ' . __('subscribers')) ?>
        <?php endif; ?>
        <div class="btn-col">
          <?php if (can('editor')): ?>
            <button class="a-btn a-btn-primary a-btn-block" name="do" value="publish"><?= ($a['status'] ?? '') === 'published' ? __('Update') : __('Publish') ?></button>
          <?php else: ?>
            <button class="a-btn a-btn-primary a-btn-block" name="do" value="pending"><?= __('Send for review') ?></button>
          <?php endif; ?>
          <button class="a-btn a-btn-block" name="do" value="draft"><?= ($a['status'] ?? '') === 'published' ? __('Unpublish (save as draft)') : __('Save draft') ?></button>
          <?php if ($a && can('editor')): ?><button class="a-btn a-btn-danger a-btn-block js-confirm" name="do" value="delete" data-confirm="<?= e(__('Delete this story permanently?')) ?>" formnovalidate><?= __('Delete') ?></button><?php endif; ?>
        </div>
      </div>

      <div class="card">
        <h2><?= __('Section & topics') ?></h2>
        <label class="f"><span><?= __('Section') ?></span><select name="category_id" id="f-cat" required><?= category_options($val('category_id') !== '' ? (int) $val('category_id') : null) ?></select></label>
        <label class="f"><span><?= __('Tags (comma separated)') ?></span><input name="tags" id="f-tags" value="<?= e($tags) ?>" placeholder="Toronto, Ontario Court, Housing"></label>
        <?= field('location', __('Dateline (city)'), $val('location'), 'text', ['placeholder' => 'TORONTO', 'id' => 'f-location']) ?>
        <?= select_field('lang', __('Language'), ['en' => 'English', 'so' => 'Soomaali'], $val('lang', 'en')) ?>
        <?php if (can('editor')): ?>
          <label class="f"><span><?= __('Author') ?></span><select name="author_id"><?php foreach ($authors as $au): ?><option value="<?= (int) $au['id'] ?>"<?= (int) ($v['author_id'] ?? $u['id']) === (int) $au['id'] ? ' selected' : '' ?>><?= e($au['name']) ?></option><?php endforeach; ?></select></label>
        <?php endif; ?>
        <?= field('byline', __('Byline override (optional)'), $val('byline'), 'text', ['placeholder' => __('e.g. Staff and agencies')]) ?>
      </div>

      <div class="card">
        <h2><?= __('Main image') ?></h2>
        <input type="hidden" name="image_id" id="f-image-id" value="<?= (int) ($m['id'] ?? 0) ?: '' ?>">
        <div class="img-preview" id="img-preview"><?= $m ? '<img src="' . e(media_url($m, 400)) . '" alt="">' : '<span class="muted">' . e(__('No image — the section image is used.')) . '</span>' ?></div>
        <div class="btn-row">
          <button type="button" class="a-btn js-pick-image" data-target="featured"><?= __('Choose from library') ?></button>
          <button type="button" class="a-btn js-clear-image"><?= __('Remove') ?></button>
        </div>
        <label class="f"><span><?= __('…or upload a new image') ?></span><input type="file" name="image_file" accept="image/jpeg,image/png,image/webp,image/gif"></label>
        <?= field('image_alt', __('Alt text (describe the image)'), $m['alt'] ?? '', 'text', ['id' => 'f-image-alt']) ?>
        <?= field('image_caption', __('Caption'), $m['caption'] ?? '', 'text', ['id' => 'f-image-caption']) ?>
        <?= field('image_credit', __('Photo credit'), $m['credit'] ?? '', 'text', ['id' => 'f-image-credit']) ?>
      </div>

      <?php if ($a && $a['source_url']): ?>
        <div class="card"><h2><?= __('Source') ?></h2><p class="small"><?= e($a['source_name']) ?> · <?= e($a['source_licence']) ?><br><a href="<?= e($a['source_url']) ?>" target="_blank" rel="noopener"><?= __('Original') ?> ↗</a></p></div>
      <?php endif; ?>
    </aside>
  </div>
</form>

<dialog class="media-dialog" id="media-dialog">
  <form method="dialog" class="media-dialog-head"><h2><?= __('Image library') ?></h2><button class="a-btn" value="close">✕</button></form>
  <div class="media-dialog-tools">
    <input type="search" id="media-q" placeholder="<?= e(__('Search images')) ?>">
    <label class="a-btn"><?= __('Upload') ?><input type="file" id="media-upload" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>
  </div>
  <div class="media-grid" id="media-grid"></div>
</dialog>
<?php admin_footer(); ?>
