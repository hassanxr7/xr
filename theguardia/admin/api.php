<?php
/**
 * The Guardia — JSON endpoints used by the dashboard's JavaScript.
 */
require __DIR__ . '/_init.php';

if (!user()) {
    json_out(['error' => __('Your session has expired. Sign in again.')], 401);
}
if (!is_post()) {
    json_out(['error' => 'POST only'], 405);
}
csrf_check();

$media_json = fn (array $m) => [
    'id' => (int) $m['id'], 'thumb' => media_url($m, 400), 'src' => media_url($m, 1200), 'width' => (int) $m['width'], 'height' => (int) $m['height'],
    'alt' => (string) $m['alt'], 'caption' => (string) $m['caption'], 'credit' => (string) $m['credit'],
];

try {
    switch ((string) input('action')) {
        case 'ai_write':
            require_role('writer');
            if (!rate_limit('ai', 40, 3600)) {
                throw new RuntimeException(__('Hourly AI limit reached. Try again later.'));
            }
            $out = ai_write_story([
                'notes' => (string) ($_POST['notes'] ?? ''), 'type' => (string) input('type'), 'length' => (string) input('length'),
                'lang' => (string) input('lang'), 'headline' => (string) input('headline'), 'source' => (string) input('source'),
            ]);
            $cat = null;
            foreach (categories() as $c) {
                if (strcasecmp($c['name'], (string) ($out['category_hint'] ?? '')) === 0) {
                    $cat = (int) $c['id'];
                }
            }
            $out['category_id'] = $cat;
            audit('ai write', (string) ($out['headline'] ?? ''));
            json_out(['ok' => true, 'story' => $out]);

        case 'ai_seo':
            require_role('writer');
            if (!rate_limit('ai', 40, 3600)) {
                throw new RuntimeException(__('Hourly AI limit reached. Try again later.'));
            }
            json_out(['ok' => true, 'story' => ai_seo_for((string) input('title'), (string) ($_POST['body'] ?? ''))]);

        case 'media_list':
            require_role('writer');
            $qv = trim((string) input('q'));
            $page = max(1, (int) input('page', 1));
            $list = $qv !== ''
                ? rows("SELECT * FROM media WHERE alt LIKE ? ESCAPE '!' OR caption LIKE ? ESCAPE '!' OR file LIKE ? ESCAPE '!' ORDER BY id DESC LIMIT 40 OFFSET ?", [like_param($qv), like_param($qv), like_param($qv), ($page - 1) * 40])
                : rows('SELECT * FROM media ORDER BY id DESC LIMIT 40 OFFSET ?', [($page - 1) * 40]);
            json_out(['ok' => true, 'items' => array_map($media_json, $list)]);

        case 'media_upload':
            require_role('writer');
            $mid = media_save_upload($_FILES['file'] ?? [], ['alt' => input('alt'), 'caption' => input('caption'), 'credit' => input('credit')]);
            json_out(['ok' => true, 'item' => $media_json(media($mid))]);

        case 'import_step':
            require_role('editor');
            $mode = input('mode') === 'backfill' ? 'backfill' : 'latest';
            json_out(['ok' => true] + import_run((int) input('source'), $mode, 20));

        case 'push_step':
            require_role('editor');
            $m = push_process((int) input('message'), 20);
            json_out(['ok' => true, 'message' => $m]);

        case 'newsroom_step':
            require_role('editor');
            if (!ai_enabled()) {
                throw new RuntimeException(__('Add your Anthropic API key in Settings → AI assistant first.'));
            }
            if (newsroom_current()) {
                json_out(['ok' => true, 'started' => false, 'did' => __('The team is already working — follow the progress below.')]);
            }
            respond_and_continue(['ok' => true, 'started' => true, 'did' => __('The team has started. Progress appears below as they work.')]);
            // One step per click: the web server stops requests after a few minutes; cron does the rest.
            newsroom_work(true, 1, 280);
            exit;

        case 'newsroom_poll':
            require_role('editor');
            session_write_close();
            $msgs = rows('SELECT * FROM ai_messages WHERE id > ? ORDER BY id LIMIT 50', [(int) input('after')]);
            $cur = newsroom_current();
            json_out(['ok' => true, 'messages' => array_map(fn ($m) => ['id' => (int) $m['id'], 'html' => newsroom_message_html($m)], $msgs),
                'status' => $cur ? $cur['text'] . ' (' . time_ago(date('Y-m-d H:i:s', $cur['ts'])) . ')' : '', 'busy' => (bool) $cur]);

        default:
            json_out(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 422);
}
