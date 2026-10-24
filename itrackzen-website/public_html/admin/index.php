<?php
/**
 * ITrackZen admin dashboard.
 * Roles: owner (everything) | editor (content, SEO, media, brand) | support (enquiries, deletion requests)
 */
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/mailer.php';
require __DIR__ . '/../includes/deletion.php';
secure_session();
require_once __DIR__ . '/../includes/odoo.php';
header('X-Robots-Tag: noindex, nofollow'); header('Cache-Control: no-store'); header('X-Frame-Options: DENY');

const DATASETS = [
    'site'      => ['Site settings, contact details & platform links', 'Brand, emails, WhatsApp, phone, platform URLs (login, demo, register), analytics IDs, form recipients, menu, country list.'],
    'pages'     => ['SEO: titles, descriptions & headings', 'Meta title, description, keywords and H1 for every page.'],
    'home'      => ['Home page & banners', 'Hero text, banner image, trust items, tour tabs, steps, call to action.'],
    'pricing'   => ['Plans & pricing', 'Add, edit or remove plans. Set price, currency, billing period, features and description. Plans without an approved price show "Contact Sales".'],
    'services'  => ['Services', 'GPS and fleet services by category.'],
    'solutions' => ['Industries & fleet solutions', 'Industry sections with optional images.'],
    'countries' => ['Country pages (SEO)', 'Country-specific content, cities, use cases, conditions and partner text.'],
    'trackers'  => ['Supported trackers & accessories', 'Brands and models, one model per line, e.g. "FMB920 [moto,asset]".'],
    'features'  => ['Feature pages', 'Fuel monitoring, driver behaviour & safety, alerts/geofencing/reports pages.'],
    'fleet'     => ['Fleet management page', 'Benefits, modules, workflow.'],
    'dashcam'   => ['AI dashcam page', 'Detections, how it works, benefits.'],
    'partners'  => ['Partnerships page', 'Partnership types and text.'],
    'about'     => ['About ITrackZen & LibDex', 'Company text, mission, values.'],
    'faq'       => ['FAQ & support', 'Questions and answers (also used for FAQ schema).'],
    'blog'      => ['Blog posts', 'News and SEO articles.'],
    'screens'   => ['Platform screenshots', 'Real screenshots of the ITrackZen platform (itrackzen.com/demo). Upload in Media, paste each path into an image field. Also set Home > hero screen_desktop / screen_mobile and tour tab screenshots.'],
    'photos'    => ['Photos & credits', 'Alt text, titles and licence credits for the photographs. Keep author and licence details accurate.'],
    'deletion'  => ['Account & data deletion page', 'Public deletion page text: steps, what is deleted, retention table, timeframe, notification emails.'],
    'privacy'   => ['Privacy Policy', 'Legal text.'],
    'terms'     => ['Terms & Conditions', 'Legal text.'],
];
const PERMS = ['owner' => ['*'], 'editor' => ['content', 'media', 'brand'], 'support' => ['enquiries', 'deletions']];
const ENQ_STATUS = ['new' => 'New', 'in_progress' => 'In progress', 'replied' => 'Replied', 'closed' => 'Closed', 'spam' => 'Spam'];
const ENQ_TYPE = ['contact' => 'Contact', 'quote' => 'Quote', 'demo' => 'Demo', 'partner' => 'Partnership'];

function h($s): string { return e((string)$s); }
function me(): ?array { return $_SESSION['admin_user'] ?? null; }
function can(string $area): bool
{
    $u = me(); if (!$u) { return false; }
    if (!empty($u['sso'])) { return in_array($area, (array)($u['areas'] ?? []), true); }   // rights come from the person's role in the management system
    $p = PERMS[$u['role'] ?? ''] ?? []; return in_array('*', $p, true) || in_array($area, $p, true);
}
function need(string $area): void { if (!can($area)) { http_response_code(403); exit('You do not have permission for this section.'); } }
function actor(): string { return me()['username'] ?? 'unknown'; }
function display_name(): string { return me()['name'] ?? actor(); }
function flash(string $type, string $m): void { $_SESSION['flash'] = [$type, $m]; }
function go(string $q = ''): never { header('Location: /admin/' . ($q ? '?' . $q : '')); exit; }
function throttle_file(): string { return DATA_DIR . '/ratelimit/admin-' . hash('sha256', client_ip()) . '.json'; }
function throttled(): bool { $f = throttle_file(); if (!is_file($f)) { return false; } $a = array_filter(json_decode((string)file_get_contents($f), true) ?: [], fn($t) => time() - $t < 900); return count($a) >= 6; }
function throttle_hit(): void { $d = DATA_DIR . '/ratelimit'; if (!is_dir($d)) { @mkdir($d, 0755, true); } $f = throttle_file(); $a = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : []; $a[] = time(); @file_put_contents($f, json_encode(array_values($a)), LOCK_EX); }

/* ---------- image upload with compression (GD) ---------- */
function save_image(array $f, string $dir, string $baseName, int $maxW = 1920): array
{
    if (($f['error'] ?? 1) !== UPLOAD_ERR_OK) { return [false, 'Upload failed.']; }
    if ($f['size'] > 8 * 1024 * 1024) { return [false, 'Max file size is 8 MB.']; }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true) || !@getimagesize($f['tmp_name'])) { return [false, 'Only JPG, PNG, WebP or GIF images are allowed.']; }
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    $name = trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower($baseName)), '-') ?: 'image';
    $name .= '-' . substr(bin2hex(random_bytes(3)), 0, 6);
    if (function_exists('imagecreatefromstring') && function_exists('imagewebp') && $mime !== 'image/gif') {
        $im = @imagecreatefromstring((string)file_get_contents($f['tmp_name']));
        if ($im) {
            $w = imagesx($im); $hh = imagesy($im);
            if ($w > $maxW) { $im2 = imagescale($im, $maxW); if ($im2) { $im = $im2; } }
            imagepalettetotruecolor($im); imagealphablending($im, false); imagesavealpha($im, true);
            $dest = $dir . '/' . $name . '.webp';
            if (imagewebp($im, $dest, 82)) { return [true, $dest]; }
        }
    }
    $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'][$mime];
    $dest = $dir . '/' . $name . '.' . $ext;
    return move_uploaded_file($f['tmp_name'], $dest) ? [true, $dest] : [false, 'Could not save the file. Check folder permissions.'];
}
function web_path(string $abs): string { return '/' . ltrim(str_replace(ROOT, '', $abs), '/'); }

function make_icons(string $src): array
{
    $im = @imagecreatefromstring((string)file_get_contents($src)); if (!$im) { return []; }
    $out = []; $dir = ROOT . '/assets/uploads/brand';
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    foreach (['favicon32' => [32, 0, false], 'apple' => [180, 26, true], 'icon192' => [192, 28, true], 'icon512' => [512, 70, true]] as $k => [$s, $pad, $bg]) {
        $c = imagecreatetruecolor($s, $s); imagealphablending($c, false); imagesavealpha($c, true);
        imagefill($c, 0, 0, imagecolorallocatealpha($c, 255, 255, 255, $bg ? 0 : 127)); imagealphablending($c, true);
        $iw = imagesx($im); $ih = imagesy($im); $box = $s - 2 * $pad; $sc = min($box / $iw, $box / $ih);
        $nw = (int)round($iw * $sc); $nh = (int)round($ih * $sc);
        imagecopyresampled($c, $im, (int)(($s - $nw) / 2), (int)(($s - $nh) / 2), 0, 0, $nw, $nh, $iw, $ih);
        $p = $dir . '/' . $k . '.png'; imagepng($c, $p); $out[$k] = web_path($p);
    }
    return $out;
}

