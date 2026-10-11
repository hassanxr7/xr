# Backup and restoration guide

## What is backed up
One SQLite file (all businesses, branches, transactions, users, settings, audit log). Uploaded images live in `$DATA_DIR/uploads/` and must be copied with it.

## Automatic
The server takes a **consistent online snapshot** (`VACUUM INTO`, no downtime) every 24 h into `$DATA_DIR/backups/`, **verifies it** (`PRAGMA integrity_check`, `foreign_key_check`, row counts) and keeps the latest 14 (`BACKUP_KEEP`). A backup that fails verification is deleted and an error is logged.

## Manual (also from the UI: Settings → Backups → *Create backup now*)
```bash
docker compose exec app npm run backup        # or: npm run backup
```

## Off-site copy (required – a backup on the same disk is not a backup)
Example nightly cron on the host (rsync to another machine, or `rclone` to object storage):
```bash
0 3 * * * rsync -a /var/lib/docker/volumes/bizsuite_bizsuite-data/_data/backups/ backup@other-host:/srv/bizsuite-backups/ \
       && rsync -a /var/lib/docker/volumes/bizsuite_bizsuite-data/_data/uploads/ backup@other-host:/srv/bizsuite-uploads/
```

## Restore
1. **Stop the service** (`docker compose stop app` / `systemctl stop bizsuite`).
2. `npm run restore -- /path/to/bizsuite-2026-10-11T03-00-00-000Z.sqlite` (inside the container: `docker compose run --rm app npm run restore -- /data/backups/<file>`).
   The tool *refuses an unverified backup*, keeps the current database as `bizsuite.sqlite.before-restore-<timestamp>` and replaces it.
3. Restore `uploads/` if needed, start the service, sign in and spot-check the dashboard and last transactions.

## Restore drill (do this quarterly)
`test/acceptance.test.js → "16. Backup is verified and restoration recovers a consistent, usable database"` automates it: seeds data, snapshots, **destroys the live file**, restores, and asserts the dashboard JSON is **byte-identical** before and after, that the restored file passes integrity checks, and that a corrupt backup is rejected. Run it any time with `npm test`. Perform a manual drill on a scratch VM the same way before go-live and record the date.

## Recovery objectives (default configuration)
RPO ≤ 24 h (≤ minutes if you also take a manual backup before risky operations; for a tighter RPO run `npm run backup` hourly from cron). RTO ≈ 15 minutes (restore + start).
