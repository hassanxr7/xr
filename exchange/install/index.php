<?php
/**
 * XR Exchange — web installer.
 * Fur: https://domainkaaga.com/install/  — buuxi xogta database-ka iyo admin-ka.
 * Marka uu dhammaado, tirtir galkan "install" (ama waa la xiri doonaa si toos ah).
 */
declare(strict_types=1);

define('APP', true);
define('APP_VERSION', '1.0.0');
define('BASE_PATH', dirname(__DIR__));
define('APP_PATH', BASE_PATH . '/app');
define('STORAGE_PATH', APP_PATH . '/storage');

require APP_PATH . '/helpers.php';

session_name('XRINSTALL');
session_start();

$configFile = APP_PATH . '/config.php';
$lockFile = STORAGE_PATH . '/installed.lock';
$installed = is_file($configFile) && is_file($lockFile);

$checks = [
    'PHP 8.1+'            => version_compare(PHP_VERSION, '8.1.0', '>='),
    'PDO MySQL'           => extension_loaded('pdo_mysql'),
    'mbstring'            => extension_loaded('mbstring'),
    'fileinfo / GD (images)' => function_exists('getimagesize'),
    'cURL (Telegram)'     => function_exists('curl_init'),
    'app/ writable'       => is_writable(APP_PATH),
    'app/storage/ writable' => is_writable(STORAGE_PATH),
    'uploads/ writable'   => is_writable(BASE_PATH . '/uploads'),
];
$required = ['PHP 8.1+', 'PDO MySQL', 'mbstring', 'app/storage/ writable', 'uploads/ writable'];
$canInstall = !in_array(false, array_intersect_key($checks, array_flip($required)), true);

$errors = [];
$manualConfig = null;
$done = false;
$old = [
    'db_host' => 'localhost', 'db_name' => '', 'db_user' => '', 'db_port' => '',
    'site_name' => 'XR Exchange', 'evc_number' => '', 'whatsapp' => '',
    'admin_name' => '', 'admin_user' => 'admin', 'admin_email' => '',
];

if (empty($_SESSION['_install_csrf'])) {
    $_SESSION['_install_csrf'] = bin2hex(random_bytes(16));
}

