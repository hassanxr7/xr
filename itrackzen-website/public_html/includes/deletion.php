<?php
/**
 * Account & data deletion workflow.
 *
 * pending_email  -> requester must confirm the link we email to the address they supplied
 * awaiting_review-> email confirmed, queued for support staff
 * in_review      -> staff verifying identity against the platform account
 * approved       -> identity verified, deletion authorised (optional signed webhook to the platform)
 * completed      -> data deleted on the platform; reference + retained-data summary recorded
 * rejected / cancelled / expired
 */
require_once __DIR__ . '/odoo.php';

const DEL_STATUS = [
    'pending_email' => 'Waiting for email confirmation', 'awaiting_review' => 'Awaiting review', 'in_review' => 'Identity check in progress',
    'approved' => 'Approved, deletion in progress', 'completed' => 'Completed', 'rejected' => 'Rejected', 'cancelled' => 'Cancelled', 'expired' => 'Expired (never confirmed)',
];

function del_cfg(): array { return data('deletion'); }

function del_event(int $id, string $actor, string $action, string $note = ''): void
{
    db_insert('deletion_events', ['request_id' => $id, 'at' => now_utc(), 'actor' => $actor, 'action' => $action, 'note' => $note]);
}

function del_recipients(): array
{
    $to = array_values(array_filter((array)(del_cfg()['notify'] ?? []), fn($m) => filter_var($m, FILTER_VALIDATE_EMAIL)));
    if (!$to) { $to = array_values(array_filter((array)site('form_recipients', []), fn($m) => filter_var($m, FILTER_VALIDATE_EMAIL))); }
    return $to ?: ['info@libdexltd.com'];
}

function del_timeframe(): string { return (string)(del_cfg()['timeframe_days'] ?? 30); }

function del_new_token(int $id): string
{
    $tok = bin2hex(random_bytes(32));
    db_update('deletion_requests', $id, ['token_hash' => hash('sha256', $tok), 'token_expires' => gmdate('Y-m-d H:i:s', time() + 48 * 3600), 'updated_at' => now_utc()]);
    return $tok;
}

function del_send_verification(array $r, string $tok): array
{
    $url = abs_url('/delete-account/verify?ref=' . rawurlencode($r['ref']) . '&token=' . $tok);
    [$t, $h] = mail_wrap('Confirm your account deletion request', [
        'Hello ' . $r['full_name'] . ',',
        'We received a request to delete an ITrackZen account and its associated data (reference ' . $r['ref'] . '). To confirm that this request came from you, please confirm it using the button below. The link is valid for 48 hours.',
        'If you did not make this request, ignore this email. Nothing will be deleted unless the request is confirmed.',
    ], ['Confirm deletion request', $url]);
    return send_mail([$r['email']], 'Confirm your ITrackZen account deletion request (' . $r['ref'] . ')', $t, $h, site('emails.info'), site('brand') . ' Support');
}

function del_create(array $in, string $ip): array
{
    $ref = make_ref('DEL');
    $id = db_insert('deletion_requests', [
        'ref' => $ref, 'status' => 'pending_email', 'full_name' => $in['full_name'], 'email' => strtolower($in['email']), 'phone' => $in['phone'], 'company' => $in['company'],
        'account_id' => $in['account_id'], 'account_type' => $in['account_type'], 'scope' => $in['scope'], 'details' => $in['details'], 'ip' => $ip,
        'identity_verified' => 0, 'created_at' => now_utc(), 'updated_at' => now_utc(),
    ]);
    del_event($id, 'requester', 'request_submitted', 'Scope: ' . $in['scope'] . '; account type: ' . $in['account_type']);
    $r = db_one('SELECT * FROM deletion_requests WHERE id=?', [$id]);
    $tok = del_new_token($id);
    [$ok, $err] = del_send_verification($r, $tok);
    del_event($id, 'system', $ok ? 'verification_email_sent' : 'verification_email_failed', $err);
    return [$r, $ok, $err];
}

