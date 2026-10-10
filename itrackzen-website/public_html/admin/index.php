<?php
/**
 * ITrackZen admin panel - edit text, services, trackers, pricing, FAQ, images.
 * Flat-file (JSON) so it runs on any Hostinger / cPanel / VPS PHP host with no database.
 */
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
secure_session();
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

const DATASETS = [
    'site'      => ['Site settings', 'Brand, contact emails, WhatsApp, phone, Google Analytics / Facebook Pixel IDs, client login URL, form recipients, menu.'],
    'pages'     => ['SEO: titles & descriptions', 'Meta title, description, keywords and H1 for every page.'],
    'home'      => ['Home page', 'Hero text, trust items, tour tabs, steps and call-to-action.'],
    'services'  => ['Services', 'All GPS and fleet services grouped by category.'],
    'trackers'  => ['Supported trackers', 'Brands and models. One model per line, e.g. "FMB920 [moto,asset]".'],
    'pricing'   => ['Pricing & plans', 'Plan names, price labels, features and comparison table.'],
    'solutions' => ['Solutions', 'Industry solution sections.'],
    'fleet'     => ['Fleet management page', 'Benefits, modules and workflow.'],
    'dashcam'   => ['AI dashcam page', 'Detections, how it works, benefits.'],
    'about'     => ['About us', 'Mission, values and coverage text.'],
    'faq'       => ['FAQ', 'Questions and answers (also used for FAQ schema).'],
    'countries' => ['Country landing pages', 'GPS tracking Somalia, Kenya, Uganda, Ethiopia, South Sudan, DR Congo.'],
    'blog'      => ['Blog posts', 'News and SEO articles.'],
    'privacy'   => ['Privacy Policy', 'Legal text for website and app stores.'],
    'terms'     => ['Terms & Conditions', 'Legal text.'],
];
$adminFile = DATA_DIR . '/admin.json';
$admin = is_file($adminFile) ? (json_decode((string)file_get_contents($adminFile), true) ?: []) : [];
$msg = ''; $err = '';

function admin_h(string $s): string { return e($s); }
function throttle_file(): string { return DATA_DIR . '/ratelimit/admin-' . hash('sha256', client_ip()) . '.json'; }
function throttled(): bool
{
    $f = throttle_file(); if (!is_file($f)) { return false; }
    $a = json_decode((string)file_get_contents($f), true) ?: [];
    $a = array_filter($a, fn($t) => time() - $t < 900);
    return count($a) >= 6;
}
function throttle_hit(): void
{
    $d = DATA_DIR . '/ratelimit'; if (!is_dir($d)) { @mkdir($d, 0755, true); }
    $f = throttle_file(); $a = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
    $a[] = time(); @file_put_contents($f, json_encode(array_values($a)), LOCK_EX);
}

