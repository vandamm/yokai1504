import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CARDS } from '../game/catalog';
import { historyText } from '../game/history';
import type { CardDefId, CardDefinition, HistoryEntry, PlayerId } from '../game/types';
import { publicAsset } from './assets';

const definitions = Object.values(CARDS);
const cardNames = new RegExp(`(${definitions.map(card => card.name).join('|')})`, 'g');
type CardReference = { card: CardDefId; owner?: PlayerId };

export function PlayerNames({ text, names, viewer = 0 }: { text: string; names?: [string, string]; viewer?: PlayerId }) {
  if (!names) return <>{text}</>;
  // shortcut: Identical names stay neutral; seat-tagged player references are needed to distinguish them.
  const unique = names.filter(name => name && names.indexOf(name) === names.lastIndexOf(name)).sort((a, b) => b.length - a.length);
  if (!unique.length) return <>{text}</>;
  const escaped = unique.map(name => Array.from(name, char => '\\^$.*+?()[]{}|'.includes(char) ? '\\' + char : char).join('')).join('|');
  const pattern = new RegExp('(^|[^\\p{L}\\p{N}_])(' + escaped + ')(?=$|[^\\p{L}\\p{N}_])', 'gu');
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index! + match[1].length, player = names.indexOf(match[2]) as PlayerId;
    parts.push(text.slice(cursor, start), <span className="history-player-name" data-player={player} data-affiliation={player === viewer ? 'own' : 'opponent'} key={start}>{match[2]}</span>);
    cursor = start + match[2].length;
  }
  return <>{parts}{text.slice(cursor)}</>;
}

function format(entry: HistoryEntry, names?: [string, string]) {
  const references: CardReference[] = [];
  let parts: (string | CardReference)[];
  if (typeof entry === 'string') {
    const actor = names?.find(name => entry.startsWith(`${name} `) && /^(?:summons|plays|attacks with|evokes|releases|reveals|casts|sets|takes|wins|declines)\b/.test(entry.slice(name.length + 1)));
    const rest = actor ? entry.slice(actor.length) : entry;
    parts = [actor ?? '', ...rest.split(cardNames).map(part => {
      const definition = definitions.find(card => card.name === part);
      return definition ? { card: definition.id } : part;
    })];
  } else parts = entry.parts;
  let text = parts.map(part => typeof part === 'string' ? part.replaceAll('\0', '�') : `\0${references.push(part) - 1}\0`).join('');
  if (/ draws a card\.$/.test(text)) return null;
  const actor = typeof entry === 'string' ? names?.findIndex(name => text.startsWith(`${name} `)) : entry.actor;
  const opponent = names && (actor === 0 || actor === 1) ? names[actor === 0 ? 1 : 0] : 'Opponent';
  text = text
    .replace(/^.* summons (\0\d+\0)\.$/s, '⛩️ $1')
    .replace(/^.* attacks with (\0\d+\0) directly\.$/s, (_match, card) => `${card} ⚔️ ${opponent.replaceAll('\0', '�')}`)
    .replace(/^.* attacks with (\0\d+\0) against (\0\d+\0)\.$/s, '$1 ⚔️ $2')
    .replace(/^(.*) takes (\d+) damage \((.*)\)\.$/s, (_match, player, amount, reason) => `${player} -${amount} ❤️${reason === 'battle' || reason === 'direct attack' ? '' : ` (${reason})`}`)
    .replace(/^(\0\d+\0) is destroyed\.$/, '💀 $1')
    .replace(/^.* (?:reveals|casts) (\0\d+\0)\.$/s, '💥 $1')
    .replace(/^.* evokes a soul onto (\0\d+\0)\.$/s, '$1 +\0soul\0')
    .replace(/^.* releases a soul from (\0\d+\0)\.$/s, '$1 −\0soul\0')
    .replace(/\.$/, '');
  return { text, references };
}

export function PublicHistory({ entries, names, viewer = 0, onInspect }: { entries: HistoryEntry[]; names?: [string, string]; viewer?: PlayerId; onInspect?: (card: CardDefinition) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [entries.length]);
  const turns: { heading?: string; actions: NonNullable<ReturnType<typeof format>>[] }[] = [{ actions: [] }];
  for (const entry of entries) {
    const start = /^Turn (\d+): (.*)\.$/s.exec(historyText(entry));
    if (start) turns.push({ heading: `Turn ${Math.ceil(Number(start[1]) / 2)}: ${start[2]}`, actions: [] });
    else { const action = format(entry, names); if (action) turns.at(-1)!.actions.push(action); }
  }
  return <div className="public-history-list" ref={list}>{turns.filter(turn => turn.heading || turn.actions.length).map((turn, index) => <section className="history-turn" key={index}>
    {turn.heading && <h3><PlayerNames text={turn.heading} names={names} viewer={viewer} /></h3>}
    <ul>{turn.actions.map(({ text, references }, action) => <li key={action}>{text.split(/(\0(?:\d+|soul)\0)/g).map((part, index) => {
      if (part === '\0soul\0') return <img className="history-soul" src={publicAsset('icons/soul.svg')} alt="soul" key={index} />;
      const token = /^\0(\d+)\0$/.exec(part), reference = token ? references[Number(token[1])] : undefined;
      if (!reference) return <PlayerNames text={part} names={names} viewer={viewer} key={index} />;
      const card = CARDS[reference.card], owner = reference.owner;
      const ownerLabel = owner === undefined ? undefined : `${names?.[owner] ?? `Player ${owner + 1}`}’s card`;
      return <button type="button" className="history-card-link" data-card-def={card.id} data-owner={owner} data-affiliation={owner === undefined ? undefined : owner === viewer ? 'own' : 'opponent'} title={ownerLabel} aria-label={ownerLabel ? `${card.name}, ${ownerLabel}` : undefined} key={index} onClick={() => onInspect?.(card)}>{card.name}</button>;
    })}</li>)}</ul>
  </section>)}</div>;
}
