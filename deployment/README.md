# Deploying SMSBridge

Two paths: **local development** (no Docker, fastest iteration) and a
**production VPS deployment** (Docker Compose + Caddy, HTTPS via Let's
Encrypt). Both are described exactly, command by command.

## What you must supply yourself

- A Linux VPS (these instructions assume Ubuntu 22.04/24.04) with a public
  IP, reachable on ports 80 and 443.
- A domain name (or subdomain) with an **A record** pointing at that IP.
  SMSBridge does not need or want a specific registrar/host — any DNS
  provider works.
- An Android phone to install the app on (see `android/README.md`).
- Nothing else is required to be paid/proprietary: Postgres, Caddy, Node,
  and every library used are open-source and self-hosted.

---

## 1. Local development (no Docker)

Requires Node.js 22+, PostgreSQL 16 (a local install or `docker run
postgres:16-alpine`), and npm.

```bash
# 1. Database
sudo -u postgres createdb -O <role> smsbridge   # or run postgres via Docker instead

# 2. API
cd api
cp .env.example .env            # edit DATABASE_URL to match your local Postgres
npm install
npx prisma migrate deploy
npm run owner:create -- --email=you@example.com --password='a-strong-password'
npm run start:dev               # http://localhost:3001, OpenAPI docs at /api/docs

# 3. Web dashboard (separate terminal)
cd web
cp .env.example .env.local       # sets API_PROXY_ORIGIN=http://localhost:3001
npm install
npm run dev                      # http://localhost:3000
```

Open `http://localhost:3000`, sign in with the owner account you created,
and go to **Devices → Add device** to generate a pairing code/QR for the
Android app. Since your phone and this laptop are on different networks in
real use, you'll want the API reachable at a real HTTPS URL for the phone
to pair against — see section 2 for that. For pure local testing you can
still pair with an Android emulator or a real phone on the same Wi-Fi by
using your machine's LAN IP and running the API without HTTPS, but treat
that as a dev convenience only, never production use.

### Running the test suite

```bash
cd api
sudo -u postgres createdb -O <role> smsbridge_test
cp .env.example .env.test        # point DATABASE_URL at smsbridge_test
echo 'LOGIN_RATE_LIMIT=1000' >> .env.test   # avoid tripping rate limits across many test cases
echo 'PAIR_RATE_LIMIT=1000' >> .env.test
npx prisma migrate deploy         # against .env.test's DATABASE_URL
npm run test:e2e
```

---

## 2. Production VPS deployment (Docker Compose + Caddy)

### 2.1 Point DNS at the server

Create an A record: `smsbridge.example.com -> <your VPS's public IP>`. Wait
for it to propagate (`dig +short smsbridge.example.com` should return the
IP) before continuing — Caddy's automatic HTTPS needs this to succeed.

### 2.2 Install Docker on the VPS (Ubuntu)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
```

### 2.3 Firewall

Only 22 (SSH), 80, and 443 need to be open. Postgres is never exposed —
`docker-compose.yml` gives it no host port mapping at all, so it's
unreachable outside the compose network even if you forget the firewall.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2.4 Get the code and configure

```bash
git clone <your-fork-or-repo-url> smsbridge
cd smsbridge/deployment
cp .env.example .env
nano .env   # set POSTGRES_PASSWORD, SMSBRIDGE_DOMAIN, etc.
```

### 2.5 Build and start

```bash
docker compose build
docker compose up -d
docker compose ps            # all four services should become healthy
docker compose logs -f caddy # watch it obtain the Let's Encrypt certificate
```

The API container runs `prisma migrate deploy` automatically on every start
(see `api/docker-entrypoint.sh`), so migrations are applied before the app
starts serving traffic.

### 2.6 Create the owner account

Public registration is disabled by design — this is the only way to create
the one owner account:

```bash
docker compose exec api npm run owner:create -- --email=you@example.com --password='a-strong-password'
```

Visit `https://smsbridge.example.com`, sign in, and pair your first device
from **Devices → Add device**.

### 2.7 Account recovery

If the owner password is lost, whoever controls the server runs:

```bash
docker compose exec api npm run owner:reset-password -- --password='a-new-strong-password'
```

This is the documented recovery path for a self-hosted single-owner
instance with no outbound email configured. It immediately signs out every
existing browser session.

---

## 3. Backups

```bash
cd deployment
./scripts/backup.sh                 # writes deployment/backups/smsbridge-<timestamp>.sql.gz
```

Run this on a schedule with cron, e.g. nightly:

```
0 3 * * * cd /path/to/smsbridge/deployment && ./scripts/backup.sh >> /var/log/smsbridge-backup.log 2>&1
```

**Encryption at rest for the backup file itself** (the Postgres data
volume is not separately encrypted by this setup — use encrypted VPS block
storage if your provider offers it, or an encrypted filesystem, for
at-rest protection of the live volume):

```bash
# Encrypt a backup with age (https://github.com/FiloSottile/age) before
# copying it offsite:
age -r <your-age-public-key> -o smsbridge-<timestamp>.sql.gz.age smsbridge-<timestamp>.sql.gz
```

Ship encrypted backups offsite (another host, S3-compatible storage, etc.)
— that step is intentionally left to you since it depends on what storage
you already have.

**What deletion means for backups**: deleting a message from the dashboard
removes it from the live database immediately, but an *already-taken*
backup still contains it until that backup itself is rotated/deleted per
your own retention schedule for backup files (separate from the app's
message-retention setting, which only prunes the live database). Restoring
an old backup will bring back messages that were deleted after that backup
was taken — this is normal backup behavior, not a bug, but worth knowing
before you restore.

### Restore

```bash
./scripts/restore.sh deployment/backups/smsbridge-<timestamp>.sql.gz
```

This stops the API, drops and recreates the database from the dump, then
restarts the API (which re-applies any migrations newer than the backup).
It asks for a typed confirmation because it is destructive to current data.

---

## 4. Upgrade

```bash
cd smsbridge
git pull
cd deployment
docker compose build
docker compose up -d
```

Take a backup first (`./scripts/backup.sh`) if the upgrade includes a
schema change you're unsure about. Migrations run automatically on API
container startup.

## 5. Rollback

```bash
cd smsbridge
git log --oneline -20        # find the commit/tag you want to roll back to
git checkout <previous-commit-or-tag>
cd deployment
docker compose build
docker compose up -d
```

If the previous version's schema is incompatible with data written by the
newer version (rare, since Prisma migrations are additive in this
project), restore the pre-upgrade backup instead of just rolling back code.

---

## 6. Health checks

- `GET /api/health` — liveness (process is up).
- `GET /api/health/ready` — readiness (process is up **and** can reach
  Postgres). `docker compose ps` and the container `HEALTHCHECK`s use this.

## 7. Rebranding

Set `BRAND_NAME` in `deployment/.env` (maps to `NEXT_PUBLIC_BRAND_NAME` for
the web app). For a deeper rebrand (Android `applicationId`/app icon), see
`android/README.md`.
