import { openDb } from '../src/db.js';
import { createBackup } from '../src/backup.js';
const db = openDb(process.env.DB_FILE || './data/bizsuite.sqlite');
console.log(JSON.stringify(createBackup(db, process.env.BACKUP_DIR || './data/backups', Number(process.env.BACKUP_KEEP || 14)), null, 2));
