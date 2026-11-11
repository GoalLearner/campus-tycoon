import type { PaintPreview, Tool } from '../sim';

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
    if (tool !== 'look') this.selected = null;
    this.emit();
  }

  setTreeKind(kind: number): void {
    this.treeKind = kind;
    this.emit();
  }

  select(x: number, y: number): void {
    this.selected = { x, y };
    this.emit();
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
