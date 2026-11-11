import type { PaintPreview, StudentRef, Tool } from '../sim';

/**
 * What the player is doing right now: the tool in hand, the lot they tapped,
 * the paint they are dragging. None of this is saved. The map and the UI both
 * read it and are told when it changes.
 */

export type ToolChoice = 'look' | Tool;

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
  selected: { x: number; y: number } | null = null;
  /** The student whose card is open. */
  student: StudentRef | null = null;
  /** True while the camera keeps that student in view. */
  following = false;
  /** What that student is doing, as the map shows it. null when they have gone indoors. */
  doing: string | null = null;
  /** A cell the map should glide to. A new `seq` means a new request. */
  focus: { x: number; y: number; seq: number } | null = null;
  preview: PaintPreview | null = null;
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
    if (tool !== 'look') {
      this.selected = null;
      this.student = null;
      this.following = false;
    }
    this.emit();
  }

  setTreeKind(kind: number): void {
    this.treeKind = kind;
    this.emit();
  }

  select(x: number, y: number): void {
    this.selected = { x, y };
    this.student = null;
    this.following = false;
    this.emit();
  }

  openStudent(ref: StudentRef): void {
    this.student = ref;
    this.following = false;
    this.doing = null;
    this.selected = null;
    this.emit();
  }

  closeStudent(): void {
    if (!this.student) return;
    this.student = null;
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
    this.toastId += 1;
    this.toast = { text, kind, id: this.toastId };
    this.emit();
  }
}

export const session = new Session();
