import type { PaintPreview, PersonRef, PlacedType, StudentRef, Tool } from '../sim';
import { nextTurn, type Turn } from '../game/iso';
import { sound } from './sound';

/** Which way the player last faced the map (DESIGN.md section 43). On this phone only, never in the save. */
const TURN_KEY = 'campus-tycoon.turn';

function storedTurn(): Turn {
  try {
    const stored = Number(localStorage.getItem(TURN_KEY));
    return stored === 1 || stored === 2 || stored === 3 ? stored : 0;
  } catch {
    // Storage is blocked: the map faces the way it always has.
    return 0;
  }
}

/**
 * What the player is doing right now: the tool in hand, the lot they tapped,
 * the paint they are dragging. None of this is saved. The map and the UI both
 * read it and are told when it changes.
 */

/** 'place' is the mode entered from the Build menu: taps position one building. */
export type ToolChoice = 'look' | 'place' | Tool;

export interface Toast {
  text: string;
  kind: 'info' | 'error';
  id: number;
}

type Listener = () => void;

class Session {
  tool: ToolChoice = 'look';
  /** The kind of tree the Tree tool plants. */
  treeKind = 0;
  /** The building picked from the Build menu and not yet placed. */
  placing: PlacedType | null = null;
  /** Where its top corner would go. null until the player taps the map. */
  ghost: { x: number; y: number } | null = null;
  /** While `placing` is 'decor': which decoration, an id from the list of them. */
  decor: string | null = null;
  /** A decoration on the map that is being moved: its index in the map's list. null when one is being placed new. */
  moving: number | null = null;
  /** Turned to run the other way, for a decoration that can be. */
  decorFlip = false;
  /** True while photo mode has put the bars away (DESIGN.md 42.5). */
  photo = false;
  /** Set by the map once it is drawing: a picture of the campus as it is drawn now. */
  snap: (() => Promise<HTMLImageElement>) | null = null;
  selected: { x: number; y: number } | null = null;
  /** The student whose card is open. */
  student: StudentRef | null = null;
  /** The figure that student is drawn as on the map now, when it is not their everyday one. null for the everyday one. */
  studentLook: number | null = null;
  /** Someone who is not a student whose card is open: a professor, a worker, a visitor. Never both at once. */
  person: PersonRef | null = null;
  /** True while the camera keeps that student in view. */
  following = false;
  /** What that student is doing, as the map shows it. null when they have gone indoors. */
  doing: string | null = null;
  /** A cell the map should glide to. A new `seq` means a new request. */
  focus: { x: number; y: number; seq: number } | null = null;
  preview: PaintPreview | null = null;
  /** A clear the player has dragged out and not yet confirmed. */
  clearing: PaintPreview | null = null;
  /** An overlay the player has asked to see until they tap Done. Parking: which car parks and roads reach a street. Clean: litter, bins, broken things and where workers reach. */
  overlay: 'parking' | 'clean' | null = null;
  toast: Toast | null = null;
  /** How far the view is turned, a quarter at a time (DESIGN.md section 43). For show only. */
  turn: Turn = storedTurn();

  private listeners = new Set<Listener>();
  private toastId = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  setTool(tool: ToolChoice): void {
    this.tool = tool;
    this.preview = null;
    this.clearing = null;
    this.placing = null;
    this.ghost = null;
    this.decor = null;
    this.moving = null;
    this.decorFlip = false;
    this.overlay = null;
    if (tool !== 'look') {
      this.selected = null;
      this.student = null;
      this.person = null;
      this.following = false;
    }
    this.emit();
  }

  /** Begin placing a decoration from the Build menu, or moving one that is on the map. */
  startDecor(id: string, moving: number | null = null, flip = false): void {
    this.startPlacing('decor');
    this.decor = id;
    this.moving = moving;
    this.decorFlip = flip;
    this.emit();
  }

  /** Photo mode: the bars go away, and come back when it is left. */
  setPhoto(on: boolean): void {
    if (this.photo === on) return;
    if (on) this.setTool('look');
    this.photo = on;
    this.emit();
  }

