<?php
/**
 * The Guardia — web installer. Creates app/config.php, the database, the admin account and default content.
 * Delete the install/ folder after installing.
 */
declare(strict_types=1);

define('APP', true);
define('APP_VERSION', '1.0.0');
define('SCHEMA_VERSION', '2');
define('BASE_PATH', dirname(__DIR__));
define('APP_PATH', BASE_PATH . '/app');
define('STORAGE_PATH', APP_PATH . '/storage');
define('UPLOAD_PATH', BASE_PATH . '/uploads');

require APP_PATH . '/helpers.php';
require APP_PATH . '/content.php';
require APP_PATH . '/cache.php';
require APP_PATH . '/webpush.php';
require APP_PATH . '/seed.php';

$GLOBALS['config'] = [];
$configFile = APP_PATH . '/config.php';
$locked = is_file($configFile) || is_file(STORAGE_PATH . '/installed.lock');

$checks = [
    'PHP 8.1 or newer'           => version_compare(PHP_VERSION, '8.1.0', '>='),
    'PDO SQLite'                 => extension_loaded('pdo_sqlite'),
    'GD (images)'                => extension_loaded('gd'),
    'cURL'                       => extension_loaded('curl'),
    'OpenSSL'                    => extension_loaded('openssl'),
    'mbstring'                   => extension_loaded('mbstring'),
    'SQLite full-text search'    => (function () {
        try {
            (new PDO('sqlite::memory:'))->exec('CREATE VIRTUAL TABLE t USING fts5(a)');
            return true;
        } catch (Throwable $e) {
            return false;
        }
    })(),
    'app/ is writable'           => is_writable(APP_PATH),
    'app/storage/ is writable'   => is_writable(STORAGE_PATH),
    'uploads/ is writable'       => is_writable(UPLOAD_PATH),
];
$ready = !in_array(false, $checks, true);
$errors = [];
$host = $_SERVER['HTTP_HOST'] ?? 'theguardia.ca';
$defaults = [
    'site_name' => 'The Guardia', 'site_url' => (is_https() ? 'https' : 'http') . '://' . $host . base_url(), 'contact_email' => '',
    'admin_name' => '', 'admin_email' => '', 'timezone' => 'America/Toronto',
];
$v = array_merge($defaults, array_intersect_key($_POST, $defaults));

