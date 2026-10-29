import type { GameCommand, GameView, VisibleCard } from '../game/types';
import type { DraftEvent, TableDraft } from './interaction';
import { allVisible, canConfirmEffect, decisionCandidates, effectCommand, effectSource } from './interaction';
import { useTableDrag } from './DragSurface';
import { resolveEffectTarget } from './drag';
import { publicAsset } from './assets';

interface Props {
  view: GameView; draft: TableDraft; busy: boolean; onDraft: (event: DraftEvent) => void;
  onCommand: (command: GameCommand) => void; onDetails: (card?: VisibleCard) => void; onUnavailable?: (reason: string) => void;
}
export function TurnControls({ view, draft, busy, onCommand, onDetails, showInspect = false, onUndo, canUndo = false }: Omit<Props, 'onDraft'> & { showInspect?: boolean; onUndo?: () => void; canUndo?: boolean }) {
  const remaining = 2 - view.actionsUsed;
  const selected = allVisible(view).find(card => card.id === draft.selectedId) ?? effectSource(view);
  return <div className="turn-controls" aria-label="Turn controls">
    {view.phase === 'main' && <span className={`action-budget ${remaining === 0 ? 'exhausted' : ''}`} role="status" aria-label={`${remaining} main ${remaining === 1 ? 'action' : 'actions'} left`}><strong>{remaining}</strong><span>{remaining === 1 ? 'action' : 'actions'} left</span><span className="action-pips" aria-hidden="true">{[0, 1].map(i => <i key={i} className={i < remaining ? '' : 'used'} />)}</span></span>}
    {showInspect && selected && <button type="button" className="text-button" onClick={() => onDetails(selected)}>Inspect</button>}
    <div className="turn-buttons">{onUndo && <button type="button" className="undo-button" aria-label="Undo" disabled={busy || !canUndo} onClick={onUndo}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4 4 9l5 5M4 9h9a7 7 0 0 1 0 14" transform="translate(0 -2)" /></svg><span>Undo</span></button>}
    {(view.phase === 'main'  || view.phase === 'turnEnd') && <button type="button" className={view.phase === 'turnEnd' ? 'primary' : 'secondary'} disabled={busy} onClick={() => onCommand({ type: 'endTurn' })}>End turn</button>}</div>
  </div>;
}

/** Only pending decisions need instructions; routine play stays on the table. */
export function DecisionBar({ view, draft, busy, onCommand, onDraft, onUnavailable }: Props) {
  const drag = useTableDrag(), source = effectSource(view);
  if (view.phase === 'trap') return <section className="effect-panel trap-prompt" aria-label="Trap response"><strong>Respond to the attack</strong><span>Drag your trap onto your field to activate it.</span><button type="button" disabled={busy} onClick={() => onCommand({ type: 'respond', activate: false })}>Keep hidden</button></section>;
  if (!source) return null;
  const candidates = decisionCandidates(view, draft), total = Object.values(draft.allocations).reduce((a, b) => a + b, 0);
  const prompt = source.def === 'hamaya' ? 'Choose a highest-attack yokai to destroy.'
    : source.def === 'sake' ? `Use + soul on recipients · ${total}/${Math.min(3, view.supply)} allocated.`
    : source.def === 'jufu' ? `Choose up to two soul-equipped yokai · ${draft.targets.length}/2 chosen.`
    : source.def === 'ougi' ? draft.targets.length ? 'Choose a different yokai to receive the soul.' : 'Choose the soul donor, then its recipient. You can also drag donor onto recipient.'
    : source.def === 'boseki' ? 'Choose or drag a yokai from either graveyard onto your field.'
    : source.def === 'karakasa-kozo' ? 'Choose a set trap to destroy.' : 'Choose an opposing yokai to exchange.';
  const pick = (id: string) => { const result = resolveEffectTarget(view, draft, id); if (result.command) onCommand(result.command); else if (result.event) onDraft(result.event); else onUnavailable?.(result.reason ?? 'Choose a marked target.'); };
  const staged = source.def === 'sake' || source.def === 'jufu';
  return <section className="effect-panel" aria-label="Resolve card effect" aria-busy={busy}>
    <div className="effect-drag-card" {...drag.bind(source.id)} data-card-id={source.id} tabIndex={0} role="button" aria-label={`Drag ${source.definition.name} to resolve its effect`}><img src={publicAsset(`cards/${source.def}.png`)} alt="" draggable={false} /></div>
    <div className="effect-instructions"><strong>{source.definition.name}</strong><p>{prompt}</p>
      {!['sake', 'boseki'].includes(source.def) && <div className="effect-targets">{candidates.cards.map(card => <button type="button" key={card.id} disabled={busy} aria-pressed={draft.targets.includes(card.id)} onClick={() => pick(card.id)}>{source.def === 'hamaya' ? 'Destroy ' : ''}{card.definition.name} · {view.players[card.controller].name} · ATK {card.attack}</button>)}{candidates.hiddenTrapSeats.map(seat => <button type="button" key={seat} disabled={busy} onClick={() => pick(`trap:${seat}`)}>Destroy {view.players[seat].name}’s trap</button>)}</div>}
      <div className="effect-confirm">{staged && <button type="button" className="primary" {...drag.drop('resolve')} disabled={busy || !canConfirmEffect(view, draft)} onClick={() => onCommand(effectCommand(view, draft))}>Resolve {source.definition.name}</button>}{(total > 0 || draft.targets.length > 0) && <button type="button" className="text-button" onClick={() => onDraft({ type: 'clear' })}>Clear choices</button>}</div>
    </div>
  </section>;
}
