<?php
/**
 * The Guardia — visitor location (country / region / city).
 *
 * Order: Cloudflare headers (if the site is behind Cloudflare) → a local MaxMind-format
 * database (.mmdb) in app/storage/geoip/ — e.g. the free "DB-IP City Lite" (CC BY 4.0),
 * which Settings → Analytics can download automatically, or MaxMind GeoLite2-City.
 * The IP address itself is never stored.
 */
defined('APP') || exit;

const GEOIP_DIR = STORAGE_PATH . '/geoip';

/** ['country' => 'CA', 'region' => 'Ontario', 'city' => 'Toronto'] (values may be empty). */
function geo_lookup(string $ip): array
{
    $out = ['country' => '', 'region' => '', 'city' => ''];
    $cf = strtoupper((string) ($_SERVER['HTTP_CF_IPCOUNTRY'] ?? ''));
    if (preg_match('~^[A-Z]{2}$~', $cf) && $cf !== 'XX' && $cf !== 'T1') {
        $out['country'] = $cf;
        $out['city'] = mb_substr((string) ($_SERVER['HTTP_CF_IPCITY'] ?? ''), 0, 80);
        $out['region'] = mb_substr((string) ($_SERVER['HTTP_CF_REGION'] ?? ''), 0, 80);
        if ($out['city'] !== '') {
            return $out;
        }
    }
    $db = geoip_db();
    if ($db) {
        try {
            $rec = $db->get($ip);
            if (is_array($rec)) {
                $out['country'] = $out['country'] ?: (string) ($rec['country']['iso_code'] ?? '');
                $out['city'] = (string) ($rec['city']['names']['en'] ?? '');
                $out['region'] = (string) ($rec['subdivisions'][0]['names']['en'] ?? '');
            }
        } catch (Throwable $e) {
            log_error('GeoIP: ' . $e->getMessage());
        }
    }
    return $out;
}

function geoip_file(): ?string
{
    $files = glob(GEOIP_DIR . '/*.mmdb') ?: [];
    usort($files, fn ($a, $b) => filemtime($b) <=> filemtime($a));
    return $files[0] ?? null;
}

function geoip_db(): ?MaxMindReader
{
    static $db = false;
    if ($db === false) {
        $file = geoip_file();
        $db = null;
        if ($file) {
            try {
                $db = new MaxMindReader($file);
            } catch (Throwable $e) {
                log_error('GeoIP open: ' . $e->getMessage());
            }
        }
    }
    return $db;
}

/**
 * Download this month's DB-IP City Lite database (free, CC BY 4.0, attribution shown in the dashboard).
 * Returns a status message.
 */
function geoip_download(): string
{
    @mkdir(GEOIP_DIR, 0755, true);
    foreach ([date('Y-m'), date('Y-m', strtotime('first day of last month'))] as $month) {
        $url = "https://download.db-ip.com/free/dbip-city-lite-$month.mmdb.gz";
        $tmp = GEOIP_DIR . '/download.gz';
        $fp = fopen($tmp, 'wb');
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_FILE => $fp, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 240, CURLOPT_CONNECTTIMEOUT => 15]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        fclose($fp);
        if ($status !== 200 || filesize($tmp) < 1000000) {
            @unlink($tmp);
            continue;
        }
        $out = GEOIP_DIR . "/dbip-city-lite-$month.mmdb";
        $in = gzopen($tmp, 'rb');
        $o = fopen($out . '.part', 'wb');
        while (!gzeof($in)) {
            fwrite($o, gzread($in, 1 << 20));
        }
        gzclose($in);
        fclose($o);
        @unlink($tmp);
        try {
            new MaxMindReader($out . '.part');
        } catch (Throwable $e) {
            @unlink($out . '.part');
            return 'Downloaded file is not a valid database: ' . $e->getMessage();
        }
        rename($out . '.part', $out);
        foreach (glob(GEOIP_DIR . '/*.mmdb') ?: [] as $old) {
            if ($old !== $out) {
                @unlink($old);
            }
        }
        save_setting('geoip_updated', now());
        return 'OK: ' . basename($out);
    }
    return 'Could not download the DB-IP database (HTTP error). You can upload a .mmdb file manually.';
}

