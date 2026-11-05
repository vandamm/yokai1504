import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameView } from '../game/types';
import type { VisualEvent } from './presentation';
import { publicAsset } from './assets';
import { CardFace } from './CardFace';
import { animateAttack, contactTravel } from './combat';
export interface Rect { x: number; y: number; width: number; height: number; }
export type Geometry = Record<string, Rect>;
export function battleGeometry(geometry: Geometry, before: GameView, battle?: GameView): Geometry {
  const result = { ...geometry };
  for (const player of battle?.players ?? []) player.field.forEach((card, index) => {
    if (!before.players[player.id].field.some(previous => previous.id === card.id) && geometry[`field:${player.id}:${index}`]) result[card.id] = geometry[`field:${player.id}:${index}`];
  });
  return result;
}
export function captureGeometry(): Geometry {
  const result: Geometry = {};
  const save = (id: string, el: Element) => { const { x, y, width, height } = el.getBoundingClientRect(); result[id] = { x, y, width, height }; };
  document.querySelectorAll<HTMLElement>('[data-card-id]').forEach(el => save(el.dataset.cardId!, el));
  for (const zone of ['health', 'deck', 'graveyard', 'hand', 'trap'] as const) document.querySelectorAll<HTMLElement>(`[data-${zone}-seat]`).forEach(el => save(`${zone}:${el.dataset[`${zone}Seat`]}`, el));
  document.querySelectorAll<HTMLElement>('[data-field-seat]').forEach(el => [...el.children].forEach((child, index) => save(`field:${el.dataset.fieldSeat}:${index}`, child)));
  const supply = document.querySelector('.toolbar-supply'); if (supply) save('supply', supply);
  return result;
}
export function Playback({ events, geometry, onStart, onComplete, delay = 0, fastHandMoves = false }: { events: VisualEvent[]; geometry: Geometry; onStart?: () => void; onComplete: () => void; delay?: number; fastHandMoves?: boolean }) {
  const [started, setStarted] = useState(delay === 0);
  const [hit, setHit] = useState(false);
  const [revealed, setRevealed] = useState(!events.some(event => event.kind === 'reveal'));
  const layer = useRef<HTMLDivElement>(null);
  const attack = events.find(event => event.kind === 'attack');
  useLayoutEffect(() => {
    if (!delay) return;
    const timer = window.setTimeout(() => setStarted(true), delay);
    return () => window.clearTimeout(timer);
  }, []);
  useLayoutEffect(() => {
    if (!started) return;
    if (!revealed) {
      const timer = window.setTimeout(() => setRevealed(true), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1400 : 2400);
      return () => window.clearTimeout(timer);
    }
    if (events.every(event => event.kind === 'reveal')) { onStart?.(); onComplete(); return; }
    let live = true, impacted = false, timer: number | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const impact = () => {
      if (!live || impacted) return;
      impacted = true; setHit(true); onStart?.();
      const quickPlay = fastHandMoves && events.filter(event => event.kind !== 'reveal').every(event => event.kind === 'move' && event.from.startsWith('hand:'));
      timer = window.setTimeout(onComplete, reduced || attack?.declaration ? 450 : quickPlay ? 1400 : 2100);
    };
    const from = attack && geometry[attack.from], to = attack && geometry[attack.to];
    const element = layer.current?.querySelector<HTMLElement>('.playback-attacker');
    const motion = from && to && element ? animateAttack(element, contactTravel(from, to), impact, reduced) : undefined;
    if (motion) void motion.finished.catch(impact); else impact();
    return () => { live = false; motion?.cancel(); window.clearTimeout(timer); };
  }, [started, revealed]);
  if (!started) return null;
  const hidden = events.filter(event => event.card && (event.kind === 'attack' && revealed || event.kind === 'death' && hit || event.kind === 'move' && (!attack || hit)));
  const attackerDies = events.some(event => event.kind === 'death' && event.from === attack?.from);
  const fromAttack = attack && geometry[attack.from], toAttack = attack && geometry[attack.to];
  const travel = fromAttack && toAttack ? contactTravel(fromAttack, toAttack) : undefined;
  return <div className="playback-layer" ref={layer} aria-hidden="true"><style>{hidden.map(event => `[data-card-id="${CSS.escape(event.card!.id)}"] { visibility: hidden; }`).join('\n')}</style>{events.map((event, index) => {
    const from = geometry[event.from], to = geometry[event.to]; if (!from || !to) return null;
    if (event.kind === 'reveal') {
      if (revealed) return null;
      const width = Math.min(from.width, 130), height = width * 947 / 640;
      const centerWidth = Math.min(220, window.innerWidth * .56, window.innerHeight * .42 * 640 / 947);
      const style = { left: from.x + from.width / 2 - width / 2, top: from.y + from.height / 2 - height / 2, width, height,
        '--cx': `${window.innerWidth / 2 - from.x - from.width / 2}px`, '--cy': `${window.innerHeight / 2 - from.y - from.height / 2}px`, '--reveal-scale': centerWidth / width,
        '--dx': `${to.x + to.width / 2 - from.x - from.width / 2}px`, '--dy': `${to.y + to.height / 2 - from.y - from.height / 2}px`,
      } as CSSProperties;
      return <div key={index} className="playback-piece playback-reveal" style={style}><CardFace card={event.card!} /></div>;
    }
    if (!revealed) return null;
    if (event.kind === 'attack') return <div key={index} className={`playback-piece playback-attacker ${event.declaration ? 'playback-attack-declaration' : ''} ${hit && attackerDies ? 'playback-fallen' : ''}`} style={{ left: from.x, top: from.y, width: from.width, height: from.height }}><CardFace card={event.card!} /></div>;
    if (event.kind === 'death') return hit ? <div key={index} className="playback-piece playback-death-marker" style={{ left: from.x, top: from.y, width: from.width, height: from.height }}><span className="combat-skull" /></div> : null;
    if ((attack || event.kind === 'damage') && !hit) return null;
    const token = event.kind === 'damage';
    const width = token ? 44 : Math.min(from.width, 130), height = token ? 44 : width * 947 / 640;
    const style = { left: from.x + from.width / 2 - width / 2, top: from.y + from.height / 2 - height / 2, width, height, '--travel-duration': fastHandMoves && event.kind === 'move' && event.from.startsWith('hand:') ? '1.1s' : '1.65s', '--dx': `${to.x + to.width / 2 - from.x - from.width / 2}px`, '--dy': `${to.y + to.height / 2 - from.y - from.height / 2}px` } as CSSProperties;
    return <div key={index} className={`playback-piece playback-${event.kind}`} style={style}>{event.kind === 'damage' ? `−${event.amount}` : event.card && event.kind !== 'draw' ? <CardFace card={event.card} /> : <img src={publicAsset(`cards/${event.seat === 0 ? 'back.svg' : 'back-ochre.svg'}`)} alt="" />}{event.kind === 'draw' && event.amount! > 1 && <b className="draw-amount">×{event.amount}</b>}</div>;
  })}{hit && attack?.card && !attack.declaration && fromAttack && toAttack && travel && <>
    <span className="playback-impact" style={{ left: toAttack.x + toAttack.width / 2, top: toAttack.y + toAttack.height / 2 - 20 }}>Hit {attack.card.attack}</span>
    {attack.targetCard && <span className="playback-impact" style={{ left: fromAttack.x + fromAttack.width / 2 + travel.x, top: fromAttack.y + fromAttack.height / 2 + travel.y + 15 }}>Counter {attack.targetCard.attack}</span>}
  </>}</div>;
}
