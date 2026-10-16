<?php
/**
 * Optional: lets the ITrackZen tracking platform mark a deletion request as completed once it has deleted the data.
 * POST JSON {"ref":"DEL-...","status":"completed","platform_ref":"...","retained":"..."}
 * Header X-ITZ-Signature: sha256=HMAC_SHA256(body, DELETION_WEBHOOK_SECRET)
 */
declare(strict_types=1);
require __DIR__ . '/../includes/bootstrap.php';
require __DIR__ . '/../includes/mailer.php';
require __DIR__ . '/../includes/deletion.php';
header('Content-Type: application/json'); header('Cache-Control: no-store'); header('X-Robots-Tag: noindex');
$body = (string)file_get_contents('php://input');
if (DELETION_WEBHOOK_SECRET === '' || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') { http_response_code(404); echo '{"ok":false}'; exit; }
$sig = $_SERVER['HTTP_X_ITZ_SIGNATURE'] ?? '';
if (!hash_equals('sha256=' . hash_hmac('sha256', $body, DELETION_WEBHOOK_SECRET), $sig)) { http_response_code(401); echo '{"ok":false,"error":"bad signature"}'; exit; }
$j = json_decode($body, true);
$r = is_array($j) ? db_one('SELECT * FROM deletion_requests WHERE ref=?', [(string)($j['ref'] ?? '')]) : null;
if (!$r) { http_response_code(404); echo '{"ok":false,"error":"unknown ref"}'; exit; }
if (($j['status'] ?? '') !== 'completed' || !in_array($r['status'], ['approved'], true)) { http_response_code(409); echo '{"ok":false,"error":"request is not in approved state or status invalid"}'; exit; }
del_complete($r, 'platform', mb_substr((string)($j['platform_ref'] ?? 'platform-callback'), 0, 190), mb_substr((string)($j['retained'] ?? ''), 0, 1000));
echo '{"ok":true}';