/**
 * Minimal reader for the MaxMind DB format (.mmdb), the format used by GeoLite2 and DB-IP.
 * Spec: https://maxmind.github.io/MaxMind-DB/
 */
final class MaxMindReader
{
    private $fh;
    private int $fileSize;
    private int $nodeCount;
    private int $recordSize;
    private int $ipVersion;
    private int $searchTreeSize;
    private int $dataStart;
    private int $nodeBytes;
    private int $ipv4Start = -1;

    public function __construct(string $file)
    {
        $this->fh = fopen($file, 'rb');
        if (!$this->fh) {
            throw new RuntimeException('Cannot open ' . $file);
        }
        $this->fileSize = (int) filesize($file);
        $marker = "\xAB\xCD\xEFMaxMind.com";
        $tailLen = min($this->fileSize, 128 * 1024);
        fseek($this->fh, $this->fileSize - $tailLen);
        $tail = (string) fread($this->fh, $tailLen);
        $pos = strrpos($tail, $marker);
        if ($pos === false) {
            throw new RuntimeException('Not a MaxMind DB file');
        }
        $metaStart = $this->fileSize - $tailLen + $pos + strlen($marker);
        [$meta] = $this->decode($metaStart, $metaStart);
        if (!is_array($meta) || !isset($meta['node_count'], $meta['record_size'])) {
            throw new RuntimeException('Invalid metadata');
        }
        $this->nodeCount = (int) $meta['node_count'];
        $this->recordSize = (int) $meta['record_size'];
        $this->ipVersion = (int) $meta['ip_version'];
        if (!in_array($this->recordSize, [24, 28, 32], true)) {
            throw new RuntimeException('Unsupported record size');
        }
        $this->nodeBytes = $this->recordSize * 2 / 8;
        $this->searchTreeSize = $this->nodeCount * $this->nodeBytes;
        $this->dataStart = $this->searchTreeSize + 16;
    }

    /** Record for an IP address, or null when not found. */
    public function get(string $ip)
    {
        $packed = @inet_pton($ip);
        if ($packed === false) {
            return null;
        }
        $bits = strlen($packed) * 8;
        $node = 0;
        if ($bits === 32 && $this->ipVersion === 6) {
            $node = $this->ipv4StartNode();
        }
        for ($i = 0; $i < $bits && $node < $this->nodeCount; $i++) {
            $bit = (ord($packed[$i >> 3]) >> (7 - ($i & 7))) & 1;
            $node = $this->readNode($node, $bit);
        }
        if ($node === $this->nodeCount) {
            return null;
        }
        if ($node > $this->nodeCount) {
            $offset = $node - $this->nodeCount - 16 + $this->dataStart;
            if ($offset >= $this->fileSize) {
                throw new RuntimeException('Corrupt search tree');
            }
            [$value] = $this->decode($offset, $this->dataStart);
            return $value;
        }
        return null;
    }

    private function ipv4StartNode(): int
    {
        if ($this->ipv4Start < 0) {
            $node = 0;
            for ($i = 0; $i < 96 && $node < $this->nodeCount; $i++) {
                $node = $this->readNode($node, 0);
            }
            $this->ipv4Start = $node;
        }
        return $this->ipv4Start;
    }

    private function read(int $offset, int $len): string
    {
        if ($len === 0) {
            return '';
        }
        fseek($this->fh, $offset);
        $s = fread($this->fh, $len);
        if ($s === false || strlen($s) !== $len) {
            throw new RuntimeException('Unexpected end of database');
        }
        return $s;
    }

