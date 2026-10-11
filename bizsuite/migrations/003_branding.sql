-- Company branding (logo), per-branch identity colour, forced password change for hand-over accounts.
ALTER TABLE orgs ADD COLUMN logo_file_id INTEGER;
ALTER TABLE orgs ADD COLUMN tagline TEXT;
ALTER TABLE branches ADD COLUMN color TEXT;
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE commission_payouts ADD COLUMN ledger_deductions INTEGER NOT NULL DEFAULT 0;
