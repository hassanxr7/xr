// First-start setup for hosts without a terminal (e.g. Hostinger): if the database is empty and OWNER_EMAIL +
// OWNER_PASSWORD are set, create the organisation, the owner (forced to change the password at first login)
// and - unless BOOTSTRAP_BRANCHES=0 - the three Hubdex branches. Runs once; ignored when data already exists.
import { createTenant } from './platform.js';
import { Ctx } from './core.js';
import * as admin from './admin.js';

export function bootstrapFromEnv(db, env = process.env) {
  if (db.prepare('SELECT COUNT(*) c FROM orgs').get().c) return null;
  const { OWNER_EMAIL, OWNER_PASSWORD } = env; if (!OWNER_EMAIL || !OWNER_PASSWORD) return null;
  const t = createTenant(db, { name: env.ORG_NAME || 'Hubdex Store LTD', owner_name: env.OWNER_NAME || 'Owner', owner_email: OWNER_EMAIL, owner_password: OWNER_PASSWORD, must_change_password: true });
  if (env.BOOTSTRAP_BRANCHES !== '0') {
    const O = Ctx.forUserId(db, t.owner_id); const ccy = env.CURRENCY || 'USD';
    for (const [name, type, code, color] of [['Rio Berber', 'barber', 'RBR', '#c2410c'], ['Rio Store', 'clothing', 'RST', '#2563eb'], ['Reyxaan Store', 'electronics_combined', 'RYX', '#059669']]) {
      const business_id = admin.createBusiness(O, { name, type }).id;
      admin.createBranch(O, { business_id, code, name, color, currency: ccy, receipt_header: env.ORG_NAME || 'Hubdex Store LTD', receipt_footer: 'Thank you', tip_to: 'employee' });
    }
  }
  console.log(`First start: created organisation and owner ${OWNER_EMAIL}${env.BOOTSTRAP_BRANCHES !== '0' ? ' with Rio Berber, Rio Store and Reyxaan Store' : ''}. Remove OWNER_PASSWORD from the environment now.`);
  return t;
}
