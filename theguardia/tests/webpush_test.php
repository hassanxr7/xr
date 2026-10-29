<?php
// RFC 8291 Appendix A test vector + VAPID signature round trip. Run: php tests/webpush_test.php
define('APP', true);
define('APP_VERSION', 'test');
define('BASE_PATH', dirname(__DIR__));
define('APP_PATH', BASE_PATH . '/app');
define('STORAGE_PATH', APP_PATH . '/storage');
require APP_PATH . '/helpers.php';
require APP_PATH . '/webpush.php';

$asPriv = b64url_decode('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
$asPub = b64url_decode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
$uaPub = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
$auth = 'BTBZMqHH6r4Tts7J_aSIgg';
$salt = b64url_decode('DGv6ra1nlYgDCS1FRnbzlw');
$key = ec_private_from_raw($asPriv, $asPub);
$plain = 'When I grow up, I want to be a watermelon';
$body = webpush_encrypt($plain, $uaPub, $auth, $key, $salt);

// Header: salt | rs=4096 | idlen=65 | keyid=as_public (RFC 8188)
$ok = substr($body, 0, 16) === $salt && unpack('N', substr($body, 16, 4))[1] === 4096 && ord($body[20]) === 65 && substr($body, 21, 65) === $asPub;

// Decrypt as the browser would, with the receiver's private key from the RFC.
$uaPriv = ec_private_from_raw(b64url_decode('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'), b64url_decode($uaPub));
$shared = openssl_pkey_derive(ec_public_from_raw(substr($body, 21, 65)), $uaPriv, 32);
$ok = $ok && b64url_encode($shared) === 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs'; // ecdh_secret from RFC 8291 A
$prkKey = hash_hmac('sha256', $shared, b64url_decode($auth), true);
$ikm = hash_hmac('sha256', "WebPush: info\0" . b64url_decode($uaPub) . $asPub . "\x01", $prkKey, true);
$prk = hash_hmac('sha256', $ikm, $salt, true);
$cek = substr(hash_hmac('sha256', "Content-Encoding: aes128gcm\0\x01", $prk, true), 0, 16);
$nonce = substr(hash_hmac('sha256', "Content-Encoding: nonce\0\x01", $prk, true), 0, 12);
$ok = $ok && b64url_encode($cek) === 'oIhVW04MRdy2XN9CiKLxTg' && b64url_encode($nonce) === '4h_95klXJ5E_qnoN'; // CEK / NONCE from RFC 8291 A
$ct = substr($body, 86);
$dec = openssl_decrypt(substr($ct, 0, -16), 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, substr($ct, -16));
$ok = $ok && $dec === $plain . "\x02";
echo $ok ? "RFC 8291 encryption: PASS\n" : "RFC 8291 encryption: FAIL\n";

// ES256 JWT signature verifies with the public key.
$k = ec_new_key();
openssl_pkey_export($k, $pem);
openssl_sign('hello', $der, $k, OPENSSL_ALGO_SHA256);
$raw = ecdsa_der_to_raw($der);
$r = ltrim(substr($raw, 0, 32), "\0"); $s = ltrim(substr($raw, 32), "\0");
$enc = fn ($i) => (ord($i[0]) & 0x80 ? "\0" . $i : $i);
$r = $enc($r); $s = $enc($s);
$back = "\x30" . chr(strlen($r) + strlen($s) + 4) . "\x02" . chr(strlen($r)) . $r . "\x02" . chr(strlen($s)) . $s;
echo strlen($raw) === 64 && openssl_verify('hello', $back, openssl_pkey_get_public(der_to_pem(P256_SPKI_PREFIX . ec_public_raw($k), 'PUBLIC KEY')), OPENSSL_ALGO_SHA256) === 1 ? "ES256 raw signature: PASS\n" : "ES256 raw signature: FAIL\n";
