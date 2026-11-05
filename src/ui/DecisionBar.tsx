import type { GameCommand, GameView, PlayerId, VisibleCard } from '../game/types';
import type { DraftEvent, TableDraft } from './interaction';
import { canConfirmEffect, effectCommand, effectSource } from './interaction';
import { useTableDrag } from './DragSurface';
import { publicAsset } from './assets';

interface Props {
  view: GameView; draft: TableDraft; busy: boolean; onDraft: (event: DraftEvent) => void;
  onCommand: (command: GameCommand) => void; onDetails: (card?: VisibleCard) => void; onUnavailable?: (reason: string) => void;
  onCancel?: () => void;
}
export function ActionBudget({ view, viewer }: { view: GameView; viewer?: PlayerId }) {
  const mainPhase = view.phase === 'main' || view.phase === 'effect' && view.decisionPlayer === view.turnPlayer && view.pending?.kind === 'effect' && view.pending.attack === null;
  if (view.result || !mainPhase || viewer !== undefined && viewer !== view.decisionPlayer) return null;
  const remaining = 2 - view.actionsUsed;
  return <span className={`action-budget ${remaining === 0 ? 'exhausted' : ''}`} role="status" aria-label={`${remaining} main ${remaining === 1 ? 'action' : 'actions'} left`}><span className="action-pips" aria-hidden="true">{[0, 1].map(i => <i key={i} className={i < remaining ? '' : 'used'} />)}</span></span>;
}

export function TurnControls({ view, viewer, busy, onCommand, onUndo, canUndo = false }: Omit<Props, 'onDraft'> & { viewer?: PlayerId; showInspect?: boolean; onUndo?: () => void; canUndo?: boolean }) {
  const ownDecision = viewer === undefined || viewer === view.decisionPlayer;
  const canEnd = ownDecision && !view.result && (view.phase === 'main' || view.phase === 'turnEnd');
  const ready = canEnd && (view.actionsUsed === 2 || view.phase === 'turnEnd');
  return <div className="turn-controls" aria-label="Turn controls"><div className="turn-buttons">
    {onUndo && <button type="button" className="undo-button" aria-label="Undo" title="Undo" disabled={busy || !canUndo} onClick={onUndo}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 5-5 5 5 5M4 10h9a6 6 0 0 1 0 12" /></svg></button>}
    <button type="button" className={`end-turn${ready ? ' ready' : ''}`} disabled={busy || !canEnd} onClick={() => onCommand({ type: 'endTurn' })}>End turn</button>
  </div></div>;
}

/** Only pending decisions need instructions; routine play stays on the table. */
export function DecisionBar({ view, draft, busy, onCommand, onDraft, onCancel }: Props) {
  const drag = useTableDrag(), source = effectSource(view);
  if (view.phase === 'trap') return <section className="effect-panel trap-prompt" aria-label="Trap response"><strong>Do you want to activate the trap?</strong><div className="trap-options"><button type="button" className="primary" disabled={busy} onClick={() => onCommand({ type: 'respond', activate: true })}>Activate trap</button><button type="button" disabled={busy} onClick={() => onCommand({ type: 'respond', activate: false })}>Keep hidden</button></div></section>;
  if (!source) return null;
  const total = Object.values(draft.allocations).reduce((a, b) => a + b, 0);
  const prompt = source.def === 'hamaya' ? 'Choose a highest-attack yokai to destroy.'
    : source.def === 'sake' ? `Use + soul on recipients · ${total}/${Math.min(3, view.supply)} allocated.`
    : source.def === 'jufu' ? `Choose up to two soul-equipped yokai · ${draft.targets.length}/2 chosen.`
    : source.def === 'ougi' ? draft.targets.length ? 'Select the yokai to receive the soul on the field.' : 'Select the soul donor on the field.'
    : source.def === 'boseki' ? 'Choose a yokai from either graveyard, or drag one of your own onto your field.'
    : source.def === 'karakasa-kozo' ? 'Choose a set trap to destroy.' : 'Choose an opposing yokai to exchange.';
  const staged = source.def === 'sake' || source.def === 'jufu';
  return <section className="effect-panel" aria-label="Resolve card effect" aria-busy={busy}>
    <div className="effect-drag-card" {...(source.def === 'ougi' ? {} : drag.bind(source.id))} data-card-id={source.id} {...(source.def === 'ougi' ? {} : { tabIndex: 0, role: 'button', 'aria-label': `Drag ${source.definition.name} to resolve its effect` })}><img src={publicAsset(`cards/${source.def}.png`)} alt="" draggable={false} /></div>
    <div className="effect-instructions"><strong>{source.definition.name}</strong><p role="status">{prompt}</p>

      <div className="effect-confirm">{staged && <button type="button" className="primary" {...drag.drop('resolve')} disabled={busy || !canConfirmEffect(view, draft)} onClick={() => onCommand(effectCommand(view, draft))}>Resolve {source.definition.name}</button>}{(total > 0 || draft.targets.length > 0) && <button type="button" className="text-button" onClick={() => onDraft({ type: 'clear' })}>Clear choices</button>}{view.pending?.kind === 'effect' && view.pending.source === 'cast' && onCancel && <button type="button" className="text-button" disabled={busy} onClick={onCancel}>Cancel spell</button>}</div>
    </div>
  </section>;
}
