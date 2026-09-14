-- Trigram indexes for fast case-insensitive substring search on sender/body
-- at 100k+ rows (Prisma's `contains` filter maps to ILIKE, which needs a
-- trigram GIN index to avoid a full table scan at that size).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Message_body_trgm_idx" ON "Message" USING gin ("body" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Message_sender_trgm_idx" ON "Message" USING gin ("sender" gin_trgm_ops);
