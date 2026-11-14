/**
 * The social web's record as text (DESIGN.md 63.5): squeezed with gzip where the browser can, then base64, as the save
 * is kept as text. Done in the web's worker, so the main thread only stores and reads a finished string.
 */

async function squeeze(bytes: Uint8Array, how: 'compress' | 'decompress'): Promise<Uint8Array> {
  const Stream = how === 'compress' ? globalThis.CompressionStream : globalThis.DecompressionStream;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Stream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toText(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function fromText(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The record as stored: "gz:" and base64 when gzip is to hand, plain base64 when not. */
export async function packRecord(bytes: Uint8Array): Promise<string> {
  if (!globalThis.CompressionStream) return toText(bytes);
  return 'gz:' + toText(await squeeze(bytes, 'compress'));
}

/** The record's bytes from its text, or null when it cannot be read: the web is then grown again from the seed. */
export async function unpackRecord(text: string): Promise<Uint8Array | null> {
  try {
    if (!text.startsWith('gz:')) return fromText(text);
    if (!globalThis.DecompressionStream) return null;
    return await squeeze(fromText(text.slice(3)), 'decompress');
  } catch {
    return null;
  }
}
