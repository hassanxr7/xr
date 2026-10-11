import path from 'node:path';
import { restoreBackup } from '../src/backup.js';
const [file] = process.argv.slice(2); if (!file) { console.error('usage: npm run restore -- <backup.sqlite>   (stop the server first)'); process.exit(1); }
console.log(JSON.stringify(restoreBackup(file, process.env.DB_FILE || path.join(process.env.DATA_DIR || './data', 'bizsuite.sqlite')), null, 2));
