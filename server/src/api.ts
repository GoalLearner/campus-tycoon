/**
 * What the cloud server and the app say to each other (DESIGN.md 48). Shared by
 * both: the app imports these names and shapes, and nothing else, from the server.
 */

/** Every route starts here. A later version of the app can speak to a later version of the server. */
export const API = '/v1';

/** The revision the upload was made from: 0 for a campus the phone has never uploaded. */
export const BASE_REVISION_HEADER = 'x-base-revision';
/** What the upload says about itself, as JSON: a `CampusMeta`. */
export const CAMPUS_META_HEADER = 'x-campus-meta';
/** On a download: the campus's record, as JSON. */
export const CAMPUS_RECORD_HEADER = 'x-campus';

/** The most a gzipped save may be. A model campus's is about 20 KB. */
export const MAX_SAVE_BYTES = 2_000_000;
/** The most campuses one account keeps. */
export const MAX_CAMPUSES = 20;

/** What a phone says about the save it uploads: shown when a player chooses between two campuses. */
export interface CampusMeta {
  /** The school's name. */
  name: string;
  /** The University Level. */
  level: number;
  /** The academic rank, 1 the best; 0 before the first rankings day. */
  rank: number;
  /** Minutes of game played: the save's own tick. */
  tick: number;
  /** The real time, in milliseconds, the save's game was simulated up to. Its own clock. */
  simulatedAt: number;
}

/** A campus as the server keeps it. */
export interface CampusRecord extends CampusMeta {
  id: string;
  /** 1 for the first upload, one more for each after. */
  revision: number;
  /** The server's own time when the latest upload arrived. */
  uploadedAt: number;
  /** The gzipped save's size. */
  bytes: number;
  /**
   * True while the save's clock is ahead of what real time allows: ahead of the server's clock, or advanced further
   * since its first upload than real time has. Such a campus would be left off every board until real time catches
   * up. Nothing is banned, and the campus syncs as any other.
   */
  clockAhead: boolean;
}

export interface SignInRequest {
  /** The identity token Apple gave the phone. */
  identityToken: string;
  /** The one-time code Apple gave with it, which the server trades for a refresh token it can revoke later. */
  authorizationCode?: string;
  /** The nonce the phone asked Apple to put in the token, if it asked for one. */
  nonce?: string;
}

export interface SignInReply {
  /** The session: sent as `Authorization: Bearer <token>` with every later request. */
  token: string;
  accountId: string;
  /** True when the server holds an Apple refresh token it can revoke when the account is deleted. */
  revocable: boolean;
}

export interface CampusList {
  campuses: CampusRecord[];
  serverTime: number;
}

export interface UploadReply {
  campus: CampusRecord;
}

/** A 409: another phone has uploaded since. `campus` is what the server now holds. */
export interface ConflictReply {
  conflict: CampusRecord;
}

export interface DeleteReply {
  deleted: true;
  /** What became of the Apple sign-in: revoked, nothing to revoke, the server has no key to do it, or Apple refused. */
  apple: 'revoked' | 'nothing to revoke' | 'no key' | 'failed';
}

export interface ErrorReply {
  error: string;
}
