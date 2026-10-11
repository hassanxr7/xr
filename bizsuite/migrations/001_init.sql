-- BizSuite schema. All money = INTEGER minor units. Quantities = INTEGER. Rates = basis points (4000 = 40%).
-- Every tenant table carries org_id; every query in the service layer is filtered by it.

CREATE TABLE orgs (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', -- active|suspended
  saas_enabled INTEGER NOT NULL DEFAULT 0, plan TEXT NOT NULL DEFAULT 'internal',
  max_branches INTEGER, max_users INTEGER, max_storage_mb INTEGER, modules TEXT, -- NULL = unlimited / all
  reporting_currency TEXT NOT NULL DEFAULT 'USD', created_at TEXT NOT NULL
);
CREATE TABLE exchange_rates (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), from_ccy TEXT NOT NULL, to_ccy TEXT NOT NULL,
  rate_ppm INTEGER NOT NULL, -- rate * 1,000,000
  effective_date TEXT NOT NULL, UNIQUE(org_id, from_ccy, to_ccy, effective_date)
);
CREATE TABLE businesses (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('clothing','electronics_retail','electronics_repair','barber','electronics_combined')),
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE branches (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), business_id INTEGER NOT NULL REFERENCES businesses(id),
  code TEXT NOT NULL, name TEXT NOT NULL, address TEXT, phone TEXT, email TEXT, logo_file_id INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD', timezone TEXT NOT NULL DEFAULT 'Africa/Mogadishu',
  manager_id INTEGER, tax_bp INTEGER NOT NULL DEFAULT 0, tip_to TEXT NOT NULL DEFAULT 'employee',
  require_register INTEGER NOT NULL DEFAULT 0, allow_credit INTEGER NOT NULL DEFAULT 1,
  receipt_header TEXT, receipt_footer TEXT, invoice_terms TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, UNIQUE(org_id, code)
);
CREATE TABLE departments (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL REFERENCES branches(id), name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('clothing','electronics_retail','electronics_repair','barber','electronics_combined')),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE roles (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL REFERENCES orgs(id), name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'assigned' CHECK (scope IN ('org','assigned')),
  perms TEXT NOT NULL DEFAULT '[]', -- JSON array of "module.action"
  limits TEXT NOT NULL DEFAULT '{}', -- JSON {discount_bp, refund_max, expense_max, adjust_qty, payout_max}
  is_system INTEGER NOT NULL DEFAULT 0, UNIQUE(org_id, name)
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY, org_id INTEGER REFERENCES orgs(id), -- NULL => platform admin
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, pass_hash TEXT NOT NULL,
  role_id INTEGER REFERENCES roles(id), active INTEGER NOT NULL DEFAULT 1, lang TEXT NOT NULL DEFAULT 'en',
  commission_bp INTEGER NOT NULL DEFAULT 0, totp_secret TEXT, totp_enabled INTEGER NOT NULL DEFAULT 0,
  is_platform INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE user_branches (user_id INTEGER NOT NULL REFERENCES users(id), branch_id INTEGER NOT NULL REFERENCES branches(id), PRIMARY KEY(user_id, branch_id));
CREATE TABLE commission_rate_history (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, user_id INTEGER NOT NULL, rate_bp INTEGER NOT NULL,
  changed_by INTEGER, changed_at TEXT NOT NULL
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), support_org_id INTEGER, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE support_access (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, reason TEXT, granted_by INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  revoked_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE counters (org_id INTEGER NOT NULL, scope TEXT NOT NULL, next INTEGER NOT NULL, PRIMARY KEY(org_id, scope));
CREATE TABLE idempotency (org_id INTEGER NOT NULL, user_id INTEGER NOT NULL, key TEXT NOT NULL, method_path TEXT NOT NULL, status INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(org_id, user_id, key));
CREATE TABLE settings (org_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY(org_id, key));
CREATE TABLE files (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER, owner_type TEXT, owner_id INTEGER,
  path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_by INTEGER, created_at TEXT NOT NULL
);

-- Parties
CREATE TABLE customers (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, notes TEXT,
  credit_limit INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, notes TEXT,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);

-- Catalogue & inventory
CREATE TABLE products (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, business_id INTEGER NOT NULL REFERENCES businesses(id), name TEXT NOT NULL,
  category TEXT, brand TEXT, model TEXT, kind TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard','serialized')),
  is_part INTEGER NOT NULL DEFAULT 0, warranty_months INTEGER NOT NULL DEFAULT 0, image_file_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE variants (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL, barcode TEXT, attrs TEXT NOT NULL DEFAULT '{}', cost INTEGER NOT NULL DEFAULT 0, price INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, UNIQUE(org_id, sku)
);
CREATE UNIQUE INDEX variants_barcode ON variants(org_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE TABLE stock (
  branch_id INTEGER NOT NULL REFERENCES branches(id), variant_id INTEGER NOT NULL REFERENCES variants(id),
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0), value INTEGER NOT NULL DEFAULT 0, -- weighted-average: avg = value/qty
  PRIMARY KEY(branch_id, variant_id)
);
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, variant_id INTEGER NOT NULL,
  type TEXT NOT NULL, qty INTEGER NOT NULL, value INTEGER NOT NULL, -- signed deltas
  ref_type TEXT, ref_id INTEGER, note TEXT, user_id INTEGER, created_at TEXT NOT NULL
);
CREATE INDEX sm_idx ON stock_movements(org_id, branch_id, variant_id);
CREATE TABLE devices (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, variant_id INTEGER NOT NULL REFERENCES variants(id), serial TEXT NOT NULL,
  branch_id INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('in_stock','sold','returned','transit','scrapped')),
  cost INTEGER NOT NULL DEFAULT 0, sale_id INTEGER, sale_line_id INTEGER, customer_id INTEGER, sold_at TEXT,
  warranty_start TEXT, warranty_end TEXT, created_at TEXT NOT NULL, UNIQUE(org_id, serial)
);
CREATE TABLE device_history (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, device_id INTEGER NOT NULL, event TEXT NOT NULL, ref_type TEXT, ref_id INTEGER, user_id INTEGER, note TEXT, created_at TEXT NOT NULL);

-- Purchases
CREATE TABLE purchases (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, business_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','partial','received','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid', currency TEXT NOT NULL, charges INTEGER NOT NULL DEFAULT 0,
  billed INTEGER NOT NULL DEFAULT 0, charges_billed INTEGER NOT NULL DEFAULT 0, paid INTEGER NOT NULL DEFAULT 0, note TEXT, user_id INTEGER, created_at TEXT NOT NULL, business_date TEXT NOT NULL,
  UNIQUE(org_id, ref)
);
CREATE TABLE purchase_lines (
  id INTEGER PRIMARY KEY, purchase_id INTEGER NOT NULL REFERENCES purchases(id), variant_id INTEGER NOT NULL REFERENCES variants(id),
  qty INTEGER NOT NULL, unit_cost INTEGER NOT NULL, qty_received INTEGER NOT NULL DEFAULT 0, qty_returned INTEGER NOT NULL DEFAULT 0, charge_allocated INTEGER NOT NULL DEFAULT 0
);

-- Transfers
CREATE TABLE transfers (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, ref TEXT NOT NULL, from_branch_id INTEGER NOT NULL, to_branch_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched','partial','received','cancelled')),
  note TEXT, created_by INTEGER, received_by INTEGER, created_at TEXT NOT NULL, received_at TEXT, UNIQUE(org_id, ref)
);
CREATE TABLE transfer_lines (
  id INTEGER PRIMARY KEY, transfer_id INTEGER NOT NULL REFERENCES transfers(id), variant_id INTEGER NOT NULL, qty INTEGER NOT NULL,
  cost_total INTEGER NOT NULL, qty_received INTEGER NOT NULL DEFAULT 0, value_received INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE transfer_devices (line_id INTEGER NOT NULL, device_id INTEGER NOT NULL, received INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(line_id, device_id));
CREATE TABLE stock_counts (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, ref TEXT NOT NULL, lines TEXT NOT NULL, user_id INTEGER, created_at TEXT NOT NULL);

-- Payment methods & accounts
CREATE TABLE payment_methods (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('cash','mobile','bank','card','credit','other')),
  provider TEXT NOT NULL DEFAULT 'manual', active INTEGER NOT NULL DEFAULT 1, UNIQUE(org_id, name)
);
CREATE TABLE branch_accounts (branch_id INTEGER NOT NULL, method_id INTEGER NOT NULL, opening_balance INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(branch_id, method_id));

-- Sales (retail and barber visits share this model)
CREATE TABLE sales (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, business_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, department_id INTEGER,
  ref TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('retail','service')), customer_id INTEGER, customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','void')), payment_status TEXT NOT NULL DEFAULT 'unpaid',
  currency TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0, -- confirmed in minus confirmed out (cache, verified by tests)
  returned_total INTEGER NOT NULL DEFAULT 0, tip INTEGER NOT NULL DEFAULT 0, tip_to TEXT,
  user_id INTEGER NOT NULL, approved_by INTEGER, void_reason TEXT, note TEXT, created_at TEXT NOT NULL, business_date TEXT NOT NULL,
  UNIQUE(org_id, ref)
);
CREATE INDEX sales_idx ON sales(org_id, branch_id, business_date);
CREATE TABLE sale_lines (
  id INTEGER PRIMARY KEY, sale_id INTEGER NOT NULL REFERENCES sales(id), variant_id INTEGER, device_id INTEGER, service_id INTEGER,
  barber_id INTEGER, description TEXT NOT NULL, qty INTEGER NOT NULL, unit_price INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
  net INTEGER NOT NULL, -- qty*unit_price - discount (excl tax)
  tax INTEGER NOT NULL DEFAULT 0, cost_total INTEGER NOT NULL DEFAULT 0, returned_qty INTEGER NOT NULL DEFAULT 0,
  returned_net INTEGER NOT NULL DEFAULT 0, returned_tax INTEGER NOT NULL DEFAULT 0, cost_reversed INTEGER NOT NULL DEFAULT 0,
  commission_bp INTEGER NOT NULL DEFAULT 0, warranty_end TEXT
);
CREATE TABLE services (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, business_id INTEGER NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL,
  duration_min INTEGER, consumable_cost INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE returns (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, sale_id INTEGER NOT NULL REFERENCES sales(id), ref TEXT NOT NULL,
  net INTEGER NOT NULL, tax INTEGER NOT NULL, refund INTEGER NOT NULL, cost_reversed INTEGER NOT NULL, reason TEXT,
  user_id INTEGER, approved_by INTEGER, created_at TEXT NOT NULL, business_date TEXT NOT NULL, UNIQUE(org_id, ref)
);
CREATE TABLE return_lines (id INTEGER PRIMARY KEY, return_id INTEGER NOT NULL, sale_line_id INTEGER NOT NULL, qty INTEGER NOT NULL, net INTEGER NOT NULL, tax INTEGER NOT NULL, restock INTEGER NOT NULL, cost_reversed INTEGER NOT NULL);

-- Payments (customer receipts, supplier payments, refunds, payouts)
CREATE TABLE payments (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, ref TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  party_type TEXT NOT NULL CHECK (party_type IN ('sale','repair','purchase','payout','refund','customer')),
  party_id INTEGER, customer_id INTEGER, supplier_id INTEGER, method_id INTEGER NOT NULL, method_kind TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0), currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','failed','cancelled')),
  provider TEXT NOT NULL DEFAULT 'manual', external_ref TEXT, session_id INTEGER, reverses_id INTEGER, reversed_by INTEGER,
  reconciled_at TEXT, is_collection INTEGER NOT NULL DEFAULT 0, note TEXT, user_id INTEGER, created_at TEXT NOT NULL, business_date TEXT NOT NULL, UNIQUE(org_id, ref)
);
CREATE INDEX pay_idx ON payments(org_id, branch_id, business_date);
CREATE INDEX pay_party ON payments(party_type, party_id);
CREATE TABLE reconciliations (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, method_id INTEGER NOT NULL, book_total INTEGER NOT NULL, statement_total INTEGER NOT NULL, difference INTEGER NOT NULL, payment_ids TEXT NOT NULL, note TEXT, user_id INTEGER, created_at TEXT NOT NULL);

