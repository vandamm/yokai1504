import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createGame } from '../../../src/game/engine';
import { viewForPlayer } from '../../../src/game/views';
import { CARDS } from '../../../src/game/catalog';
import type { CardDefId, GameView, PlayerId, VisibleCard } from '../../../src/game/types';
import { Table } from '../../../src/ui/Table';
import { publicAsset } from '../../../src/ui/assets';
import '../../../src/ui/table.css';
import './board.css';

type Scene = 'main' | 'trap' | 'ougi' | 'notice' | 'connection';
type Option = 'a' | 'b' | 'c';
interface Comment { id: string; option: Option; actor: string; scene: Scene; target: string; region: string; x: number; y: number; }
interface Preview { option: Option; actor: 'mine' | 'opponent'; scene: Scene; tooltip: boolean; commentMode: boolean; comments: Comment[]; selectedComment?: string; }
const initial: Preview = { option: 'a', actor: 'mine', scene: 'main', tooltip: false, commentMode: false, comments: [] };
const send = (message: object) => parent.postMessage(message, location.origin);
const game = createGame({ seed: 42, names: ['Alex', 'Poli'], startingPlayer: 0 });
game.turn = 3;
function move(def: CardDefId, owner: PlayerId, zone: 'hand' | 'field' | 'trap', souls = 0) {
  const card = Object.values(game.cards).find(card => card.owner === owner && card.def === def)!;
  for (const player of game.players) for (const key of ['deck', 'hand', 'field', 'graveyard'] as const) player[key] = player[key].filter(id => id !== card.id);
  if (zone === 'trap') game.players[owner].trap = card.id; else game.players[owner][zone].push(card.id);
  card.souls = souls; game.supply -= souls;
}
move('yuki-onna', 0, 'field', 1); move('nekomata', 0, 'field');
move('kappa', 1, 'field', 1); move('tengu', 1, 'field');
move('ougi', 0, 'trap'); move('hamaya', 1, 'trap');
for (const def of ['sake', 'kozuchi', 'jufu', 'zashiki-warashi', 'boseki'] as const) move(def, 0, 'hand');
const base = viewForPlayer(game, 0);
function position(preview: Preview): GameView {
  const view = structuredClone(base), actor = preview.actor === 'mine' ? 0 : 1;
  view.decisionPlayer = actor; view.turnPlayer = actor;
  if (preview.scene === 'trap') {
    view.phase = 'trap'; view.turnPlayer = actor === 0 ? 1 : 0;
    view.pending = { kind: 'trap', actor, attacker: view.players[view.turnPlayer].field[0].id, target: view.players[actor].field[0].id };
  }
  if (preview.scene === 'ougi') {
    view.phase = 'effect'; view.turnPlayer = actor === 0 ? 1 : 0;
    const source: VisibleCard = { id: 'preview-ougi', def: 'ougi', definition: CARDS.ougi, controller: actor, owner: actor, zone: 'graveyard', attack: 0, souls: 0, summonedTurn: 0 };
    view.players[actor].trap = null; view.players[actor].graveyard.push(source);
    view.pending = { kind: 'effect', actor, cardId: source.id, source: 'trap', attack: { attacker: view.players[view.turnPlayer].field[0].id, target: view.players[actor].field[0].id } };
  }
  return view;
}
function targetElement(target: string): Element | null {
  if (target.startsWith('card:')) return document.querySelector(`[data-card-id="${CSS.escape(target.slice(5))}"]`);
  const selectors: Record<string, string> = { outline: '.turn-frame', prompts: '.prototype-controls', toolbar: '.app-header', divider: '.table-divider', history: '.prototype-history', 'hand:0': '.bottom-hand .hand-window', 'hand:1': '.top-hand .hand-window', 'summary:0': '.bottom-hand .seat-summary', 'summary:1': '.top-hand .seat-summary', 'field:0': '.lower-seat', 'field:1': '.upper-seat', 'tooltip-art': '.tooltip-art', 'tooltip-text': '.tooltip-copy' };
  return selectors[target] ? document.querySelector(selectors[target]) : null;
}
function App() {
  const [preview, setPreview] = useState(initial), [donor, setDonor] = useState<string>();
  const [inspected, setInspected] = useState<VisibleCard>(), [hovered, setHovered] = useState<VisibleCard>();
  const [shift, setShift] = useState(false), [frame, setFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [pins, setPins] = useState<{ comment: Comment; x: number; y: number; number: number }[]>([]);
  const root = useRef<HTMLDivElement>(null), view = position(preview), mine = preview.actor === 'mine';
  const all = view.players.flatMap(player => [...player.field, ...(player.hand ?? []), ...player.graveyard]);
  const shown = preview.tooltip ? view.players[0].field[0] : inspected ?? (shift ? hovered : undefined);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'review:state') return;
      setPreview(event.data);
    };
    const down = (event: KeyboardEvent) => { if (event.key === 'Shift') setShift(true); if (event.key === 'Escape') { setInspected(undefined); send({ type: 'review:tooltip', show: false }); } };
    const up = (event: KeyboardEvent) => { if (event.key === 'Shift') setShift(false); };
    window.addEventListener('message', receive); window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    send({ type: 'review:ready' });
    return () => { window.removeEventListener('message', receive); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
  useEffect(() => { setDonor(undefined); setInspected(undefined); }, [preview.actor, preview.scene]);
  useLayoutEffect(() => {
    const measure = () => {
      const table = document.querySelector('.table-surface')?.getBoundingClientRect(), divider = document.querySelector('.table-divider')?.getBoundingClientRect();
      if (!table || !divider) return;
      const middle = divider.top + divider.height / 2;
      setFrame({ x: table.left + 3, y: mine ? middle + 2 : table.top + 3, width: table.width - 6, height: mine ? table.bottom - middle - 5 : middle - table.top - 5 });
      setPins(preview.comments.map((comment, index) => ({ comment, number: index + 1 })).filter(({ comment }) => comment.option === preview.option && comment.actor === preview.actor && comment.scene === preview.scene).flatMap(({ comment, number }) => {
        const el = targetElement(comment.target); if (!el) return [];
        const rect = el.getBoundingClientRect(); return [{ comment, number, x: rect.left + rect.width * comment.x, y: rect.top + rect.height * comment.y }];
      }));
    };
    const observer = new ResizeObserver(measure); if (root.current) observer.observe(root.current);
    measure(); window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [preview, mine, donor, shown?.id]);
  function inspect(card: VisibleCard) {
    if (preview.scene === 'ougi' && mine && card.zone === 'field') { setDonor(old => old === card.id ? undefined : old ? undefined : card.id); return; }
    setInspected(card);
  }
  function commentAt(event: React.MouseEvent<HTMLDivElement>) {
    if (!preview.commentMode) return;
    const el = event.target as Element;
    if (el.closest('.comment-pin')) return;
    event.preventDefault(); event.stopPropagation();
    let target = '', region = '';
    if (el.closest('.tooltip-art')) { target = 'tooltip-art'; region = 'Tooltip · card image'; }
    else if (el.closest('.tooltip-copy')) { target = 'tooltip-text'; region = 'Tooltip · rules text'; }
    else if (el.closest('.prototype-controls')) { target = 'prompts'; region = 'Prompts and actions'; }
    else if (el.closest('.prototype-history')) { target = 'history'; region = 'History sidebar'; }
    else if (el.closest('.app-header')) { target = 'toolbar'; region = 'Top toolbar'; }
    else if (el.closest('.table-divider')) { target = 'divider'; region = 'Middle divider'; }
    else if (el.closest('[data-card-id]')) { const card = el.closest<HTMLElement>('[data-card-id]')!; target = `card:${card.dataset.cardId}`; region = 'Card on the table'; }
    else if (el.closest('.seat-summary')) { const near = !!el.closest('.bottom-hand'); target = `summary:${near ? 0 : 1}`; region = near ? 'Your health and controls' : 'Opponent health'; }
    else if (el.closest('.hand-window')) { const near = !!el.closest('.bottom-hand'); target = `hand:${near ? 0 : 1}`; region = near ? 'Your hand' : 'Opponent hand'; }
    else if (el.closest('.table-seat')) { const near = !!el.closest('.lower-seat'); target = `field:${near ? 0 : 1}`; region = near ? 'Your field' : 'Opponent field'; }
    else { target = 'outline'; region = 'Active-side outline'; }
    const edge = Math.min(Math.abs(event.clientX - frame.x), Math.abs(event.clientX - frame.x - frame.width), Math.abs(event.clientY - frame.y), Math.abs(event.clientY - frame.y - frame.height));
    if (!el.closest('.prototype-tooltip') && event.clientX >= frame.x - 5 && event.clientX <= frame.x + frame.width + 5 && event.clientY >= frame.y - 5 && event.clientY <= frame.y + frame.height + 5 && edge < 9) { target = 'outline'; region = 'Active-side outline'; }
    const rect = targetElement(target)?.getBoundingClientRect(); if (!rect) return;
    send({ type: 'review:target', target, region, x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) });
  }
  const prompt = preview.scene === 'trap' ? mine ? 'Activate the trap?' : 'Poli is choosing a trap response.'
    : preview.scene === 'ougi' ? mine ? donor ? 'Ougi · select a recipient.' : 'Ougi · select a donor.' : 'Poli is resolving Ougi.'
    : preview.scene === 'notice' ? 'That yokai is at its soul capacity.'
    : preview.scene === 'connection' ? 'Connection lost. Retry to continue.'
    : mine ? '2 actions left' : 'Waiting for Poli’s move.';
  const controls = <div className={`prototype-controls ${preview.scene}`} aria-label="Fixed decision area"><div className="decision-copy" role="status">{prompt}</div><div className="decision-buttons">
    <button type="button" className="undo-button" aria-label="Undo" onClick={() => setDonor(undefined)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 4-5 5 5 5M4 9h9a7 7 0 0 1 0 14" transform="translate(0 -2)" /></svg></button>
    {preview.scene === 'trap' && mine ? <><button type="button" className="prototype-primary" aria-label="Activate trap" onClick={() => send({ type: 'review:scene', scene: 'ougi' })}>Yes</button><button type="button" aria-label="Keep hidden" onClick={() => send({ type: 'review:scene', scene: 'main' })}>No</button></>
      : preview.scene === 'connection' ? <button type="button" className="prototype-primary" onClick={() => send({ type: 'review:scene', scene: 'main' })}>Retry</button>
      : preview.scene === 'ougi' && mine ? <button type="button" onClick={() => setDonor(undefined)}>Clear</button>
      : mine && ['main', 'notice'].includes(preview.scene) ? <button type="button" className="prototype-primary" onClick={() => send({ type: 'review:actor', actor: 'opponent' })}>End turn</button> : null}
  </div></div>;
  return <div ref={root} className={`app-shell in-match prototype option-${preview.option} ${mine ? 'acting-mine' : 'acting-opponent'} ${preview.commentMode ? 'comment-mode' : ''}`} onClickCapture={commentAt} onPointerMove={event => { const id = (event.target as Element).closest<HTMLElement>('[data-card-id]')?.dataset.cardId; setHovered(all.find(card => card.id === id)); }}>
    <header className="app-header"><a className="wordmark" href="#" onClick={event => event.preventDefault()}>Yokai <small>1504</small></a><span className="toolbar-supply"><span>Supply</span><strong>{view.supply}</strong><img src={publicAsset('icons/soul.svg')} alt="" /></span><div className="header-tools"><button type="button" className="header-button" onClick={() => send({ type: 'review:scene', scene: 'main' })}>Menu</button></div></header>
    <main className="game-workspace"><div className="drag-surface"><div className="table-play"><Table view={view} viewer={0} openHands={false} targetIds={preview.scene === 'ougi' && mine ? all.filter(card => card.zone === 'field' && (donor ? card.id !== donor && card.souls < card.definition.cap : card.souls > 0)).map(card => card.id) : []} chosenTargets={donor ? [donor] : []} allocations={{}} selectedId={donor} onCard={inspect} onTrap={() => {}} onGraveyard={() => {}} turnControls={controls} /></div></div>
      <aside className="details-rail prototype-history"><div className="history-status"><strong>{view.turnPlayer === 0 ? 'Your turn' : 'Poli’s turn'}</strong><span>Turn 2</span></div><h2>Public history</h2><section><h3>Turn 2: Alex</h3><p>Alex draws a card.</p><p>Alex summons <button type="button" className="history-card-link" onClick={() => setInspected(view.players[0].field[0])}>Yuki-onna</button>.</p><p>Alex evokes a soul onto Yuki-onna.</p></section><section><h3>Turn 2: Poli</h3><p>Poli draws a card.</p><p>Poli summons <button type="button" className="history-card-link" onClick={() => setInspected(view.players[1].field[0])}>Kappa</button>.</p><p>Poli sets a spell trap.</p></section><p className="history-hint">Shift + hover a card to inspect.</p></aside>
    </main>
    <div className="turn-frame" aria-hidden="true" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}><i /><i /><i /><i /></div>
    {shown && <div className="prototype-tooltip" role="tooltip" aria-label={`${shown.definition.name} details`}><div className="tooltip-art"><img src={publicAsset(`cards/${shown.def}.png`)} alt={`${shown.definition.name} card`} /></div><div className="tooltip-copy"><button type="button" className="tooltip-close" aria-label="Close card details" onClick={() => { setInspected(undefined); send({ type: 'review:tooltip', show: false }); }}>×</button><span className="tooltip-type">{shown.definition.kind === 'yokai' ? `${shown.definition.effectType} yokai` : 'Spell · can be set as a trap'}</span><h2>{shown.definition.name}</h2><p className="japanese" lang="ja">{shown.definition.japanese}</p><p className="card-rule">{shown.definition.text}</p>{shown.definition.effectType === 'possession' && <p className="rule-note">Possession is active while this yokai has a soul.</p>}{shown.definition.effectType === 'passive' && <p className="rule-note">This passive effect is always active.</p>}</div></div>}
    {preview.commentMode && <><div className="comment-instruction">Click a part to comment</div>{pins.map(pin => <button type="button" key={pin.comment.id} className={`comment-pin ${preview.selectedComment === pin.comment.id ? 'focused' : ''}`} style={{ left: pin.x, top: pin.y }} aria-label={`Read comment ${pin.number} on ${pin.comment.region}`} onClick={() => send({ type: 'review:comment', id: pin.comment.id })}>{pin.number}</button>)}</>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App />);
