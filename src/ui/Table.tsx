import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GameView, PlayerId, PlayerView, VisibleCard } from '../game/types';
import { CardFace } from './CardFace';
export { CardFace } from './CardFace';
import { publicAsset } from './assets';
import { useTableDrag } from './DragSurface';
import { ActionBudget } from './DecisionBar';
import { actionUnavailableReason, allocationLimit, effectSource } from './interaction';

const cardImage = (card: VisibleCard) => publicAsset(`cards/${card.def}.png`);
const cardBack = (seat: PlayerId) => publicAsset(`cards/${seat === 0 ? 'back' : 'back-ochre'}.svg`);
const visibleTrap = (trap: PlayerView['trap']): trap is VisibleCard => !!trap && !('hidden' in trap);

function cardLabel(card: VisibleCard, allocation = 0) {
  return card.definition.name + (card.zone === 'field' ? `, ${card.attack} attack, base ${card.definition.atk}, ${card.souls} of ${card.definition.cap} souls${allocation ? `, adding ${allocation}` : ''}` : '');
}

interface TableProps {
  turnControls?: ReactNode;
  onHistory?: () => void;
  onNotifications?: () => void;
  view: GameView;
  viewer?: PlayerId;
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

export function Table({ view, viewer = view.decisionPlayer, openHands, selectedId, targetIds, chosenTargets, allocations, targetTrapSeats = [], onCard, onTrap, onGraveyard, onSoul, onRelease, turnControls, onHistory, onNotifications }: TableProps) {
  const drag = useTableDrag();
  const resolving = effectSource(view);
  const lower = view.players[viewer];
  const upper = view.players[viewer === 0 ? 1 : 0];

  function cardButton(card: VisibleCard, inHand = false) {
    const chosen = chosenTargets.includes(card.id);
    const selected = selectedId === card.id || chosen;
    const target = targetIds.includes(card.id);
    const allocation = allocations[card.id] ?? 0;
    const combat = drag.combat;
    const doomed = combat && (combat.attacker.id === card.id && combat.attackerDies || combat.target?.id === card.id && combat.targetDies);
    const face = <button type="button" key={card.id} {...drag.drop(card.id)} {...drag.bind(card.id)} data-card-id={card.id} className={`table-card ${selected ? 'selected' : ''} ${target ? 'target' : ''} ${chosen ? 'chosen' : ''} ${doomed ? 'combat-doomed' : ''}`} onClick={event => { if (!event.shiftKey) onCard(card); }} aria-label={`${target ? 'Target ' : ''}${cardLabel(card, allocation)}${chosen ? `, chosen target ${chosenTargets.indexOf(card.id) + 1}` : ''}`} aria-pressed={selected}>
      <CardFace card={card} allocation={allocation} />
      {doomed && <><span className="combat-skull" role="img" aria-label={combat.trapRisk ? 'May be destroyed; a trap could change the outcome' : 'Would be destroyed'} />{combat.trapRisk && <span className="combat-uncertain" aria-hidden="true">?</span>}</>}
      {chosen && <span className="chosen-order" aria-hidden="true">{chosenTargets.indexOf(card.id) + 1}</span>}
    </button>;
    if (inHand) return face;
    const sake = view.phase === 'effect' && resolving?.def === 'sake';
    const canSoul = viewer === view.decisionPlayer && !view.result && (sake ? allocationLimit(view, { targets: [], allocations }, card.id) > allocation : !actionUnavailableReason(view, card, 'evoke'));
    const slot = card.definition.cap - card.souls - allocation - 1;
    return <div className="card-spot" key={card.id} style={{ '--empty-soul-index': slot } as CSSProperties}>{face}<div className="soul-tools">{onSoul && canSoul && <button type="button" className="add-soul" aria-label={`${sake ? 'Allocate' : 'Evoke'} soul ${sake ? 'to' : 'onto'} ${card.definition.name}`} title={sake ? 'Allocate a soul' : 'Add a soul'} onClick={() => onSoul(card)}><span className="soul-add-token" aria-hidden="true"><img src={publicAsset('icons/soul.svg')} alt="" /><span>+</span></span></button>}{onRelease && selected && !actionUnavailableReason(view, card, 'release') && <button type="button" className="release-soul" onClick={() => onRelease(card)} aria-label={`Release a soul from ${card.definition.name}`}>Release</button>}</div></div>;
  }

  function hand(player: PlayerView, top: boolean) {
    const count = player.hand?.length ?? player.handCount;
    return <section className={`${top ? 'top-hand' : 'bottom-hand'} ${!view.result && player.id === view.decisionPlayer ? 'side-active' : ''}`} style={{ '--fan-rise': `${count}px` } as CSSProperties} aria-label={`${player.name}’s hand, ${top ? 'far' : 'near'} edge`}>
      <HandTrack key={player.id} player={player} openHands={openHands}>
        {count ? Array.from({ length: count }, (_, index) => {
          const card = player.hand?.[index], offset = index - (count - 1) / 2;
          return <div className="fan-card" key={card?.id ?? index} style={{ '--fan-angle': `${offset * Math.min(7, 28 / Math.max(1, count - 1)) * (top ? -1 : 1)}deg`, '--fan-lift': `${Math.abs(offset) * 2}px` } as CSSProperties}>
            {card ? cardButton(card, true) : <span className="hand-back" aria-hidden="true"><img src={cardBack(player.id)} alt="" draggable={false} /></span>}
          </div>;
        }) : <span className="empty-hand">No cards in hand</span>}
      </HandTrack>
    </section>;
  }

  function seat(player: PlayerView, top: boolean) {
    const trap = player.trap;
    const combat = drag.combat, trapRisk = combat?.opponent === player.id && combat.trapRisk;
    const damage = combat ? player.id === combat.opponent ? combat.opponentDamage : combat.ownDamage : 0;
    const fieldDrop = drag.drop(`field:${player.id}`);
    const directAttack = player.id !== view.decisionPlayer && player.field.length === 0 && !!fieldDrop['data-drop-state'];
    const targetTrap = targetTrapSeats.includes(player.id) || (visibleTrap(trap) && targetIds.includes(trap.id));
    const chosenTrap = chosenTargets.includes(`trap:${player.id}`) || (visibleTrap(trap) && chosenTargets.includes(trap.id));
    const selectedTrap = chosenTrap || (visibleTrap(trap) && selectedId === trap.id);
    const topDiscard = player.graveyard.at(-1);
    const trapContents = <>{trap ? <img src={visibleTrap(trap) ? cardImage(trap) : cardBack(player.id)} alt="" draggable={false} /> : <span className="empty-trap-card" aria-hidden="true">×</span>}<span className="pile-caption">Trap</span>{trapRisk && <span className="combat-trap-question" aria-hidden="true">?</span>}</>;
    return <section className={`table-seat ${top ? 'upper-seat' : 'lower-seat'} ${!view.result && player.id === view.decisionPlayer ? 'side-active' : ''}`} {...fieldDrop} aria-label={`${player.name}’s play area${directAttack ? ', drop to attack directly' : ''}`}>
      {directAttack && <span className="direct-attack-hint" aria-hidden="true">Drop to attack directly</span>}
      <div className="field" data-field-seat={player.id} {...drag.drop(`field:${player.id}`)} aria-label={`${player.name}’s yokai`}>{[0, 1, 2].map(index => player.field[index] ? cardButton(player.field[index]) : <div key={`empty-${index}`} className="empty-slot" aria-label="Empty yokai position" />)}</div>
      <div className="seat-summary"><span className="health" {...drag.drop(`player:${player.id}`)} data-health-seat={player.id} aria-label={`${player.name}, ${player.health} health`}><span aria-hidden="true">♥</span><b>{player.health}</b>{combat && (player.id === combat.opponent || damage > 0) && <span className="combat-health-preview">{damage ? '−' : ''}{damage}{combat.trapRisk ? '?' : ''}</span>}</span><span className="player-name">{player.name}</span>{trapRisk && <span className="combat-trap-warning">Trap may change outcome</span>}{!top && <ActionBudget view={view} viewer={viewer} />}</div>
      <div className="rear-piles">
        <div className="table-deck" data-deck-seat={player.id} aria-label={`${player.name}’s deck, ${player.deckCount} cards`}><Pile image={cardBack(player.id)} count={player.deckCount} /><span className="pile-caption">Deck</span></div>
        <button type="button" className="table-graveyard" data-graveyard-seat={player.id} onClick={() => onGraveyard(player.id)} aria-label={`View ${player.name}’s graveyard, ${player.graveyard.length} cards`}><Pile image={topDiscard ? cardImage(topDiscard) : undefined} count={player.graveyard.length} /><span className="pile-caption">Graveyard</span></button>
      </div>
      {trap ? <button type="button" {...drag.drop(visibleTrap(trap) ? trap.id : `trap:${player.id}`)} {...(visibleTrap(trap) ? drag.bind(trap.id) : {})} data-card-id={visibleTrap(trap) ? trap.id : undefined} data-trap-seat={player.id} className={`table-trap ${targetTrap ? 'target' : ''} ${selectedTrap ? 'selected' : ''}`} onClick={event => { if (!event.shiftKey) onTrap(player.id); }} aria-label={`${player.name}’s ${visibleTrap(trap) ? `trap ${trap.definition.name}` : 'hidden trap'}${targetTrap ? ', available target' : ''}${chosenTrap ? ', chosen' : ''}`} aria-pressed={selectedTrap}>{trapContents}</button> : <div {...drag.drop(`trap:${player.id}`)} className="table-trap is-empty" data-trap-seat={player.id} aria-label={`${player.name}’s empty trap slot`}>{trapContents}</div>}
    </section>;
  }

  return <div className={`table-surface ${view.result ? '' : view.decisionPlayer === viewer ? 'active-near' : 'active-far'} phase-${view.phase}`}>
    {!view.result && <div key={view.decisionPlayer} className="turn-atmosphere" aria-hidden="true" />}
    {onHistory && <button type="button" className="table-menu" aria-label="Open history and menu" onClick={onHistory}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" /></svg></button>}
    {onNotifications && <button type="button" className="table-menu table-notifications" aria-label="Notification settings" onClick={onNotifications}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></button>}
    {hand(upper, true)}
    <div className="battlefield" role="region" aria-label="Facing yokai fields" tabIndex={0}>
      {seat(upper, true)}
      <div className="table-divider"><span className="divider-rule" aria-hidden="true" /><span className="toolbar-supply divider-supply" aria-label={`Supply: ${view.supply} souls`}><strong>{view.supply}</strong><img src={publicAsset('icons/soul.svg')} alt="" /></span><div className="divider-utilities">{turnControls}</div></div>
      {seat(lower, false)}
    </div>
    {hand(lower, false)}
  </div>;
}