  /** Begin placing a building picked from the Build menu. */
  startPlacing(type: PlacedType): void {
    this.tool = 'place';
    this.placing = type;
    this.decor = null;
    this.moving = null;
    this.decorFlip = false;
    this.ghost = null;
    this.preview = null;
    this.selected = null;
    this.student = null;
    this.person = null;
    this.following = false;
    this.emit();
  }

  /** Show or hide an overlay. It stays until Done is tapped or another tool is picked. */
  setOverlay(overlay: 'parking' | 'clean' | null): void {
    if (this.overlay === overlay) return;
    this.overlay = overlay;
    this.emit();
  }

  /** Hold a dragged-out clear until the player has seen what comes back and said yes. */
  askClear(preview: PaintPreview): void {
    this.clearing = preview;
    this.preview = null;
    this.emit();
  }

  cancelClear(): void {
    if (!this.clearing) return;
    this.clearing = null;
    this.emit();
  }

  /** Glide the map to a cell without selecting anything. */
  lookAt(x: number, y: number): void {
    this.focus = { x, y, seq: (this.focus?.seq ?? 0) + 1 };
    this.emit();
  }

  setGhost(x: number, y: number): void {
    this.ghost = { x, y };
    this.emit();
  }

  setTreeKind(kind: number): void {
    this.treeKind = kind;
    this.emit();
  }

  select(x: number, y: number): void {
    this.selected = { x, y };
    this.student = null;
    this.person = null;
    this.following = false;
    this.emit();
  }

  /** `look` is the figure they were drawn as when tapped, where that is not their everyday one: a player in the kit. */
  openStudent(ref: StudentRef, look: number | null = null): void {
    this.student = ref;
    this.studentLook = look;
    this.person = null;
    this.following = false;
    this.doing = null;
    this.selected = null;
    this.emit();
  }

  /** Open the card of someone who is not a student. */
  openPerson(ref: PersonRef): void {
    this.person = ref;
    this.student = null;
    this.following = false;
    this.doing = null;
    this.selected = null;
    this.emit();
  }

  /** Put away whichever card is open: a student's, or anyone else's. */
  closeStudent(): void {
    if (!this.student && !this.person) return;
    this.student = null;
    this.person = null;
    this.following = false;
    this.emit();
  }

  setFollowing(on: boolean): void {
    if (this.following === on) return;
    this.following = on;
    this.emit();
  }

  /** Told by the map, which is where the student is: what they are doing, and the figure they are drawn as if not their everyday one. */
  setDoing(doing: string | null, look: number | null = null): void {
    if (this.doing === doing && this.studentLook === look) return;
    this.doing = doing;
    this.studentLook = look;
    this.emit();
  }

  /** Glide the map to a building and select it. */
  focusOn(x: number, y: number): void {
    this.focus = { x, y, seq: (this.focus?.seq ?? 0) + 1 };
    this.select(x, y);
  }

  clearSelection(): void {
    if (!this.selected) return;
    this.selected = null;
    this.emit();
  }

  setPreview(preview: PaintPreview | null): void {
    this.preview = preview;
    this.emit();
  }

  /** Turn the view a quarter, clockwise on the screen. Four turns come home. The phone remembers the way it faces. */
  turnView(by = 1): void {
    this.setTurn(nextTurn(this.turn, by));
  }

  setTurn(turn: Turn): void {
    if (turn === this.turn) return;
    this.turn = turn;
    try {
      localStorage.setItem(TURN_KEY, String(turn));
    } catch {
      // Private browsing: it faces this way until the page closes.
    }
    this.emit();
  }

  notify(text: string, kind: Toast['kind'] = 'info'): void {
    // Something that could not be done has a soft sound of its own.
    if (kind === 'error') sound.ui('error');
    this.toastId += 1;
    this.toast = { text, kind, id: this.toastId };
    this.emit();
  }
}

export const session = new Session();