    private function readNode(int $node, int $index): int
    {
        $b = $this->read($node * $this->nodeBytes, $this->nodeBytes);
        switch ($this->recordSize) {
            case 24:
                $p = substr($b, $index * 3, 3);
                return unpack('N', "\0" . $p)[1];
            case 28:
                if ($index === 0) {
                    return ((ord($b[3]) & 0xF0) << 20) | unpack('N', "\0" . substr($b, 0, 3))[1];
                }
                return ((ord($b[3]) & 0x0F) << 24) | unpack('N', "\0" . substr($b, 4, 3))[1];
            default:
                return unpack('N', substr($b, $index * 4, 4))[1];
        }
    }

    /** Decode the data field at $offset; pointers are relative to $base. Returns [value, nextOffset]. */
    private function decode(int $offset, int $base): array
    {
        $ctrl = ord($this->read($offset++, 1));
        $type = $ctrl >> 5;
        if ($type === 1) { // pointer
            $ss = ($ctrl >> 3) & 0x3;
            $vvv = $ctrl & 0x7;
            $bytes = $this->read($offset, $ss + 1);
            $offset += $ss + 1;
            switch ($ss) {
                case 0:
                    $ptr = ($vvv << 8) | ord($bytes[0]);
                    break;
                case 1:
                    $ptr = (($vvv << 16) | unpack('n', $bytes)[1]) + 2048;
                    break;
                case 2:
                    $ptr = (($vvv << 24) | unpack('N', "\0" . $bytes)[1]) + 526336;
                    break;
                default:
                    $ptr = unpack('N', $bytes)[1];
            }
            [$value] = $this->decode($base + $ptr, $base);
            return [$value, $offset];
        }
        if ($type === 0) { // extended type
            $type = 7 + ord($this->read($offset++, 1));
        }
        $size = $ctrl & 0x1F;
        if ($size >= 29) {
            $n = $size - 28;
            $extra = $this->read($offset, $n);
            $offset += $n;
            if ($size === 29) {
                $size = 29 + ord($extra);
            } elseif ($size === 30) {
                $size = 285 + unpack('n', $extra)[1];
            } else {
                $size = 65821 + unpack('N', "\0" . $extra)[1];
            }
        }
        switch ($type) {
            case 2: // UTF-8 string
                return [$this->read($offset, $size), $offset + $size];
            case 3: // double
                return [unpack('E', $this->read($offset, 8))[1], $offset + 8];
            case 4: // bytes
                return [$this->read($offset, $size), $offset + $size];
            case 5: // uint16
            case 6: // uint32
            case 9: // uint64
            case 10: // uint128
                $v = 0;
                foreach (str_split($this->read($offset, $size) ?: '', 1) as $ch) {
                    $v = $size > 7 ? (float) $v * 256 + ord($ch) : ($v << 8) | ord($ch);
                }
                return [$size === 0 ? 0 : $v, $offset + $size];
            case 7: // map
                $map = [];
                for ($i = 0; $i < $size; $i++) {
                    [$k, $offset] = $this->decode($offset, $base);
                    [$v, $offset] = $this->decode($offset, $base);
                    $map[$k] = $v;
                }
                return [$map, $offset];
            case 8: // int32
                $raw = str_pad($this->read($offset, $size), 4, "\0", STR_PAD_LEFT);
                $v = unpack('N', $raw)[1];
                if ($v >= 0x80000000) {
                    $v -= 0x100000000;
                }
                return [$v, $offset + $size];
            case 11: // array
                $arr = [];
                for ($i = 0; $i < $size; $i++) {
                    [$arr[], $offset] = $this->decode($offset, $base);
                }
                return [$arr, $offset];
            case 14: // boolean (value in size)
                return [$size !== 0, $offset];
            case 15: // float
                return [unpack('G', $this->read($offset, 4))[1], $offset + 4];
            default:
                throw new RuntimeException('Unknown MMDB data type ' . $type);
        }
    }
}