/* ---------- POST actions ---------- */
$action = $_POST['action'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action === 'setup' && !$admin) {
        $key = (string)($_POST['setup_key'] ?? ''); $pw = (string)($_POST['password'] ?? '');
        if (ADMIN_SETUP_KEY === '' || ADMIN_SETUP_KEY === 'CHANGE_THIS_TO_A_LONG_RANDOM_PHRASE') { $err = 'Set ADMIN_SETUP_KEY in includes/config.local.php first.'; }
        elseif (throttled()) { $err = 'Too many attempts. Try again in 15 minutes.'; }
        elseif (!hash_equals(ADMIN_SETUP_KEY, $key)) { throttle_hit(); $err = 'Setup key is incorrect.'; }
        elseif (strlen($pw) < 10) { $err = 'Use a password of at least 10 characters.'; }
        else { file_put_contents($adminFile, json_encode(['hash' => password_hash($pw, PASSWORD_DEFAULT), 'created' => gmdate('c')])); session_regenerate_id(true); $_SESSION['admin'] = true; header('Location: /admin/'); exit; }
    } elseif ($action === 'login' && $admin) {
        if (throttled()) { $err = 'Too many failed attempts. Try again in 15 minutes.'; }
        elseif (password_verify((string)($_POST['password'] ?? ''), $admin['hash'] ?? '')) { session_regenerate_id(true); $_SESSION['admin'] = true; $_SESSION['csrf'] = bin2hex(random_bytes(24)); header('Location: /admin/'); exit; }
        else { throttle_hit(); $err = 'Incorrect password.'; }
    } elseif (!empty($_SESSION['admin'])) {
        if (!csrf_ok($_POST['csrf'] ?? '')) { http_response_code(403); exit('Invalid security token. Reload the page.'); }
        if ($action === 'logout') { $_SESSION = []; session_destroy(); header('Location: /admin/'); exit; }
        if ($action === 'save') {
            $name = (string)($_POST['file'] ?? '');
            $arr = json_decode((string)($_POST['json'] ?? ''), true);
            header('Content-Type: application/json');
            if (!isset(DATASETS[$name]) || !is_array($arr)) { http_response_code(400); echo json_encode(['ok' => false, 'message' => 'Invalid data.']); exit; }
            if ($name === 'site') { // never let a bad edit lock the site out
                $arr['url'] = rtrim((string)($arr['url'] ?? 'https://itrackzen.net'), '/');
                if (empty($arr['form_recipients'])) { $arr['form_recipients'] = ['info@libdexltd.com', 'sales@itrackzen.net']; }
            }
            $ok = data_save($name, $arr);
            echo json_encode(['ok' => $ok, 'message' => $ok ? 'Saved. Changes are live.' : 'Could not write file. Check folder permissions on /data.']); exit;
        }
        if ($action === 'restore') {
            $name = (string)($_POST['file'] ?? ''); $b = basename((string)($_POST['backup'] ?? ''));
            $src = DATA_DIR . '/backups/' . $b;
            if (isset(DATASETS[$name]) && str_starts_with($b, $name . '-') && is_file($src) && data_save($name, json_decode((string)file_get_contents($src), true) ?: [])) { $msg = 'Backup restored.'; } else { $err = 'Restore failed.'; }
            $_GET['edit'] = $name;
        }
        if ($action === 'password') {
            if (!password_verify((string)($_POST['current'] ?? ''), $admin['hash'] ?? '')) { $err = 'Current password is wrong.'; }
            elseif (strlen((string)($_POST['new'] ?? '')) < 10) { $err = 'New password must be at least 10 characters.'; }
            else { $admin['hash'] = password_hash((string)$_POST['new'], PASSWORD_DEFAULT); file_put_contents($adminFile, json_encode($admin)); $msg = 'Password updated.'; }
            $_GET['view'] = 'account';
        }
        if ($action === 'upload') {
            $f = $_FILES['image'] ?? null;
            if (!$f || $f['error'] !== UPLOAD_ERR_OK) { $err = 'Upload failed.'; }
            elseif ($f['size'] > 5 * 1024 * 1024) { $err = 'Max file size is 5 MB.'; }
            else {
                $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
                $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'][$mime] ?? null;
                if (!$ext || !@getimagesize($f['tmp_name'])) { $err = 'Only JPG, PNG, WebP or GIF images are allowed.'; }
                else {
                    $base = preg_replace('/[^a-z0-9-]+/', '-', strtolower(pathinfo($f['name'], PATHINFO_FILENAME))) ?: 'image';
                    $dest = ROOT . '/assets/uploads/' . trim($base, '-') . '-' . substr(bin2hex(random_bytes(3)), 0, 6) . '.' . $ext;
                    $msg = move_uploaded_file($f['tmp_name'], $dest) ? 'Uploaded: /assets/uploads/' . basename($dest) : '';
                    if (!$msg) { $err = 'Could not save file. Check permissions on /assets/uploads.'; }
                }
            }
            $_GET['view'] = 'media';
        }
        if ($action === 'delete_media') {
            $f = ROOT . '/assets/uploads/' . basename((string)($_POST['name'] ?? ''));
            if (is_file($f) && !str_starts_with(basename($f), '.') && basename($f) !== 'index.html') { unlink($f); $msg = 'Deleted.'; }
            $_GET['view'] = 'media';
        }
    }
}