/* ---------- admin users ---------- */
$adminCount = (int)db_val('SELECT COUNT(*) FROM admins');
$action = $_POST['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action === 'setup' && $adminCount === 0) {
        $key = (string)($_POST['setup_key'] ?? ''); $pw = (string)($_POST['password'] ?? ''); $un = strtolower(trim((string)($_POST['username'] ?? '')));
        if (ADMIN_SETUP_KEY === '' || ADMIN_SETUP_KEY === 'CHANGE_THIS_TO_A_LONG_RANDOM_PHRASE') { flash('err', 'Set ADMIN_SETUP_KEY in includes/config.local.php first.'); }
        elseif (throttled()) { flash('err', 'Too many attempts. Try again in 15 minutes.'); }
        elseif (!hash_equals(ADMIN_SETUP_KEY, $key)) { throttle_hit(); flash('err', 'Setup key is incorrect.'); }
        elseif (!preg_match('/^[a-z0-9._-]{3,32}$/', $un)) { flash('err', 'Username: 3-32 letters, numbers, dot, dash or underscore.'); }
        elseif (strlen($pw) < 10) { flash('err', 'Use a password of at least 10 characters.'); }
        else { $id = db_insert('admins', ['username' => $un, 'pass_hash' => password_hash($pw, PASSWORD_DEFAULT), 'role' => 'owner', 'active' => 1, 'created_at' => now_utc()]); session_regenerate_id(true); $_SESSION['admin_user'] = ['id' => $id, 'username' => $un, 'role' => 'owner']; $_SESSION['last'] = time(); admin_log($un, 'setup', 'Owner account created'); go(); }
        go();
    }
    if ($action === 'login') {
        $un = strtolower(trim((string)($_POST['username'] ?? '')));
        $u = $un !== '' ? db_one('SELECT * FROM admins WHERE username=? AND active=1', [$un]) : null;
        if (throttled()) { flash('err', 'Too many failed attempts. Try again in 15 minutes.'); }
        elseif ($u && odoo_enabled() && (($u['source'] ?? 'local') !== 'local' || (ADMIN_LOCAL_LOGIN === 'off') || (ADMIN_LOCAL_LOGIN === 'owner' && $u['role'] !== 'owner'))) {
            admin_log($un, 'login_blocked', 'Use the ITrackZen Management sign-in'); flash('err', 'Please sign in with your ITrackZen Management account.');
        }
        elseif ($u && password_verify((string)($_POST['password'] ?? ''), $u['pass_hash'])) {
            session_regenerate_id(true); $_SESSION['admin_user'] = ['id' => (int)$u['id'], 'username' => $u['username'], 'role' => $u['role']]; $_SESSION['last'] = time(); $_SESSION['csrf'] = bin2hex(random_bytes(24));
            db_update('admins', (int)$u['id'], ['last_login' => now_utc()]); admin_log($u['username'], 'login'); go();
        } else { throttle_hit(); admin_log($un ?: '?', 'login_failed', client_ip()); flash('err', 'Incorrect username or password.'); }
        go();
    }
}
if (me() && (time() - ($_SESSION['last'] ?? 0)) > 7200) { $_SESSION = []; flash('err', 'Session expired. Please sign in again.'); }
if (me()) { $_SESSION['last'] = time(); }

