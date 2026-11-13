-- Campus Tycoon cloud saves (DESIGN.md 48). Applied with `npx wrangler d1 migrations apply`.

-- One row a player who has signed in with Apple. Only Apple's stable user ID is kept: no name, no email.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  apple_sub TEXT NOT NULL UNIQUE,
  -- Apple's refresh token, revoked when the account is deleted. Empty when the server has no Sign in with Apple key.
  apple_refresh TEXT,
  created_at INTEGER NOT NULL
);

-- A phone that is signed in. Only a hash of the session token is kept.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_by_account ON sessions (account_id);

-- One row a campus. The save itself is in R2, under campuses/<account>/<campus>/<revision>.json.gz.
CREATE TABLE campuses (
  account_id TEXT NOT NULL,
  campus_id TEXT NOT NULL,
  name TEXT NOT NULL,
  revision INTEGER NOT NULL,
  -- The server's own time when the latest upload arrived.
  uploaded_at INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  level INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  -- The save's own clock.
  simulated_at INTEGER NOT NULL,
  -- The clock rules of 42.9: how far the save's clock stands ahead of real time, and until when.
  lead_ms INTEGER NOT NULL,
  ahead_until INTEGER NOT NULL,
  PRIMARY KEY (account_id, campus_id)
);