$logged = !empty($_SESSION['admin']);
$view = (string)($_GET['view'] ?? ''); $edit = (string)($_GET['edit'] ?? '');
?><!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ITrackZen Admin</title><link rel="stylesheet" href="/admin/admin.css"></head><body>
<?php if (!$logged): ?>
<main class="login"><form method="post" class="box"><h1>ITrackZen Admin</h1>
<?php if ($err): ?><p class="alert err"><?= admin_h($err) ?></p><?php endif; ?>
<?php if (!$admin): ?><p>First-time setup. Enter the <code>ADMIN_SETUP_KEY</code> from <code>includes/config.local.php</code> and choose a password.</p>
<input type="hidden" name="action" value="setup"><label>Setup key<input type="password" name="setup_key" required autocomplete="off"></label><label>New admin password (min 10 chars)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label><button>Create admin</button>
<?php else: ?><input type="hidden" name="action" value="login"><label>Password<input type="password" name="password" required autofocus autocomplete="current-password"></label><button>Sign in</button><?php endif; ?>
<p class="small"><a href="/">&larr; Back to website</a></p></form></main>
<?php else: $tok = csrf_token(); ?>
<header class="top"><strong>ITrackZen Admin</strong><nav><a href="/admin/">Content</a><a href="/admin/?view=media">Media</a><a href="/admin/?view=inquiries">Inquiries</a><a href="/admin/?view=account">Account</a><a href="/" target="_blank" rel="noopener">View site</a>
<form method="post" class="inline"><input type="hidden" name="csrf" value="<?= admin_h($tok) ?>"><input type="hidden" name="action" value="logout"><button class="link">Log out</button></form></nav></header>
<main class="wrap">
<?php if ($msg): ?><p class="alert ok"><?= admin_h($msg) ?></p><?php endif; ?>
<?php if ($err): ?><p class="alert err"><?= admin_h($err) ?></p><?php endif; ?>