/* ---------- authenticated POST actions ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && me()) {
    if (!csrf_ok($_POST['csrf'] ?? '')) { http_response_code(403); exit('Invalid security token. Reload the page.'); }
    switch ($action) {
    case 'logout':
        admin_log(actor(), 'logout'); $viaOdoo = !empty(me()['sso']); $_SESSION = []; session_destroy();
        header('Location: ' . ($viaOdoo && odoo_enabled() ? odoo_url('/itz/sso/logout') . '?redirect=' . rawurlencode(admin_base_url()) : '/admin/')); exit;

    case 'save': // content editor (JSON response)
        need('content'); header('Content-Type: application/json');
        $name = (string)($_POST['file'] ?? ''); $arr = json_decode((string)($_POST['json'] ?? ''), true);
        if (!isset(DATASETS[$name]) || !is_array($arr)) { http_response_code(400); echo json_encode(['ok' => false, 'message' => 'Invalid data.']); exit; }
        if ($name === 'site') {
            $arr['url'] = rtrim((string)($arr['url'] ?? 'https://itrackzen.net'), '/');
            if (empty($arr['form_recipients'])) { $arr['form_recipients'] = ['info@libdexltd.com', 'sales@itrackzen.net']; }
        }
        $ok = data_save($name, $arr, actor()); if ($ok) { admin_log(actor(), 'content_saved', $name); }
        echo json_encode(['ok' => $ok, 'message' => $ok ? 'Saved. Changes are live on the website.' : 'Could not save. Check that the /data folder is writable.']); exit;

    case 'restore':
        need('content'); $name = (string)($_POST['file'] ?? ''); $vid = (int)($_POST['version'] ?? 0);
        $row = isset(DATASETS[$name]) ? db_one('SELECT * FROM content_versions WHERE id=? AND name=?', [$vid, $name]) : null;
        if ($row && data_save($name, json_decode($row['body'], true) ?: [], actor())) { admin_log(actor(), 'content_restored', "$name v$vid"); flash('ok', 'Previous version restored.'); } else { flash('err', 'Restore failed.'); }
        go('edit=' . urlencode($name));

    case 'reset_default':
        need('content'); $name = (string)($_POST['file'] ?? '');
        if (isset(DATASETS[$name]) && data_save($name, data_default($name), actor())) { admin_log(actor(), 'content_reset', $name); flash('ok', 'Reset to the original default content (your previous version is kept in history).'); }
        go('edit=' . urlencode($name));

    case 'upload':
        need('media'); [$ok, $r] = save_image($_FILES['image'] ?? [], ROOT . '/assets/uploads', pathinfo($_FILES['image']['name'] ?? 'image', PATHINFO_FILENAME));
        flash($ok ? 'ok' : 'err', $ok ? 'Uploaded (compressed): ' . web_path($r) : $r); if ($ok) { admin_log(actor(), 'media_upload', web_path($r)); } go('v=media');

    case 'delete_media':
        need('media'); $f = ROOT . '/assets/uploads/' . basename((string)($_POST['name'] ?? ''));
        if (is_file($f) && !str_starts_with(basename($f), '.') && basename($f) !== 'index.html') { unlink($f); admin_log(actor(), 'media_delete', basename($f)); flash('ok', 'Deleted.'); } go('v=media');

    case 'brand':
        need('brand'); $slot = (string)($_POST['slot'] ?? ''); $site = data('site'); $ba = $site['brand_assets'] ?? [];
        if ($slot === 'reset') { $site['brand_assets'] = []; data_save('site', $site, actor()); flash('ok', 'Brand assets reset to defaults.'); go('v=brand'); }
        if (!in_array($slot, ['logo', 'logo_light', 'icon'], true)) { go('v=brand'); }
        [$ok, $r] = save_image($_FILES['image'] ?? [], ROOT . '/assets/uploads/brand', $slot, 1200);
        if (!$ok) { flash('err', $r); go('v=brand'); }
        if ($slot === 'icon') { $ba = array_merge($ba, make_icons($r), ['icon' => web_path($r)]); } else { $ba[$slot] = web_path($r); }
        $site['brand_assets'] = $ba; data_save('site', $site, actor()); admin_log(actor(), 'brand_upload', $slot); flash('ok', 'Brand asset updated and live.'); go('v=brand');

    case 'enq_update':
        need('enquiries'); $id = (int)($_POST['id'] ?? 0); $st = (string)($_POST['status'] ?? '');
        if (db_one('SELECT id FROM enquiries WHERE id=?', [$id]) && isset(ENQ_STATUS[$st])) { db_update('enquiries', $id, ['status' => $st, 'notes' => mb_substr((string)($_POST['notes'] ?? ''), 0, 5000), 'updated_at' => now_utc()]); admin_log(actor(), 'enquiry_update', "#$id -> $st"); flash('ok', 'Enquiry updated.'); }
        go('v=enquiry&id=' . $id);
    case 'enq_delete':
        need('enquiries'); if (me()['role'] === 'owner') { db_run('DELETE FROM enquiries WHERE id=?', [(int)$_POST['id']]); admin_log(actor(), 'enquiry_delete', '#' . (int)$_POST['id']); flash('ok', 'Enquiry deleted.'); } go('v=enquiries');

    case 'del_do': // deletion request workflow
        need('deletions'); $id = (int)($_POST['id'] ?? 0); $do = (string)($_POST['do'] ?? ''); $note = trim(mb_substr((string)($_POST['note'] ?? ''), 0, 2000));
        $r = db_one('SELECT * FROM deletion_requests WHERE id=?', [$id]); if (!$r) { go('v=deletions'); }
        $st = $r['status']; $a = actor();
        if ($do === 'note' && $note !== '') { del_event($id, $a, 'note', $note); flash('ok', 'Note added.'); }
        elseif ($do === 'start_review' && $st === 'awaiting_review') { del_set($id, $a, 'in_review', ['assigned_to' => $a], 'review_started'); flash('ok', 'Review started.'); }
        elseif ($do === 'verify_identity' && in_array($st, ['awaiting_review', 'in_review'], true)) {
            $meth = mb_substr((string)($_POST['method'] ?? ''), 0, 120);
            if ($meth === '' || $note === '') { flash('err', 'Choose how identity was verified and add notes about what you checked.'); }
            else { del_set($id, $a, 'in_review', ['identity_verified' => 1, 'verification_method' => $meth, 'verification_notes' => $note, 'assigned_to' => $a], 'identity_verified', $meth . ': ' . $note); flash('ok', 'Identity verification recorded.'); }
        }
        elseif ($do === 'unverify' && $st === 'in_review') { del_set($id, $a, 'in_review', ['identity_verified' => 0], 'identity_unverified', $note); }
        elseif ($do === 'approve' && in_array($st, ['awaiting_review', 'in_review'], true)) {
            if (!$r['email_verified_at'] || !(int)$r['identity_verified']) { flash('err', 'Email confirmation and identity verification are both required before approval.'); }
            else {
                del_set($id, $a, 'approved', ['assigned_to' => $a], 'approved', $note);
                $wh = del_webhook($r, $a); db_update('deletion_requests', $id, ['webhook_status' => $wh]); del_event($id, 'system', 'platform_webhook', $wh);
                del_notify_requester($r, 'Your deletion request was approved', ['Hello ' . $r['full_name'] . ',', 'Your identity has been verified and your deletion request (reference ' . $r['ref'] . ') is approved. We are now deleting the data from the ITrackZen platform and will email you when it is complete.']);
                flash('ok', 'Approved. Platform notification: ' . $wh);
            }
        }
        elseif ($do === 'complete' && $st === 'approved') {
            $pref = trim((string)($_POST['platform_ref'] ?? '')); $ret = trim(mb_substr((string)($_POST['retained'] ?? ''), 0, 1000));
            if ($pref === '') { flash('err', 'Enter the platform reference or a note confirming where the data was deleted (for example the platform user ID removed).'); }
            else { del_complete($r, $a, mb_substr($pref, 0, 190), $ret); admin_log($a, 'deletion_completed', $r['ref']); flash('ok', 'Marked as completed and the requester was emailed.'); }
        }
        elseif ($do === 'reject' && !in_array($st, ['completed', 'rejected', 'cancelled'], true)) {
            if ($note === '') { flash('err', 'Please give a reason. It is sent to the requester.'); }
            else { del_set($id, $a, 'rejected', ['decision_note' => $note, 'completed_at' => now_utc()], 'rejected', $note); del_notify_requester($r, 'Your deletion request could not be completed', ['Hello ' . $r['full_name'] . ',', 'We could not complete deletion request ' . $r['ref'] . ': ' . $note, 'If you believe this is a mistake, reply to this email with more information.']); flash('ok', 'Request rejected and requester emailed.'); }
        }
        elseif ($do === 'cancel' && !in_array($st, ['completed', 'rejected', 'cancelled'], true)) { del_set($id, $a, 'cancelled', ['decision_note' => $note, 'completed_at' => now_utc()], 'cancelled', $note); flash('ok', 'Request cancelled.'); }
        elseif ($do === 'resend' && $st === 'pending_email') { $tok = del_new_token($id); [$ok, $err] = del_send_verification($r, $tok); del_event($id, $a, $ok ? 'verification_resent' : 'verification_resend_failed', $err); flash($ok ? 'ok' : 'err', $ok ? 'Verification email resent.' : 'Could not send: ' . $err); }
        else { flash('err', 'That action is not available for this request in its current status.'); }
        go('v=deletion&id=' . $id);

    case 'user_add':
        need('users'); $un = strtolower(trim((string)$_POST['username'])); $role = (string)$_POST['role']; $pw = (string)$_POST['password'];
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $un) || !isset(PERMS[$role]) || strlen($pw) < 10) { flash('err', 'Valid username, role and a password of 10+ characters are required.'); }
        elseif (db_one('SELECT id FROM admins WHERE username=?', [$un])) { flash('err', 'That username already exists.'); }
        else { db_insert('admins', ['username' => $un, 'pass_hash' => password_hash($pw, PASSWORD_DEFAULT), 'role' => $role, 'active' => 1, 'created_at' => now_utc()]); admin_log(actor(), 'user_add', "$un ($role)"); flash('ok', 'User created.'); }
        go('v=users');
    case 'user_toggle':
        need('users'); $id = (int)$_POST['id']; if ($id !== (int)me()['id']) { db_run('UPDATE admins SET active = 1 - active WHERE id=?', [$id]); admin_log(actor(), 'user_toggle', "#$id"); } go('v=users');
    case 'user_password':
        need('users'); $id = (int)$_POST['id']; if (db_val('SELECT source FROM admins WHERE id=?', [$id]) === 'odoo') { flash('err', 'This person signs in through ITrackZen Management.'); go('v=users'); } if (strlen((string)$_POST['password']) >= 10) { db_run('UPDATE admins SET pass_hash=? WHERE id=?', [password_hash((string)$_POST['password'], PASSWORD_DEFAULT), $id]); admin_log(actor(), 'user_password_reset', "#$id"); flash('ok', 'Password updated.'); } else { flash('err', 'Password must be at least 10 characters.'); } go('v=users');
    case 'password':
        $u = db_one('SELECT * FROM admins WHERE id=?', [(int)me()['id']]);
        if (!password_verify((string)($_POST['current'] ?? ''), $u['pass_hash'])) { flash('err', 'Current password is wrong.'); }
        elseif (strlen((string)($_POST['new'] ?? '')) < 10) { flash('err', 'New password must be at least 10 characters.'); }
        else { db_run('UPDATE admins SET pass_hash=? WHERE id=?', [password_hash((string)$_POST['new'], PASSWORD_DEFAULT), $u['id']]); admin_log(actor(), 'password_changed'); flash('ok', 'Password updated.'); }
        go('v=account');
    }
}

/* ---------- CSV export ---------- */
if (me() && ($_GET['v'] ?? '') === 'enquiries' && isset($_GET['export']) && can('enquiries')) {
    header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="itrackzen-enquiries-' . gmdate('Ymd') . '.csv"');
    $o = fopen('php://output', 'w'); fputcsv($o, ['ref', 'type', 'status', 'created_utc', 'name', 'company', 'country', 'phone', 'email', 'vehicles', 'service', 'message', 'extra', 'notes']);
    foreach (db_all('SELECT * FROM enquiries ORDER BY id DESC') as $r) { fputcsv($o, [$r['ref'], $r['type'], $r['status'], $r['created_at'], $r['full_name'], $r['company'], $r['country'], $r['phone'], $r['email'], $r['vehicles'], $r['service'], $r['message'], $r['extra'], $r['notes']]); }
    exit;
}

