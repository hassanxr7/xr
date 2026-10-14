/* Deposit store: a JSON file written atomically (temp file + rename).
 * Node runs request handlers one at a time, so a read-check-write done synchronously inside
 * one handler cannot interleave with another — that is what keeps crediting idempotent.
 * Swap for a real database (with row locks) before running more than one server process.
 */
'use strict';
const fs = require('fs');
const path = require('path');

class DepositStore {
  constructor(file) {
    this.file = file;
    this.deposits = {};
    this.ledger = [];
    if (file && fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.deposits = data.deposits || {};
      this.ledger = data.ledger || [];
    }
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ deposits: this.deposits, ledger: this.ledger }));
    fs.renameSync(tmp, this.file);
  }

  get(id) {
    return Object.prototype.hasOwnProperty.call(this.deposits, id) ? this.deposits[id] : null;
  }

  insert(dep) {
    if (this.get(dep.id)) throw new Error('duplicate deposit id');
    this.deposits[dep.id] = dep;
    this.save();
    return dep;
  }

  // confirm a pending (or browser-cancelled) deposit exactly once and write its ledger entry
  confirm(id, providerData) {
    const dep = this.get(id);
    if (!dep) return { ok: false, reason: 'unknown' };
    if (dep.status === 'confirmed') return { ok: true, duplicate: true, dep };
    dep.status = 'confirmed';
    dep.confirmedAt = Date.now();
    dep.provider = providerData;
    this.ledger.push({ t: dep.confirmedAt, deposit: id, cents: dep.cents, currency: dep.currency, kind: 'sovamoney_deposit' });
    this.save();
    return { ok: true, duplicate: false, dep };
  }

  // move a still-open deposit to a final non-paid state; never touches a confirmed one
  close(id, status, message) {
    const dep = this.get(id);
    if (!dep || dep.status === 'confirmed' || dep.status === 'failed') return dep;
    dep.status = status;
    dep.closedAt = Date.now();
    if (message) dep.message = String(message).slice(0, 200);
    this.save();
    return dep;
  }

  // hand a confirmed deposit to the customer's wallet once
  deliver(id) {
    const dep = this.get(id);
    if (!dep || dep.status !== 'confirmed' || dep.deliveredAt) return { delivered: false, dep };
    dep.deliveredAt = Date.now();
    this.save();
    return { delivered: true, dep };
  }
}

module.exports = { DepositStore };
