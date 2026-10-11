# Deployment

> **Status:** the artefacts below are provided and the application is verified locally (unit + browser tests), but **no production host was available during development, so a live deployment has not been performed.** Follow this guide on your server; budget about 1 hour.

## Requirements
* A Linux VM (1 vCPU / 1–2 GB RAM / 20 GB disk is enough to start), a domain name pointing at it, ports 80/443 open.
* Docker + Docker Compose **or** Node.js ≥ 22.13.

## Option A – Docker + automatic HTTPS (recommended)
```bash
git clone <repo> && cd <repo>/bizsuite
cp .env.example .env            # set DOMAIN and ACME_EMAIL
docker compose up -d --build
# create the first organisation + owner (generate a strong password; do not reuse the demo one)
docker compose exec -e OWNER_EMAIL=you@example.com -e OWNER_PASSWORD='<generated>' -e ORG_NAME='My Group' app npm run bootstrap
```
Open `https://<DOMAIN>` and sign in. Then: Organisation → add businesses and branches → Staff → Settings.
Data lives in the `bizsuite-data` Docker volume (`/data`: database, uploads, backups).

## Option B – systemd on a VM
```bash
sudo useradd -r -m bizsuite && sudo -u bizsuite git clone <repo> /home/bizsuite/app
sudo tee /etc/systemd/system/bizsuite.service <<'UNIT'
[Unit]
Description=BizSuite
After=network.target
[Service]
User=bizsuite
WorkingDirectory=/home/bizsuite/app/bizsuite
Environment=DATA_DIR=/var/lib/bizsuite PORT=3000 SEED_DEMO=0 HTTPS=1 TRUST_PROXY=1 TZ=Africa/Mogadishu
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning src/server.js
Restart=always
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/bizsuite
[Install]
WantedBy=multi-user.target
UNIT
sudo mkdir -p /var/lib/bizsuite && sudo chown bizsuite /var/lib/bizsuite
sudo systemctl enable --now bizsuite
```
Put Caddy or nginx in front for TLS (`reverse_proxy 127.0.0.1:3000`).

## Configuration (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | listen port |
| `DATA_DIR` | `./data` | database (`bizsuite.sqlite`), `uploads/`, `backups/` |
| `DB_FILE` | `$DATA_DIR/bizsuite.sqlite` | override database path |
| `SEED_DEMO` | 1 (dev) | **set 0 in production**; 1 loads demo data only if the database is empty |
| `HTTPS` | 0 | 1 adds HSTS (set when behind TLS) |
| `TRUST_PROXY` | 0 | 1 = use `X-Forwarded-For` for rate limiting (only behind your proxy) |
| `REQUIRE_2FA` | 0 | 1 = users who can edit roles must enable TOTP |
| `RATE_LIMIT` | 600 | requests / minute / IP |
| `BACKUP_AUTO`, `BACKUP_KEEP` | 1, 14 | daily verified backup and retention |

Secrets: there are **no API keys or third-party secrets** in the base system. Passwords are never stored in files; the only secret on disk is the database itself – protect the VM, the volume and the backups.

## Hand-over of production credentials
Generate the owner password on the server (`openssl rand -base64 18`), deliver it through a password-manager share or a one-time-secret link, require a change at first login (*top-right name → Change password*) and enable 2FA for the owner. Never send credentials by e-mail/chat in clear text. Remove or rotate the demo accounts: production starts with `SEED_DEMO=0`, so none exist.

## Monitoring
* Liveness: `GET /api/health` → `{"ok":true}` (Docker `HEALTHCHECK` included). Point an uptime monitor (UptimeRobot, Healthchecks.io, …) at it.
* Logs: `docker compose logs -f app` / `journalctl -u bizsuite -f`. Unhandled errors are logged with stack traces; business errors are returned to the client.
* Disk: alert at 80 % (database + backups).
* Backups: see `BACKUP_RESTORE.md` – also copy them **off the server**.

## Updating
```bash
git pull && docker compose up -d --build     # migrations run automatically at start-up; take a backup first
```
Database changes are additive SQL files in `migrations/` applied once each (`schema_migrations`). There is no vendor platform to wait for: you own the code.
