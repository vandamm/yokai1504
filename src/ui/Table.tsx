import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { CardDefId, GameView, PlayerId, PlayerView, VisibleCard } from '../game/types';
import { publicAsset } from './assets';
import { useTableDrag } from './DragSurface';
import { actionUnavailableReason, allocationLimit, effectSource } from './interaction';

const cardColors: Partial<Record<CardDefId, string>> = {
  'karakasa-kozo': '#7c9554', kappa: '#ab525e', nekomata: '#d95d47',
  'zashiki-warashi': '#d89fae', 'chochin-kozo': '#579d95', rokurokubi: '#9f8bbf',
  'yuki-onna': '#324d88', tengu: '#686868', nurikabe: '#b2abaa',
};
const cardImage = (card: VisibleCard) => publicAsset(`cards/${card.def}.png`);
const cardBack = (seat: PlayerId) => publicAsset(`cards/${seat === 0 ? 'back' : 'back-ochre'}.svg`);
const visibleTrap = (trap: PlayerView['trap']): trap is VisibleCard => !!trap && !('hidden' in trap);

/** Original artwork with live values over its printed attack and soul slots. */
export function CardFace({ card, allocation = 0 }: { card: VisibleCard; allocation?: number }) {
  return <span className="card-face" style={{ '--card-color': cardColors[card.def] } as CSSProperties}>
    <img src={cardImage(card)} alt="" draggable={false} />
    {card.zone === 'field' && <>
      <span className={`live-attack ${card.attack !== card.definition.atk ? 'modified' : ''}`} aria-hidden="true">{card.attack}</span>
      <span className="soul-slots" aria-hidden="true">{Array.from({ length: card.definition.cap }, (_, index) => <span key={index} className={`soul-slot ${index < card.souls ? 'filled' : index < card.souls + allocation ? 'pending' : ''}`} />)}</span>
    </>}
  </span>;
}

function cardLabel(card: VisibleCard, allocation = 0) {
  return card.definition.name + (card.zone === 'field' ? `, ${card.attack} attack, base ${card.definition.atk}, ${card.souls} of ${card.definition.cap} souls${allocation ? `, adding ${allocation}` : ''}` : '');
}

interface TableProps {
  view: GameView;
  openHands: boolean;
  selectedId?: string;
  targetIds: readonly string[];
  chosenTargets: readonly string[];
  allocations: Readonly<Record<string, number>>;
  targetTrapSeats?: readonly PlayerId[];
  onCard: (card: VisibleCard) => void;
  onTrap: (seat: PlayerId) => void;
  onGraveyard: (seat: PlayerId) => void;
  onSoul?: (card: VisibleCard) => void;
  onRelease?: (card: VisibleCard) => void;
}

function Pile({ image, count }: { image?: string; count: number }) {
  return <span className={`card-pile ${count === 0 ? 'empty-pile' : ''}`} aria-hidden="true">
    {image && count > 0 && <img src={image} alt="" draggable={false} />}
    <span className="pile-count">{count}</span>
  </span>;
}

function HandTrack({ player, openHands, children }: { player: PlayerView; openHands: boolean; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, start: true, end: true });
  const measure = () => { const el = track.current; if (el) setScroll({ overflow: el.scrollWidth > el.clientWidth + 1, start: el.scrollLeft < 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 }); };
  useEffect(() => { const el = track.current; if (!el) return; const observer = new ResizeObserver(measure); observer.observe(el); measure(); return () => observer.disconnect(); }, [player.handCount]);
  return <div className="hand-window"><div ref={track} className="hand-track" data-hand-seat={player.id} tabIndex={0} onScroll={measure} aria-description={`${player.handCount} cards`} aria-label={`${player.name}’s ${player.hand ? '' : 'hidden '}hand cards${openHands ? ', open hands' : ''}`}>{children}</div>{scroll.overflow && <><button type="button" className="hand-scroll hand-scroll-back" aria-label={`Scroll ${player.name}’s hand left`} disabled={scroll.start} onClick={() => track.current?.scrollBy({ left: -180, behavior: 'smooth' })}>‹</button><button type="button" className="hand-scroll hand-scroll-next" aria-label={`Scroll ${player.name}’s hand right`} disabled={scroll.end} onClick={() => track.current?.scrollBy({ left: 180, behavior: 'smooth' })}>›</button></>}</div>;
}

