import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameCommand, GameView, VisibleCard } from '../game/types';
import { actionUnavailableReason, allocationLimit, allVisible, canConfirmEffect, effectCommand, effectSource, effectUnavailableReason } from './interaction';
import type { CardAction, DraftEvent, TableDraft } from './interaction';
import { publicAsset } from './assets';

interface DecisionBarProps {
  view: GameView;
  draft: TableDraft;
  busy: boolean;
  onDraft(event: DraftEvent): void;
  onCommand(command: GameCommand): void;
  onDetails(card?: VisibleCard): void;
  onUnavailable?(reason: string): void;
}

export function DecisionBar({ view, draft, busy, onDraft, onCommand, onDetails, onUnavailable }: DecisionBarProps) {
  const [localReason, setLocalReason] = useState<string>();
  useEffect(() => setLocalReason(undefined), [view, draft]);
  const explain = (reason: string) => onUnavailable ? onUnavailable(reason) : setLocalReason(reason);
  const actor = view.players[view.decisionPlayer];
  const opponent = view.players[view.decisionPlayer === 0 ? 1 : 0];
  const visible = allVisible(view);
  const selected = visible.find(card => card.id === draft.selectedId);
  const source = effectSource(view);
  const button = (label: ReactNode, action: () => void, options: { reason?: string; className?: string; label?: string } = {}) => <button type="button" className={options.className ?? 'secondary'} disabled={busy} aria-disabled={options.reason ? true : undefined} aria-label={options.label} onClick={() => options.reason ? explain(options.reason) : action()}>{label}</button>;
  const details = (card?: VisibleCard) => button('Details', () => onDetails(card), { className: 'text-button' });
  const clear = (label = 'Cancel') => button(label, () => onDraft({ type: 'clear' }), { className: 'text-button' });
  const cardAction = (card: VisibleCard, action: CardAction, label: string, cost: string, className = 'secondary') => button(<><span>{label}</span><small>{cost}</small></>, () => action === 'attack' ? onDraft({ type: 'beginAttack', id: card.id }) : onCommand({ type: action, cardId: card.id }), { reason: actionUnavailableReason(view, card, action), className, label: `${label}, ${cost}` });
  let title: string;
  let prompt: string | undefined;
  let controls: ReactNode;

  if (view.phase === 'trap' && view.pending?.kind === 'trap') {
    const pending = view.pending;
    const attacker = visible.find(card => card.id === pending.attacker);
    const target = visible.find(card => card.id === pending.target);
    const trap = actor.trap && !('hidden' in actor.trap) ? actor.trap : undefined;
    title = `${attacker?.definition.name ?? 'Attacker'} → ${target?.definition.name ?? actor.name}`;
    prompt = trap ? `${trap.definition.name}: activate or keep hidden.` : 'Choose whether to activate your trap.';
    controls = <>
      {button('Activate trap', () => onCommand({ type: 'respond', activate: true }), { className: 'primary', reason: trap ? effectUnavailableReason(view, trap) : 'Your trap is not visible in this view.' })}
      {button('Keep hidden', () => onCommand({ type: 'respond', activate: false }))}
      {details(trap)}
    </>;
  } else if (view.phase === 'effect') {
    title = source?.definition.name ?? 'Resolve effect';
    const total = Object.values(draft.allocations).reduce((sum, count) => sum + count, 0);
    const canConfirm = canConfirmEffect(view, draft);
    const confirmReason = source?.def === 'ougi' ? 'Choose a soul source, then a different recipient with room.' : 'Choose the marked target before confirming.';
    let editor: ReactNode;
    let confirmLabel = 'Confirm';
    if (source?.def === 'sake') {
      const allocationCard = visible.find(card => card.id === draft.allocationCardId && card.zone === 'field');
      const available = Math.min(3, view.supply);
      prompt = allocationCard ? `${allocationCard.definition.name} · ${total}/${available} souls allocated` : `Tap a yokai to allocate up to ${available} souls.`;
      confirmLabel = `Place ${total} ${total === 1 ? 'soul' : 'souls'}`;
      if (allocationCard) {
        const count = draft.allocations[allocationCard.id] ?? 0;
        const limit = allocationLimit(view, draft, allocationCard.id);
        editor = <div className="soul-stepper" aria-label={`${allocationCard.definition.name} allocation`}>
          {button('−', () => onDraft({ type: 'setAllocation', id: allocationCard.id, count: count - 1 }), { label: `Remove a soul from ${allocationCard.definition.name} allocation`, reason: count <= 0 ? 'No souls are allocated to this yokai.' : undefined })}
          <span className="allocation-value" aria-label={`${count} allocated souls`}><strong>{count}</strong><img src={publicAsset('icons/soul.svg')} className="soul-icon" alt="" /></span>
          {button('+', () => onDraft({ type: 'setAllocation', id: allocationCard.id, count: count + 1 }), { label: `Add a soul to ${allocationCard.definition.name} allocation`, reason: count >= limit ? allocationCard.souls + count >= allocationCard.definition.cap ? 'This yokai has no more soul capacity.' : 'All available souls for this Sake are allocated.' : undefined })}
        </div>;
      }
    } else if (source?.def === 'ougi') {
      const [from, to] = draft.targets.map(id => visible.find(card => card.id === id));
      prompt = draft.targets.length === 0 ? '1. Choose a yokai with a soul.' : draft.targets.length === 1 ? '2. Choose a different yokai with room.' : `${from?.definition.name ?? 'Source'} → ${to?.definition.name ?? 'Recipient'}`;
    } else if (source?.def === 'jufu') {
      prompt = `Choose up to two yokai with souls · ${draft.targets.length}/2 chosen`;
      if (!draft.targets.length) confirmLabel = 'No targets';
    } else if (source?.def === 'boseki') prompt = 'Choose a yokai from either graveyard above.';
    else if (source?.def === 'hamaya') prompt = 'Choose a marked highest-attack yokai.';
    else if (source?.def === 'karakasa-kozo') prompt = 'Choose a set trap to destroy.';
    else if (source?.def === 'nekomata') prompt = 'Choose an opposing yokai to exchange.';
    controls = <>
      {editor}
      {button(confirmLabel, () => onCommand(effectCommand(view, draft)), { className: 'primary', reason: canConfirm ? undefined : confirmReason })}
      {details(source)}
      {(draft.targets.length > 0 || total > 0) && clear('Clear')}
    </>;
  } else if (draft.attackSourceId) {
    const attacker = actor.field.find(card => card.id === draft.attackSourceId);
    title = `Attack with ${attacker?.definition.name ?? 'selected yokai'}`;
    prompt = opponent.field.length ? 'Tap a marked defender. This ends your turn.' : `${opponent.name} has no yokai. Attack directly.`;
    controls = <>
      {!opponent.field.length && button('Attack player', () => onCommand({ type: 'attack', attacker: draft.attackSourceId!, target: null }), { className: 'danger', reason: attacker ? actionUnavailableReason(view, attacker, 'attack') : 'Select a yokai on your field.' })}
      {details(attacker)}{clear()}
    </>;
  } else {
    title = selected?.definition.name ?? 'Tap a card to act';
    const owns = selected?.controller === view.decisionPlayer;
    if (selected && !owns) prompt = 'Other player’s card · available for inspection';
    else if (selected?.zone === 'graveyard') prompt = 'In the graveyard · available for inspection';
    const endTurn = button('End turn', () => onCommand({ type: 'endTurn' }), { className: 'secondary end-turn' });
    controls = <>
      {selected && owns && (selected.zone === 'hand' || selected.zone === 'trap') && <>
        {cardAction(selected, 'play', selected.definition.kind === 'yokai' ? 'Summon' : 'Cast spell', '1 action', 'primary')}
        {selected.zone === 'hand' && selected.definition.kind === 'spell' && cardAction(selected, 'setTrap', 'Set trap', 'Free')}
      </>}
      {selected && owns && selected.zone === 'field' && <>
        {cardAction(selected, 'evoke', 'Evoke', '1 action', 'primary')}
        {selected.definition.effectType === 'release' && cardAction(selected, 'release', 'Release', 'Free')}
        {cardAction(selected, 'attack', 'Attack', 'Ends turn')}
      </>}
      {selected && details(selected)}
      {endTurn}
    </>;
  }
  return <section className={`decision-dock ${view.phase === 'main' && selected && !draft.attackSourceId ? 'has-card-actions' : ''} ${view.phase === 'effect' || view.phase === 'trap' ? 'resolving' : ''}`} aria-label="Current decision" aria-busy={busy}>
    <div className="decision-copy"><strong>{title}</strong>{prompt && <span>{prompt}</span>}</div>
    <div className="decision-controls">{controls}</div>
    {!onUnavailable && localReason && <p className="decision-reason" role="status">{localReason}</p>}
  </section>;
}
