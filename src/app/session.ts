import type { PaintPreview, PersonRef, PlacedType, StudentRef, Tool } from '../sim';
import { sound } from './sound';

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
  selected: { x: number; y: number } | null = null;
  /** The student whose card is open. */
  student: StudentRef | null = null;
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
    this.overlay = null;
    if (tool !== 'look') {
      this.selected = null;
      this.student = null;
      this.person = null;
      this.following = false;
    }
    this.emit();
  }

  /** Begin placing a building picked from the Build menu. */
  startPlacing(type: PlacedType): void {
    this.tool = 'place';
    this.placing = type;
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

  openStudent(ref: StudentRef): void {
    this.student = ref;
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

  /** Told by the map, which is where the walker is. */
  setDoing(doing: string | null): void {
    if (this.doing === doing) return;
    this.doing = doing;
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

  notify(text: string, kind: Toast['kind'] = 'info'): void {
    // Something that could not be done has a soft sound of its own.
    if (kind === 'error') sound.ui('error');
    this.toastId += 1;
    this.toast = { text, kind, id: this.toastId };
    this.emit();
  }
}

export const session = new Session();
