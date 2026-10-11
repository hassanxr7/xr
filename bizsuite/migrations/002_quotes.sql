-- Quotations: priced offers that can be converted into a sale. No stock is reserved or moved until conversion.
CREATE TABLE quotes (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, business_id INTEGER NOT NULL, branch_id INTEGER NOT NULL, ref TEXT NOT NULL,
  customer_id INTEGER, customer_name TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','converted')),
  valid_until TEXT, currency TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, tax INTEGER NOT NULL, total INTEGER NOT NULL,
  lines TEXT NOT NULL, note TEXT, user_id INTEGER NOT NULL, converted_sale_id INTEGER, created_at TEXT NOT NULL, business_date TEXT NOT NULL, UNIQUE(org_id, ref)
);
CREATE INDEX quotes_idx ON quotes(org_id, branch_id, business_date);
