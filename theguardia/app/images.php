<?php
/**
 * The Guardia — image uploads, resizing (JPEG/PNG + WebP) and responsive <picture> output.
 */
defined('APP') || exit;

const IMAGE_SIZES = [400, 800, 1200];
const IMAGE_MAX_WIDTH = 2000;

/** Load an image file into GD. Returns [resource, type] or throws. */
function gd_load(string $path): array
{
    $info = @getimagesize($path);
    if (!$info) {
        throw new RuntimeException(__('The file is not a valid image.'));
    }
    switch ($info[2]) {
        case IMAGETYPE_JPEG:
            $im = @imagecreatefromjpeg($path);
            $type = 'jpg';
            break;
        case IMAGETYPE_PNG:
            $im = @imagecreatefrompng($path);
            $type = 'png';
            break;
        case IMAGETYPE_WEBP:
            $im = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false;
            $type = 'webp';
            break;
        case IMAGETYPE_GIF:
            $im = @imagecreatefromgif($path);
            $type = 'gif';
            break;
        default:
            $im = false;
            $type = '';
    }
    if (!$im) {
        throw new RuntimeException(__('Only JPG, PNG, WebP and GIF images are supported.'));
    }
    // Phone photos: apply the EXIF rotation so the image is upright.
    if ($type === 'jpg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($path);
        $rot = ['3' => 180, '6' => -90, '8' => 90][(string) ($exif['Orientation'] ?? '')] ?? 0;
        if ($rot) {
            $im = imagerotate($im, $rot, 0);
        }
    }
    return [$im, $type];
}

function gd_resize($im, int $width)
{
    $w = imagesx($im);
    $h = imagesy($im);
    if ($w <= $width) {
        return $im;
    }
    $nh = (int) round($h * $width / $w);
    $out = imagecreatetruecolor($width, $nh);
    imagealphablending($out, false);
    imagesavealpha($out, true);
    imagecopyresampled($out, $im, 0, 0, 0, 0, $width, $nh, $w, $h);
    return $out;
}

function gd_save($im, string $file, string $type, int $quality = 82): void
{
    if ($type === 'png') {
        imagesavealpha($im, true);
        imagepng($im, $file, 7);
    } elseif ($type === 'webp') {
        imagewebp($im, $file, $quality);
    } else {
        // Flatten transparency onto white for JPEG.
        $flat = imagecreatetruecolor(imagesx($im), imagesy($im));
        imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
        imagecopy($flat, $im, 0, 0, 0, 0, imagesx($im), imagesy($im));
        imageinterlace($flat, true);
        imagejpeg($flat, $file, $quality);
    }
}

/**
 * Store an uploaded image ($_FILES entry) in uploads/YYYY/MM/ with resized copies.
 * Re-encoding through GD also strips anything hidden inside the file.
 */
function media_save_upload(array $file, array $meta = []): int
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
        throw new RuntimeException(__('Upload failed. The file may be too large.'));
    }
    if ($file['size'] > 15 * 1024 * 1024) {
        throw new RuntimeException(__('Images must be smaller than 15 MB.'));
    }
    return media_save_file($file['tmp_name'], $meta['name'] ?? ($file['name'] ?? 'image'), $meta);
}

function media_save_file(string $path, string $name, array $meta = []): int
{
    [$im, $type] = gd_load($path);
    $dir = 'uploads/' . date('Y/m');
    if (!is_dir(BASE_PATH . '/' . $dir) && !@mkdir(BASE_PATH . '/' . $dir, 0755, true)) {
        throw new RuntimeException('Cannot create ' . $dir);
    }
    $base = $dir . '/' . (slugify(pathinfo($name, PATHINFO_FILENAME), 50) ?: 'image') . '-' . substr(bin2hex(random_bytes(3)), 0, 5);
    $sizes = [];
    $webp = function_exists('imagewebp');

    if ($type === 'gif') {
        // Keep animated GIFs untouched.
        copy($path, BASE_PATH . '/' . $base . '.gif');
        $ext = 'gif';
        $webp = false;
    } else {
        $ext = $type === 'png' ? 'png' : 'jpg';
        $im = gd_resize($im, IMAGE_MAX_WIDTH);
        gd_save($im, BASE_PATH . '/' . $base . '.' . $ext, $ext, 84);
        if ($webp) {
            gd_save($im, BASE_PATH . '/' . $base . '.webp', 'webp', 80);
        }
        foreach (IMAGE_SIZES as $w) {
            if (imagesx($im) > $w) {
                $small = gd_resize($im, $w);
                gd_save($small, BASE_PATH . "/$base-$w.$ext", $ext, 80);
                if ($webp) {
                    gd_save($small, BASE_PATH . "/$base-$w.webp", 'webp', 78);
                }
                $sizes[] = $w;
            }
        }
    }
    [$w, $h] = getimagesize(BASE_PATH . '/' . $base . '.' . $ext);
    return insert('media', [
        'file'        => $base,
        'ext'         => $ext,
        'width'       => $w,
        'height'      => $h,
        'sizes'       => json_encode($sizes),
        'webp'        => $webp ? 1 : 0,
        'bytes'       => (int) filesize(BASE_PATH . '/' . $base . '.' . $ext),
        'alt'         => mb_substr((string) ($meta['alt'] ?? ''), 0, 250),
        'caption'     => mb_substr((string) ($meta['caption'] ?? ''), 0, 500),
        'credit'      => mb_substr((string) ($meta['credit'] ?? ''), 0, 120),
        'uploaded_by' => user()['id'] ?? null,
        'created_at'  => now(),
    ]);
}

