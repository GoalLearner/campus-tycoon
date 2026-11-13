/**
 * The little of Cloudflare's D1 and R2 that the server uses, typed here so the
 * server needs no type package of its own. The real bindings, and Miniflare's
 * in the tests, have these and more.
 */

export interface D1Result<T = unknown> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface R2ObjectBody {
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2ListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: R2ListOptions): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
}

export interface Env {
  /** Accounts, sessions and one row a campus. */
  DB: D1Database;
  /** The saves themselves, gzipped, one object a campus. */
  SAVES: R2Bucket;
  /** Who Apple's identity tokens must be for: the app's bundle ID. Several may be given, comma separated. */
  APPLE_AUDIENCE: string;
  /**
   * The Sign in with Apple key, set by the owner as Worker secrets (DESIGN.md 48). With it the server keeps each
   * account's Apple refresh token and revokes it when the account is deleted, as Apple asks. Without it, signing in
   * and saves work, and nothing is revoked.
   */
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
}
