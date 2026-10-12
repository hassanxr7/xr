import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApi } from './api.js';
import { createBackup } from './backup.js';
import { scanAlerts } from './notify.js';
import { seedIfEmpty } from './seed.js';
import { bootstrapFromEnv } from './bootstrap.js';

const here = path.dirname(fileURLToPath(import.meta.url)); const pub = path.join(here, '..', 'public');
const PORT = Number(process.env.PORT || 3000); const DATA = process.env.DATA_DIR || './data';
const db = openDb(process.env.DB_FILE || path.join(DATA, 'bizsuite.sqlite'));
const seedMode = process.env.SEED_DEMO ?? (process.env.NODE_ENV === 'production' ? '0' : '1'); // never seed demo data in production unless explicitly asked
if (seedMode === '1') seedIfEmpty(db);
else { try { bootstrapFromEnv(db); } catch (e) { console.error('First-start setup failed:', e.message); } }
const api = createApi(db, { dataDir: DATA });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'", ...(process.env.HTTPS === '1' ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}) };

const hits = new Map(); // coarse per-IP limiter: 600 requests / minute
setInterval(() => hits.clear(), 60e3).unref();
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); const ip = (process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress;
  if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
  if (url.pathname === '/api/health') { try { db.prepare('SELECT 1').get(); res.writeHead(200, { 'Content-Type': 'application/json', ...SEC }); return res.end('{"ok":true}'); } catch { res.writeHead(500); return res.end(); } }
  const n = (hits.get(ip) || 0) + 1; hits.set(ip, n); if (n > Number(process.env.RATE_LIMIT || 600)) { res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60', ...SEC }); return res.end('{"error":{"code":"rate_limited","message":"Too many requests"}}'); }
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 4 * 1024 * 1024) { res.writeHead(413, SEC); res.end('{"error":{"code":"too_large"}}'); req.destroy(); } else chunks.push(c); });
  req.on('end', () => {
    let body = {}; try { if (chunks.length) body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { res.writeHead(400, { 'Content-Type': 'application/json', ...SEC }); return res.end('{"error":{"code":"invalid_json","message":"Invalid JSON"}}'); }
    const r = api.handle({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers: req.headers, ip });
    if (r.raw) { const h = { 'Content-Type': r.type, 'Cache-Control': r.cache || 'no-store', ...SEC }; if (r.filename) h['Content-Disposition'] = `attachment; filename="${r.filename}"`; res.writeHead(r.status, h); return res.end(r.body); }
    res.writeHead(r.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SEC }); res.end(JSON.stringify(r.body));
  });
}).listen(PORT, () => console.log(`BizSuite listening on :${PORT}`));

function serveStatic(p, res) {
  const rel = p === '/' ? 'index.html' : decodeURIComponent(p).replace(/^\/+/, ''); const file = path.normalize(path.join(pub, rel));
  if (!file.startsWith(pub + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, SEC); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...SEC }); fs.createReadStream(file).pipe(res);
}
if (process.env.BACKUP_AUTO !== '0') setInterval(() => { try { createBackup(db, path.join(DATA, 'backups'), Number(process.env.BACKUP_KEEP || 14)); } catch (e) { console.error('backup failed', e.message); } }, 24 * 3600e3).unref();
setInterval(() => { try { scanAlerts(db); } catch (e) { console.error(e.message); } }, 10 * 60e3).unref();
setInterval(() => { try { db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now()); } catch { /* ignore */ } }, 3600e3).unref();
