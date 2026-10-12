-- QR/scan selling: per-item maximum discount, fixed per-service barber fee, and baskets sent to the branch manager to complete.
ALTER TABLE variants ADD COLUMN max_discount_bp INTEGER; -- NULL = no item cap (the seller's role limit still applies)
ALTER TABLE users ADD COLUMN commission_fixed INTEGER NOT NULL DEFAULT 0; -- minor units earned per service performed (barbers), in addition to commission_bp
ALTER TABLE sale_lines ADD COLUMN commission_fixed INTEGER NOT NULL DEFAULT 0; -- per-unit fixed fee frozen at sale time
ALTER TABLE commission_rate_history ADD COLUMN fixed_amount INTEGER;
CREATE TABLE orders (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL REFERENCES branches(id), ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
  customer_id INTEGER, customer_name TEXT, discount INTEGER NOT NULL DEFAULT 0,
  lines TEXT NOT NULL, -- JSON [{variant_id, serial, qty, discount}]; prices are re-read when the order is completed
  total INTEGER NOT NULL, currency TEXT NOT NULL, note TEXT,
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL, completed_by INTEGER, completed_at TEXT, sale_id INTEGER, cancel_reason TEXT,
  UNIQUE(org_id, ref)
);
CREATE INDEX orders_branch_status ON orders(org_id, branch_id, status);
-- permission flag orders.create (send a scanned basket to the manager) for the roles that sell
UPDATE roles SET perms = json_insert(perms, '$[#]', 'orders.create') WHERE name IN ('Owner', 'Branch Manager', 'Cashier') AND perms NOT LIKE '%"orders.create"%';
INSERT INTO roles(org_id, name, scope, perms, limits, is_system)
  SELECT o.id, 'Sales Assistant', 'assigned', '["dashboard.view","sales.view","sales.print","products.view","inventory.view","customers.view","customers.create","orders.create"]', '{"discount_bp":0}', 0
  FROM orgs o WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.org_id = o.id AND r.name = 'Sales Assistant');