-- Repairs
CREATE TABLE repair_jobs (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, business_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, ref TEXT NOT NULL,
  customer_id INTEGER, customer_name TEXT NOT NULL, customer_phone TEXT, device_category TEXT, brand TEXT, model TEXT, serial TEXT,
  fault TEXT NOT NULL, condition_notes TEXT, accessories TEXT, device_lock TEXT, technician_id INTEGER, est_completion TEXT, est_price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','diagnosing','awaiting_approval','awaiting_parts','in_progress','completed','delivered','cancelled','unrepairable')),
  diagnosis TEXT, notes TEXT, approved_total INTEGER, tech_commission_bp INTEGER NOT NULL DEFAULT 0, other_direct_cost INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL, qc_done INTEGER NOT NULL DEFAULT 0, completed_at TEXT, delivered_at TEXT, user_id INTEGER, created_at TEXT NOT NULL, business_date TEXT NOT NULL,
  revenue_date TEXT, UNIQUE(org_id, ref)
);
CREATE TABLE repair_status_history (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, status TEXT NOT NULL, note TEXT, user_id INTEGER, created_at TEXT NOT NULL);
CREATE TABLE repair_charges (
  id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES repair_jobs(id), kind TEXT NOT NULL CHECK (kind IN ('labor','part','other')),
  description TEXT NOT NULL, variant_id INTEGER, qty INTEGER NOT NULL DEFAULT 1, unit_price INTEGER NOT NULL, cost_total INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 1, voided INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE repair_approvals (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL, decision TEXT NOT NULL, by_name TEXT, note TEXT, recorded_by INTEGER, created_at TEXT NOT NULL);

-- Commission ledger & payouts
CREATE TABLE commission_payouts (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, employee_id INTEGER NOT NULL, ref TEXT NOT NULL,
  period_from TEXT, period_to TEXT, earned INTEGER NOT NULL, payable INTEGER NOT NULL, advances INTEGER NOT NULL DEFAULT 0, deductions INTEGER NOT NULL DEFAULT 0,
  previous_balance INTEGER NOT NULL DEFAULT 0, net_due INTEGER NOT NULL, amount_paid INTEGER NOT NULL, remaining INTEGER NOT NULL,
  method_id INTEGER, payment_id INTEGER, note TEXT, status TEXT NOT NULL DEFAULT 'paid', processed_by INTEGER, approved_by INTEGER, created_at TEXT NOT NULL, business_date TEXT NOT NULL,
  UNIQUE(org_id, ref)
);
CREATE TABLE commission_ledger (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, employee_id INTEGER NOT NULL,
  source_type TEXT NOT NULL, source_id INTEGER NOT NULL, -- sale_line | repair | advance | carry
  sale_id INTEGER, type TEXT NOT NULL, base INTEGER NOT NULL DEFAULT 0, rate_bp INTEGER NOT NULL DEFAULT 0,
  earned_delta INTEGER NOT NULL DEFAULT 0, payable_delta INTEGER NOT NULL DEFAULT 0,
  settled_payout_id INTEGER REFERENCES commission_payouts(id), note TEXT, created_at TEXT NOT NULL, business_date TEXT NOT NULL
);
CREATE INDEX cl_idx ON commission_ledger(org_id, employee_id, settled_payout_id);
CREATE INDEX cl_src ON commission_ledger(source_type, source_id);

-- Expenses
CREATE TABLE expense_categories (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, name TEXT NOT NULL, UNIQUE(org_id, name));
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, ref TEXT NOT NULL, scope TEXT NOT NULL CHECK (scope IN ('branch','business','org')),
  business_id INTEGER, branch_id INTEGER, category_id INTEGER NOT NULL, description TEXT, amount INTEGER NOT NULL CHECK (amount > 0), currency TEXT NOT NULL,
  alloc_rule TEXT, status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected','void')),
  method_id INTEGER, method_kind TEXT, session_id INTEGER, expense_date TEXT NOT NULL, created_by INTEGER, approved_by INTEGER, created_at TEXT NOT NULL,
  UNIQUE(org_id, ref)
);
CREATE TABLE expense_allocations (id INTEGER PRIMARY KEY, expense_id INTEGER NOT NULL REFERENCES expenses(id), branch_id INTEGER NOT NULL, amount INTEGER NOT NULL);
CREATE INDEX ea_idx ON expense_allocations(branch_id);

