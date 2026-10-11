// Creates the first organisation + owner on an EMPTY database (production start; no demo data).
// usage: OWNER_EMAIL=... OWNER_PASSWORD=... ORG_NAME="My Group" npm run bootstrap
import { openDb } from '../src/db.js';
import { createTenant } from '../src/platform.js';
const db = openDb(process.env.DB_FILE || (process.env.DATA_DIR || './data') + '/bizsuite.sqlite');
if (db.prepare('SELECT COUNT(*) c FROM orgs').get().c) { console.error('Database already initialised.'); process.exit(1); }
const { OWNER_EMAIL, OWNER_PASSWORD, ORG_NAME = 'My Organisation', OWNER_NAME = 'Owner' } = process.env;
if (!OWNER_EMAIL || !OWNER_PASSWORD) { console.error('Set OWNER_EMAIL and OWNER_PASSWORD'); process.exit(1); }
console.log(createTenant(db, { name: ORG_NAME, owner_name: OWNER_NAME, owner_email: OWNER_EMAIL, owner_password: OWNER_PASSWORD }));