function media(?int $id, ?array $put = null): ?array
{
    static $cache = [];
    if (!$id) {
        return null;
    }
    if ($put !== null) {
        return $cache[$id] = $put;
    }
    if (!array_key_exists($id, $cache)) {
        $cache[$id] = row('SELECT * FROM media WHERE id = ?', [$id]);
    }
    return $cache[$id];
}

/** Load the media rows of a list of cards in one query (avoids one query per card). */
function media_prefetch(array $articles): void
{
    $ids = array_values(array_unique(array_filter(array_map(fn ($a) => (int) ($a['image_id'] ?? 0), $articles))));
    if ($ids) {
        foreach (rows('SELECT * FROM media WHERE id IN (' . placeholders($ids) . ')', $ids) as $m) {
            media((int) $m['id'], $m);
        }
    }
}

/** URL of a media file at (roughly) a given width. */
function media_url(array $m, int $width = 0, bool $absolute = false, string $ext = ''): string
{
    $ext = $ext ?: $m['ext'];
    $sizes = json_decode((string) $m['sizes'], true) ?: [];
    $path = $m['file'] . '.' . $ext;
    if ($width) {
        foreach ($sizes as $s) {
            if ($s >= $width) {
                $path = $m['file'] . '-' . $s . '.' . $ext;
                break;
            }
        }
    }
    return $absolute ? abs_url($path) : url($path);
}

function media_delete(int $id): void
{
    $m = media($id);
    if (!$m) {
        return;
    }
    foreach (glob(BASE_PATH . '/' . $m['file'] . '*') ?: [] as $f) {
        if (strpos(basename($f), basename($m['file'])) === 0) {
            @unlink($f);
        }
    }
    q('UPDATE articles SET image_id = NULL WHERE image_id = ?', [$id]);
    q('DELETE FROM media WHERE id = ?', [$id]);
}

/**
 * Image data for a story: its own photo, or the section's default image.
 * Returns src, width, height, alt, caption, credit, srcset, webp srcset, absolute url for SEO.
 */
function article_image(array $a): array
{
    $m = media(isset($a['image_id']) ? (int) $a['image_id'] : null);
    if ($m) {
        $sizes = json_decode((string) $m['sizes'], true) ?: [];
        $set = $webpSet = [];
        foreach ($sizes as $s) {
            $set[] = url($m['file'] . '-' . $s . '.' . $m['ext']) . ' ' . $s . 'w';
            if ($m['webp']) {
                $webpSet[] = url($m['file'] . '-' . $s . '.webp') . ' ' . $s . 'w';
            }
        }
        $set[] = url($m['file'] . '.' . $m['ext']) . ' ' . $m['width'] . 'w';
        if ($m['webp']) {
            $webpSet[] = url($m['file'] . '.webp') . ' ' . $m['width'] . 'w';
        }
        return [
            'src'     => media_url($m, 800),
            'abs'     => media_url($m, 1200, true),
            'width'   => (int) $m['width'],
            'height'  => (int) $m['height'],
            'alt'     => $m['alt'] ?: $a['title'],
            'caption' => (string) $m['caption'],
            'credit'  => (string) $m['credit'],
            'srcset'  => implode(', ', $set),
            'webp'    => implode(', ', $webpSet),
            'default' => false,
        ];
    }
    $path = category_image(category((int) ($a['category_id'] ?? 0)));
    return [
        'src' => url($path), 'abs' => abs_url($path), 'width' => 1200, 'height' => 675, 'alt' => $a['title'] ?? '',
        'caption' => '', 'credit' => '', 'srcset' => '', 'webp' => '', 'default' => true,
    ];
}

/** Responsive <picture> markup. $sizes is the CSS sizes hint, e.g. "(min-width: 900px) 640px, 100vw". */
function picture(array $img, string $sizes = '100vw', string $class = '', bool $eager = false): string
{
    $attrs = 'src="' . e($img['src']) . '" alt="' . e($img['alt']) . '" width="' . (int) $img['width'] . '" height="' . (int) $img['height'] . '"'
        . ($class ? ' class="' . e($class) . '"' : '')
        . ($eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"');
    if ($img['srcset'] === '') {
        return '<img ' . $attrs . '>';
    }
    $html = '<picture>';
    if ($img['webp'] !== '') {
        $html .= '<source type="image/webp" srcset="' . e($img['webp']) . '" sizes="' . e($sizes) . '">';
    }
    return $html . '<img ' . $attrs . ' srcset="' . e($img['srcset']) . '" sizes="' . e($sizes) . '"></picture>';
}
