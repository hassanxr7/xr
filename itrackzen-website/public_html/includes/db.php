<?php
/**
 * Database layer (PDO). Default: SQLite file in /data (zero setup on Hostinger/cPanel/VPS).
 * Optional MySQL: set DB_DSN / DB_USER / DB_PASS in includes/config.local.php.
 * Stores: CMS content (with version history), enquiries, deletion requests + audit trail, admin users.
 */

function db(): PDO
{
    static $pdo = null;
    if ($pdo) { return $pdo; }
    $dsn = DB_DSN !== '' ? DB_DSN : 'sqlite:' . DATA_DIR . '/itrackzen.sqlite';
    $pdo = new PDO($dsn, DB_USER ?: null, DB_PASS ?: null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
        $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    }
    db_migrate($pdo);
    return $pdo;
}

function db_is_mysql(): bool { return db()->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'; }

function db_migrate(PDO $pdo): void
{
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    try { $v = $pdo->query("SELECT v FROM meta WHERE k='schema'")->fetchColumn(); if ((int)$v >= 1) { return; } } catch (Throwable $e) { /* first run */ }
    $id = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $long = $mysql ? 'LONGTEXT' : 'TEXT';
    $s = $mysql ? 'VARCHAR(191)' : 'TEXT';
    $tail = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $t = [
        "CREATE TABLE IF NOT EXISTS meta (k VARCHAR(64) PRIMARY KEY, v TEXT)$tail",
        "CREATE TABLE IF NOT EXISTS content (name VARCHAR(64) PRIMARY KEY, body $long NOT NULL, updated_at VARCHAR(32), updated_by VARCHAR(64))$tail",
        "CREATE TABLE IF NOT EXISTS content_versions (id $id, name VARCHAR(64) NOT NULL, body $long NOT NULL, saved_at VARCHAR(32), saved_by VARCHAR(64))$tail",
        "CREATE TABLE IF NOT EXISTS admins (id $id, username VARCHAR(64) NOT NULL UNIQUE, pass_hash VARCHAR(255) NOT NULL, role VARCHAR(16) NOT NULL DEFAULT 'support', active INT NOT NULL DEFAULT 1, created_at VARCHAR(32), last_login VARCHAR(32))$tail",
        "CREATE TABLE IF NOT EXISTS admin_log (id $id, at VARCHAR(32), actor VARCHAR(64), action VARCHAR(64), detail TEXT)$tail",
        "CREATE TABLE IF NOT EXISTS enquiries (id $id, ref VARCHAR(24) NOT NULL UNIQUE, type VARCHAR(16) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'new', full_name $s, company $s, country VARCHAR(80), phone VARCHAR(40), email $s, vehicles VARCHAR(24), service $s, message TEXT, extra TEXT, page VARCHAR(255), ip VARCHAR(64), mail_sent INT DEFAULT 0, mail_error TEXT, notes TEXT, created_at VARCHAR(32), updated_at VARCHAR(32))$tail",
        "CREATE INDEX idx_enq_status ON enquiries (status, created_at)",
        "CREATE TABLE IF NOT EXISTS deletion_requests (id $id, ref VARCHAR(24) NOT NULL UNIQUE, status VARCHAR(24) NOT NULL, full_name $s, email $s, phone VARCHAR(40), company $s, account_id $s, account_type VARCHAR(24), scope VARCHAR(24), details TEXT, token_hash VARCHAR(64), token_expires VARCHAR(32), email_verified_at VARCHAR(32), identity_verified INT DEFAULT 0, verification_method $s, verification_notes TEXT, assigned_to VARCHAR(64), platform_ref $s, retained_summary TEXT, decision_note TEXT, webhook_status TEXT, ip VARCHAR(64), created_at VARCHAR(32), updated_at VARCHAR(32), completed_at VARCHAR(32))$tail",
        "CREATE INDEX idx_del_status ON deletion_requests (status, created_at)",
        "CREATE TABLE IF NOT EXISTS deletion_events (id $id, request_id INT NOT NULL, at VARCHAR(32), actor VARCHAR(64), action VARCHAR(48), note TEXT)$tail",
    ];
    foreach ($t as $sql) { try { $pdo->exec($sql); } catch (Throwable $e) { if (!str_contains($sql, 'CREATE INDEX')) { throw $e; } } }
    $pdo->prepare("DELETE FROM meta WHERE k='schema'")->execute();
    $pdo->prepare("INSERT INTO meta (k, v) VALUES ('schema', '1')")->execute();
}

function now_utc(): string { return gmdate('Y-m-d H:i:s'); }

function db_all(string $sql, array $p = []): array { $s = db()->prepare($sql); $s->execute($p); return $s->fetchAll(); }
function db_one(string $sql, array $p = []): ?array { $s = db()->prepare($sql); $s->execute($p); $r = $s->fetch(); return $r ?: null; }
function db_val(string $sql, array $p = []) { $s = db()->prepare($sql); $s->execute($p); return $s->fetchColumn(); }
function db_run(string $sql, array $p = []): int { $s = db()->prepare($sql); $s->execute($p); return $s->rowCount(); }
function db_insert(string $table, array $row): int
{
    $cols = array_keys($row);
    db_run("INSERT INTO $table (" . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($row));
    return (int)db()->lastInsertId();
}
function db_update(string $table, int $id, array $row): void
{
    $sets = implode(',', array_map(fn($c) => "$c=?", array_keys($row)));
    db_run("UPDATE $table SET $sets WHERE id=?", [...array_values($row), $id]);
}

function make_ref(string $prefix): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; $r = '';
    for ($i = 0; $i < 5; $i++) { $r .= $alphabet[random_int(0, strlen($alphabet) - 1)]; }
    return $prefix . '-' . gmdate('ymd') . '-' . $r;
}

function admin_log(string $actor, string $action, string $detail = ''): void
{
    try { db_insert('admin_log', ['at' => now_utc(), 'actor' => $actor, 'action' => $action, 'detail' => $detail]); } catch (Throwable $e) {}
}
