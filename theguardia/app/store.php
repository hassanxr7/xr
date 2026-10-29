<?php
/**
 * The Guardia — photo store for media outlets.
 *
 * Editors upload exclusive photos with prices per licence. Visitors see watermarked previews;
 * buyers pay with Stripe Checkout (or send a licence request when Stripe is not set up) and
 * receive a time-limited download link to the original file, which is stored privately.
 */
defined('APP') || exit;

const LICENCES = [
    'editorial'  => ['Editorial licence', 'News and editorial use: one outlet, print, broadcast and online, non-exclusive. No advertising.'],
    'commercial' => ['Commercial licence', 'Editorial plus marketing, advertising and promotional use, non-exclusive.'],
    'exclusive'  => ['Exclusive rights', 'All uses with exclusive rights. The photo is removed from the store after purchase.'],
];

function photo_storage_dir(): string
{
    $dir = STORAGE_PATH . '/photos';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

/** Tile the brand watermark across an image and add an ID band at the bottom. */
function photo_watermark($im, int $photoId)
{
    $w = imagesx($im);
    $h = imagesy($im);
    $wmFile = BASE_PATH . '/assets/img/brand/watermark.png';
    if (is_file($wmFile) && ($wm = @imagecreatefrompng($wmFile))) {
        $tw = (int) max(160, $w * 0.32);
        $th = (int) round(imagesy($wm) * $tw / imagesx($wm));
        $tile = imagecreatetruecolor($tw, $th);
        imagealphablending($tile, false);
        imagesavealpha($tile, true);
        imagefill($tile, 0, 0, imagecolorallocatealpha($tile, 0, 0, 0, 127));
        imagecopyresampled($tile, $wm, 0, 0, 0, 0, $tw, $th, imagesx($wm), imagesy($wm));
        imagefilter($tile, IMG_FILTER_COLORIZE, 0, 0, 0, 85); // make it semi-transparent
        imagealphablending($im, true);
        $row = 0;
        for ($y = (int) ($th * 0.4); $y < $h; $y += $th * 2.2, $row++) {
            for ($x = ($row % 2) ? -$tw / 2 : 0; $x < $w; $x += $tw * 1.35) {
                imagecopy($im, $tile, (int) $x, (int) $y, 0, 0, $tw, $th);
            }
        }
    }
    $band = imagecolorallocatealpha($im, 0, 0, 0, 40);
    imagefilledrectangle($im, 0, $h - 26, $w, $h, $band);
    $white = imagecolorallocate($im, 255, 255, 255);
    imagestring($im, 3, 10, $h - 20, 'PREVIEW - ' . strtoupper((string) parse_url(site_origin(), PHP_URL_HOST)) . '/PHOTOS - ID ' . $photoId, $white);
    return $im;
}

/** Save an uploaded photo for sale. $data: title, description, location, taken_at, photographer, keywords, prices (cents). */
function photo_save_upload(array $file, array $data): int
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
        throw new RuntimeException(__('Upload failed. The file may be too large.'));
    }
    if ($file['size'] > 40 * 1024 * 1024) {
        throw new RuntimeException(__('Photos must be smaller than 40 MB.'));
    }
    [$im, $type] = gd_load($file['tmp_name']);
    if (!in_array($type, ['jpg', 'png', 'webp'], true)) {
        throw new RuntimeException(__('Use a JPG, PNG or WebP photo.'));
    }
    $name = bin2hex(random_bytes(12)) . '.' . $type;
    if (!move_uploaded_file($file['tmp_name'], photo_storage_dir() . '/' . $name)) {
        throw new RuntimeException('Could not store the original file.');
    }
    $slug = unique_slug('photos', slugify($data['title'] ?: 'photo'));
    $id = insert('photos', [
        'title' => $data['title'], 'slug' => $slug, 'description' => $data['description'] ?? '', 'location' => $data['location'] ?? '',
        'taken_at' => $data['taken_at'] ?? null, 'photographer' => $data['photographer'] ?? '', 'keywords' => $data['keywords'] ?? '',
        'original' => $name, 'preview' => '', 'thumb' => '', 'width' => imagesx($im), 'height' => imagesy($im),
        'price_editorial' => (int) $data['price_editorial'], 'price_commercial' => (int) $data['price_commercial'], 'price_exclusive' => (int) $data['price_exclusive'],
        'currency' => setting('store_currency', 'CAD'), 'status' => $data['status'] ?? 'active', 'created_at' => now(),
    ]);
    $dir = 'uploads/photos';
    @mkdir(BASE_PATH . '/' . $dir, 0755, true);
    $base = $dir . '/' . $slug . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
    $preview = photo_watermark(gd_resize($im, 1400), $id);
    gd_save($preview, BASE_PATH . '/' . $base . '.jpg', 'jpg', 78);
    $thumb = photo_watermark(gd_resize($im, 600), $id);
    gd_save($thumb, BASE_PATH . '/' . $base . '-600.jpg', 'jpg', 76);
    update('photos', ['preview' => $base . '.jpg', 'thumb' => $base . '-600.jpg'], 'id = ?', [$id]);
    content_changed();
    return $id;
}

