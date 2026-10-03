<?php
/**
 * Hubdex Store - "Notify Me" subscription handler
 *
 * Saves e-mail addresses to /data/subscribers.csv (protected by .htaccess).
 * Works with JavaScript (JSON response) and without (redirect back).
 * Later you can connect this to Mailchimp, Brevo, a database, etc.
 */

require_once __DIR__ . '/includes/functions.php';

header('X-Robots-Tag: noindex, nofollow');

function subscribe_finish(string $status, string $message, int $code = 200): void
{
    if (wants_json()) {
        json_response(['ok' => in_array($status, ['success', 'exists'], true), 'status' => $status, 'message' => $message], $code);
    }
    header('Location: ./?notify=' . urlencode($status) . '#notify', true, 303);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    header('Location: ./', true, 303);
    exit;
}

// Honeypot - bots fill hidden fields. Pretend success.
if (!empty($_POST['website'])) {
    subscribe_finish('success', "You're on the list!");
}

if (!csrf_verify($_POST['csrf_token'] ?? null)) {
    subscribe_finish('error', 'Your session has expired. Please refresh the page and try again.', 400);
}

$email = strtolower(clean_input($_POST['email'] ?? '', 190));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    subscribe_finish('invalid', 'Please enter a valid e-mail address.', 422);
}

if (!rate_limit('subscribe', 10)) {
    subscribe_finish('error', 'Please wait a few seconds before trying again.', 429);
}

// Duplicate check
$file = DATA_DIR . '/subscribers.csv';
if (is_readable($file) && ($fh = fopen($file, 'r'))) {
    while (($row = fgetcsv($fh)) !== false) {
        if (isset($row[1]) && strtolower($row[1]) === $email) {
            fclose($fh);
            subscribe_finish('exists', "You're already subscribed - we'll be in touch at launch.");
        }
    }
    fclose($fh);
}

$saved = save_submission('subscribers.csv', [
    'date'  => date('c'),
    'email' => $email,
    'ip'    => client_ip(),
]);

if (!$saved) {
    subscribe_finish('error', 'Something went wrong. Please try again in a moment.', 500);
}

send_notification('New Hubdex Store launch subscriber', "New subscriber: {$email}\nDate: " . date('c'), $email);

subscribe_finish('success', "You're on the list! We'll e-mail you when Hubdex Store launches.");
