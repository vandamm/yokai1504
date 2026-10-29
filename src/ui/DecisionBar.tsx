import type { GameCommand, GameView, VisibleCard } from '../game/types';
import type { DraftEvent, TableDraft } from './interaction';
import { allVisible, effectSource } from './interaction';
import { useTableDrag } from './DragSurface';
import { publicAsset } from './assets';

export function DecisionBar({ view, draft, busy, onCommand, onDetails, onDraft }: {
  view: GameView; draft: TableDraft; busy: boolean; onDraft: (event: DraftEvent) => void;
  onCommand: (command: GameCommand) => void; onDetails: (card?: VisibleCard) => void; onUnavailable?: (reason: string) => void;
}) {
  const drag = useTableDrag();
  const selected = allVisible(view).find(card => card.id === draft.selectedId), source = effectSource(view);
  const remaining = 2 - view.actionsUsed, total = Object.values(draft.allocations).reduce((a, b) => a + b, 0);
  let title = selected?.definition.name ?? 'Drag a card to play', prompt = 'Drag a yokai onto your field. Drag yours onto a rival to attack.';
  if (view.phase === 'turnEnd') { title = 'Attack complete'; prompt = 'Review the result, then end your turn.'; }
  if (view.phase === 'trap') { title = 'Respond to the attack'; prompt = 'Drag your trap to Play spell, or keep it hidden.'; }
  if (source) {
    title = source.definition.name;
    prompt = source.def === 'sake' ? `Use + soul on recipients · ${total}/${Math.min(3, view.supply)} allocated. Drag Sake to Resolve.`
      : source.def === 'jufu' ? `Drag Jufu onto up to two yokai · ${draft.targets.length}/2 chosen. Then drag to Resolve.`
      : source.def === 'ougi' ? 'Drag a yokai with a soul onto a different yokai with room.'
      : source.def === 'boseki' ? 'Drag a yokai from either graveyard onto your field.'
      : 'Drag the resolving card onto a highlighted target.';
  } else if (view.phase === 'main' && selected?.zone === 'hand' && selected.definition.kind === 'spell') prompt = 'Drag to Play spell or your empty Trap slot.';
  return <section className={`decision-dock ${view.phase === 'effect' ? 'resolving' : ''}`} aria-label="Current decision" aria-busy={busy}>
    {source && <div className="effect-drag-card" {...drag.bind(source.id)} tabIndex={0} role="button" aria-label={`Drag ${source.definition.name} to resolve its effect`}><img src={publicAsset(`cards/${source.def}.png`)} alt="" draggable={false} /></div>}
    <div className="decision-copy"><div className="decision-heading"><strong>{title}</strong>{view.phase === 'main' && <span className={`action-budget ${remaining === 0 ? 'exhausted' : ''}`} role="status" aria-label={`${remaining} main ${remaining === 1 ? 'action' : 'actions'} left`} title="Playing cards and evoking souls use main actions. Free actions remain available."><strong>{remaining}</strong><span>{remaining === 1 ? 'action' : 'actions'} left</span><span className="action-pips" aria-hidden="true">{[0, 1].map(i => <i key={i} className={i < remaining ? '' : 'used'} />)}</span></span>}</div><span>{prompt}</span></div>
    <div className="decision-controls">
      {source && ['sake', 'jufu'].includes(source.def) && <div className="resolve-zone" {...drag.drop('resolve')} aria-label="Resolve effect drop zone">Resolve</div>}
      {source && (total > 0 || draft.targets.length > 0) && <button type="button" className="text-button" onClick={() => onDraft({ type: 'clear' })}>Clear</button>}
      {view.phase === 'trap' && <button type="button" disabled={busy} onClick={() => onCommand({ type: 'respond', activate: false })}>Keep hidden</button>}
      {(selected || source) && <button type="button" className="text-button" onClick={() => onDetails(selected ?? source)}>Details</button>}
      {(view.phase === 'main' || view.phase === 'turnEnd') && <button type="button" className={`end-turn ${view.phase === 'turnEnd' ? 'primary' : 'secondary'}`} disabled={busy} onClick={() => onCommand({ type: 'endTurn' })}>End turn</button>}
    </div>
  </section>;
}