function photo_delete(int $id): void
{
    $p = row('SELECT * FROM photos WHERE id = ?', [$id]);
    if (!$p) {
        return;
    }
    @unlink(photo_storage_dir() . '/' . $p['original']);
    @unlink(BASE_PATH . '/' . $p['preview']);
    @unlink(BASE_PATH . '/' . $p['thumb']);
    q('DELETE FROM photos WHERE id = ?', [$id]);
    content_changed();
}

/** Licence options with a price for a photo. */
function photo_licences(array $p): array
{
    $out = [];
    foreach (LICENCES as $k => [$label, $desc]) {
        $price = (int) $p['price_' . $k];
        if ($price > 0) {
            $out[$k] = ['label' => $label, 'desc' => $desc, 'price' => $price];
        }
    }
    return $out;
}

function stripe_enabled(): bool
{
    return setting('stripe_secret') !== '';
}

function stripe_api(string $method, string $path, array $params = []): array
{
    $r = http_request($method, 'https://api.stripe.com/v1/' . $path, ['Authorization: Bearer ' . setting('stripe_secret'), 'Content-Type: application/x-www-form-urlencoded'],
        $method === 'GET' ? null : http_build_query($params), 30);
    $data = json_decode($r['body'], true) ?: [];
    if ($r['status'] < 200 || $r['status'] >= 300) {
        throw new RuntimeException('Stripe: ' . ($data['error']['message'] ?? ($r['error'] ?: 'HTTP ' . $r['status'])));
    }
    return $data;
}

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------

function photos_index(): void
{
    $page = current_page();
    $q = mb_substr(trim((string) ($_GET['q'] ?? '')), 0, 80);
    $where = "status = 'active'";
    $params = [];
    if ($q !== '') {
        $where .= " AND (title LIKE ? ESCAPE '!' OR keywords LIKE ? ESCAPE '!' OR location LIKE ? ESCAPE '!')";
        $params = [like_param($q), like_param($q), like_param($q)];
    }
    $total = (int) val("SELECT COUNT(*) FROM photos WHERE $where", $params);
    $list = rows("SELECT * FROM photos WHERE $where ORDER BY id DESC LIMIT 24 OFFSET ?", array_merge($params, [($page - 1) * 24]));
    seo(['title' => 'Photo store – exclusive news photos for media', 'description' => 'License exclusive news photography from ' . site_name() . ' for print, broadcast and online use.',
        'robots' => $q !== '' ? 'noindex, follow' : seo()['robots']]);
    render('photos', ['list' => $list, 'total' => $total, 'page' => $page, 'pages' => max(1, (int) ceil($total / 24)), 'q' => $q]);
}

function photo_page(string $slug): void
{
    $p = row("SELECT * FROM photos WHERE slug = ? AND status IN ('active', 'sold')", [$slug]);
    if (!$p) {
        not_found();
    }
    start_session();
    seo(['title' => $p['title'] . ' – licence this photo', 'description' => str_limit($p['description'] ?: $p['title'], 155), 'image' => abs_url($p['preview']),
        'jsonld' => ['@type' => 'ImageObject', 'contentUrl' => abs_url($p['preview']), 'name' => $p['title'], 'description' => $p['description'] ?: $p['title'],
            'creditText' => $p['photographer'] ?: site_name(), 'creator' => ['@type' => 'Person', 'name' => $p['photographer'] ?: site_name()],
            'copyrightNotice' => '© ' . site_name(), 'license' => abs_url('terms'), 'acquireLicensePage' => abs_url('photos/' . $p['slug'])]]);
    render('photo', ['p' => $p, 'licences' => photo_licences($p)]);
}