export function Table({ view, openHands, selectedId, targetIds, chosenTargets, allocations, targetTrapSeats = [], onCard, onTrap, onGraveyard, onSoul, onRelease }: TableProps) {
  const drag = useTableDrag();
  const resolving = effectSource(view);
  const [expandedHand, setExpandedHand] = useState(false);
  const lower = view.players[view.decisionPlayer];
  const upper = view.players[view.decisionPlayer === 0 ? 1 : 0];

  function cardButton(card: VisibleCard, inHand = false) {
    const chosen = chosenTargets.includes(card.id);
    const selected = selectedId === card.id || chosen;
    const target = targetIds.includes(card.id);
    const allocation = allocations[card.id] ?? 0;
    const face = <button type="button" key={card.id} {...drag.drop(card.id)} {...drag.bind(card.id)} data-card-id={card.id} className={`table-card ${selected ? 'selected' : ''} ${target ? 'target' : ''} ${chosen ? 'chosen' : ''}`} onClick={event => { if (!event.shiftKey) onCard(card); }} aria-label={`${target ? 'Target ' : ''}${cardLabel(card, allocation)}${chosen ? `, chosen target ${chosenTargets.indexOf(card.id) + 1}` : ''}`} aria-pressed={selected}>
      <CardFace card={card} allocation={allocation} />
      {chosen && <span className="chosen-order" aria-hidden="true">{chosenTargets.indexOf(card.id) + 1}</span>}
      {inHand && <span className="card-name">{card.definition.name}</span>}
    </button>;
    if (inHand) return face;
    const sake = view.phase === 'effect' && resolving?.def === 'sake';
    const canSoul = sake ? allocationLimit(view, { targets: [], allocations }, card.id) > allocation : !actionUnavailableReason(view, card, 'evoke');
    return <div className="card-spot" key={card.id}>{face}<div className="soul-tools">{onSoul && canSoul && <button type="button" className="add-soul" aria-label={`${sake ? 'Allocate' : 'Evoke'} soul ${sake ? 'to' : 'onto'} ${card.definition.name}`} onClick={() => onSoul(card)}>+<img src={publicAsset('icons/soul.svg')} alt="" /></button>}{onRelease && selected && !actionUnavailableReason(view, card, 'release') && <button type="button" className="release-soul" onClick={() => onRelease(card)} aria-label={`Release a soul from ${card.definition.name}`}>Release</button>}</div></div>;
  }

  function hand(player: PlayerView, top: boolean) {
    const owner = <>
      <strong title={player.name}>{player.name}</strong>
      <span className="health" {...drag.drop(`player:${player.id}`)} data-health-seat={player.id} aria-label={`${player.name}, ${player.health} health`}><span aria-hidden="true">♥</span><b>{player.health}</b></span>
      {top && player.hand && <span className="hand-expand-hint" aria-hidden="true">{expandedHand ? '⌃' : '⌄'}</span>}
    </>;
    return <section className={`${top ? 'top-hand' : 'bottom-hand'} ${top && expandedHand ? 'expanded' : ''}`} aria-label={`${player.name}’s hand, ${top ? 'far' : 'near'} edge`}>
      {top && player.hand ? <button type="button" className="seat-summary seat-summary-toggle" onClick={() => setExpandedHand(value => !value)} aria-expanded={expandedHand} aria-label={`${expandedHand ? 'Compact' : 'Expand'} ${player.name}’s hand`} aria-description={`${player.health} health; ${player.handCount} cards`}>{owner}</button> : <div className="seat-summary">{owner}</div>}
      <HandTrack key={player.id} player={player} openHands={openHands}>
        {player.hand ? player.hand.length ? player.hand.map(card => cardButton(card, true)) : <span className="empty-hand">No cards in hand</span> : Array.from({ length: player.handCount }, (_, index) => <span className="hand-back" key={index} aria-hidden="true"><img src={cardBack(player.id)} alt="" draggable={false} /></span>)}
      </HandTrack>
    </section>;
  }

  function seat(player: PlayerView, top: boolean) {
    const trap = player.trap;
    const targetTrap = targetTrapSeats.includes(player.id) || (visibleTrap(trap) && targetIds.includes(trap.id));
    const chosenTrap = chosenTargets.includes(`trap:${player.id}`) || (visibleTrap(trap) && chosenTargets.includes(trap.id));
    const selectedTrap = chosenTrap || (visibleTrap(trap) && selectedId === trap.id);
    const topDiscard = player.graveyard.at(-1);
    const trapContents = <>{trap ? <img src={visibleTrap(trap) ? cardImage(trap) : cardBack(player.id)} alt="" draggable={false} /> : <span className="empty-trap-card" aria-hidden="true">×</span>}<span className="pile-caption">Trap</span></>;
    return <section className={`table-seat ${top ? 'upper-seat' : 'lower-seat'}`} {...drag.drop(`field:${player.id}`)} aria-label={`${player.name}’s play area`}>
      <div className="field" data-field-seat={player.id} {...drag.drop(`field:${player.id}`)} aria-label={`${player.name}’s yokai`}>{[0, 1, 2].map(index => player.field[index] ? cardButton(player.field[index]) : <div key={`empty-${index}`} className="empty-slot" aria-label="Empty yokai position" />)}</div>
      <div className="rear-piles">
        <div className="table-deck" data-deck-seat={player.id} aria-label={`${player.name}’s deck, ${player.deckCount} cards`}><Pile image={cardBack(player.id)} count={player.deckCount} /><span className="pile-caption">Deck</span></div>
        <button type="button" className="table-graveyard" data-graveyard-seat={player.id} onClick={() => onGraveyard(player.id)} aria-label={`View ${player.name}’s graveyard, ${player.graveyard.length} cards`}><Pile image={topDiscard ? cardImage(topDiscard) : undefined} count={player.graveyard.length} /><span className="pile-caption">Graveyard</span></button>
      </div>
      {trap ? <button type="button" {...drag.drop(visibleTrap(trap) ? trap.id : `trap:${player.id}`)} {...(visibleTrap(trap) ? drag.bind(trap.id) : {})} data-card-id={visibleTrap(trap) ? trap.id : undefined} data-trap-seat={player.id} className={`table-trap ${targetTrap ? 'target' : ''} ${selectedTrap ? 'selected' : ''}`} onClick={event => { if (!event.shiftKey) onTrap(player.id); }} aria-label={`${player.name}’s ${visibleTrap(trap) ? `trap ${trap.definition.name}` : 'hidden trap'}${targetTrap ? ', available target' : ''}${chosenTrap ? ', chosen' : ''}`} aria-pressed={selectedTrap}>{trapContents}</button> : <div {...drag.drop(`trap:${player.id}`)} className="table-trap is-empty" data-trap-seat={player.id} aria-label={`${player.name}’s empty trap slot`}>{trapContents}</div>}
    </section>;
  }

  return <div className="table-surface">
    {hand(upper, true)}
    <div className="battlefield" role="region" aria-label="Facing yokai fields" tabIndex={0}>
      {seat(upper, true)}
      <div className="table-divider" aria-hidden="true"><span /></div>
      {seat(lower, false)}
    </div>
    {hand(lower, false)}
  </div>;
}
