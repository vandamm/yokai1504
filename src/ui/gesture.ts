/** A second finger must never move, release or cancel the card held by the first. */
export class DragGesture {
  active: { id: string; x: number; y: number; pointerId: number; moved: boolean } | null = null;
  begin(id: string, pointerId: number, x: number, y: number): boolean {
    if (this.active) return false;
    this.active = { id, pointerId, x, y, moved: false }; return true;
  }
  move(pointerId: number, x: number, y: number) {
    const active = this.active;
    if (!active || active.pointerId !== pointerId) return null;
    if (Math.hypot(x - active.x, y - active.y) >= 6) active.moved = true;
    return active;
  }
  finish(pointerId: number) {
    const active = this.active;
    if (!active || active.pointerId !== pointerId) return null;
    this.active = null; return active;
  }
  cancel(pointerId?: number): boolean {
    if (!this.active || pointerId !== undefined && pointerId !== this.active.pointerId) return false;
    this.active = null; return true;
  }
}
