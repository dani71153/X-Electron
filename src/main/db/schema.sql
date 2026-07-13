-- Esquema de la base de datos local.
-- Se ejecuta entero en cada arranque; todo es CREATE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  handle     TEXT NOT NULL,
  name       TEXT NOT NULL,
  avatar_url TEXT,
  verified   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tweets (
  id           TEXT PRIMARY KEY,
  author_id    TEXT,
  text         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  reply_to_id  TEXT,
  quoted_id    TEXT,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  media_json   TEXT NOT NULL DEFAULT '[]',
  raw_json     TEXT,
  captured_at  INTEGER NOT NULL,
  -- saved = 1: el usuario lo ha guardado localmente (favorito local, no de X).
  saved        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tweets_created_at ON tweets (created_at DESC);

CREATE TABLE IF NOT EXISTS columns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  type         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT '',
  position     INTEGER NOT NULL DEFAULT 0,
  filters_json TEXT NOT NULL DEFAULT '{}',
  -- live = 1: la columna es una webview en vivo, no se cosecha.
  live         INTEGER NOT NULL DEFAULT 0
);

-- Que tweet aparecio en que columna. Un mismo tweet puede estar en varias.
CREATE TABLE IF NOT EXISTS column_tweets (
  column_id INTEGER NOT NULL,
  tweet_id  TEXT NOT NULL,
  seen_at   INTEGER NOT NULL,
  PRIMARY KEY (column_id, tweet_id)
);

CREATE INDEX IF NOT EXISTS idx_column_tweets_column ON column_tweets (column_id);

-- Listas del usuario, capturadas al visitar x.com/i/lists.
CREATE TABLE IF NOT EXISTS lists (
  id           TEXT PRIMARY KEY,   -- id_str de la lista
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 0,
  mode         TEXT NOT NULL DEFAULT 'public',
  banner_url   TEXT NOT NULL DEFAULT '',
  updated_at   INTEGER NOT NULL
);
