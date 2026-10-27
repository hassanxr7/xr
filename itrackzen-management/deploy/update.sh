#!/usr/bin/env bash
# Update the ITrackZen add-ons on a server that is already installed (as root).
#   sudo ./update.sh /root/itz_new/itrackzen/itrackzen-management/addons
# Copies the new add-ons, takes a backup first, updates every installed itz_ module, restarts the service.
set -euo pipefail
SRC="${1:-}"
[[ -d "$SRC/itz_base" ]] || { echo "usage: $0 <folder that contains itz_base, itz_sales, ... (the add-ons folder)>"; exit 1; }
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }
ODOO_HOME=/opt/itrackzen; DB=itrackzen

echo "==> backup first"
if command -v itz-backup >/dev/null; then itz-backup || echo "!! backup failed; continue only if you accept that"; fi

echo "==> copy add-ons"
rsync -a --delete "$SRC/" "$ODOO_HOME/addons/"
chown -R itrackzen:itrackzen "$ODOO_HOME/addons"

echo "==> libraries (AI-assisted replies)"
sudo -u itrackzen "$ODOO_HOME/venv/bin/pip" install -q anthropic || echo "!! could not install the AI library; replies still work without AI"

echo "==> update the installed ITrackZen modules (and install itz_mail, the email module, if it is new)"
MODULES="$(sudo -u postgres psql -d "$DB" -Atc "select string_agg(name, ',' order by name) from ir_module_module where name like 'itz\_%' and state='installed'")"
echo "modules: $MODULES"
systemctl stop itrackzen-odoo
sudo -u itrackzen "$ODOO_HOME/venv/bin/python" "$ODOO_HOME/odoo/odoo-bin" -c /etc/itrackzen/odoo.conf -d "$DB" -u "$MODULES" -i itz_mail --stop-after-init
systemctl start itrackzen-odoo
sleep 3
systemctl --no-pager --lines=0 status itrackzen-odoo | head -4
echo "DONE. Press Ctrl+Shift+R in the browser."