/* ---------- areas that need a permission answer 403 instead of silently showing the dashboard ---------- */
if (me()) {
    $areaOf = ['enquiries' => 'enquiries', 'enquiry' => 'enquiries', 'deletions' => 'deletions', 'deletion' => 'deletions', 'content' => 'content',
               'media' => 'media', 'brand' => 'brand', 'users' => 'users', 'log' => 'users'];
    $wanted = isset($_GET['edit']) && $_GET['edit'] !== '' ? 'content' : ($areaOf[(string)($_GET['v'] ?? '')] ?? '');
    if ($wanted !== '' && !can($wanted)) { http_response_code(403); exit('You do not have permission for this section. Ask the owner to change your role in ITrackZen Management.'); }
}

/* =================== VIEWS =================== */
$flash = $_SESSION['flash'] ?? null; unset($_SESSION['flash']);
$v = (string)($_GET['v'] ?? ''); $edit = (string)($_GET['edit'] ?? '');
$tok = me() ? csrf_token() : '';
function badge(string $s, string $label = ''): string { return '<span class="badge b-' . h($s) . '">' . h($label ?: $s) . '</span>'; }
function csrf_field(): string { return '<input type="hidden" name="csrf" value="' . h(csrf_token()) . '">'; }
?><!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ITrackZen Admin</title><link rel="icon" href="/assets/img/brand/itrackzen-favicon.svg"><link rel="stylesheet" href="/admin/admin.css?v=2"></head><body>
<?php if (!me()): $ssoOn = odoo_enabled(); ?>
<main class="login"><div class="box"><img class="login-logo" src="/assets/img/brand/itrackzen-logo.svg" alt="ITrackZen" width="150"><h1><?= $ssoOn ? 'Staff workspace' : 'ITrackZen Admin' ?></h1>
<?php if ($flash): ?><p class="alert <?= $flash[0] ?>"><?= h($flash[1]) ?></p><?php endif; ?>
<?php if ($ssoOn): ?>
<p class="muted">Sign in once with your own ITrackZen Management account. You will see only the work and records that belong to your role.</p>
<a class="btn-sso" href="/admin/sso.php?start=1">Sign in with ITrackZen Management</a>
<?php if ($adminCount === 0): ?><details class="local-login"><summary>First-time local owner setup (optional)</summary>
<form method="post"><input type="hidden" name="action" value="setup"><label>Setup key<input type="password" name="setup_key" required autocomplete="off"></label><label>Username<input name="username" required autocomplete="username" pattern="[a-z0-9._-]{3,32}"></label><label>Password (min 10 characters)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label><button>Create owner account</button></form></details>
<?php elseif (ADMIN_LOCAL_LOGIN !== 'off'): ?><details class="local-login"><summary>Owner emergency sign-in</summary>
<form method="post"><input type="hidden" name="action" value="login"><label>Username<input name="username" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button>Sign in</button></form></details><?php endif; ?>
<?php elseif ($adminCount === 0): ?><form method="post"><p>First-time setup. Enter the <code>ADMIN_SETUP_KEY</code> from <code>includes/config.local.php</code> and create the owner account.</p>
<input type="hidden" name="action" value="setup"><label>Setup key<input type="password" name="setup_key" required autocomplete="off"></label><label>Username<input name="username" required autocomplete="username" pattern="[a-z0-9._-]{3,32}"></label><label>Password (min 10 characters)<input type="password" name="password" required minlength="10" autocomplete="new-password"></label><button>Create owner account</button></form>
<?php else: ?><form method="post"><input type="hidden" name="action" value="login"><label>Username<input name="username" required autofocus autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button>Sign in</button></form><?php endif; ?>
<p class="small"><a href="/">&larr; Back to website</a></p></div></main>
<?php else:
    $newEnq = (int)db_val("SELECT COUNT(*) FROM enquiries WHERE status='new'");
    $openDel = (int)db_val("SELECT COUNT(*) FROM deletion_requests WHERE status IN ('awaiting_review','in_review','approved')");
    // lazily expire unconfirmed deletion requests
    db_run("UPDATE deletion_requests SET status='expired', updated_at=? WHERE status='pending_email' AND created_at < ?", [now_utc(), gmdate('Y-m-d H:i:s', time() - 7 * 86400)]);
?>
<?php
    $sso = !empty(me()['sso']);
    $menus = $sso ? (array)(me()['menus'] ?? []) : [];
    if ($sso) { odoo_outbox_flush(5); }
?>
<header class="top"><a class="brand" href="/admin/"><img src="/assets/img/brand/itrackzen-logo-white.svg" alt="ITrackZen" height="26"><span>Workspace</span></a><nav>
<a href="/admin/">Home</a>
<?php if ($sso && $menus): ?><details class="navdrop"><summary>Operations</summary><div class="navpanel">
<?php foreach ($menus as $m): ?><a href="<?= h(odoo_url((string)$m['path'])) ?>"><?= h((string)$m['label']) ?></a><?php endforeach; ?>
</div></details><?php endif; ?>
<?php $webTools = can('enquiries') || can('deletions') || can('content') || can('media') || can('brand') || can('users'); ?>
<?php if ($webTools): ?><details class="navdrop"><summary>Website<?= ($newEnq + $openDel) ? ' <i class="pill">' . ($newEnq + $openDel) . '</i>' : '' ?></summary><div class="navpanel">
<?php if (can('enquiries')): ?><a href="/admin/?v=enquiries">Enquiries<?= $newEnq ? ' <i class="pill">' . $newEnq . '</i>' : '' ?></a><?php endif; ?>
<?php if (can('deletions')): ?><a href="/admin/?v=deletions">Deletion requests<?= $openDel ? ' <i class="pill">' . $openDel . '</i>' : '' ?></a><?php endif; ?>
<?php if (can('content')): ?><a href="/admin/?v=content">Content</a><?php endif; ?>
<?php if (can('media')): ?><a href="/admin/?v=media">Media</a><?php endif; ?>
<?php if (can('brand')): ?><a href="/admin/?v=brand">Brand</a><?php endif; ?>
<?php if (can('users')): ?><a href="/admin/?v=users">Local users</a><a href="/admin/?v=log">Activity</a><?php endif; ?>
</div></details><?php endif; ?>
<a href="/admin/?v=account"><?= h(display_name()) ?></a><a href="/" target="_blank" rel="noopener">View site</a>
<form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="logout"><button class="link">Sign out</button></form></nav></header>
<main class="wrap">
<?php if ($flash): ?><p class="alert <?= $flash[0] ?>"><?= h($flash[1]) ?></p><?php endif; ?>

