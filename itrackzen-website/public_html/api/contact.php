<?php
/**
 * Enquiry endpoint: contact, quote, demo and partnership forms.
 * Stores every enquiry in the database (so none are lost) and emails site.json -> form_recipients
 * (default: info@libdexltd.com + sales@itrackzen.net).
 */
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/forms.php';
require __DIR__ . '/../includes/mailer.php';

$wantsJson = (stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false) || (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch');

function respond(bool $ok, string $msg, int $status = 200, string $redirect = ''): never
{
    global $wantsJson;
    if ($wantsJson) {
        http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
        echo json_encode(['ok' => $ok, 'message' => $msg, 'redirect' => $redirect]);
    } else {
        $to = $ok ? ($redirect ?: '/thank-you') : (($_SERVER['HTTP_REFERER'] ?? '/contact-sales') ?: '/contact-sales');
        $to = preg_replace('#^https?://[^/]+#i', '', $to);
        if (!$ok) { $to .= (str_contains($to, '?') ? '&' : '?') . 'form_error=' . rawurlencode($msg); }
        header('Location: ' . $to, true, 303);
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); respond(false, 'Method not allowed.', 405); }
header('X-Robots-Tag: noindex');

/* ---- anti-spam: honeypot, signed time token, rate limit ---- */
if (trim((string)($_POST['website'] ?? '')) !== '') { respond(true, 'Thank you.'); }
if (!form_token_ok((string)($_POST['token'] ?? ''))) { respond(false, 'Your session expired or the form was submitted too quickly. Please reload the page and try again.', 400); }
$ip = client_ip();
if ((int)db_val('SELECT COUNT(*) FROM enquiries WHERE ip=? AND created_at > ?', [$ip, gmdate('Y-m-d H:i:s', time() - 3600)]) >= 8) {
    respond(false, 'Too many requests from your connection. Please try again later or contact us on WhatsApp.', 429);
}

function field(string $k, int $max): string
{
    $v = preg_replace('/[^\P{C}\n\t]+/u', '', (string)($_POST[$k] ?? '')) ?? '';
    return mb_substr(trim($v), 0, $max);
}
$type = $_POST['form_type'] ?? 'contact';
$type = $type === 'sales' ? 'contact' : $type;
if (!in_array($type, ['contact', 'quote', 'demo', 'partner'], true)) { $type = 'contact'; }
$d = [
    'full_name' => str_replace(["\r", "\n"], ' ', field('full_name', 120)), 'company' => field('company', 160), 'country' => field('country', 80),
    'phone' => field('phone', 40), 'email' => field('email', 160), 'vehicles' => field('vehicles', 24), 'service' => field('service', 160), 'message' => field('message', 5000),
];
$extra = [];
foreach (['preferred_time' => 120, 'hardware' => 80, 'plan' => 80, 'website_url' => 160, 'partnership_type' => 80] as $k => $max) { if (($v = field($k, $max)) !== '') { $extra[$k] = $v; } }

$errors = [];
if (mb_strlen($d['full_name']) < 2) { $errors[] = 'Please enter your full name.'; }
if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) { $errors[] = 'Please enter a valid email address.'; }
if ($d['phone'] === '' || !preg_match('/^[0-9+()\-\s.]{6,40}$/', $d['phone'])) { $errors[] = 'Please enter a valid phone / WhatsApp number.'; }
if ($d['country'] === '') { $errors[] = 'Please select your country.'; }
if ($type === 'partner' && ($d['company'] === '' || mb_strlen($d['message']) < 10)) { $errors[] = 'Please add your company name and a short description of the partnership you have in mind.'; }
if (empty($_POST['consent'])) { $errors[] = 'Please accept the contact consent box.'; }
if ($errors) { respond(false, implode(' ', $errors), 422); }

$labels = ['contact' => 'Contact Enquiry', 'quote' => 'Quote Request', 'demo' => 'Demo Request', 'partner' => 'Partnership Enquiry'];
$label = $labels[$type];
$ref = make_ref(['contact' => 'ENQ', 'quote' => 'QTE', 'demo' => 'DEM', 'partner' => 'PRT'][$type]);
$page = preg_replace('#^https?://[^/]+#i', '', (string)($_SERVER['HTTP_REFERER'] ?? ''));
$id = db_insert('enquiries', $d + ['ref' => $ref, 'type' => $type, 'status' => 'new', 'extra' => $extra ? json_encode($extra, JSON_UNESCAPED_UNICODE) : null, 'page' => mb_substr($page, 0, 255),
    'ip' => $ip, 'mail_sent' => 0, 'created_at' => now_utc(), 'updated_at' => now_utc()]);

$rows = ['Reference' => $ref, 'Type' => $label, 'Full name' => $d['full_name'], 'Company' => $d['company'], 'Country' => $d['country'], 'Phone / WhatsApp' => $d['phone'], 'Email' => $d['email'],
    'Vehicles' => $d['vehicles'], 'Service / interest' => $d['service']];
foreach ($extra as $k => $v) { $rows[ucfirst(str_replace('_', ' ', $k))] = $v; }
$rows += ['Message' => $d['message'], 'Page' => $page, 'Submitted (UTC)' => now_utc()];
[$text, $html] = mail_wrap($label . ' from ' . $d['full_name'], ['Reply to this email to respond directly to the sender.'], ['Open in dashboard', abs_url('/admin/?v=enquiry&id=' . $id)], $rows);
$recipients = array_values(array_filter((array)site('form_recipients', []), fn($m) => filter_var($m, FILTER_VALIDATE_EMAIL))) ?: ['info@libdexltd.com', 'sales@itrackzen.net'];
[$sent, $err] = send_mail($recipients, '[ITrackZen] ' . $label . ' ' . $ref . ' - ' . $d['full_name'] . ($d['company'] !== '' ? ' (' . $d['company'] . ')' : ''), $text, $html, $d['email'], $d['full_name']);
db_update('enquiries', $id, ['mail_sent' => $sent ? 1 : 0, 'mail_error' => $err]);

if (!$sent) {
    error_log('[ITrackZen] enquiry mail failed: ' . $err);
    respond(false, 'We saved your request (reference ' . $ref . '), but our email service is temporarily unavailable. Please email ' . site('emails.sales') . ' or message us on WhatsApp so we can help right away.', 502);
}
respond(true, 'Thank you! Your message has been sent to our team. Reference: ' . $ref . '.', 200, '/thank-you?type=' . $type . '&ref=' . $ref);