if (!$locked && $ready && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $v = array_map(fn ($x) => trim((string) $x), $v);
    $pass = (string) ($_POST['admin_pass'] ?? '');
    if ($v['site_name'] === '') {
        $errors[] = 'Enter the site name.';
    }
    if (!filter_var($v['site_url'], FILTER_VALIDATE_URL)) {
        $errors[] = 'Enter the full site address, e.g. https://theguardia.ca';
    }
    if (!filter_var($v['admin_email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Enter a valid admin email.';
    }
    if ($v['admin_name'] === '') {
        $errors[] = 'Enter the admin name.';
    }
    if (strlen($pass) < 10) {
        $errors[] = 'The admin password must be at least 10 characters.';
    }
    if (!in_array($v['timezone'], timezone_identifiers_list(), true)) {
        $v['timezone'] = 'America/Toronto';
    }
    if (!$errors) {
        try {
            $appKey = bin2hex(random_bytes(32));
            $configPhp = "<?php\n// Created by the installer on " . date('Y-m-d H:i') . ". Keep this file private.\nreturn " . var_export([
                'db'       => ['path' => 'app/storage/database.sqlite'],
                'base_url' => '',
                'debug'    => false,
                'app_key'  => $appKey,
            ], true) . ";\n";
            $GLOBALS['config'] = ['db' => ['path' => 'app/storage/database.sqlite'], 'app_key' => $appKey];
            date_default_timezone_set($v['timezone']);
            db()->exec((string) file_get_contents(APP_PATH . '/schema.sql'));
            save_setting('schema_version', SCHEMA_VERSION);
            save_setting('site_name', $v['site_name']);
            save_setting('site_url', rtrim($v['site_url'], '/'));
            save_setting('contact_email', $v['contact_email'] ?: $v['admin_email']);
            save_setting('timezone', $v['timezone']);
            seed_defaults();
            vapid_generate();
            $slug = slugify($v['admin_name'], 60) ?: 'editor';
            if (val('SELECT id FROM users WHERE email = ?', [strtolower($v['admin_email'])])) {
                // Re-install over an existing database: reset this admin's password.
                update('users', ['password_hash' => password_hash($pass, PASSWORD_DEFAULT), 'role' => 'admin', 'status' => 'active'], 'email = ?', [strtolower($v['admin_email'])]);
            } else {
                insert('users', [
                    'name' => $v['admin_name'], 'email' => strtolower($v['admin_email']), 'password_hash' => password_hash($pass, PASSWORD_DEFAULT),
                    'role' => 'admin', 'slug' => unique_slug('users', $slug), 'title' => 'Editor-in-chief', 'created_at' => now(),
                ]);
            }
            if (file_put_contents($configFile, $configPhp, LOCK_EX) === false) {
                throw new RuntimeException('Could not write app/config.php');
            }
            @file_put_contents(STORAGE_PATH . '/installed.lock', date('c'));
            header('Location: ' . url('admin/login.php?installed=1'));
            exit;
        } catch (Throwable $e) {
            $errors[] = 'Installation failed: ' . $e->getMessage();
        }
    }
}
$zones = ['America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Africa/Mogadishu', 'Africa/Nairobi', 'UTC'];
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Install The Guardia</title>
<style>
body{margin:0;background:#faf8f4;color:#121212;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.box{max-width:620px;margin:32px auto;background:#fff;border:1px solid #e3dfd6;border-radius:8px;padding:28px}
h1{font:900 26px Georgia,serif;margin:16px 0 4px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:#6b6862;margin:26px 0 8px}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 4px}input,select{width:100%;box-sizing:border-box;font:16px system-ui;padding:10px 12px;border:1px solid #bdb8ad;border-radius:5px}
button{margin-top:22px;width:100%;font:600 16px system-ui;background:#d7261e;color:#fff;border:0;border-radius:5px;padding:13px;cursor:pointer}
.ok{color:#137a3b}.bad{color:#b51f18}ul.checks{list-style:none;padding:0;margin:0;columns:2;font-size:14px}.err{background:#fbe9e7;color:#b51f18;padding:10px 14px;border-radius:5px;margin:12px 0}
.hint{font-size:13px;color:#6b6862;margin-top:4px}
</style></head><body>
<div class="box">
  <img src="../assets/img/logo.svg" alt="The Guardia" width="260">
  <h1>Install your news website</h1>
  <?php if ($locked): ?>
    <p>The site is already installed. <a href="../admin/">Open the dashboard</a>.</p>
    <p class="hint">For security, delete the <code>install/</code> folder in your File Manager.</p>
  <?php else: ?>
    <h2>Server check</h2>
    <ul class="checks"><?php foreach ($checks as $label => $ok): ?><li class="<?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✔' : '✘' ?> <?= e($label) ?></li><?php endforeach; ?></ul>
    <?php if (!$ready): ?><p class="err">Fix the items marked ✘ (hPanel → PHP Configuration → PHP 8.2 / extensions; folder permissions 755) and reload this page.</p><?php endif; ?>
    <?php foreach ($errors as $er): ?><div class="err"><?= e($er) ?></div><?php endforeach; ?>
    <form method="post" autocomplete="off">
      <h2>Website</h2>
      <label>Site name</label><input name="site_name" value="<?= e($v['site_name']) ?>" required>
      <label>Site address</label><input name="site_url" value="<?= e($v['site_url']) ?>" required>
      <div class="hint">Use your final address with https, e.g. https://theguardia.ca</div>
      <label>Newsroom email (contact form, orders)</label><input type="email" name="contact_email" value="<?= e($v['contact_email']) ?>" placeholder="newsroom@theguardia.ca">
      <label>Time zone</label><select name="timezone"><?php foreach ($zones as $z): ?><option<?= $z === $v['timezone'] ? ' selected' : '' ?>><?= e($z) ?></option><?php endforeach; ?></select>
      <h2>Administrator</h2>
      <label>Your name (shown as author)</label><input name="admin_name" value="<?= e($v['admin_name']) ?>" required>
      <label>Email (used to sign in)</label><input type="email" name="admin_email" value="<?= e($v['admin_email']) ?>" required>
      <label>Password (10+ characters)</label><input type="password" name="admin_pass" minlength="10" required autocomplete="new-password">
      <button type="submit"<?= $ready ? '' : ' disabled' ?>>Install now</button>
    </form>
  <?php endif; ?>
</div>
</body></html>
