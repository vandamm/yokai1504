import { useEffect, useRef } from 'react';
import { CARDS } from '../game/catalog';
import type { CardDefinition } from '../game/types';

const definitions = Object.values(CARDS);
const names = new RegExp(`(${definitions.map(card => card.name).join('|')})`, 'g');

export function PublicHistory({ entries, onInspect }: { entries: string[]; onInspect?: (card: CardDefinition) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [entries.length]);
  const turns: { heading?: string; actions: string[] }[] = [{ actions: [] }];
  for (const entry of entries) {
    const start = /^Turn (\d+): (.*)\.$/s.exec(entry);
    if (start) turns.push({ heading: `Turn ${Math.ceil(Number(start[1]) / 2)}: ${start[2]}`, actions: [] });
    else turns.at(-1)!.actions.push(entry);
  }
  return <div className="public-history-list" ref={list}>{turns.map((turn, index) => <section className="history-turn" key={index}>
    {turn.heading && <h3>{turn.heading}</h3>}
    <ul>{turn.actions.map((entry, action) => <li key={action}>{entry.split(names).map((part, index) => {
      const card = definitions.find(card => card.name === part);
      return card ? <button type="button" className="history-card-link" data-card-def={card.id} key={index} onClick={() => onInspect?.(card)}>{part}</button> : part;
    })}</li>)}</ul>
  </section>)}</div>;
}
