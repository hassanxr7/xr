import path from 'node:path';
import { openDb } from '../src/db.js';
import { createBackup } from '../src/backup.js';
const dir = process.env.DATA_DIR || './data';
const db = openDb(process.env.DB_FILE || path.join(dir, 'bizsuite.sqlite'));
console.log(JSON.stringify(createBackup(db, process.env.BACKUP_DIR || path.join(dir, 'backups'), Number(process.env.BACKUP_KEEP || 14)), null, 2));
