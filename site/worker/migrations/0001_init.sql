-- Paste 和设备信任（设计文档 6.5）。时间都是 unix 秒。

CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,          -- mv_device cookie 的 SHA-256
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  user_agent    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE pastes (
  id          TEXT PRIMARY KEY,                -- 8 位 [a-z0-9]
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  language    TEXT NOT NULL DEFAULT 'text',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,                         -- NULL 表示永不过期
  device_id   TEXT REFERENCES devices(id) ON DELETE SET NULL
);
CREATE INDEX idx_pastes_created ON pastes(created_at DESC);
CREATE INDEX idx_pastes_expires ON pastes(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE pair_codes (
  id                 TEXT PRIMARY KEY,
  token_hash         TEXT NOT NULL UNIQUE,     -- 长 token（链接、二维码）
  code_hash          TEXT,                     -- 6 位码；终端邀请没有
  attempts           INTEGER NOT NULL DEFAULT 0,
  expires_at         INTEGER NOT NULL,
  used_at            INTEGER,
  created_by_device  TEXT                      -- NULL 表示由终端生成
);
