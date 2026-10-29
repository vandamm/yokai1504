import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { VisualEvent } from './presentation';
import { publicAsset } from './assets';
export interface Rect { x: number; y: number; width: number; height: number; }
export type Geometry = Record<string, Rect>;
export function captureGeometry(): Geometry {
  const result: Geometry = {};
  const save = (id: string, el: Element) => { const { x, y, width, height } = el.getBoundingClientRect(); result[id] = { x, y, width, height }; };
  document.querySelectorAll<HTMLElement>('[data-card-id]').forEach(el => save(el.dataset.cardId!, el));
  for (const zone of ['health', 'deck', 'graveyard', 'hand', 'trap'] as const) document.querySelectorAll<HTMLElement>(`[data-${zone}-seat]`).forEach(el => save(`${zone}:${el.dataset[`${zone}Seat`]}`, el));
  document.querySelectorAll<HTMLElement>('[data-field-seat]').forEach(el => [...el.children].forEach((child, index) => save(`field:${el.dataset.fieldSeat}:${index}`, child)));
  const supply = document.querySelector('.toolbar-supply'); if (supply) save('supply', supply);
  return result;
}
export function Playback({ events, geometry, onComplete }: { events: VisualEvent[]; geometry: Geometry; onComplete: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onComplete, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 450 : 1400); return () => window.clearTimeout(timer); }, []);
  return <div className="playback-layer" aria-hidden="true"><style>{events.filter(event => event.card && ['attack', 'death', 'summon', 'cast', 'move'].includes(event.kind)).map(event => `[data-card-id="${CSS.escape(event.card!.id)}"] { visibility: hidden; }`).join('\n')}</style>{events.map((event, index) => {
    const from = geometry[event.from], to = geometry[event.to]; if (!from || !to) return null;
    const token = event.kind === 'damage' || event.kind === 'soul';
    const width = token ? 44 : Math.min(from.width, 130), height = token ? 44 : width * 947 / 640;
    const style = { left: from.x + from.width / 2 - width / 2, top: from.y + from.height / 2 - height / 2, width, height, '--dx': `${to.x + to.width / 2 - from.x - from.width / 2}px`, '--dy': `${to.y + to.height / 2 - from.y - from.height / 2}px` } as CSSProperties;
    return <div key={index} className={`playback-piece playback-${event.kind}`} style={style}>{event.kind === 'damage' ? `−${event.amount}` : event.kind === 'soul' ? <><img src={publicAsset('icons/soul.svg')} alt="" />{event.amount! > 1 && <b>×{event.amount}</b>}</> : <img src={publicAsset(`cards/${event.kind === 'draw' ? event.seat === 0 ? 'back.svg' : 'back-ochre.svg' : `${event.card?.def}.png`}`)} alt="" />}{event.kind === 'draw' && event.amount! > 1 && <b className="draw-amount">×{event.amount}</b>}</div>;
  })}</div>;
}