<?php if ($edit && isset(DATASETS[$edit]) && can('content')):
    $json = json_encode(data($edit), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
    $versions = db_all('SELECT id, saved_at, saved_by FROM content_versions WHERE name=? ORDER BY id DESC LIMIT 15', [$edit]); ?>
<h1><?= h(DATASETS[$edit][0]) ?></h1><p class="muted"><?= h(DATASETS[$edit][1]) ?> <a href="/admin/?v=content">&larr; All content</a></p>
<div class="bar"><button id="save" class="primary">Save changes</button><button id="toggle-raw" type="button">Raw JSON</button><span id="status" role="status"></span></div>
<div id="editor"></div><textarea id="raw" hidden spellcheck="false"></textarea>
<details class="backups"><summary>Version history (<?= count($versions) ?>) and reset</summary>
<?php foreach ($versions as $ver): ?><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="restore"><input type="hidden" name="file" value="<?= h($edit) ?>"><input type="hidden" name="version" value="<?= (int)$ver['id'] ?>"><button class="link" onclick="return confirm('Restore this version? The current content is kept in history.')"><?= h($ver['saved_at']) ?> UTC by <?= h($ver['saved_by']) ?></button></form><br><?php endforeach; ?>
<form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="reset_default"><input type="hidden" name="file" value="<?= h($edit) ?>"><button class="link danger" onclick="return confirm('Reset this section to the original default content?')">Reset to original default content</button></form></details>
<script>window.ADMIN={file:<?= json_encode($edit) ?>,csrf:<?= json_encode($tok) ?>,data:<?= $json ?>};</script><script src="/admin/admin.js?v=2"></script>

<?php elseif ($v === 'content' && can('content')): ?>
<h1>Website content</h1><p class="muted">Choose a section to edit. Changes go live as soon as you save and every previous version is kept.</p>
<div class="cards"><?php foreach (DATASETS as $k => [$t, $d]): ?><a class="card link-card" href="/admin/?edit=<?= h($k) ?>"><strong><?= h($t) ?></strong><span><?= h($d) ?></span></a><?php endforeach; ?></div>

<?php elseif ($v === 'media' && can('media')): $files = array_values(array_filter(scandir(ROOT . '/assets/uploads') ?: [], fn($f) => preg_match('/\.(jpe?g|png|webp|gif)$/i', $f))); rsort($files); ?>
<h1>Media library</h1><p class="muted">Images are resized (max 1920 px) and compressed to WebP automatically. After uploading, paste the path (for example <code>/assets/uploads/photo.webp</code>) into any <em>image</em> field in Content (home banner, industries, country pages, blog). Add descriptive <em>alt</em> text in the matching field.</p>
<form method="post" enctype="multipart/form-data" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="upload"><input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" required> <button class="primary">Upload &amp; compress</button></form>
<div class="media"><?php foreach ($files as $f): ?><figure><img src="/assets/uploads/<?= h($f) ?>" alt="" loading="lazy"><figcaption><code>/assets/uploads/<?= h($f) ?></code><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="delete_media"><input type="hidden" name="name" value="<?= h($f) ?>"><button class="link danger" onclick="return confirm('Delete this image?')">Delete</button></form></figcaption></figure><?php endforeach; if (!$files) { echo '<p class="muted">No images uploaded yet.</p>'; } ?></div>

<?php elseif ($v === 'brand' && can('brand')): $ba = site('brand_assets', []); ?>
<h1>Brand assets</h1><p class="muted">Upload your official logo files. They replace the logo in the header, footer, mobile menu, favicon and app icons across the website. Use transparent PNG or WebP at least 600 px wide so the proportions and colours are kept exactly.</p>
<div class="cards">
<?php foreach (['logo' => ['Main logo (for light backgrounds)', '/assets/img/brand/itrackzen-logo.svg'], 'logo_light' => ['Logo for dark backgrounds (footer)', '/assets/img/brand/itrackzen-logo-white.svg'], 'icon' => ['Square symbol (favicon & app icons)', '/assets/img/brand/itrackzen-app-icon.svg']] as $slot => [$lab, $def]): $cur = $ba[$slot] ?? $def; ?>
<form method="post" enctype="multipart/form-data" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="brand"><input type="hidden" name="slot" value="<?= h($slot) ?>"><strong><?= h($lab) ?></strong>
<div class="logo-prev<?= $slot === 'logo_light' ? ' dark' : '' ?>"><img src="<?= h($cur) ?>" alt=""></div><p class="small muted"><?= isset($ba[$slot]) ? 'Custom: ' . h($cur) : 'Using the default traced logo' ?></p><input type="file" name="image" accept="image/png,image/webp,image/jpeg" required> <button class="primary">Upload</button></form>
<?php endforeach; ?></div>
<form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="brand"><input type="hidden" name="slot" value="reset"><button class="link danger" onclick="return confirm('Reset all brand assets to the defaults?')">Reset to default logo</button></form>

<?php elseif ($v === 'enquiries' && can('enquiries')):
    $fs = (string)($_GET['status'] ?? ''); $ft = (string)($_GET['type'] ?? ''); $q = trim((string)($_GET['q'] ?? '')); $page = max(1, (int)($_GET['p'] ?? 1)); $per = 25;
    $w = ['1=1']; $pa = [];
    if (isset(ENQ_STATUS[$fs])) { $w[] = 'status=?'; $pa[] = $fs; } if (isset(ENQ_TYPE[$ft])) { $w[] = 'type=?'; $pa[] = $ft; }
    if ($q !== '') { $w[] = '(full_name LIKE ? OR company LIKE ? OR email LIKE ? OR ref LIKE ? OR country LIKE ?)'; array_push($pa, "%$q%", "%$q%", "%$q%", "%$q%", "%$q%"); }
    $total = (int)db_val('SELECT COUNT(*) FROM enquiries WHERE ' . implode(' AND ', $w), $pa);
    $rows = db_all('SELECT * FROM enquiries WHERE ' . implode(' AND ', $w) . ' ORDER BY id DESC LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per), $pa); ?>
<h1>Enquiries</h1><p class="muted">Quote requests, contact messages, demo requests and partnership enquiries. Everything is saved here even if email delivery fails.</p>
<form method="get" class="filters"><input type="hidden" name="v" value="enquiries"><select name="type"><option value="">All types</option><?php foreach (ENQ_TYPE as $k => $l): ?><option value="<?= $k ?>" <?= $ft === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach; ?></select>
<select name="status"><option value="">All statuses</option><?php foreach (ENQ_STATUS as $k => $l): ?><option value="<?= $k ?>" <?= $fs === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach; ?></select><input name="q" value="<?= h($q) ?>" placeholder="Search name, company, email, ref"><button>Filter</button> <a class="btn" href="/admin/?v=enquiries&export=1">Export CSV</a></form>
<div class="table"><table><thead><tr><th>Date (UTC)</th><th>Ref</th><th>Type</th><th>Contact</th><th>Country</th><th>Interest</th><th>Status</th><th>Email</th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr class="clk" onclick="location='/admin/?v=enquiry&id=<?= (int)$r['id'] ?>'"><td><?= h(substr($r['created_at'], 0, 16)) ?></td><td><a href="/admin/?v=enquiry&id=<?= (int)$r['id'] ?>"><?= h($r['ref']) ?></a></td><td><?= h(ENQ_TYPE[$r['type']] ?? $r['type']) ?></td><td><strong><?= h($r['full_name']) ?></strong><br><?= h($r['company']) ?><br><small><?= h($r['email']) ?></small></td><td><?= h($r['country']) ?></td><td><?= h(trim($r['vehicles'] . ' vehicles ' . $r['service'])) ?></td><td><?= badge($r['status'], ENQ_STATUS[$r['status']] ?? $r['status']) ?></td><td><?= $r['mail_sent'] ? '<span class="ok">sent</span>' : '<span class="danger" title="' . h($r['mail_error']) . '">FAILED</span>' ?></td></tr><?php endforeach; if (!$rows) { echo '<tr><td colspan="8" class="muted">No enquiries found.</td></tr>'; } ?></tbody></table></div>
<p class="muted"><?= $total ?> result(s). <?php if ($page > 1): ?><a href="?<?= h(http_build_query(['v' => 'enquiries', 'status' => $fs, 'type' => $ft, 'q' => $q, 'p' => $page - 1])) ?>">&larr; Prev</a><?php endif; ?> <?php if ($page * $per < $total): ?><a href="?<?= h(http_build_query(['v' => 'enquiries', 'status' => $fs, 'type' => $ft, 'q' => $q, 'p' => $page + 1])) ?>">Next &rarr;</a><?php endif; ?></p>

<?php elseif ($v === 'enquiry' && can('enquiries')): $r = db_one('SELECT * FROM enquiries WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) { echo '<p>Not found.</p>'; } else { $ex = json_decode((string)$r['extra'], true) ?: []; ?>
<p><a href="/admin/?v=enquiries">&larr; All enquiries</a></p><h1><?= h($r['ref']) ?> <?= badge($r['status'], ENQ_STATUS[$r['status']] ?? '') ?></h1>
<div class="two"><div class="card"><dl class="facts"><dt>Type</dt><dd><?= h(ENQ_TYPE[$r['type']] ?? $r['type']) ?></dd><dt>Received</dt><dd><?= h($r['created_at']) ?> UTC</dd><dt>Name</dt><dd><?= h($r['full_name']) ?></dd><dt>Company</dt><dd><?= h($r['company']) ?></dd><dt>Email</dt><dd><a href="mailto:<?= h($r['email']) ?>?subject=<?= rawurlencode('Re: ITrackZen ' . $r['ref']) ?>"><?= h($r['email']) ?></a></dd><dt>Phone / WhatsApp</dt><dd><?= h($r['phone']) ?><?php $wn = preg_replace('/\D/', '', $r['phone']); if ($wn): ?> &middot; <a href="https://wa.me/<?= h($wn) ?>" target="_blank" rel="noopener">WhatsApp</a><?php endif; ?></dd><dt>Country</dt><dd><?= h($r['country']) ?></dd><dt>Vehicles</dt><dd><?= h($r['vehicles']) ?></dd><dt>Interest</dt><dd><?= h($r['service']) ?></dd>
<?php foreach ($ex as $k => $val): ?><dt><?= h(ucfirst(str_replace('_', ' ', $k))) ?></dt><dd><?= h($val) ?></dd><?php endforeach; ?><dt>Page</dt><dd><?= h($r['page']) ?></dd><dt>Email to team</dt><dd><?= $r['mail_sent'] ? 'Delivered to recipients' : '<span class="danger">FAILED: ' . h($r['mail_error']) . '</span>' ?></dd></dl>
<h3>Message</h3><p class="pre"><?= h($r['message']) ?></p></div>
<form method="post" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="enq_update"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><h3>Manage</h3><label>Status<select name="status"><?php foreach (ENQ_STATUS as $k => $l): ?><option value="<?= $k ?>" <?= $r['status'] === $k ? 'selected' : '' ?>><?= $l ?></option><?php endforeach; ?></select></label><label>Internal notes<textarea name="notes" rows="8"><?= h($r['notes']) ?></textarea></label><button class="primary">Save</button></form></div>
<?php if (me()['role'] === 'owner'): ?><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="enq_delete"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><button class="link danger" onclick="return confirm('Permanently delete this enquiry?')">Delete enquiry</button></form><?php endif; } ?>

<?php elseif ($v === 'deletions' && can('deletions')):
    $fs = (string)($_GET['status'] ?? ''); $w = ''; $pa = []; if (isset(DEL_STATUS[$fs])) { $w = 'WHERE status=?'; $pa[] = $fs; }
    $rows = db_all("SELECT * FROM deletion_requests $w ORDER BY id DESC LIMIT 200", $pa); $counts = array_column(db_all('SELECT status, COUNT(*) c FROM deletion_requests GROUP BY status'), 'c', 'status'); ?>
<h1>Account deletion requests</h1><p class="muted">Public requests from <code>/delete-account</code>. Requests must have a confirmed email and a recorded identity check before they can be approved.</p>
<p class="chips2"><a href="/admin/?v=deletions" class="<?= $fs === '' ? 'on' : '' ?>">All</a><?php foreach (DEL_STATUS as $k => $l): ?><a href="/admin/?v=deletions&status=<?= $k ?>" class="<?= $fs === $k ? 'on' : '' ?>"><?= h($l) ?> (<?= (int)($counts[$k] ?? 0) ?>)</a><?php endforeach; ?></p>
<div class="table"><table><thead><tr><th>Received (UTC)</th><th>Ref</th><th>Requester</th><th>Scope</th><th>Email confirmed</th><th>Identity</th><th>Status</th></tr></thead><tbody>
<?php foreach ($rows as $r): ?><tr class="clk" onclick="location='/admin/?v=deletion&id=<?= (int)$r['id'] ?>'"><td><?= h(substr($r['created_at'], 0, 16)) ?></td><td><a href="/admin/?v=deletion&id=<?= (int)$r['id'] ?>"><?= h($r['ref']) ?></a></td><td><strong><?= h($r['full_name']) ?></strong><br><small><?= h($r['email']) ?></small></td><td><?= $r['scope'] === 'full_account' ? 'Full account' : 'Some data' ?></td><td><?= $r['email_verified_at'] ? '<span class="ok">yes</span>' : 'no' ?></td><td><?= (int)$r['identity_verified'] ? '<span class="ok">verified</span>' : '-' ?></td><td><?= badge($r['status'], DEL_STATUS[$r['status']] ?? $r['status']) ?></td></tr><?php endforeach; if (!$rows) { echo '<tr><td colspan="7" class="muted">No requests.</td></tr>'; } ?></tbody></table></div>

<?php elseif ($v === 'deletion' && can('deletions')): $r = db_one('SELECT * FROM deletion_requests WHERE id=?', [(int)($_GET['id'] ?? 0)]); if (!$r) { echo '<p>Not found.</p>'; } else {
    $ev = db_all('SELECT * FROM deletion_events WHERE request_id=? ORDER BY id DESC', [$r['id']]); $st = $r['status']; $open = !in_array($st, ['completed', 'rejected', 'cancelled', 'expired'], true);
    $retDefault = implode('; ', array_map(fn($x) => $x['data'] . ' (' . $x['period'] . ')', data('deletion')['retained'] ?? [])); ?>
<p><a href="/admin/?v=deletions">&larr; All deletion requests</a></p><h1><?= h($r['ref']) ?> <?= badge($st, DEL_STATUS[$st] ?? $st) ?></h1>
<div class="two"><div class="card"><dl class="facts"><dt>Name</dt><dd><?= h($r['full_name']) ?></dd><dt>Email</dt><dd><a href="mailto:<?= h($r['email']) ?>"><?= h($r['email']) ?></a></dd><dt>Phone</dt><dd><?= h($r['phone']) ?></dd><dt>Company</dt><dd><?= h($r['company']) ?></dd><dt>Account ID / username</dt><dd><?= h($r['account_id']) ?></dd><dt>Account type</dt><dd><?= h(['individual' => 'Individual', 'company_owner' => 'Company owner / admin', 'company_user' => 'User of a company account'][$r['account_type']] ?? $r['account_type']) ?></dd><dt>Scope</dt><dd><?= $r['scope'] === 'full_account' ? 'Delete the account and all associated personal data' : 'Delete some data only, keep account' ?></dd><dt>Details</dt><dd class="pre"><?= h($r['details']) ?></dd>
<dt>Submitted</dt><dd><?= h($r['created_at']) ?> UTC</dd><dt>Email confirmed</dt><dd><?= $r['email_verified_at'] ? '<span class="ok">' . h($r['email_verified_at']) . ' UTC</span>' : 'Not yet' ?></dd><dt>Identity verified</dt><dd><?= (int)$r['identity_verified'] ? '<span class="ok">Yes</span> &middot; ' . h($r['verification_method']) . '<br><small>' . h($r['verification_notes']) . '</small>' : 'No' ?></dd><dt>Assigned to</dt><dd><?= h($r['assigned_to']) ?></dd>
<?php if ($r['webhook_status']): ?><dt>Platform webhook</dt><dd><?= h($r['webhook_status']) ?></dd><?php endif; ?><?php if ($r['completed_at']): ?><dt>Closed</dt><dd><?= h($r['completed_at']) ?> UTC</dd><?php endif; ?><?php if ($r['platform_ref']): ?><dt>Platform reference</dt><dd><?= h($r['platform_ref']) ?></dd><?php endif; ?><?php if ($r['retained_summary']): ?><dt>Retained data told to requester</dt><dd><?= h($r['retained_summary']) ?></dd><?php endif; ?><?php if ($r['decision_note']): ?><dt>Decision note</dt><dd><?= h($r['decision_note']) ?></dd><?php endif; ?></dl></div>

<div>
<?php if ($open): ?>
<div class="card"><h3>Staff checklist</h3><ol class="check-steps"><li class="<?= $r['email_verified_at'] ? 'done' : '' ?>">Requester confirmed email link</li><li class="<?= (int)$r['identity_verified'] ? 'done' : '' ?>">Identity matched to the platform account (name, registered email, account ID)</li><li class="<?= in_array($st, ['approved', 'completed'], true) ? 'done' : '' ?>">Approved</li><li class="<?= $st === 'completed' ? 'done' : '' ?>">Data deleted in the tracking platform, reference recorded</li></ol></div>
<?php if ($st === 'pending_email'): ?><form method="post" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="del_do"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><input type="hidden" name="do" value="resend"><p>Waiting for the requester to confirm their email.</p><button>Resend verification email</button></form><?php endif; ?>
<?php if ($st === 'awaiting_review'): ?><form method="post" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="del_do"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><input type="hidden" name="do" value="start_review"><button class="primary">Start review (assign to me)</button></form><?php endif; ?>
<?php if (in_array($st, ['awaiting_review', 'in_review'], true)): ?>
<form method="post" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="del_do"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><input type="hidden" name="do" value="verify_identity"><h3>Record identity verification</h3>
<label>Method<select name="method"><option value="">Select</option><option>Name and registered email match the platform account</option><option>Account ID / username and email match the platform account</option><option>Callback or message to registered phone number completed</option><option>Additional proof provided by requester</option><option>Verified by company account owner</option></select></label><label>What did you check?<textarea name="note" rows="3" required placeholder="e.g. User ID 4821 in platform, registered email matches, last login 2026-10-02"></textarea></label><button>Save verification</button></form>
<form method="post" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="del_do"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><input type="hidden" name="do" value="approve"><h3>Approve deletion</h3><p class="small muted">Requires confirmed email and verified identity.<?= DELETION_WEBHOOK_URL !== '' ? ' A signed notification is sent to the platform webhook.' : ' No platform webhook is configured: delete the data manually in the platform, then mark as completed.' ?></p><label>Note<input name="note" placeholder="Optional"></label><button class="primary" onclick="return confirm('Approve this deletion request?')">Approve</button></form>
<?php endif; ?>
<?php if ($st === 'approved'): ?><form method="post" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="del_do"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><input type="hidden" name="do" value="complete"><h3>Mark deletion completed</h3><p class="small muted">Only after the data has actually been deleted in the tracking platform.</p><label>Platform reference / confirmation<input name="platform_ref" required placeholder="e.g. platform user #4821 and 3 devices deleted"></label><label>Data retained (sent to requester)<textarea name="retained" rows="3"><?= h($retDefault) ?></textarea></label><button class="primary" onclick="return confirm('Confirm that the data was deleted from the platform? The requester will be emailed.')">Mark completed &amp; email requester</button></form><?php endif; ?>
<form method="post" class="card"><?= csrf_field() ?><input type="hidden" name="action" value="del_do"><input type="hidden" name="id" value="<?= (int)$r['id'] ?>"><h3>Other actions</h3><label>Note / reason<textarea name="note" rows="2"></textarea></label><button name="do" value="note">Add internal note</button> <button name="do" value="reject" class="danger-btn" onclick="return confirm('Reject and email the requester with this reason?')">Reject (emails reason)</button> <button name="do" value="cancel" onclick="return confirm('Cancel this request?')">Cancel</button></form>
<?php endif; ?>
<div class="card"><h3>Audit trail</h3><ul class="timeline"><?php foreach ($ev as $e): ?><li><time><?= h($e['at']) ?> UTC</time><strong><?= h(str_replace('_', ' ', $e['action'])) ?></strong> <span class="muted">by <?= h($e['actor']) ?></span><?php if ($e['note']): ?><br><span class="pre"><?= h($e['note']) ?></span><?php endif; ?></li><?php endforeach; ?></ul></div>
</div></div>
<?php } ?>

<?php elseif ($v === 'users' && can('users')): $us = db_all('SELECT * FROM admins ORDER BY id'); ?>
<h1>Website accounts</h1><p class="muted"><?= odoo_enabled() ? 'Staff sign in through ITrackZen Management, where their role and permissions are managed. Accounts below marked "management" were created automatically on first sign-in and cannot have a password here. Local accounts are for emergencies only.' : 'Owner: everything. Editor: content, SEO, media, brand. Support: enquiries and deletion requests.' ?></p>
<div class="table"><table><thead><tr><th>User</th><th>Source</th><th>Role</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody><?php foreach ($us as $u): ?><tr><td><?= h($u['display_name'] ?: $u['username']) ?><br><small class="muted"><?= h($u['username']) ?></small></td><td><?= ($u['source'] ?? 'local') === 'odoo' ? 'management' : 'local' ?></td><td><?= h($u['role']) ?></td><td><?= h($u['last_login']) ?></td><td><?= $u['active'] ? 'Active' : 'Disabled' ?></td><td>
<?php if ((int)$u['id'] !== (int)me()['id']): ?><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="user_toggle"><input type="hidden" name="id" value="<?= (int)$u['id'] ?>"><button class="link"><?= $u['active'] ? 'Disable' : 'Enable' ?></button></form> &middot; <?php endif; ?>
<?php if (($u['source'] ?? 'local') !== 'odoo'): ?><form method="post" class="inline"><?= csrf_field() ?><input type="hidden" name="action" value="user_password"><input type="hidden" name="id" value="<?= (int)$u['id'] ?>"><input type="password" name="password" placeholder="new password" minlength="10" style="width:150px"> <button class="link">Set password</button></form><?php endif; ?></td></tr><?php endforeach; ?></tbody></table></div>
<form method="post" class="card narrow"><?= csrf_field() ?><input type="hidden" name="action" value="user_add"><h3>Add user</h3><label>Username<input name="username" required pattern="[a-z0-9._-]{3,32}"></label><label>Role<select name="role"><option value="support">Support</option><option value="editor">Editor</option><option value="owner">Owner</option></select></label><label>Password (min 10)<input type="password" name="password" required minlength="10"></label><button class="primary">Create user</button></form>

<?php elseif ($v === 'log' && can('users')): $lg = db_all('SELECT * FROM admin_log ORDER BY id DESC LIMIT 300'); ?>
<h1>Activity log</h1><div class="table"><table><thead><tr><th>When (UTC)</th><th>User</th><th>Action</th><th>Detail</th></tr></thead><tbody><?php foreach ($lg as $l): ?><tr><td><?= h($l['at']) ?></td><td><?= h($l['actor']) ?></td><td><?= h($l['action']) ?></td><td><?= h($l['detail']) ?></td></tr><?php endforeach; ?></tbody></table></div>

<?php elseif ($v === 'account'): ?>
<h1>Account</h1><p class="muted">Signed in as <strong><?= h(actor()) ?></strong> (<?= h(me()['role']) ?>).</p>
<?php if (!empty(me()['sso'])): ?><p class="alert info">Your password and two-step verification are managed in ITrackZen Management (<a href="<?= h(odoo_url('/odoo/my-preferences')) ?>">open my preferences</a>).</p><?php else: ?><form method="post" class="card narrow"><?= csrf_field() ?><input type="hidden" name="action" value="password"><label>Current password<input type="password" name="current" required autocomplete="current-password"></label><label>New password (min 10 characters)<input type="password" name="new" required minlength="10" autocomplete="new-password"></label><button class="primary">Change password</button></form><?php endif; ?>
<h2>Delivery settings</h2><p class="muted">Email: <strong><?= SMTP_HOST !== '' ? 'SMTP via ' . h(SMTP_HOST) : 'PHP mail() fallback (configure SMTP in includes/config.local.php for reliable delivery)' ?></strong>. Enquiry recipients: <strong><?= h(implode(', ', (array)site('form_recipients', []))) ?></strong>. Deletion notifications: <strong><?= h(implode(', ', del_recipients())) ?></strong>. Database: <strong><?= db_is_mysql() ? 'MySQL' : 'SQLite' ?></strong>. Platform deletion webhook: <strong><?= DELETION_WEBHOOK_URL !== '' ? 'configured' : 'not configured (manual deletion)' ?></strong>.</p>

<?php else: $recent = db_all('SELECT * FROM enquiries ORDER BY id DESC LIMIT 5'); $recentDel = db_all("SELECT * FROM deletion_requests ORDER BY id DESC LIMIT 5");
    $summary = $sso ? odoo_summary((int)me()['odoo_uid']) : null; ?>
<?php if ($sso): ?>
<section class="hero">
  <div><h1>Hello, <?= h(explode(' ', trim(display_name()))[0]) ?></h1>
  <p><?php foreach ((array)(me()['roles'] ?? []) as $r): ?><span class="chip"><?= h(str_replace('_', ' ', $r)) ?></span><?php endforeach; ?></p></div>
  <div class="hero-actions"><a class="btn-light" href="<?= h(odoo_url('/odoo')) ?>">Open management system</a></div>
</section>
<?php if ($summary): $bySection = []; foreach ((array)$summary['tiles'] as $t) { $bySection[$t['section']][] = $t; } ?>
<?php foreach ($bySection as $title => $tiles): ?>
<h2 class="sec"><?= h($title) ?></h2>
<div class="tiles">
<?php foreach ($tiles as $t): $val = !empty($t['money']) ? ($summary['currency']['symbol'] ?? '') . ' ' . number_format((float)$t['value'], 0) : (string)$t['value']; $href = !empty($t['path']) ? odoo_url((string)$t['path']) : odoo_url('/odoo'); ?>
<a class="tile <?= in_array($t['tone'], ['danger', 'warning'], true) ? 'warn' : '' ?>" href="<?= h($href) ?>"><b><?= h($val) ?></b><span><?= h((string)$t['label']) ?></span></a>
<?php endforeach; ?>
</div>
<?php endforeach; ?>
<?php else: ?><p class="alert info">The management system did not answer, so operations figures are not shown right now. Use <strong>Operations</strong> in the menu to open it directly.</p><?php endif; ?>
<h2 class="sec">Website</h2>
<?php elseif (odoo_enabled()): ?>
<p class="alert info">You are signed in with a local website account. <a href="/admin/sso.php?start=1">Sign in with ITrackZen Management</a> to see operations: quotations, stock, installations, payments, subscriptions and tasks.</p>
<h1>Dashboard</h1>
<?php else: ?>
<h1>Dashboard</h1>
<?php endif; ?>
<div class="tiles">
<?php if (can('enquiries')): ?><a class="tile" href="/admin/?v=enquiries&status=new"><b><?= $newEnq ?></b><span>New enquiries</span></a><?php endif; ?>
<?php if (can('deletions')): ?><a class="tile <?= $openDel ? 'warn' : '' ?>" href="/admin/?v=deletions"><b><?= $openDel ?></b><span>Deletion requests to handle</span></a><a class="tile" href="/admin/?v=deletions&status=pending_email"><b><?= (int)db_val("SELECT COUNT(*) FROM deletion_requests WHERE status='pending_email'") ?></b><span>Awaiting email confirmation</span></a><?php endif; ?>
<?php if (can('content')): ?><a class="tile" href="/admin/?v=content"><b><?= count(DATASETS) ?></b><span>Editable content sections</span></a><?php endif; ?>
</div>
<?php if (can('deletions')): ?><p class="alert info">Public account deletion page: <a href="<?= h(abs_url('/delete-account')) ?>" target="_blank" rel="noopener"><strong><?= h(abs_url('/delete-account')) ?></strong></a>. Use this exact URL in Google Play Console &rarr; App content &rarr; Data safety.</p><?php endif; ?>
<div class="two">
<?php if (can('enquiries')): ?><div class="card"><h3>Latest enquiries</h3><?php foreach ($recent as $r): ?><p><a href="/admin/?v=enquiry&id=<?= (int)$r['id'] ?>"><?= h($r['ref']) ?></a> <?= badge($r['status'], ENQ_STATUS[$r['status']] ?? '') ?><br><small><?= h($r['full_name']) ?> &middot; <?= h($r['country']) ?> &middot; <?= h(ENQ_TYPE[$r['type']] ?? '') ?></small></p><?php endforeach; if (!$recent) { echo '<p class="muted">None yet.</p>'; } ?></div><?php endif; ?>
<?php if (can('deletions')): ?><div class="card"><h3>Latest deletion requests</h3><?php foreach ($recentDel as $r): ?><p><a href="/admin/?v=deletion&id=<?= (int)$r['id'] ?>"><?= h($r['ref']) ?></a> <?= badge($r['status'], DEL_STATUS[$r['status']] ?? '') ?><br><small><?= h($r['full_name']) ?> &middot; <?= h($r['email']) ?></small></p><?php endforeach; if (!$recentDel) { echo '<p class="muted">None yet.</p>'; } ?></div><?php endif; ?>
</div>
<?php endif; ?>
</main>
<?php endif; ?></body></html>
