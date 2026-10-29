-- The Guardia — SQLite schema (created by the installer, upgraded by app/upgrade.php).

CREATE TABLE IF NOT EXISTS settings (
  `key`   TEXT PRIMARY KEY,
  `value` TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'writer',   -- writer | editor | admin
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT,                              -- e.g. "Senior Court Reporter"
  bio           TEXT,
  avatar        TEXT,
  status        TEXT NOT NULL DEFAULT 'active',
  last_login    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  in_menu     INTEGER NOT NULL DEFAULT 1,
  on_home     INTEGER NOT NULL DEFAULT 1,
  image       TEXT,                                -- default story image (assets path or uploads path)
  seo_title   TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  file        TEXT NOT NULL,      -- base path without extension, e.g. uploads/2026/10/court-house-a1b2
  ext         TEXT NOT NULL,      -- jpg | png | webp | gif
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  sizes       TEXT,               -- JSON list of generated widths, e.g. [400,800,1200]
  webp        INTEGER NOT NULL DEFAULT 0,
  bytes       INTEGER NOT NULL DEFAULT 0,
  alt         TEXT,
  caption     TEXT,
  credit      TEXT,
  uploaded_by INTEGER,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  standfirst      TEXT,                     -- summary under the headline
  body            TEXT,
  image_id        INTEGER REFERENCES media(id) ON DELETE SET NULL,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  author_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  byline          TEXT,                     -- overrides the author name (e.g. "Staff and agencies")
  status          TEXT NOT NULL DEFAULT 'draft',   -- draft | pending | scheduled | published
  published_at    TEXT,
  updated_at      TEXT,
  created_at      TEXT NOT NULL,
  is_breaking     INTEGER NOT NULL DEFAULT 0,
  is_featured     INTEGER NOT NULL DEFAULT 0,
  views           INTEGER NOT NULL DEFAULT 0,
  word_count      INTEGER NOT NULL DEFAULT 0,
  location        TEXT,                     -- dateline, e.g. "TORONTO"
  lang            TEXT NOT NULL DEFAULT 'en',
  seo_title       TEXT,
  seo_description TEXT,
  focus_keyword   TEXT,
  canonical_url   TEXT,
  noindex         INTEGER NOT NULL DEFAULT 0,
  source_name     TEXT,
  source_url      TEXT,
  source_licence  TEXT,
  external_id     TEXT UNIQUE,              -- importer id, e.g. "doj:uuid"
  push_sent       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_articles_pub ON articles(status, published_at);
CREATE INDEX IF NOT EXISTS idx_articles_cat ON articles(category_id, status, published_at);
CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author_id, status, published_at);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(is_featured, status, published_at);

CREATE TABLE IF NOT EXISTS tags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id, article_id);

-- Full-text search (kept in sync by triggers)
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(title, standfirst, body, content='articles', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, standfirst, body) VALUES (new.id, new.title, new.standfirst, new.body);
END;
CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, standfirst, body) VALUES ('delete', old.id, old.title, old.standfirst, old.body);
END;
CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE OF title, standfirst, body ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, standfirst, body) VALUES ('delete', old.id, old.title, old.standfirst, old.body);
  INSERT INTO articles_fts(rowid, title, standfirst, body) VALUES (new.id, new.title, new.standfirst, new.body);
END;

CREATE TABLE IF NOT EXISTS redirects (
  from_path  TEXT PRIMARY KEY,
  to_path    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  body       TEXT,
  in_footer  INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- Analytics: one row per page view (raw, kept for N days) + daily roll-ups (kept forever)
CREATE TABLE IF NOT EXISTS hits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  day        TEXT NOT NULL,          -- Y-m-d (site time zone)
  hour       INTEGER NOT NULL,
  path       TEXT NOT NULL,
  article_id INTEGER,
  visitor    TEXT NOT NULL,          -- salted hash, never the IP
  is_new     INTEGER NOT NULL DEFAULT 0,
  source     TEXT NOT NULL,          -- facebook | whatsapp | google | direct | ...
  ref_host   TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  country    TEXT,
  region     TEXT,
  city       TEXT,
  device     TEXT,                   -- mobile | tablet | desktop
  browser    TEXT,
  os         TEXT
);
CREATE INDEX IF NOT EXISTS idx_hits_day ON hits(day, hour);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits(ts);
CREATE INDEX IF NOT EXISTS idx_hits_article ON hits(article_id, ts);

CREATE TABLE IF NOT EXISTS stats_daily (
  day      TEXT NOT NULL,
  dim      TEXT NOT NULL,            -- total | country | city | source | ref | device | browser | os | article | campaign
  `key`    TEXT NOT NULL,
  views    INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dim, `key`)
);
CREATE INDEX IF NOT EXISTS idx_stats_dim ON stats_daily(dim, day);

