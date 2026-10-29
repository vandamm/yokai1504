import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { CardDefId, GameView, PlayerId, PlayerView, VisibleCard } from '../game/types';
import { publicAsset } from './assets';

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
}

function Pile({ image, count }: { image?: string; count: number }) {
  return <span className={`card-pile ${count === 0 ? 'empty-pile' : ''}`} aria-hidden="true">
    {image && count > 0 && <img src={image} alt="" draggable={false} />}
    <span className="pile-count">{count}</span>
  </span>;
}

export function Table({ view, openHands, selectedId, targetIds, chosenTargets, allocations, targetTrapSeats = [], onCard, onTrap, onGraveyard }: TableProps) {
  const [expandedHand, setExpandedHand] = useState(false);
  const lower = view.players[view.decisionPlayer];
  const upper = view.players[view.decisionPlayer === 0 ? 1 : 0];

  function cardButton(card: VisibleCard, inHand = false) {
    const chosen = chosenTargets.includes(card.id);
    const selected = selectedId === card.id || chosen;
    const target = targetIds.includes(card.id);
    const allocation = allocations[card.id] ?? 0;
    return <button type="button" key={card.id} className={`table-card ${selected ? 'selected' : ''} ${target ? 'target' : ''} ${chosen ? 'chosen' : ''}`} onClick={() => onCard(card)} aria-label={`${target ? 'Target ' : ''}${cardLabel(card, allocation)}${chosen ? `, chosen target ${chosenTargets.indexOf(card.id) + 1}` : ''}`} aria-pressed={selected}>
      <CardFace card={card} allocation={allocation} />
      {chosen && <span className="chosen-order" aria-hidden="true">{chosenTargets.indexOf(card.id) + 1}</span>}
      {inHand && <span className="card-name">{card.definition.name}</span>}
    </button>;
  }

  function hand(player: PlayerView, top: boolean) {
    const owner = <>
      <strong title={player.name}>{player.name}</strong>
      <span className="health" aria-label={`${player.name}, ${player.health} health`}><span aria-hidden="true">♥</span><b>{player.health}</b></span>
      <span className="seat-counters"><span className="hand-count">Hand {player.handCount}{top && player.hand && <span aria-hidden="true"> {expandedHand ? '⌃' : '⌄'}</span>}</span></span>
    </>;
    return <section className={`${top ? 'top-hand' : 'bottom-hand'} ${top && expandedHand ? 'expanded' : ''}`} aria-label={`${player.name}’s hand, ${top ? 'far' : 'near'} edge`}>
      {top && player.hand ? <button type="button" className="seat-summary seat-summary-toggle" onClick={() => setExpandedHand(value => !value)} aria-expanded={expandedHand} aria-label={`${expandedHand ? 'Compact' : 'Expand'} ${player.name}’s hand`} aria-description={`${player.health} health; ${player.handCount} cards`}>{owner}</button> : <div className="seat-summary">{owner}</div>}
      <div className="hand-track" tabIndex={0} aria-label={`${player.name}’s ${player.hand ? '' : 'hidden '}hand cards${openHands ? ', open hands' : ''}`}>
        {player.hand ? player.hand.length ? player.hand.map(card => cardButton(card, true)) : <span className="empty-hand">No cards in hand</span> : Array.from({ length: player.handCount }, (_, index) => <span className="hand-back" key={index} aria-hidden="true"><img src={cardBack(player.id)} alt="" draggable={false} /></span>)}
      </div>
    </section>;
  }

  function seat(player: PlayerView, top: boolean) {
    const trap = player.trap;
    const targetTrap = targetTrapSeats.includes(player.id) || (visibleTrap(trap) && targetIds.includes(trap.id));
    const chosenTrap = chosenTargets.includes(`trap:${player.id}`) || (visibleTrap(trap) && chosenTargets.includes(trap.id));
    const selectedTrap = chosenTrap || (visibleTrap(trap) && selectedId === trap.id);
    const topDiscard = player.graveyard.at(-1);
    const trapContents = <>{trap ? <img src={visibleTrap(trap) ? cardImage(trap) : cardBack(player.id)} alt="" draggable={false} /> : <span className="empty-trap-card" aria-hidden="true">×</span>}<span className="pile-caption">Trap</span></>;
    return <section className={`table-seat ${top ? 'upper-seat' : 'lower-seat'}`} aria-label={`${player.name}’s play area`}>
      <div className="field" aria-label={`${player.name}’s yokai`}>{[0, 1, 2].map(index => player.field[index] ? cardButton(player.field[index]) : <div key={`empty-${index}`} className="empty-slot" aria-label="Empty yokai position"><span aria-hidden="true">—</span></div>)}</div>
      <div className="rear-piles">
        <div className="table-deck" aria-label={`${player.name}’s deck, ${player.deckCount} cards`}><Pile image={cardBack(player.id)} count={player.deckCount} /><span className="pile-caption">Deck</span></div>
        <button type="button" className="table-graveyard" onClick={() => onGraveyard(player.id)} aria-label={`View ${player.name}’s graveyard, ${player.graveyard.length} cards`}><Pile image={topDiscard ? cardImage(topDiscard) : undefined} count={player.graveyard.length} /><span className="pile-caption">Graveyard</span></button>
      </div>
      {trap ? <button type="button" className={`table-trap ${targetTrap ? 'target' : ''} ${selectedTrap ? 'selected' : ''}`} onClick={() => onTrap(player.id)} aria-label={`${player.name}’s ${visibleTrap(trap) ? `trap ${trap.definition.name}` : 'hidden trap'}${targetTrap ? ', available target' : ''}${chosenTrap ? ', chosen' : ''}`} aria-pressed={selectedTrap}>{trapContents}</button> : <div className="table-trap is-empty" aria-label={`${player.name}’s empty trap slot`}>{trapContents}</div>}
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