/** Confirm via emailed link. Returns [bool, message, request|null] */
function del_confirm_email(string $ref, string $token): array
{
    $r = db_one('SELECT * FROM deletion_requests WHERE ref=?', [$ref]);
    if (!$r) { return [false, 'This confirmation link is not valid.', null]; }
    if ($r['status'] !== 'pending_email') { return [true, 'This request has already been confirmed.', $r]; }
    if (!$r['token_hash'] || !hash_equals($r['token_hash'], hash('sha256', $token))) { return [false, 'This confirmation link is not valid.', null]; }
    if ($r['token_expires'] < now_utc()) { return [false, 'This confirmation link has expired. Please submit a new request.', null]; }
    db_update('deletion_requests', (int)$r['id'], ['status' => 'awaiting_review', 'email_verified_at' => now_utc(), 'token_hash' => null, 'updated_at' => now_utc()]);
    if (function_exists('odoo_push')) { odoo_push('deletion.created', ['ref' => $r['ref'], 'status' => 'awaiting_review', 'scope' => $r['scope']], $r['ref']); }
    del_event((int)$r['id'], 'requester', 'email_confirmed', 'Requester confirmed ownership of ' . $r['email']);
    $r = db_one('SELECT * FROM deletion_requests WHERE id=?', [$r['id']]);
    // notify support
    [$t, $h] = mail_wrap('New account deletion request (verified email)', ['A requester has confirmed their email address. Please review and verify the account holder\'s identity in the admin dashboard.'],
        ['Open request', abs_url('/admin/?v=deletion&id=' . $r['id'])], ['Reference' => $r['ref'], 'Name' => $r['full_name'], 'Email' => $r['email'], 'Phone' => $r['phone'], 'Company' => $r['company'], 'Account ID / username' => $r['account_id'], 'Account type' => $r['account_type'], 'Scope' => $r['scope'], 'Details' => $r['details']]);
    [$ok, $err] = send_mail(del_recipients(), '[ITrackZen] Deletion request ' . $r['ref'] . ' ready for review', $t, $h, $r['email'], $r['full_name']);
    del_event((int)$r['id'], 'system', $ok ? 'support_notified' : 'support_notify_failed', $err);
    // acknowledge to requester
    [$t, $h] = mail_wrap('We received your deletion request', [
        'Hello ' . $r['full_name'] . ',',
        'Thank you for confirming your email. Your request (reference ' . $r['ref'] . ') is now with our support team.',
        'We will verify that you are the account holder, then delete the account data described on our Account & Data Deletion page. We aim to complete verified requests within ' . del_timeframe() . ' days and will email you when it is done. We may contact you if we need extra information to verify your identity.',
    ]);
    send_mail([$r['email']], 'Your ITrackZen deletion request ' . $r['ref'] . ' was received', $t, $h, site('emails.info'), site('brand') . ' Support');
    return [true, 'Thank you. Your email is confirmed and your request is now with our support team.', $r];
}

function del_set(int $id, string $actor, string $status, array $extra, string $action, string $note = ''): void
{
    db_update('deletion_requests', $id, ['status' => $status, 'updated_at' => now_utc()] + $extra);
    del_event($id, $actor, $action, $note);
    // Let staff see the request (and its outcome) in the management system
    if (function_exists('odoo_push')) {
        $ref = (string)db_val('SELECT ref FROM deletion_requests WHERE id=?', [$id]);
        odoo_push('deletion.updated', ['ref' => $ref, 'status' => $status], $ref . ':' . $status);
    }
}

function del_webhook(array $r, string $actor): string
{
    if (DELETION_WEBHOOK_URL === '') { return 'not configured (manual deletion by staff)'; }
    $body = json_encode(['event' => 'account_deletion.approved', 'ref' => $r['ref'], 'email' => $r['email'], 'account_id' => $r['account_id'], 'account_type' => $r['account_type'],
        'scope' => $r['scope'], 'requested_at' => $r['created_at'], 'approved_by' => $actor, 'approved_at' => now_utc()], JSON_UNESCAPED_SLASHES);
    $sig = 'sha256=' . hash_hmac('sha256', $body, DELETION_WEBHOOK_SECRET);
    if (!function_exists('curl_init')) { return 'failed: PHP curl extension missing'; }
    $ch = curl_init(DELETION_WEBHOOK_URL);
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-ITZ-Signature: ' . $sig]]);
    $resp = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    return $err ? 'failed: ' . $err : 'HTTP ' . $code . ' ' . mb_substr((string)$resp, 0, 200);
}

function del_notify_requester(array $r, string $title, array $paras): void
{
    [$t, $h] = mail_wrap($title, $paras);
    [$ok, $err] = send_mail([$r['email']], $title . ' (' . $r['ref'] . ')', $t, $h, site('emails.info'), site('brand') . ' Support');
    del_event((int)$r['id'], 'system', $ok ? 'requester_emailed' : 'requester_email_failed', $title . ($err ? ': ' . $err : ''));
}

function del_complete(array $r, string $actor, string $platformRef, string $retained): void
{
    del_set((int)$r['id'], $actor, 'completed', ['completed_at' => now_utc(), 'platform_ref' => $platformRef, 'retained_summary' => $retained], 'completed', 'Platform reference: ' . $platformRef);
    del_notify_requester($r, 'Your account deletion is complete', [
        'Hello ' . $r['full_name'] . ',',
        'We have completed your account and data deletion request (reference ' . $r['ref'] . ').',
        $retained !== '' ? 'Information we are required or permitted to keep: ' . $retained : 'No additional personal data is being retained beyond the records described in our Account & Data Deletion page.',
        'If you have any questions, reply to this email.',
    ]);
}