function photo_buy(string $slug): void
{
    csrf_check();
    $p = row("SELECT * FROM photos WHERE slug = ? AND status = 'active'", [$slug]);
    if (!$p) {
        not_found();
    }
    $licences = photo_licences($p);
    $lic = (string) ($_POST['licence'] ?? '');
    $name = mb_substr(trim((string) ($_POST['name'] ?? '')), 0, 100);
    $email = trim((string) ($_POST['email'] ?? ''));
    $org = mb_substr(trim((string) ($_POST['org'] ?? '')), 0, 120);
    $note = mb_substr(trim((string) ($_POST['note'] ?? '')), 0, 1000);
    if (!isset($licences[$lic]) || $name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || empty($_POST['agree'])) {
        flash('error', 'Please choose a licence, enter your name and email, and accept the licence terms.');
        redirect('photos/' . $slug . '#buy');
    }
    if (!rate_limit('photo_buy', 10, 3600)) {
        flash('error', 'Too many requests. Please try again later.');
        redirect('photos/' . $slug . '#buy');
    }
    $ref = strtoupper(bin2hex(random_bytes(8)));
    $orderId = insert('photo_orders', [
        'ref' => $ref, 'photo_id' => $p['id'], 'licence' => $lic, 'amount' => $licences[$lic]['price'], 'currency' => $p['currency'],
        'buyer_name' => $name, 'buyer_email' => $email, 'buyer_org' => $org, 'buyer_note' => $note,
        'status' => stripe_enabled() ? 'pending' : 'request', 'created_at' => now(),
    ]);
    if (stripe_enabled()) {
        try {
            $s = stripe_api('POST', 'checkout/sessions', [
                'mode' => 'payment',
                'success_url' => abs_url('photos/order/' . $ref) . '?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => abs_url('photos/' . $p['slug']),
                'customer_email' => $email,
                'client_reference_id' => $ref,
                'metadata' => ['order_ref' => $ref, 'photo_id' => $p['id']],
                'line_items' => [[
                    'quantity' => 1,
                    'price_data' => [
                        'currency' => strtolower($p['currency']),
                        'unit_amount' => $licences[$lic]['price'],
                        'product_data' => ['name' => $licences[$lic]['label'] . ': ' . mb_substr($p['title'], 0, 200), 'description' => $licences[$lic]['desc']],
                    ],
                ]],
            ]);
            update('photo_orders', ['stripe_session' => $s['id']], 'id = ?', [$orderId]);
            redirect($s['url']);
        } catch (Throwable $e) {
            log_error($e->getMessage());
            update('photo_orders', ['status' => 'request'], 'id = ?', [$orderId]);
        }
    }
    // No online payment: the newsroom confirms by email and marks the order paid in the dashboard.
    if ($to = setting('contact_email')) {
        send_mail($to, '[Photo licence request] ' . $p['title'], "Order $ref\nPhoto: {$p['title']} (#{$p['id']})\nLicence: {$licences[$lic]['label']} – " . money($licences[$lic]['price'], $p['currency'])
            . "\nBuyer: $name <$email> $org\n\n$note\n\nManage: " . abs_url('admin/photo_orders.php'));
    }
    send_mail($email, 'Your photo licence request – ' . site_name(), "Thank you, $name.\n\nWe received your request for \"{$p['title']}\" ({$licences[$lic]['label']}, " . money($licences[$lic]['price'], $p['currency'])
        . ").\nWe will contact you with payment details. Your order reference is $ref.\n\n" . abs_url('photos/order/' . $ref));
    redirect('photos/order/' . $ref);
}

function photo_order_page(string $ref): void
{
    $o = row('SELECT o.*, p.title, p.slug, p.thumb FROM photo_orders o JOIN photos p ON p.id = o.photo_id WHERE o.ref = ?', [$ref]);
    if (!$o) {
        not_found();
    }
    // Returning from Stripe: confirm right away instead of waiting for the webhook.
    if ($o['status'] === 'pending' && stripe_enabled() && !empty($_GET['session_id']) && $_GET['session_id'] === $o['stripe_session']) {
        try {
            $s = stripe_api('GET', 'checkout/sessions/' . rawurlencode($o['stripe_session']));
            if (($s['payment_status'] ?? '') === 'paid' && ($s['client_reference_id'] ?? '') === $o['ref']) {
                order_mark_paid((int) $o['id']);
                $o = row('SELECT o.*, p.title, p.slug, p.thumb FROM photo_orders o JOIN photos p ON p.id = o.photo_id WHERE o.ref = ?', [$ref]);
            }
        } catch (Throwable $e) {
            log_error($e->getMessage());
        }
    }
    start_session(); // personal page: never cached
    seo(['title' => 'Your photo order', 'robots' => 'noindex, nofollow']);
    header('X-Robots-Tag: noindex');
    render('photo_order', ['o' => $o]);
}

