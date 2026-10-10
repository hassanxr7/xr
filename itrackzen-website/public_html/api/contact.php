<?php
/**
 * Form endpoint for Contact Sales, Demo and Account Deletion requests.
 * Delivers to site.json -> form_recipients (default: info@libdexltd.com + sales@itrackzen.net)
 * and always logs to data/inquiries.jsonl so no lead is lost.
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
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(['ok' => $ok, 'message' => $msg, 'redirect' => $redirect]);
    } else {
        $to = $ok ? ($redirect ?: '/thank-you') : (($_SERVER['HTTP_REFERER'] ?? '/contact-sales') ?: '/contact-sales');
        $to = preg_replace('#^https?://[^/]+#i', '', $to);
        if (!$ok) { $to .= (str_contains($to, '?') ? '&' : '?') . 'form_error=' . rawurlencode($msg); }
        header('Location: ' . $to, true, 303);
    }
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(false, 'Method not allowed.', 405);
}
header('X-Robots-Tag: noindex');

/* ---- anti-spam: honeypot, signed time token, rate limit ---- */
if (trim((string)($_POST['website'] ?? '')) !== '') { respond(true, 'Thank you.', 200); } // silently drop bots
if (!form_token_ok((string)($_POST['token'] ?? ''))) {
    respond(false, 'Your session expired or the form was submitted too quickly. Please reload the page and try again.', 400);
}
$rlDir = DATA_DIR . '/ratelimit';
if (!is_dir($rlDir)) { @mkdir($rlDir, 0755, true); }
$rlFile = $rlDir . '/' . hash('sha256', client_ip()) . '.json';
$now = time();
$hits = is_file($rlFile) ? (json_decode((string)file_get_contents($rlFile), true) ?: []) : [];
$hits = array_values(array_filter($hits, fn($t) => $now - (int)$t < 3600));
if (count($hits) >= 6) { respond(false, 'Too many requests from your connection. Please try again later or contact us on WhatsApp.', 429); }

/* ---- validate ---- */
function field(string $k, int $max): string
{
    $v = (string)($_POST[$k] ?? '');
    $v = preg_replace('/[^\P{C}\n\t]+/u', '', $v) ?? '';
    return mb_substr(trim($v), 0, $max);
}
$type = in_array($_POST['form_type'] ?? '', ['sales', 'demo', 'delete'], true) ? $_POST['form_type'] : 'sales';
$d = [
    'full_name' => field('full_name', 120), 'company' => field('company', 160), 'country' => field('country', 80),
    'phone' => field('phone', 40), 'email' => field('email', 160), 'vehicles' => field('vehicles', 20),
    'service' => field('service', 120), 'preferred_time' => field('preferred_time', 120), 'message' => field('message', 5000),
];
$d['full_name'] = str_replace(["\r", "\n"], ' ', $d['full_name']);
$errors = [];
if (mb_strlen($d['full_name']) < 2) { $errors[] = 'Please enter your full name.'; }
if (!filter_var($d['email'], FILTER_VALIDATE_EMAIL)) { $errors[] = 'Please enter a valid email address.'; }
if ($type !== 'delete') {
    if ($d['phone'] === '' || !preg_match('/^[0-9+()\-\s.]{6,40}$/', $d['phone'])) { $errors[] = 'Please enter a valid phone / WhatsApp number.'; }
    if ($d['country'] === '') { $errors[] = 'Please select your country.'; }
    if (empty($_POST['consent'])) { $errors[] = 'Please accept the contact consent box.'; }
} else {
    if (empty($_POST['confirm'])) { $errors[] = 'Please confirm that you are authorised to request deletion.'; }
}
if ($errors) { respond(false, implode(' ', $errors), 422); }

/* ---- compose ---- */
$labels = ['sales' => 'Sales Inquiry', 'demo' => 'Demo Request', 'delete' => 'Account/Data Deletion Request'];
$label = $labels[$type];
$subject = '[ITrackZen] ' . $label . ' - ' . $d['full_name'] . ($d['company'] !== '' ? ' (' . $d['company'] . ')' : '');
$rows = [
    'Type' => $label, 'Full Name' => $d['full_name'], 'Company' => $d['company'], 'Country' => $d['country'],
    'Phone / WhatsApp' => $d['phone'], 'Email' => $d['email'], 'Number of Vehicles' => $d['vehicles'],
    'Interested Service' => $d['service'], 'Preferred Time' => $d['preferred_time'], 'Message' => $d['message'],
    'Page' => preg_replace('#^https?://[^/]+#i', '', $_SERVER['HTTP_REFERER'] ?? ''), 'IP' => client_ip(),
    'Submitted (UTC)' => gmdate('Y-m-d H:i:s'),
];
$text = '';
$html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0a1f44"><div style="background:#0a1f44;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0"><strong style="font-size:18px">ITrackZen</strong> &nbsp;<span style="color:#9db7e3">' . e($label) . '</span></div><table style="width:100%;border-collapse:collapse;border:1px solid #dbe5f5">';
foreach ($rows as $k => $v) {
    if ($v === '') { continue; }
    $text .= $k . ': ' . $v . "\n";
    $html .= '<tr><td style="padding:10px 14px;border-bottom:1px solid #eef3fb;background:#f6f9ff;width:170px;font-weight:bold;vertical-align:top">' . e($k) . '</td><td style="padding:10px 14px;border-bottom:1px solid #eef3fb;vertical-align:top">' . nl2br(e($v)) . '</td></tr>';
}
$html .= '</table><p style="font-size:12px;color:#6b7ea3">Reply to this email to respond directly to ' . e($d['full_name']) . '.</p></div>';

$recipients = array_values(array_filter((array)site('form_recipients', []), fn($m) => filter_var($m, FILTER_VALIDATE_EMAIL)));
if (!$recipients) { $recipients = ['info@libdexltd.com', 'sales@itrackzen.net']; }

[$sent, $err] = send_mail($recipients, $subject, $text, $html, $d['email'], $d['full_name']);

/* ---- always log ---- */
$hits[] = $now;
@file_put_contents($rlFile, json_encode($hits), LOCK_EX);
$log = ['time' => gmdate('c'), 'type' => $type, 'mail_sent' => $sent, 'mail_error' => $err] + $d + ['ip' => client_ip()];
@file_put_contents(DATA_DIR . '/inquiries.jsonl', json_encode($log, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);

if (!$sent) {
    error_log('[ITrackZen] mail failed: ' . $err);
    respond(false, 'We saved your request, but our email service is temporarily unavailable. Please email ' . site('emails.sales') . ' or message us on WhatsApp so we can help right away.', 502);
}
respond(true, 'Thank you! Your message has been sent to our team. We will reply shortly.', 200, '/thank-you?type=' . $type);
