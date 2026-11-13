/**
 * JSON Web Tokens, with the browser crypto every Worker has: reading one,
 * checking its signature against a public key, and signing one with a private
 * key. Only the two algorithms Apple uses: RS256 and ES256.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

export type JwtClaims = Record<string, unknown>;

export interface DecodedJwt {
  header: JwtHeader;
  claims: JwtClaims;
  signed: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
}

/** Split and read a token. null when it is not one. Nothing is checked yet. */
export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return null;
  try {
    const header = JSON.parse(decoder.decode(base64UrlDecode(parts[0]!))) as unknown;
    const claims = JSON.parse(decoder.decode(base64UrlDecode(parts[1]!))) as unknown;
    if (typeof header !== 'object' || header === null || typeof claims !== 'object' || claims === null) return null;
    return { header: header as JwtHeader, claims: claims as JwtClaims, signed: encoder.encode(`${parts[0]}.${parts[1]}`), signature: base64UrlDecode(parts[2]!) };
  } catch {
    return null;
  }
}

/** A public key as a JSON Web Key Set lists it. */
export interface PublicJwk {
  kty: string;
  kid: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

/** Check a token's signature with the key its header names. */
export async function signatureHolds(token: DecodedJwt, key: PublicJwk): Promise<boolean> {
  const alg = token.header.alg;
  try {
    if (alg === 'RS256' && key.kty === 'RSA' && key.n && key.e) {
      const jwk: JsonWebKey = { kty: 'RSA', n: key.n, e: key.e, alg: 'RS256', ext: true };
      const imported = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', imported, token.signature, token.signed);
    }
    if (alg === 'ES256' && key.kty === 'EC' && key.x && key.y) {
      const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: key.x, y: key.y, ext: true };
      const imported = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, imported, token.signature, token.signed);
    }
  } catch {
    return false;
  }
  return false;
}

/** The DER bytes inside a PEM file, such as the .p8 key Apple gives. */
export function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return base64UrlDecode(body.replace(/\+/g, '-').replace(/\//g, '_'));
}

/** Sign claims as an ES256 token with a P-256 private key in PKCS#8 PEM, as Apple's .p8 keys are. */
export async function signEs256(claims: JwtClaims, kid: string, privatePem: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(privatePem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'ES256', kid })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${head}.${body}`));
  return `${head}.${body}.${base64UrlEncode(signature)}`;
}

/** SHA-256 of a text, as hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A random token for a session: 32 bytes, base64url. */
export function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}