/** Mark an order paid, create its download link and email it to the buyer. */
function order_mark_paid(int $orderId): void
{
    $o = row('SELECT * FROM photo_orders WHERE id = ?', [$orderId]);
    if (!$o || $o['status'] === 'paid') {
        return;
    }
    $token = token(24);
    $expires = date('Y-m-d H:i:s', time() + max(1, (int) setting('download_days', '7')) * 86400);
    update('photo_orders', ['status' => 'paid', 'paid_at' => now(), 'download_token' => $token, 'download_expires' => $expires], 'id = ?', [$orderId]);
    q('UPDATE photos SET sales = sales + 1 WHERE id = ?', [$o['photo_id']]);
    if ($o['licence'] === 'exclusive') {
        q("UPDATE photos SET status = 'sold' WHERE id = ?", [$o['photo_id']]);
        content_changed();
    }
    $p = row('SELECT title FROM photos WHERE id = ?', [$o['photo_id']]);
    send_mail($o['buyer_email'], 'Your photo is ready to download – ' . site_name(),
        "Hello {$o['buyer_name']},\n\nThank you for licensing \"{$p['title']}\" (" . (LICENCES[$o['licence']][0] ?? $o['licence']) . ").\n\n"
        . "Download the original file (valid until " . fmt_date($expires, 'F j, Y') . ", up to " . setting('download_limit', '5') . " downloads):\n"
        . abs_url('photos/download/' . $token) . "\n\nOrder reference: {$o['ref']}\nLicence terms: " . abs_url('terms') . "\n\n" . site_name());
}

function photo_download(string $token): void
{
    $o = row("SELECT o.*, p.original, p.slug FROM photo_orders o JOIN photos p ON p.id = o.photo_id WHERE o.download_token = ? AND o.status = 'paid'", [$token]);
    $limit = max(1, (int) setting('download_limit', '5'));
    if (!$o || $o['download_expires'] < now() || $o['downloads'] >= $limit) {
        http_response_code(410);
        header('Content-Type: text/plain; charset=utf-8');
        exit('This download link has expired. Contact ' . setting('contact_email', 'the newsroom') . ' with your order reference.');
    }
    $file = photo_storage_dir() . '/' . basename($o['original']);
    if (!is_file($file)) {
        http_response_code(404);
        exit('File not found.');
    }
    q('UPDATE photo_orders SET downloads = downloads + 1 WHERE id = ?', [$o['id']]);
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    header('Content-Type: ' . (['png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'image/jpeg'));
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: attachment; filename="' . $o['slug'] . '-' . $o['ref'] . '.' . $ext . '"');
    header('X-Robots-Tag: noindex');
    header('Cache-Control: private, no-store');
    readfile($file);
}

/** Stripe webhook: checkout.session.completed → order paid (signature verified). */
function stripe_webhook(): void
{
    $payload = (string) file_get_contents('php://input');
    $secret = setting('stripe_webhook_secret');
    $sig = (string) ($_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '');
    if ($secret === '' || !stripe_signature_valid($payload, $sig, $secret)) {
        http_response_code(400);
        exit('invalid signature');
    }
    $event = json_decode($payload, true) ?: [];
    if (($event['type'] ?? '') === 'checkout.session.completed' || ($event['type'] ?? '') === 'checkout.session.async_payment_succeeded') {
        $s = $event['data']['object'] ?? [];
        $o = row('SELECT * FROM photo_orders WHERE ref = ? AND stripe_session = ?', [(string) ($s['client_reference_id'] ?? ''), (string) ($s['id'] ?? '')]);
        if ($o && ($s['payment_status'] ?? '') === 'paid') {
            order_mark_paid((int) $o['id']);
        }
    }
    http_response_code(200);
    echo 'ok';
}

function stripe_signature_valid(string $payload, string $header, string $secret, int $tolerance = 300): bool
{
    $t = null;
    $sigs = [];
    foreach (explode(',', $header) as $part) {
        [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
        if ($k === 't') {
            $t = (int) $v;
        } elseif ($k === 'v1') {
            $sigs[] = $v;
        }
    }
    if (!$t || !$sigs || abs(time() - $t) > $tolerance) {
        return false;
    }
    $expected = hash_hmac('sha256', $t . '.' . $payload, $secret);
    foreach ($sigs as $s) {
        if (hash_equals($expected, $s)) {
            return true;
        }
    }
    return false;
}