if (!$installed && $canInstall && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($_SESSION['_install_csrf'], (string) ($_POST['_csrf'] ?? ''))) {
        $errors[] = 'Session expired — fadlan isku day mar kale.';
    }
    foreach ($old as $k => $_) {
        $old[$k] = trim((string) ($_POST[$k] ?? ''));
    }
    $dbPass = (string) ($_POST['db_pass'] ?? '');
    $adminPass = (string) ($_POST['admin_pass'] ?? '');

    if ($old['db_name'] === '' || $old['db_user'] === '') {
        $errors[] = 'Geli magaca database-ka iyo user-ka. (Database name and user are required.)';
    }
    if ($old['admin_name'] === '' || !preg_match('/^[a-z0-9_.]{3,50}$/i', $old['admin_user'])) {
        $errors[] = 'Geli magaca admin-ka iyo username sax ah (ugu yaraan 3 xaraf). (Admin name/username required.)';
    }
    if (strlen($adminPass) < 8) {
        $errors[] = 'Password-ka admin-ka waa inuu ahaadaa ugu yaraan 8 xaraf. (Admin password min. 8 characters.)';
    }

    if (!$errors) {
        try {
            $dsn = 'mysql:host=' . $old['db_host'] . ';dbname=' . $old['db_name'] . ';charset=utf8mb4' . ($old['db_port'] !== '' ? ';port=' . (int) $old['db_port'] : '');
            $pdo = new PDO($dsn, $old['db_user'], $dbPass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        } catch (PDOException $ex) {
            $errors[] = 'Database-ka lama xiriiri karo: ' . $ex->getMessage();
        }
    }

    if (!$errors) {
        try {
            $sql = file_get_contents(__DIR__ . '/schema.sql');
            $sql = preg_replace('/^\s*--.*$/m', '', $sql);
            foreach (preg_split('/;\s*(?:\r?\n|$)/', $sql) as $stmt) {
                if (trim($stmt) !== '') {
                    $pdo->exec($stmt);
                }
            }
            $now = date('Y-m-d H:i:s');
            $st = $pdo->prepare('INSERT INTO admins (name, username, email, password_hash, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)
                                 ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), password_hash = VALUES(password_hash), is_active = 1');
            $st->execute([$old['admin_name'], strtolower($old['admin_user']), $old['admin_email'] ?: null, password_hash($adminPass, PASSWORD_DEFAULT), $now]);

            $set = $pdo->prepare('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');
            $set->execute(['site_name', $old['site_name'] ?: 'XR Exchange']);
            if ($old['whatsapp'] !== '') {
                $set->execute(['contact_whatsapp', preg_replace('/\D/', '', $old['whatsapp'])]);
                $set->execute(['contact_phone', $old['whatsapp']]);
            }
            if ($old['admin_email'] !== '') {
                $set->execute(['contact_email', $old['admin_email']]);
            }
            if ($old['evc_number'] !== '') {
                $pdo->prepare("UPDATE gateways SET pay_to = ?, pay_to_name = ? WHERE code = 'evc'")->execute([$old['evc_number'], $old['site_name'] ?: 'XR Exchange']);
            }

            $config = [
                'db' => [
                    'host' => $old['db_host'],
                    'port' => $old['db_port'],
                    'name' => $old['db_name'],
                    'user' => $old['db_user'],
                    'pass' => $dbPass,
                ],
                'base_url' => '',
                'debug'    => false,
                'app_key'  => bin2hex(random_bytes(32)),
            ];
            $php = "<?php\n// XR Exchange configuration — generated by the installer on " . $now . "\n// Ha la wadaagin faylkan qof kale (contains database password).\nreturn " . var_export($config, true) . ";\n";
            if (@file_put_contents($configFile, $php, LOCK_EX) === false) {
                $manualConfig = $php;
            }
            @file_put_contents($lockFile, $now);
            $done = true;
        } catch (Throwable $ex) {
            $errors[] = 'Khalad ayaa dhacay intii la dhisayay database-ka: ' . $ex->getMessage();
        }
    }
}
?><!doctype html>
<html lang="so">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>XR Exchange — Installer</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="<?= e(url('assets/css/app.css')) ?>">
<link rel="stylesheet" href="<?= e(url('assets/css/admin.css')) ?>">
</head>
<body>
<div class="login-wrap">
  <div class="card" style="width:100%;max-width:720px">
    <div class="card-head">
      <span class="brand"><span class="logo-mark"><?= icon('swap', 18) ?></span><span class="logo-text">XR Exchange — Installer</span></span>
      <span class="small muted">v<?= APP_VERSION ?></span>
    </div>
    <div class="card-body">
    <?php if ($installed && !$done): ?>
      <div class="alert alert-success"><?= icon('check-circle') ?><span>Nidaamka horey ayaa loo rakibay. (Already installed.)</span></div>
      <p>Ammaanka dartiis, <strong>tirtir galka <code>install/</code></strong> adigoo isticmaalaya File Manager-ka Hostinger.</p>
      <div class="btn-group"><a class="btn btn-primary" href="<?= e(url('')) ?>">Website-ka</a><a class="btn btn-outline" href="<?= e(url('admin/')) ?>">Admin Panel</a></div>
    <?php elseif ($done): ?>
      <div class="alert alert-success"><?= icon('check-circle') ?><span><strong>Hambalyo!</strong> Rakibiddu way dhammaatay. (Installation complete.)</span></div>
      <?php if ($manualConfig !== null): ?>
        <div class="alert alert-warning"><?= icon('alert') ?><span>Faylka <code>app/config.php</code> lama qori karo. Samee fayl cusub oo magaciisu yahay <code>app/config.php</code> kuna dheji qoraalkan:</span></div>
        <textarea class="input mono" rows="14" readonly><?= e($manualConfig) ?></textarea>
      <?php endif; ?>
      <ol>
        <li>Gal <a href="<?= e(url('admin/')) ?>">Admin Panel</a> (username: <strong><?= e(strtolower($old['admin_user'])) ?></strong>).</li>
        <li>Tag <em>Habab lacag-bixin</em> (Gateways) → EVC Plus → geli lambarkaaga EVC ee lacagta lagu soo dirayo.</li>
        <li>Tag <em>Sicirada</em> (Pairs) → hagaaji sicirka iyo khidmadda.</li>
        <li><strong>Tirtir galka <code>install/</code></strong> (ammaanka dartiis).</li>
      </ol>
      <div class="btn-group"><a class="btn btn-primary" href="<?= e(url('admin/')) ?>">Admin Panel <?= icon('arrow-right', 16) ?></a><a class="btn btn-outline" href="<?= e(url('')) ?>">Website-ka</a></div>
    <?php else: ?>
      <h3>1. Shuruudaha server-ka (Requirements)</h3>
      <div class="grid grid-2" style="gap:6px 20px;margin-bottom:20px">
        <?php foreach ($checks as $label => $ok): ?>
          <div class="small"><span style="color:<?= $ok ? 'var(--ok)' : (in_array($label, $required, true) ? 'var(--danger)' : 'var(--warn)') ?>"><?= icon($ok ? 'check-circle' : 'x-circle', 15) ?></span> <?= e($label) ?></div>
        <?php endforeach; ?>
      </div>
      <?php if (!$canInstall): ?>
        <div class="alert alert-error"><?= icon('alert') ?><span>Server-ku ma buuxinayo shuruudaha. Hostinger: hPanel → Advanced → PHP Configuration → dooro PHP 8.1 ama ka sareeya; hubi in galalka <code>app/storage</code> iyo <code>uploads</code> ay yihiin 755.</span></div>
      <?php endif; ?>
      <?php foreach ($errors as $err): ?><div class="alert alert-error"><?= icon('alert') ?><span><?= e($err) ?></span></div><?php endforeach; ?>

      <form method="post" autocomplete="off">
        <input type="hidden" name="_csrf" value="<?= e($_SESSION['_install_csrf']) ?>">
        <h3>2. Database (MySQL)</h3>
        <p class="small muted">Hostinger: hPanel → Databases → MySQL Databases → samee database cusub, user iyo password. Magacyadu waxay u egyihiin <code>u123456789_xr</code>.</p>
        <div class="form-row">
          <div class="form-group"><label>DB Host</label><input class="input" name="db_host" value="<?= e($old['db_host']) ?>" required></div>
          <div class="form-group"><label>DB Port <span class="muted">(optional)</span></label><input class="input" name="db_port" value="<?= e($old['db_port']) ?>" placeholder="3306"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>DB Name</label><input class="input" name="db_name" value="<?= e($old['db_name']) ?>" required placeholder="u123456789_xr"></div>
          <div class="form-group"><label>DB User</label><input class="input" name="db_user" value="<?= e($old['db_user']) ?>" required placeholder="u123456789_xr"></div>
        </div>
        <div class="form-group"><label>DB Password</label><input class="input" type="password" name="db_pass"></div>

        <h3 class="mt-3">3. Website-ka</h3>
        <div class="form-row">
          <div class="form-group"><label>Magaca shirkadda (Site name)</label><input class="input" name="site_name" value="<?= e($old['site_name']) ?>" required></div>
          <div class="form-group"><label>Lambarka EVC Plus ee lacagta lagu soo dirayo</label><input class="input" name="evc_number" value="<?= e($old['evc_number']) ?>" placeholder="61xxxxxxx"></div>
        </div>
        <div class="form-group"><label>WhatsApp / Taleefan <span class="muted">(optional)</span></label><input class="input" name="whatsapp" value="<?= e($old['whatsapp']) ?>" placeholder="25261xxxxxxx"></div>

        <h3 class="mt-3">4. Akoonka Admin-ka</h3>
        <div class="form-row">
          <div class="form-group"><label>Magaca (Name)</label><input class="input" name="admin_name" value="<?= e($old['admin_name']) ?>" required></div>
          <div class="form-group"><label>Username</label><input class="input" name="admin_user" value="<?= e($old['admin_user']) ?>" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Email <span class="muted">(optional)</span></label><input class="input" type="email" name="admin_email" value="<?= e($old['admin_email']) ?>"></div>
          <div class="form-group"><label>Password (8+)</label><input class="input" type="password" name="admin_pass" required minlength="8" autocomplete="new-password"></div>
        </div>
        <button class="btn btn-primary btn-lg btn-block mt-2" type="submit" <?= $canInstall ? '' : 'disabled' ?>><?= icon('bolt', 18) ?> Rakib hadda (Install)</button>
      </form>
    <?php endif; ?>
    </div>
  </div>
</div>
</body>
</html>
