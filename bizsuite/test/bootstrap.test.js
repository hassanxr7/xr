import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { bootstrapFromEnv } from '../src/bootstrap.js';
import { client } from './helpers.js';
test('first start creates owner + three Hubdex branches from environment, exactly once, with forced password change', async () => {
  const db = openDb(':memory:'); assert.equal(bootstrapFromEnv(db, {}), null, 'nothing without credentials');
  const env = { OWNER_EMAIL: 'boss@hubdex.so', OWNER_PASSWORD: 'First-Pass-2026', ORG_NAME: 'Hubdex Store LTD' };
  assert.ok(bootstrapFromEnv(db, env)); assert.equal(bootstrapFromEnv(db, env), null, 'second start does nothing');
  assert.deepEqual(db.prepare('SELECT b.name, u.type FROM branches b JOIN businesses u ON u.id=b.business_id ORDER BY b.id').all().map((r) => `${r.name}:${r.type}`), ['Rio Berber:barber', 'Rio Store:clothing', 'Reyxaan Store:electronics_combined']);
  const api = await client(db).login('boss@hubdex.so', 'First-Pass-2026'); assert.equal(api('GET', '/api/branches').body.error.code, 'password_change_required');
  assert.equal(api('POST', '/api/auth/password', { current: 'First-Pass-2026', password: 'Owner-Own-Pass9' }).status, 200);
  const api2 = await client(db).login('boss@hubdex.so', 'Owner-Own-Pass9'); assert.equal(api2('GET', '/api/branches').body.rows.length, 3);
});
