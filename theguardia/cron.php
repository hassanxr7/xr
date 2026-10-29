<?php
/**
 * The Guardia — background jobs. Run every 5–15 minutes:
 *   hPanel → Advanced → Cron Jobs → Command:  /usr/bin/php /home/USER/domains/theguardia.ca/public_html/cron.php
 * or, if the host only allows URL cron jobs:  https://theguardia.ca/cron.php?key=YOUR_CRON_KEY
 *
 * Jobs: publish scheduled stories, send queued push alerts, roll up analytics,
 * import new official/licensed stories, refresh the GeoIP database monthly, prune caches.
 */
require __DIR__ . '/app/bootstrap.php';

$cli = PHP_SAPI === 'cli';
if (!$cli) {
    if (!hash_equals(setting('cron_key'), (string) ($_GET['key'] ?? ''))) {
        http_response_code(403);
        exit('Forbidden');
    }
    // External URL cron services give up after ~30 s: answer now, keep working afterwards.
    respond_and_continue(['ok' => true, 'started' => now()]);
    ob_start(); // swallow the job log (the connection is already closed)
}
@set_time_limit(600);

$lock = fopen(STORAGE_PATH . '/cron.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit("Another cron run is still working.\n");
}
// Heartbeat at the start too: long AI steps can keep one run busy for several minutes.
save_setting('cron_last_run', now());
save_setting('cron_last_source', $cli ? 'cli' : 'url');

$log = function (string $msg) {
    echo date('H:i:s') . ' ' . $msg . "\n";
};
$jobs = [
    'scheduled' => function () use ($log) {
        $log('published scheduled: ' . publish_scheduled());
    },
    'push' => function () use ($log) {
        push_process_queue(60);
        $log('push queue processed');
    },
    'stats' => function () use ($log) {
        $log('analytics days rolled up: ' . stats_rollup());
    },
    'imports' => function () use ($log) {
        if (setting('imports_auto', '1') === '1') {
            import_cron((int) setting('imports_budget', '150'));
            $log('imports done');
        }
    },
    'newsroom' => function () use ($log) {
        newsroom_cron((int) setting('ai_cron_budget', '420'));
        $log('AI newsroom checked');
    },
    'geoip' => function () use ($log) {
        $updated = setting('geoip_updated');
        $tried = setting('geoip_attempt');
        if (setting('geoip_auto', '1') === '1' && (!$updated || strtotime($updated) < time() - 32 * 86400) && (!$tried || strtotime($tried) < time() - 86400)) {
            save_setting('geoip_attempt', now()); // at most one attempt a day
            $log('geoip: ' . geoip_download());
        }
    },
    'cleanup' => function () use ($log) {
        $log('page cache files pruned: ' . page_cache_prune());
        q('DELETE FROM rate_limits WHERE ts < ?', [time() - 86400]);
        q("UPDATE photo_orders SET status = 'cancelled' WHERE status = 'pending' AND created_at < ?", [date('Y-m-d H:i:s', time() - 3 * 86400)]);
    },
];
$only = $cli ? ($argv[1] ?? '') : (string) ($_GET['job'] ?? '');
foreach ($jobs as $name => $job) {
    if ($only !== '' && $only !== $name) {
        continue;
    }
    try {
        $job();
    } catch (Throwable $e) {
        $log("$name failed: " . $e->getMessage());
        log_error("cron $name: " . $e->getMessage());
    }
}
save_setting('cron_last_run', now());
save_setting('cron_last_source', $cli ? 'cli' : 'url');
flock($lock, LOCK_UN);
