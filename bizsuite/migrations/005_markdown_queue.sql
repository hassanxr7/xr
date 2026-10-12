-- Mark-downs (price before the reduction, printed struck-through on the new tag) and the barber waiting queue.
ALTER TABLE variants ADD COLUMN was_price INTEGER; -- NULL = not marked down
CREATE TABLE barber_queue (
  id INTEGER PRIMARY KEY, org_id INTEGER NOT NULL, branch_id INTEGER NOT NULL REFERENCES branches(id), ticket INTEGER NOT NULL,
  customer_name TEXT, phone TEXT, service_id INTEGER, barber_id INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','serving','done','left')),
  created_by INTEGER NOT NULL, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, sale_id INTEGER, business_date TEXT NOT NULL
);
CREATE INDEX barber_queue_open ON barber_queue(org_id, branch_id, business_date, status);
