# Backups and the tested restore

## What is backed up

Every night at about 02:30 (server time) the service `itz-backup` creates a folder in `/var/backups/itrackzen/<UTC date>/`:

| File | Content |
|---|---|
| `db.dump.gpg` | The whole PostgreSQL database (all records, users, settings), encrypted AES-256 |
| `filestore.tar.gz.gpg` | All uploaded files: photos, signatures, attachments, encrypted |
| `counts.txt`, `manifest.json` | Record counts and versions, used to check a restore |
| `SHA256SUMS` | Checksums; a damaged backup is refused at restore time |

Retention: 30 days of daily backups plus the first backup of each of the last 12 months. Optional **off-site copy**: set `OFFSITE_RSYNC` in `/etc/itrackzen/backup.env`
(a second server over SSH). **Keep `/etc/itrackzen/backup.passphrase` somewhere safe that is not this server**: without it encrypted backups cannot be opened.

Not in the backup (reinstall from the delivered files): the Odoo program itself and the add-ons. `/etc/itrackzen/secrets.env` should also be stored safely.

## Take a backup now

```bash
sudo itz-backup
```

## Restore (disaster recovery)

```bash
sudo systemctl stop itrackzen-odoo
sudo itz-restore /var/backups/itrackzen/20261024T023000Z itrackzen --force
sudo systemctl start itrackzen-odoo
```
`--force` is required to replace the live database. The script checks the checksums first, decrypts, loads the database and the files, and refuses to touch a database when the backup is damaged.

New server: run the install script first (it creates an empty system and the secrets), copy the backup folder and `backup.passphrase` over, then run the restore command above.

## Prove the restore works (do this monthly)

```bash
sudo itz-verify-restore
```
It restores the newest backup into a temporary database next to the live one, switches off emails and integrations in the copy, compares record counts with the manifest,
checks that attached files exist, starts Odoo on the copy, prints `RESTORE VERIFIED` and removes the copy. It never touches the live database or files. Add it to your monthly checklist.

## What was tested here (24 Oct 2026, demo data on Ubuntu 24.04, PostgreSQL 16)

| Test | Result |
|---|---|
| Encrypted backup of the demo database | 5.3 MB, checksums written |
| Verify restore: counts of 11 record types | all equal |
| Verify restore: 500 attachments exist in restored file store | none missing |
| Verify restore: Odoo opens the restored copy, owner and jobs present | yes |
| Damaged backup (one byte changed) | refused with `CHECKSUM MISMATCH`, no database created |
| **Disaster recovery**: live demo database and its files destroyed, restored from backup with `--force` | system came back with all data; sign-in and PDFs work |
| Verify run next to the live system | live file store unchanged (449 files before and after) |

**A bug found and fixed by these tests:** the first version of the restore script, when restoring a copy next to the live system, unpacked the files over the live file store's
folder and moved it. This is exactly the kind of mistake a restore test exists to find. It was fixed (files are unpacked in a scratch folder first) and the disaster-recovery test above was run on the fixed script.

Not tested here: the scripts' off-site copy option, and running them on a different server than the one that took the backup (the steps above are standard PostgreSQL practice, but do one rehearsal on your server).
