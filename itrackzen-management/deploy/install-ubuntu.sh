#!/usr/bin/env bash
# ITrackZen Management System - installation on a fresh Ubuntu 24.04 server (as root).
#   sudo ./install-ubuntu.sh manage.itrackzen.net you@example.com
# Installs: PostgreSQL 16, Odoo 18.0 Community (pinned commit), the ITrackZen addons, systemd service, nginx with HTTPS (Let's Encrypt),
# the nightly backup job. It does NOT load demo data. Safe to re-run: existing databases and secrets are kept.
set -euo pipefail

DOMAIN="${1:-}"; EMAIL="${2:-}"; WEBSITE="${3:-https://itrackzen.net}"
[[ -n "$DOMAIN" && -n "$EMAIL" ]] || { echo "usage: $0 <domain, e.g. manage.itrackzen.net> <admin email for Let's Encrypt> [website address, default https://itrackzen.net]"; exit 1; }
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }

ODOO_SHA="98e48692891fc9a3aaa7f53001305b322f53cfa2"    # Odoo 18.0, the exact commit the ITrackZen addons were tested on
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC_ADDONS="$(cd "$HERE/.." && pwd)/addons"
ODOO_HOME=/opt/itrackzen
DB_NAME=itrackzen
SECRETS=/etc/itrackzen/secrets.env

export DEBIAN_FRONTEND=noninteractive
echo "==> system packages"
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib libpq-dev python3-venv python3-dev gcc g++ make git curl \
  libxml2-dev libxslt1-dev libldap2-dev libsasl2-dev libjpeg-dev zlib1g-dev libffi-dev libssl-dev \
  fonts-liberation fonts-dejavu-core xfonts-75dpi xfonts-base node-less npm nginx certbot python3-certbot-nginx \
  gnupg rsync ufw logrotate

echo "==> PDF engine (wkhtmltopdf with the patched Qt build; the Ubuntu package cannot print page headers and footers)"
if ! wkhtmltopdf --version 2>/dev/null | grep -q "patched qt"; then
  WK_DEB=/tmp/wkhtmltox.deb
  curl -fsSL -o "$WK_DEB" "https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.jammy_amd64.deb"
  apt-get install -y -qq "$WK_DEB"
fi
wkhtmltopdf --version

echo "==> service user and folders"
id itrackzen &>/dev/null || useradd --system --home "$ODOO_HOME" --shell /usr/sbin/nologin itrackzen
mkdir -p "$ODOO_HOME" /etc/itrackzen /var/lib/itrackzen/odoo /var/log/itrackzen /var/backups/itrackzen
chown itrackzen:itrackzen "$ODOO_HOME" /var/lib/itrackzen/odoo /var/log/itrackzen
chown root:itrackzen /etc/itrackzen   # the service user must be able to enter the folder to read odoo.conf (secrets.env stays root-only)
chmod 750 /etc/itrackzen /var/backups/itrackzen

echo "==> secrets"
if [[ ! -f "$SECRETS" ]]; then
  umask 077
  { echo "DB_PASSWORD=$(openssl rand -hex 24)"; echo "MASTER_PASSWORD=$(openssl rand -hex 24)"; echo "BACKUP_PASSPHRASE=$(openssl rand -hex 32)"; } > "$SECRETS"
fi
# shellcheck disable=SC1090
source "$SECRETS"

echo "==> database"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='itrackzen'" | grep -q 1 || sudo -u postgres createuser itrackzen
sudo -u postgres psql -c "ALTER ROLE itrackzen WITH LOGIN CREATEDB PASSWORD '$DB_PASSWORD'" >/dev/null

echo "==> Odoo source ($ODOO_SHA)"
if [[ ! -d "$ODOO_HOME/odoo/.git" ]]; then
  sudo -u itrackzen git init -q "$ODOO_HOME/odoo"
  sudo -u itrackzen git -C "$ODOO_HOME/odoo" remote add origin https://github.com/odoo/odoo.git
fi
sudo -u itrackzen git -C "$ODOO_HOME/odoo" fetch --depth 1 origin "$ODOO_SHA"
sudo -u itrackzen git -C "$ODOO_HOME/odoo" checkout -q --force FETCH_HEAD
[[ -d "$ODOO_HOME/venv" ]] || sudo -u itrackzen python3 -m venv "$ODOO_HOME/venv"
sudo -u itrackzen "$ODOO_HOME/venv/bin/pip" install -q --upgrade pip wheel
sudo -u itrackzen "$ODOO_HOME/venv/bin/pip" install -q -r "$ODOO_HOME/odoo/requirements.txt" xlsxwriter

echo "==> ITrackZen addons"
mkdir -p "$ODOO_HOME/addons"
rsync -a --delete "$SRC_ADDONS/" "$ODOO_HOME/addons/"
chown -R itrackzen:itrackzen "$ODOO_HOME/addons"

echo "==> configuration"
sed -e "s#__ODOO_HOME__#$ODOO_HOME#g" -e "s#__DB_PASSWORD__#$DB_PASSWORD#" -e "s#__DB_NAME__#$DB_NAME#g" -e "s#__MASTER_PASSWORD__#$MASTER_PASSWORD#" \
  "$HERE/odoo.conf.template" > /etc/itrackzen/odoo.conf