-- Cash registers
CREATE TABLE register_sessions (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, name TEXT NOT NULL DEFAULT 'Main', opened_by INTEGER NOT NULL,
  opened_at TEXT NOT NULL, opening_cash INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at TEXT, expected INTEGER, counted INTEGER, difference INTEGER, explanation TEXT, closed_by INTEGER, approved_by INTEGER, approved_at TEXT,
  business_date TEXT NOT NULL
);
CREATE TABLE cash_movements (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, session_id INTEGER NOT NULL, amount INTEGER NOT NULL, note TEXT, user_id INTEGER, created_at TEXT NOT NULL); -- signed
CREATE TABLE day_closings (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, business_date TEXT NOT NULL, closed_by INTEGER, closed_at TEXT NOT NULL, reopened_by INTEGER, reopened_at TEXT, reopen_reason TEXT, UNIQUE(org_id, branch_id, business_date));

-- Governance
CREATE TABLE approvals (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER, type TEXT NOT NULL, amount INTEGER NOT NULL DEFAULT 0, summary TEXT,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','failed')),
  requested_by INTEGER NOT NULL, decided_by INTEGER, decision_note TEXT, result TEXT, created_at TEXT NOT NULL, decided_at TEXT
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY, org_id INTEGER, user_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id INTEGER, branch_id INTEGER,
  before TEXT, after TEXT, ip TEXT, created_at TEXT NOT NULL
);
CREATE INDEX audit_idx ON audit_log(org_id, created_at);
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER, user_id INTEGER, type TEXT NOT NULL, message TEXT NOT NULL, params TEXT,
  link TEXT, dedupe_key TEXT, read_at TEXT, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX notif_dedupe ON notifications(org_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE TABLE channel_deliveries (id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, channel TEXT NOT NULL, recipient TEXT, message TEXT, status TEXT NOT NULL, cost INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
