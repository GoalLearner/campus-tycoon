/// <reference lib="webworker" />
import type { GameState } from '../sim';
import { catchUp, decodeWeb, encodeWeb, newWeb, type Web } from '../sim/systems/web';
import { packRecord, unpackRecord } from './webRecord';

/**
 * The social web's worker (DESIGN.md 63.5): every student's ties, stepped once a game week and caught up after an
 * absence, off the main thread so the map never waits. It keeps the web between messages, and answers each with the
 * web's save record, already squeezed to text, and a copy of what the cards read.
 */

export type WebRequest =
  | { type: 'start'; state: GameState; record: string | null; week: number }
  | { type: 'week'; state: GameState; week: number };

export interface WebView {
  seed: number;
  classSlot: number;
  ring: number[];
  week: number;
  other: Int32Array;
  kind: Uint8Array;
  strength: Uint8Array;
  feeling: Uint8Array;
  identity: Uint32Array;
}

export interface WebReply {
  type: 'web';
  /** The record as stored. */
  record: string;
  view: WebView;
  /** `ms` for the web's work, `packMs` for squeezing the record, `recordBytes` before it is squeezed. */
  stats: { ms: number; packMs: number; recordBytes: number; lived: number; regrown: boolean; fromRecord: boolean };
}

let web: Web | null = null;

self.onmessage = async (event: MessageEvent<WebRequest>) => {
  const message = event.data;
  const started = performance.now();
  let fromRecord = false;
  if (message.type === 'start' || !web || web.seed !== message.state.seed) {
    const text = message.type === 'start' ? message.record : null;
    const bytes = text ? await unpackRecord(text) : null;
    web = bytes ? decodeWeb(bytes, message.state) : null;
    fromRecord = web !== null;
    web ??= newWeb(message.state.seed, 1024);
  }
  const done = catchUp(web, message.state, message.week);
  const bytes = encodeWeb(web);
  const ms = Math.round(performance.now() - started);
  const packed = performance.now();
  const record = await packRecord(bytes);
  const view: WebView = {
    seed: web.seed,
    classSlot: web.classSlot,
    ring: [...web.ring],
    week: web.week,
    other: web.other.slice(),
    kind: web.kind.slice(),
    strength: web.strength.slice(),
    feeling: web.feeling.slice(),
    identity: web.identity.slice(),
  };
  const stats = { ms, packMs: Math.round(performance.now() - packed), recordBytes: bytes.byteLength, ...done, fromRecord };
  const reply: WebReply = { type: 'web', record, view, stats };
  (self as unknown as Worker).postMessage(reply, [view.other.buffer, view.kind.buffer, view.strength.buffer, view.feeling.buffer, view.identity.buffer]);
};