chown root:itrackzen /etc/itrackzen/odoo.conf; chmod 640 /etc/itrackzen/odoo.conf
cp "$HERE/systemd/itrackzen-odoo.service" /etc/systemd/system/itrackzen-odoo.service

echo "==> create the database and install the ITrackZen modules (this takes several minutes)"
if ! sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  sudo -u itrackzen "$ODOO_HOME/venv/bin/python" "$ODOO_HOME/odoo/odoo-bin" -c /etc/itrackzen/odoo.conf -d "$DB_NAME" \
     -i itz_website_bridge --without-demo=all --stop-after-init
else
  echo "database $DB_NAME exists: updating modules instead"
  sudo -u itrackzen "$ODOO_HOME/venv/bin/python" "$ODOO_HOME/odoo/odoo-bin" -c /etc/itrackzen/odoo.conf -d "$DB_NAME" \
     -u itz_website_bridge --stop-after-init
fi

echo "==> first administrator password and website connection"
FIRST_RUN_FILE=/etc/itrackzen/first-admin-password.txt
if [[ ! -f "$FIRST_RUN_FILE" ]]; then
  ADMIN_PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  umask 077; echo "admin / $ADMIN_PW   (change it after the first sign-in, then delete this file)" > "$FIRST_RUN_FILE"; umask 022
  sudo -u itrackzen "$ODOO_HOME/venv/bin/python" "$ODOO_HOME/odoo/odoo-bin" shell -c /etc/itrackzen/odoo.conf -d "$DB_NAME" --no-http >/dev/null <<PYEOF
admin = env.ref('base.user_admin')
admin.write({'password': '$ADMIN_PW', 'email': '$EMAIL'})
cfg = env['itz.website.config'].get_config()
cfg.sudo().write({'website_url': '$WEBSITE', 'admin_url': '$WEBSITE/admin/', 'allowed_redirects': '$WEBSITE/admin/sso.php'})
icp = env['ir.config_parameter'].sudo()
icp.set_param('web.base.url', 'https://$DOMAIN')
icp.set_param('itz.website_url', '$WEBSITE')
icp.set_param('itz.website_admin_url', '$WEBSITE/admin/')
env.cr.commit()
PYEOF
fi

systemctl daemon-reload
systemctl enable --now itrackzen-odoo

echo "==> nginx + HTTPS"
sed "s#__DOMAIN__#$DOMAIN#g" "$HERE/nginx/manage.conf" > /etc/nginx/sites-available/itrackzen-manage
ln -sf /etc/nginx/sites-available/itrackzen-manage /etc/nginx/sites-enabled/itrackzen-manage
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "!! certbot failed: point the DNS record of $DOMAIN to this server and run: certbot --nginx -d $DOMAIN"

echo "==> firewall"
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null

echo "==> backups"
install -m 750 "$HERE/backup/backup.sh" /usr/local/sbin/itz-backup
install -m 750 "$HERE/backup/restore.sh" /usr/local/sbin/itz-restore
install -m 750 "$HERE/backup/verify-restore.sh" /usr/local/sbin/itz-verify-restore
cat > /etc/itrackzen/backup.env <<BENV
DB_NAME=$DB_NAME
PGUSER=itrackzen
PGHOST=127.0.0.1
PGPASSWORD=$DB_PASSWORD
FILESTORE_DIR=/var/lib/itrackzen/odoo/filestore/$DB_NAME
BACKUP_DIR=/var/backups/itrackzen
RETENTION_DAYS=30
KEEP_MONTHLY=12
GPG_PASSPHRASE_FILE=/etc/itrackzen/backup.passphrase
ODOO_BIN="$ODOO_HOME/venv/bin/python $ODOO_HOME/odoo/odoo-bin"
ODOO_CONF=/etc/itrackzen/odoo.conf
ADDONS_DIR=$ODOO_HOME/addons
; OFFSITE_RSYNC=user@backup-host:/backups/itrackzen/       (optional second copy; uncomment and set up an SSH key)
BENV
echo -n "$BACKUP_PASSPHRASE" > /etc/itrackzen/backup.passphrase; chmod 600 /etc/itrackzen/backup.passphrase
chmod 640 /etc/itrackzen/backup.env; chown root:itrackzen /etc/itrackzen/backup.env
cp "$HERE/systemd/itz-backup.service" "$HERE/systemd/itz-backup.timer" /etc/systemd/system/
systemctl daemon-reload; systemctl enable --now itz-backup.timer

echo
echo "DONE. Open https://$DOMAIN and sign in. The first administrator login is in $FIRST_RUN_FILE (root only)."
echo "Next: turn on website sign-in (Management > Configuration > Website > Connection and Sign-in) and copy the shared secret into the website; see docs/INSTALL.md."
echo "Secrets are in $SECRETS (root only). KEEP /etc/itrackzen/backup.passphrase safe OFF this server: without it encrypted backups cannot be restored."
