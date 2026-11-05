import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import type { GameView } from '../game/types';
import type { TableDraft } from './interaction';
import { allVisible } from './interaction';
import { canDragCard, resolveDrop } from './drag';
import { CardFace } from './CardFace';
import { DragGesture } from './gesture';
import { attackArrowPath, forecastAttack } from './combat';
import type { CombatForecast } from './combat';
interface DragBindings {
  sourceId?: string;
  combat?: CombatForecast;
  bind: (id: string) => { 'data-drag'?: string; 'data-drag-origin'?: string; onPointerDown?: (event: PointerEvent<HTMLElement>) => void; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void };
  drop: (id: string) => { 'data-drop': string; 'data-drop-state'?: string; tabIndex?: number; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void; onFocus?: () => void };
}
const DragContext = createContext<DragBindings>({ bind: () => ({}), drop: id => ({ 'data-drop': id }) });
export const useTableDrag = () => useContext(DragContext);
export function DragSurface({ view, draft, disabled, onDrop, onPick, children }: { view: GameView; draft: TableDraft; disabled: boolean; onDrop: (source: string, target: string) => void; onPick: (id: string) => void; children: ReactNode }) {
  const pointer = useRef(new DragGesture());
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; originX: number; originY: number; keyboard?: boolean }>();
  const [over, setOver] = useState<string>();
  const cards = allVisible(view), card = cards.find(card => card.id === drag?.id);
  const aimingAttack = !!drag && card?.zone === 'field' && view.phase === 'main';
  const command = drag && over ? resolveDrop(view, draft, drag.id, over).command : undefined;
  const combat = command?.type === 'attack' && card ? forecastAttack(view, card, cards.find(card => card.id === command.target) ?? null) : undefined;
  const valid = (id: string) => !!drag && !resolveDrop(view, draft, drag.id, id).reason;
  const reset = () => { pointer.current.cancel(); setDrag(undefined); setOver(undefined); };
  useEffect(reset, [disabled, view.turn, view.phase, view.decisionPlayer]);
  const hit = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]')?.dataset.drop;
  const keyboard = (id: string, target: boolean, event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { reset(); return; }
    if (event.shiftKey) { if (event.key === ' ' || event.key === 'Enter') event.preventDefault(); return; }
    if (event.key !== ' ' && event.key !== 'Enter' || disabled) return;
    event.preventDefault(); event.stopPropagation();
    if (drag?.keyboard && target) { onDrop(drag.id, id); reset(); }
    else if (!target) { onPick(id); setDrag({ id, x: 0, y: 0, originX: 0, originY: 0, keyboard: true }); }
  };
  const bindings: DragBindings = {
    sourceId: drag?.id,
    combat,
    bind: id => disabled || !cards.some(card => card.id === id && canDragCard(view, card)) ? {} : { 'data-drag': id, 'data-drag-origin': drag?.id === id && !drag.keyboard && !aimingAttack ? 'true' : undefined, onKeyDown: event => keyboard(id, !!drag?.keyboard, event), onPointerDown: event => {
      if (event.shiftKey || event.button !== 0 || !pointer.current.begin(id, event.pointerId, event.clientX, event.clientY)) return;
      event.currentTarget.setPointerCapture(event.pointerId);
    } },
    drop: id => ({ 'data-drop': id, 'data-drop-state': drag ? valid(id) ? over === id ? 'over' : 'available' : undefined : undefined,
      ...(drag?.keyboard ? { tabIndex: 0, onFocus: () => setOver(id), onKeyDown: (event: KeyboardEvent<HTMLElement>) => keyboard(id, true, event) } : {}) }),
  };
  return <DragContext.Provider value={bindings}><div className={`drag-surface ${drag ? 'is-dragging' : ''} ${aimingAttack ? 'is-attack-aim' : ''}`} onKeyDown={event => { if (event.key === 'Escape' || event.key === 'Shift') reset(); }} onClickCapture={event => { const el = (event.target as Element).closest<HTMLElement>('[data-drag],[data-card-id]'); if (pointer.current.shouldSuppressClick(el?.dataset.drag ?? el?.dataset.cardId)) { event.preventDefault(); event.stopPropagation(); } }} onPointerMove={event => {
    if (disabled) return;
    const start = pointer.current.move(event.pointerId, event.clientX, event.clientY); if (!start?.moved) return;
    if (!drag) { event.currentTarget.setPointerCapture(event.pointerId); onPick(start.id); }
    setDrag({ id: start.id, x: event.clientX, y: event.clientY, originX: start.x, originY: start.y }); setOver(hit(event.clientX, event.clientY));
  }} onPointerUp={event => {
    const start = pointer.current.finish(event.pointerId); if (!start) return;
    if (start.moved) { const target = hit(event.clientX, event.clientY); if (target) onDrop(start.id, target); }
    reset();
  }} onPointerCancel={event => { if (pointer.current.cancel(event.pointerId)) reset(); }} onLostPointerCapture={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId) && pointer.current.cancel(event.pointerId)) reset(); }}>
    {children}
    {drag && <span className="sr-only" role="status">{combat ? `${combat.attacker.definition.name} attacks ${combat.target?.definition.name ?? 'directly'}. ${combat.opponentDamage} damage to opponent, ${combat.ownDamage} to you.${combat.attackerDies ? ' Your yokai would be destroyed.' : ''}${combat.targetDies ? ' Enemy yokai would be destroyed.' : ''}${combat.trapRisk ? ' A trap may change this outcome.' : ''}` : `${card?.definition.name} picked up. Choose a destination. Escape cancels.`}</span>}
    {drag && !drag.keyboard && aimingAttack && <svg className="attack-arrow" viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`} aria-hidden="true"><path d={attackArrowPath({ x: drag.originX, y: drag.originY }, drag)} /></svg>}
    {drag && !drag.keyboard && card && !aimingAttack && <div className="drag-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y } as CSSProperties}><CardFace card={card} allocation={draft.allocations[card.id] ?? 0} /></div>}
  </div></DragContext.Provider>;
}
