import { createContext, useContext, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { GameView } from '../game/types';
import type { TableDraft } from './interaction';
import { allVisible } from './interaction';
import { resolveDrop } from './drag';
import { publicAsset } from './assets';
import { DragGesture } from './gesture';
interface DragBindings {
  sourceId?: string;
  bind: (id: string) => { 'data-drag'?: string; onPointerDown?: (event: PointerEvent<HTMLElement>) => void; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void };
  drop: (id: string) => { 'data-drop': string; 'data-drop-state'?: string; tabIndex?: number; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void };
}
const DragContext = createContext<DragBindings>({ bind: () => ({}), drop: id => ({ 'data-drop': id }) });
export const useTableDrag = () => useContext(DragContext);
export function DragSurface({ view, draft, disabled, onDrop, onPick, children }: { view: GameView; draft: TableDraft; disabled: boolean; onDrop: (source: string, target: string) => void; onPick: (id: string) => void; children: ReactNode }) {
  const pointer = useRef(new DragGesture());
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; keyboard?: boolean }>();
  const [over, setOver] = useState<string>();
  const cards = allVisible(view), card = cards.find(card => card.id === drag?.id);
  const valid = (id: string) => !!drag && !resolveDrop(view, draft, drag.id, id).reason;
  const reset = () => { pointer.current.cancel(); setDrag(undefined); setOver(undefined); };
  const hit = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')?.dataset.drop;
  const keyboard = (id: string, target: boolean, event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { reset(); return; }
    if (event.key !== ' ' && event.key !== 'Enter' || disabled) return;
    event.preventDefault(); event.stopPropagation();
    if (drag?.keyboard && target) { onDrop(drag.id, id); reset(); }
    else if (!target) { onPick(id); setDrag({ id, x: 0, y: 0, keyboard: true }); }
  };
  const bindings: DragBindings = {
    sourceId: drag?.id,
    bind: id => disabled ? {} : { 'data-drag': id, onKeyDown: event => keyboard(id, !!drag?.keyboard, event), onPointerDown: event => {
      if (event.button !== 0 || !pointer.current.begin(id, event.pointerId, event.clientX, event.clientY)) return;
      suppressClick.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
    } },
    drop: id => ({ 'data-drop': id, 'data-drop-state': drag ? valid(id) ? over === id ? 'over' : 'available' : undefined : undefined,
      ...(drag?.keyboard ? { tabIndex: 0, onKeyDown: (event: KeyboardEvent<HTMLElement>) => keyboard(id, true, event) } : {}) }),
  };
  return <DragContext.Provider value={bindings}><div className={`drag-surface ${drag ? 'is-dragging' : ''}`} onKeyDown={event => { if (event.key === 'Escape') reset(); }} onClickCapture={event => { if (suppressClick.current || pointer.current.active?.moved) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }} onPointerMove={event => {
    if (disabled) return;
    const start = pointer.current.move(event.pointerId, event.clientX, event.clientY); if (!start?.moved) return;
    if (!drag) onPick(start.id);
    setDrag({ id: start.id, x: event.clientX, y: event.clientY }); setOver(hit(event.clientX, event.clientY));
  }} onPointerUp={event => {
    const start = pointer.current.finish(event.pointerId); if (!start) return;
    if (start.moved) { suppressClick.current = true; const target = hit(event.clientX, event.clientY); if (target) onDrop(start.id, target); }
    reset();
  }} onPointerCancel={event => { if (pointer.current.cancel(event.pointerId)) reset(); }} onLostPointerCapture={event => { if (pointer.current.cancel(event.pointerId)) reset(); }}>
    {children}
    {drag && <span className="sr-only" role="status">{card?.definition.name} picked up. Drop on a highlighted destination. Escape cancels.</span>}
    {drag && !drag.keyboard && card && <div className="drag-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y } as CSSProperties}><img src={publicAsset(`cards/${card.def}.png`)} alt="" draggable={false} /></div>}
  </div></DragContext.Provider>;
}
