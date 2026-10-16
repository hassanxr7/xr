<?php
/** Public endpoint: submit an account/data deletion request. */
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/forms.php';
require __DIR__ . '/../includes/mailer.php';
require __DIR__ . '/../includes/deletion.php';

$json = (stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false);
function dr_out(bool $ok, string $msg, int $status = 200, array $extra = []): never
{
    global $json;
    if ($json) { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo json_encode(['ok' => $ok, 'message' => $msg] + $extra); }
    else { $to = $ok ? '/delete-account?submitted=' . rawurlencode($extra['ref'] ?? '') : '/delete-account?form_error=' . rawurlencode($msg); header('Location: ' . $to, true, 303); }
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { header('Allow: POST'); dr_out(false, 'Method not allowed.', 405); }
header('X-Robots-Tag: noindex');
if (trim((string)($_POST['website'] ?? '')) !== '') { dr_out(true, 'Thank you.'); }
if (!form_token_ok((string)($_POST['token'] ?? ''))) { dr_out(false, 'Your session expired or the form was submitted too quickly. Please reload the page and try again.', 400); }

function f(string $k, int $max): string { $v = preg_replace('/[^\P{C}\n\t]+/u', '', (string)($_POST[$k] ?? '')) ?? ''; return mb_substr(trim($v), 0, $max); }
$in = ['full_name' => str_replace(["\r", "\n"], ' ', f('full_name', 120)), 'email' => f('email', 160), 'phone' => f('phone', 40), 'company' => f('company', 160), 'account_id' => f('account_id', 160),
       'account_type' => f('account_type', 24), 'scope' => f('scope', 24), 'details' => f('details', 3000)];
$err = [];
if (mb_strlen($in['full_name']) < 2) { $err[] = 'Please enter your full name.'; }
if (!filter_var($in['email'], FILTER_VALIDATE_EMAIL)) { $err[] = 'Please enter the email address registered on your account.'; }
if (!in_array($in['account_type'], ['individual', 'company_owner', 'company_user'], true)) { $err[] = 'Please choose your account type.'; }
if (!in_array($in['scope'], ['full_account', 'data_only'], true)) { $err[] = 'Please choose what you want deleted.'; }
if ($in['phone'] !== '' && !preg_match('/^[0-9+()\-\s.]{6,40}$/', $in['phone'])) { $err[] = 'Please enter a valid phone number or leave it empty.'; }
if (empty($_POST['confirm'])) { $err[] = 'Please confirm that you are the account holder or authorised to make this request.'; }
if ($err) { dr_out(false, implode(' ', $err), 422); }

// rate limits: per IP (6/hour) and per email (3 per 24h)
$ip = client_ip();
if ((int)db_val('SELECT COUNT(*) FROM deletion_requests WHERE ip=? AND created_at > ?', [$ip, gmdate('Y-m-d H:i:s', time() - 3600)]) >= 6
    || (int)db_val('SELECT COUNT(*) FROM deletion_requests WHERE email=? AND created_at > ?', [strtolower($in['email']), gmdate('Y-m-d H:i:s', time() - 86400)]) >= 3) {
    dr_out(false, 'Too many requests. Please try again later or email ' . site('emails.info') . '.', 429);
}
try { [$r, $mailOk, $mailErr] = del_create($in, $ip); }
catch (Throwable $e) { error_log('[ITrackZen] deletion create: ' . $e->getMessage()); dr_out(false, 'We could not record your request. Please email ' . site('emails.info') . ' instead.', 500); }
if (!$mailOk) {
    error_log('[ITrackZen] deletion verification mail failed: ' . $mailErr);
    // The request is saved; staff can resend the verification email from the dashboard.
    del_event((int)$r['id'], 'system', 'needs_manual_followup', 'Verification email could not be delivered');
    [$t, $h] = mail_wrap('Deletion request needs manual follow-up', ['The verification email for request ' . $r['ref'] . ' could not be delivered to ' . $r['email'] . '. Please contact the requester.'], ['Open request', abs_url('/admin/?v=deletion&id=' . $r['id'])]);
    send_mail(del_recipients(), '[ITrackZen] Deletion request ' . $r['ref'] . ' needs follow-up', $t, $h);
}
dr_out(true, $mailOk
    ? 'Request received. We have emailed a confirmation link to ' . $in['email'] . '. Please open it to confirm your request.'
    : 'Request received (reference ' . $r['ref'] . '). We could not send the confirmation email automatically, so our support team will contact you at ' . $in['email'] . '.',
    200, ['ref' => $r['ref'], 'email_sent' => $mailOk]);