<?php if ($edit && isset(DATASETS[$edit])): $label = DATASETS[$edit][0]; $json = json_encode(data($edit), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
    $backups = array_reverse(glob(DATA_DIR . '/backups/' . $edit . '-*.json') ?: []); ?>
<h1><?= admin_h($label) ?></h1><p class="muted"><?= admin_h(DATASETS[$edit][1]) ?> <a href="/admin/">&larr; All content</a></p>
<div class="bar"><button id="save" class="primary">Save changes</button><button id="toggle-raw" type="button">Raw JSON</button><span id="status" role="status"></span></div>
<div id="editor"></div><textarea id="raw" hidden spellcheck="false"></textarea>
<?php if ($backups): ?><details class="backups"><summary>Restore a previous version (<?= count($backups) ?>)</summary>
<?php foreach (array_slice($backups, 0, 15) as $b): ?><form method="post" class="inline"><input type="hidden" name="csrf" value="<?= admin_h($tok) ?>"><input type="hidden" name="action" value="restore"><input type="hidden" name="file" value="<?= admin_h($edit) ?>"><input type="hidden" name="backup" value="<?= admin_h(basename($b)) ?>"><button class="link" onclick="return confirm('Restore this version? Current content will be replaced (a backup is kept).')"><?= admin_h(basename($b)) ?></button></form><br><?php endforeach; ?></details><?php endif; ?>
<script>window.ADMIN={file:<?= json_encode($edit) ?>,csrf:<?= json_encode($tok) ?>,data:<?= $json ?>};</script><script src="/admin/admin.js"></script>

<?php elseif ($view === 'media'): $files = array_values(array_filter(scandir(ROOT . '/assets/uploads') ?: [], fn($f) => preg_match('/\.(jpe?g|png|webp|gif)$/i', $f))); ?>
<h1>Media library</h1><p class="muted">Upload images, then paste the path (e.g. <code>/assets/uploads/photo.jpg</code>) into any image field in Content, such as Home &rarr; hero &rarr; image or a blog post image.</p>
<form method="post" enctype="multipart/form-data" class="card"><input type="hidden" name="csrf" value="<?= admin_h($tok) ?>"><input type="hidden" name="action" value="upload"><input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" required> <button class="primary">Upload</button></form>
<div class="media"><?php foreach ($files as $f): ?><figure><img src="/assets/uploads/<?= admin_h($f) ?>" alt="" loading="lazy"><figcaption><code>/assets/uploads/<?= admin_h($f) ?></code>
<form method="post" class="inline"><input type="hidden" name="csrf" value="<?= admin_h($tok) ?>"><input type="hidden" name="action" value="delete_media"><input type="hidden" name="name" value="<?= admin_h($f) ?>"><button class="link danger" onclick="return confirm('Delete this image?')">Delete</button></form></figcaption></figure><?php endforeach; if (!$files) { echo '<p class="muted">No images uploaded yet.</p>'; } ?></div>

<?php elseif ($view === 'inquiries'): $rows = []; $lf = DATA_DIR . '/inquiries.jsonl';
    if (is_file($lf)) { foreach (array_slice(file($lf, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [], -200) as $l) { if ($r = json_decode($l, true)) { $rows[] = $r; } } $rows = array_reverse($rows); } ?>
<h1>Inquiries</h1><p class="muted">Latest 200 form submissions. Every submission is stored here even if email delivery fails.</p>
<div class="table"><table><thead><tr><th>Time (UTC)</th><th>Type</th><th>Name / Company</th><th>Contact</th><th>Country</th><th>Details</th><th>Email</th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr><td><?= admin_h(substr((string)$r['time'], 0, 16)) ?></td><td><?= admin_h($r['type'] ?? '') ?></td><td><strong><?= admin_h($r['full_name'] ?? '') ?></strong><br><?= admin_h($r['company'] ?? '') ?></td><td><?= admin_h($r['email'] ?? '') ?><br><?= admin_h($r['phone'] ?? '') ?></td><td><?= admin_h($r['country'] ?? '') ?></td><td><?= admin_h(trim(($r['vehicles'] ?? '') . ' vehicles · ' . ($r['service'] ?? ''), ' ·')) ?><br><?= nl2br(admin_h(mb_substr((string)($r['message'] ?? ''), 0, 300))) ?></td><td><?= !empty($r['mail_sent']) ? '<span class="ok">sent</span>' : '<span class="danger" title="' . admin_h($r['mail_error'] ?? '') . '">FAILED</span>' ?></td></tr><?php endforeach; if (!$rows) { echo '<tr><td colspan="7" class="muted">No inquiries yet.</td></tr>'; } ?></tbody></table></div>

<?php elseif ($view === 'account'): ?>
<h1>Account</h1><form method="post" class="card narrow"><input type="hidden" name="csrf" value="<?= admin_h($tok) ?>"><input type="hidden" name="action" value="password"><label>Current password<input type="password" name="current" required autocomplete="current-password"></label><label>New password (min 10 chars)<input type="password" name="new" required minlength="10" autocomplete="new-password"></label><button class="primary">Change password</button></form>
<h2>Email delivery</h2><p class="muted">SMTP is configured in <code>includes/config.local.php</code> (not editable here for security). Currently: <strong><?= SMTP_HOST !== '' ? 'SMTP via ' . admin_h(SMTP_HOST) : 'PHP mail() fallback' ?></strong>. Recipients: <strong><?= admin_h(implode(', ', (array)site('form_recipients', []))) ?></strong>.</p>

<?php else: ?>
<h1>Edit your website</h1><p class="muted">Choose a section. Changes go live as soon as you save, and the previous version is backed up automatically.</p>
<div class="cards"><?php foreach (DATASETS as $k => [$t, $d]): ?><a class="card link-card" href="/admin/?edit=<?= admin_h($k) ?>"><strong><?= admin_h($t) ?></strong><span><?= admin_h($d) ?></span></a><?php endforeach; ?></div>
<?php endif; ?>
</main>
<?php endif; ?></body></html>