-- Web push
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  topics     TEXT NOT NULL DEFAULT 'all',   -- "all" or comma-separated category ids
  country    TEXT,
  device     TEXT,
  fails      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_ok    TEXT
);

CREATE TABLE IF NOT EXISTS push_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT,
  url         TEXT NOT NULL,
  image       TEXT,
  article_id  INTEGER,
  category_id INTEGER,
  status      TEXT NOT NULL DEFAULT 'queued',   -- queued | sending | done
  total       INTEGER NOT NULL DEFAULT 0,
  sent        INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0,
  cursor      INTEGER NOT NULL DEFAULT 0,       -- last subscription id processed
  created_by  INTEGER,
  created_at  TEXT NOT NULL,
  finished_at TEXT
);

-- Ads: AdSense units and direct (sold) campaigns per position
CREATE TABLE IF NOT EXISTS ads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  position     TEXT NOT NULL,
  type         TEXT NOT NULL,          -- adsense | image | html
  adsense_slot TEXT,
  adsense_format TEXT,                 -- auto | fluid | rectangle | horizontal | in-article
  image        TEXT,
  link_url     TEXT,
  html         TEXT,
  advertiser   TEXT,
  starts_at    TEXT,
  ends_at      TEXT,
  weight       INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  impressions  INTEGER NOT NULL DEFAULT 0,
  clicks       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ads_pos ON ads(position, active);

-- Photo store for media outlets
CREATE TABLE IF NOT EXISTS photos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT,
  location         TEXT,
  taken_at         TEXT,
  photographer     TEXT,
  keywords         TEXT,
  original         TEXT NOT NULL,      -- private file under app/storage/photos/
  preview          TEXT NOT NULL,      -- watermarked public JPEG
  thumb            TEXT NOT NULL,
  width            INTEGER NOT NULL,
  height           INTEGER NOT NULL,
  price_editorial  INTEGER NOT NULL DEFAULT 0,   -- cents
  price_commercial INTEGER NOT NULL DEFAULT 0,   -- cents (0 = not offered)
  price_exclusive  INTEGER NOT NULL DEFAULT 0,   -- cents (0 = not offered)
  currency         TEXT NOT NULL DEFAULT 'CAD',
  status           TEXT NOT NULL DEFAULT 'active',  -- active | hidden | sold
  sales            INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ref              TEXT NOT NULL UNIQUE,
  photo_id         INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  licence          TEXT NOT NULL,      -- editorial | commercial | exclusive
  amount           INTEGER NOT NULL,
  currency         TEXT NOT NULL,
  buyer_name       TEXT NOT NULL,
  buyer_email      TEXT NOT NULL,
  buyer_org        TEXT,
  buyer_note       TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | paid | request | cancelled
  stripe_session   TEXT,
  download_token   TEXT UNIQUE,
  downloads        INTEGER NOT NULL DEFAULT 0,
  download_expires TEXT,
  created_at       TEXT NOT NULL,
  paid_at          TEXT
);

-- Importers (official / openly-licensed sources only)
CREATE TABLE IF NOT EXISTS import_sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,          -- doj | rss
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  licence       TEXT NOT NULL,
  category_id   INTEGER,
  auto_classify INTEGER NOT NULL DEFAULT 1,
  keywords      TEXT,                   -- only import items matching (one per line, optional)
  since         TEXT NOT NULL DEFAULT '2015-01-01',
  canonical     TEXT NOT NULL DEFAULT 'source',  -- source | self
  enabled       INTEGER NOT NULL DEFAULT 1,
  backfill_page INTEGER NOT NULL DEFAULT 0,
  backfill_done INTEGER NOT NULL DEFAULT 0,
  imported      INTEGER NOT NULL DEFAULT 0,
  last_run      TEXT,
  last_error    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  k  TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits ON rate_limits(k, ts);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT,
  message    TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- AI newsroom: Alex (research) → Kristov Joi (writing) → David Mario (review & publish)
CREATE TABLE IF NOT EXISTS ai_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER,
  topic         TEXT NOT NULL,
  stage         TEXT NOT NULL DEFAULT 'researched',  -- researched | written | revise | published | rejected | failed
  research      TEXT,          -- JSON from Alex
  draft         TEXT,          -- JSON from Kristov
  review        TEXT,          -- JSON from David
  article_id    INTEGER,
  attempts      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_stage ON ai_jobs(stage, id);

CREATE TABLE IF NOT EXISTS ai_assignments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  brief      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open',   -- open | done
  created_by INTEGER,
  created_at TEXT NOT NULL,
  done_at    TEXT
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sender     TEXT NOT NULL,     -- owner | alex | kristov | david | system
  body       TEXT NOT NULL,
  job_id     INTEGER,
  user_id    INTEGER,
  created_at TEXT NOT NULL
);
