import type { Resound } from "../../wasm/resound";

const CAP = 100;

type Listener = () => void;

/**
 * Undo/redo stacks holding opaque Rust snapshots. JS owns the stacks; Rust
 * round-trips full state via serialize_snapshot / restore_snapshot.
 *
 * Discrete actions: call `commit()` *after* mutating state — it pushes the
 * snapshot taken at the previous `commit()` (or at construction).
 *
 * Continuous gestures (drag, scrub): call `beginGesture()` before mutation,
 * `endGesture()` on release. Intermediate mutations don't push.
 *
 * Either commit() or endGesture() clears the redo stack when state changed.
 */
export class UndoStack {
  private undoStack: Uint8Array[] = [];
  private redoStack: Uint8Array[] = [];
  private baseline: Uint8Array;
  private gestureSnapshot: Uint8Array | null = null;
  private listeners: Set<Listener> = new Set();

  constructor(private readonly resound: Resound) {
    this.baseline = resound.serialize_snapshot();
  }

  /** Subscribe to stack-change events (for enable/disable on Undo/Redo buttons). */
  onChange(handler: Listener): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Commit a discrete action. Call AFTER mutating state. */
  commit(): void {
    const current = this.resound.serialize_snapshot();
    if (equals(current, this.baseline)) {
      return;
    }
    this.pushUndo(this.baseline);
    this.baseline = current;
    this.redoStack.length = 0;
    this.emit();
  }

  /** Capture the pre-gesture snapshot. Call BEFORE the gesture's first mutation. */
  beginGesture(): void {
    if (this.gestureSnapshot) return; // ignore re-entry
    this.gestureSnapshot = this.baseline;
  }

  /** Commit the gesture. Call after the user releases the control. */
  endGesture(): void {
    if (!this.gestureSnapshot) return;
    const before = this.gestureSnapshot;
    this.gestureSnapshot = null;
    const current = this.resound.serialize_snapshot();
    if (equals(current, before)) {
      this.baseline = current;
      return;
    }
    this.pushUndo(before);
    this.baseline = current;
    this.redoStack.length = 0;
    this.emit();
  }

  undo(): boolean {
    if (!this.canUndo()) return false;
    const prev = this.undoStack.pop()!;
    this.redoStack.push(this.baseline);
    this.resound.restore_snapshot(prev);
    this.baseline = this.resound.serialize_snapshot();
    this.emit();
    return true;
  }

  redo(): boolean {
    if (!this.canRedo()) return false;
    const next = this.redoStack.pop()!;
    this.undoStack.push(this.baseline);
    this.resound.restore_snapshot(next);
    this.baseline = this.resound.serialize_snapshot();
    this.emit();
    return true;
  }

  private pushUndo(blob: Uint8Array): void {
    this.undoStack.push(blob);
    if (this.undoStack.length > CAP) {
      this.undoStack.shift();
    }
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
