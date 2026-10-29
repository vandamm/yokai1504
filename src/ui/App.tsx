import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CARDS } from '../game/catalog';
import type { CardDefinition, GameCommand, PlayerId, VisibleCard } from '../game/types';
import { LocalSession } from '../session/local';
import type { SessionSnapshot } from '../session/local';
import { privacyAfterSnapshot } from './privacy';
import { createId } from '../session/id';
import { Table, CardFace } from './Table';
import { DecisionBar } from './DecisionBar';
import { allVisible, decisionCandidates, effectSource, emptyDraft, updateDraft } from './interaction';
import type { DraftEvent } from './interaction';
import { inspectionLabel } from './inspection';
import { publicAsset } from './assets';

const secureNumber = () => crypto.getRandomValues(new Uint32Array(1))[0];
const imagePath = (id: string) => publicAsset(`cards/${id}.png`);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'This action could not be completed. Please try again.';

function Modal({ title, children, onClose, wide = false, className = '' }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; const previous = document.activeElement; el?.showModal(); return () => { el?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }; }, []);
  return <dialog aria-label={title} className={`modal ${wide ? 'wide-modal' : ''} ${className}`} ref={dialog} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>{children}
  </dialog>;
}

function Rules({ onClose, onInspect }: { onClose: () => void; onInspect: (card: CardDefinition) => void }) {
  const [tab, setTab] = useState<'rules' | 'cards' | 'rulings'>('rules');
  return <Modal title="At the spirit table" onClose={onClose} wide>
    <div className="tabs" aria-label="Rules sections">{(['rules', 'cards', 'rulings'] as const).map(value => <button type="button" key={value} aria-pressed={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{value === 'rules' ? 'How to play' : value === 'cards' ? 'The fifteen cards' : 'App rulings'}</button>)}</div>
    {tab === 'rules' && <div className="rules-prose">
      <p className="lede">Two identical decks. Eleven shared souls. Reduce your rival’s 15 health to zero.</p>
      <ol>
        <li><strong>Begin your turn.</strong> Draw one card, including on the first turn. If your deck is empty, your opponent takes one damage for each missed draw.</li>
        <li><strong>Take up to two main actions.</strong> Play a yokai, cast a spell from your hand or set trap, or evoke one soul onto a yokai. Playing and evoking share the same two-action budget.</li>
        <li><strong>Prepare freely.</strong> Set one spell face down as your trap, or release a yokai’s soul to activate its release effect. These do not use a main action. Your field holds three yokai and one trap.</li>
        <li><strong>Attack once, or end your turn.</strong> Choose one attacker and an opposing yokai. If the opposing field is empty, attack the player directly. The first player cannot attack on the first turn. Declaring an attack ends your main phase.</li>
        <li><strong>Let the defender respond.</strong> The defender can activate their set trap or decline. Resolve its effect before battle. A set trap stays hidden until activated.</li>
      </ol>
      <h3>Souls & battle</h3><p>Each attached soul adds one attack, up to the card’s cap. Kappa gains another one attack per soul. Possession effects require at least one soul; passive effects are always active on the field. Release effects spend one attached soul.</p>
      <p>The weaker yokai is destroyed, and its controller takes the attack difference as damage. Ties destroy both without damage. A direct attack deals the attacker’s attack. Destroyed cards go to their original owner’s graveyard; all their souls return to the shared pool.</p>
      <h3>Sharing this screen</h3><p>Private play hides the table whenever the decision changes player. Pass the device before revealing. Open hands is a local testing mode that exposes both hands and traps. It still requires the correct player to make every decision.</p>
      <p>Undo restores the position before the last action, including automatic draws and damage. It cannot remove knowledge of cards you have seen. The match saves automatically in this browser.</p>
    </div>}
    {tab === 'cards' && <><p className="muted">One of each card belongs to each player’s deck. Select any card for readable text.</p><div className="reference-grid">{Object.values(CARDS).map(card => <button type="button" key={card.id} onClick={() => onInspect(card)}><img src={imagePath(card.id)} alt={card.name} loading="lazy" /><span>{card.name}</span></button>)}</div><p className="small muted">Card art and text from the designer’s official bilingual cards.</p></>}
    {tab === 'rulings' && <div className="rules-prose"><p>These timing interpretations are used by this app. They are provisional app rulings, not official clarifications.</p><ul>
      <li>If a trap removes the originally targeted defending yokai, the declared attack is spent and ends without damage. A direct attack is redirected to a yokai newly summoned by Boseki.</li>
      <li>Yuki-onna spends a soul to prevent battle destruction, including a tie. Battle damage from the original attack difference still applies.</li>
      <li>Tengu’s turn-start damage happens before the mandatory draw. Zero health ends the match immediately.</li>
      <li>Multi-target spell destruction resolves together. A Chochin-kozo effect established in battle still resolves if Chochin-kozo is destroyed.</li>
      <li>Chochin-kozo resolves after battle, before the next turn. There is no second main phase.</li>
      <li>Nurikabe’s summon-turn restriction applies while it remains on that controller’s field. A control exchange is not a summon.</li>
      <li>Rokurokubi draws only when the opposing yokai is actually destroyed in battle, including when fighting Yuki-onna. Its pre-battle possession effect also triggers in a tied battle that destroys both yokai.</li>
      <li>Boseki summons with zero souls. There is no general summoning sickness; Nurikabe’s restriction still applies.</li>
      <li>An exact-count effect requires legal targets before activation. An “up to” effect may choose zero.</li>
      <li>No voluntary passing or repeated position is treated as a stalemate. Empty decks continue causing damage.</li>
    </ul></div>}
  </Modal>;
}

function Setup({ onStart, busy, onRules }: { onStart: (names: [string, string], starter: PlayerId | undefined, openHands: boolean) => void; busy: boolean; onRules: () => void }) {
  const [names, setNames] = useState<[string, string]>(['', '']);
  const [starter, setStarter] = useState('random');
  const [openHands, setOpenHands] = useState(false);
  return <main className="welcome"><section className="setup-panel">
    <h1>Yokai 1504</h1><p>Two players, one table. Reduce your rival’s 15 health to zero.</p>
    <form onSubmit={event => { event.preventDefault(); onStart([names[0].trim() || 'Player 1', names[1].trim() || 'Player 2'], starter === 'random' ? undefined : Number(starter) as PlayerId, openHands); }}>
      <div className="name-fields">{([0, 1] as const).map(id => <label key={id}>Player {id + 1}<input value={names[id]} maxLength={24} placeholder={`Player ${id + 1}`} autoComplete="off" onChange={event => setNames(old => id === 0 ? [event.target.value, old[1]] : [old[0], event.target.value])} /></label>)}</div>
      <label className="starter-label">First turn<select value={starter} onChange={event => setStarter(event.target.value)}><option value="random">Choose at random</option><option value="0">{names[0].trim() || 'Player 1'}</option><option value="1">{names[1].trim() || 'Player 2'}</option></select></label>
      <label className="check-label"><input type="checkbox" checked={openHands} onChange={event => setOpenHands(event.target.checked)} /><span>Open hands <small>Show both hands and traps for testing</small></span></label>
      <button type="submit" className="primary start-button" disabled={busy}>{busy ? 'Preparing…' : 'Start game'}</button>
    </form><button type="button" className="text-button" onClick={onRules}>Rules & cards</button><p className="setup-note">Private hotseat by default. Auto-saved in this browser.</p>
  </section></main>;
}

function useDetailsRail() {
  const query = '(min-width: 1280px) and (min-height: 650px)';
  const [enabled, setEnabled] = useState(() => window.matchMedia(query).matches);
  useEffect(() => { const media = window.matchMedia(query); const change = () => setEnabled(media.matches); change(); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  return enabled;
}

function Inspector({ definition, card, onClose }: { definition: CardDefinition; card?: VisibleCard; onClose?: () => void }) {
  return <div className="inspector"><div className="inspector-heading"><div><span className="card-type">{definition.kind === 'yokai' ? `${definition.effectType} yokai` : 'Spell · can be set as a trap'}</span><h2>{definition.name}</h2><p lang="ja">{definition.japanese}</p></div>{onClose && <button type="button" className="icon-button" aria-label="Close card inspector" onClick={onClose}>×</button>}</div><img className="inspector-image" src={imagePath(definition.id)} alt={`${definition.name} official card illustration`} /><div className="inspector-rule">{definition.kind === 'yokai' && <div className="inspector-stats"><span><strong>{card?.attack ?? definition.atk}</strong> {card ? 'attack now' : 'base attack'}</span><span><strong>{card?.souls ?? 0}/{definition.cap}</strong> souls</span></div>}<p>{definition.text}</p>{definition.effectType === 'possession' && <p className="small muted">Active while this yokai has at least one soul.</p>}{definition.effectType === 'release' && <p className="small muted">Spend one attached soul during your main phase.</p>}{definition.id === 'kappa' && <p className="small muted">Total attack: 2 + twice its souls.</p>}</div></div>;
}

export function App() {
  const [session] = useState(() => new LocalSession({ getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }, createId));
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const snapshotRef = useRef<SessionSnapshot | null>(null);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [curtain, setCurtain] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const [rules, setRules] = useState(false);
  const [reference, setReference] = useState<CardDefinition | null>(null);
  const [graveyard, setGraveyard] = useState<PlayerId | null>(null);
  const [restart, setRestart] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inspectionId, setInspectionId] = useState<string>();
  const rail = useDetailsRail();
  const clearPrivateUI = () => { setDraft(emptyDraft()); setInspectionId(undefined); setDetailsOpen(false); setReference(null); setGraveyard(null); setMenu(false); setHistory(false); setRules(false); setNotice(null); };
  const adopt = (next: SessionSnapshot, forcePrivacy = false) => {
    const previous = snapshotRef.current;
    clearPrivateUI();
    setCurtain(wasHidden => privacyAfterSnapshot({ wasHidden, openHands: next.openHands, previousActor: previous?.view.decisionPlayer, nextActor: next.view.decisionPlayer, forcePrivacy }));
    snapshotRef.current = next;
    setSnapshot(next);
  };
  useEffect(() => { let live = true; session.load().then(saved => { if (live && saved) adopt(saved, true); }).catch(reason => { if (live) setError(errorMessage(reason)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [session]);
  const perform = async (work: () => Promise<SessionSnapshot>, forcePrivacy = false) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setNotice(null);
    try { adopt(await work(), forcePrivacy); } catch (reason) { setError(errorMessage(reason)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const start = (names: [string, string], startingPlayer: PlayerId | undefined, openHands: boolean) => void perform(() => session.start({ seed: secureNumber(), names, startingPlayer, openHands }), true);
  const submit = (command: GameCommand) => { const before = snapshotRef.current; if (!before || curtain) return; void perform(() => session.submit({ matchId: before.matchId, commandId: createId(), expectedRevision: before.revision, actor: before.view.decisionPlayer, command })); };
  const undo = () => { const before = snapshotRef.current; if (before) void perform(() => session.undo(before.revision)); };
  const toggleOpenHands = (value: boolean) => { if (!value) { clearPrivateUI(); setCurtain(true); } void perform(() => session.setOpenHands(value), !value); };
  const hide = () => { clearPrivateUI(); setCurtain(true); };
  const onDraft = (event: DraftEvent) => { if (!busyRef.current) { setDraft(old => updateDraft(old, event)); setNotice(null); setError(null); } };
  const view = snapshot?.view;
  const cards = view ? allVisible(view) : [];
  const source = view ? effectSource(view) : undefined;
  const selected = cards.find(card => card.id === draft.selectedId);
  const inspected = cards.find(card => card.id === inspectionId) ?? selected ?? source;
  const candidates = view ? decisionCandidates(view, draft) : { cards: [], hiddenTrapSeats: [], minimum: 0, maximum: 1 };
  const onDetails = (card?: VisibleCard) => { setInspectionId(card?.id ?? inspected?.id ?? cards[0]?.id); setDetailsOpen(true); };
  const onCard = (card: VisibleCard) => {
    if (!view || busyRef.current) return;
    if (draft.attackSourceId) {
      if (candidates.cards.some(candidate => candidate.id === card.id)) submit({ type: 'attack', attacker: draft.attackSourceId, target: card.id });
      else setNotice('Choose a marked defending yokai, or cancel the attack. Use Details to inspect cards.');
    } else if (view.phase === 'effect') {
      if (!candidates.cards.some(candidate => candidate.id === card.id)) { setNotice('This card is not an eligible target. Use Details to inspect it.'); return; }
      onDraft(source?.def === 'sake' ? { type: 'selectAllocation', id: card.id } : { type: 'toggleTarget', id: card.id, maximum: candidates.maximum, ordered: source?.def === 'ougi' });
    } else { onDraft({ type: 'select', id: card.id }); setInspectionId(card.id); }
  };
  const onTrap = (seat: PlayerId) => {
    if (!view || busyRef.current) return;
    const trap = view.players[seat].trap;
    if (view.phase === 'effect' && source?.def === 'karakasa-kozo' && trap) onDraft({ type: 'toggleTarget', id: 'hidden' in trap ? `trap:${seat}` : trap.id, maximum: 1 });
    else { const trap = view.players[seat].trap; if (trap && !('hidden' in trap)) onCard(trap); else setNotice('This trap is face down.'); }
  };
  const detailsContent = view && <>
    <label className="inspect-picker">Inspect card<select aria-label="Inspect card" value={inspected?.id ?? ''} onChange={event => setInspectionId(event.target.value)}><option value="" disabled>Choose a visible card</option>{cards.map(card => <option key={card.id} value={card.id}>{inspectionLabel(view, card)}</option>)}</select></label>
    {inspected ? <Inspector definition={inspected.definition} card={inspected} /> : <p className="muted">Select a card to read its effect.</p>}
  </>;
  const errorBanner = error && <div className="error-banner" role="alert"><p>{error}</p><button type="button" className="icon-button" aria-label="Dismiss error" onClick={() => setError(null)}>×</button></div>;
  return <div className={`app-shell ${view ? 'in-match' : ''}`}>
    <header className="app-header"><a className="wordmark" href="#" onClick={event => event.preventDefault()} aria-label="Yokai 1504">Yokai <small>1504</small></a>
      {view && <span className="toolbar-supply" aria-label={`Supply: ${view.supply} souls`}><span>Supply</span><strong>{view.supply}</strong><img src={publicAsset('icons/soul.svg')} alt="" /></span>}
      <div className="header-tools">{snapshot && <button type="button" className="header-button" disabled={busy || !snapshot.canUndo} onClick={undo}>↶ Undo</button>}<button type="button" className="header-button" onClick={() => snapshot ? setMenu(true) : setRules(true)}>{snapshot ? 'Menu' : 'Rules'}</button></div>
    </header>
    {errorBanner}
    {loading ? <main className="loading-screen"><p>Setting the table…</p></main> : !view || !snapshot ? <Setup onStart={start} busy={busy} onRules={() => setRules(true)} /> : curtain ? <main className="privacy-screen">
      <p>{view.phase === 'trap' ? 'An attack needs your response.' : view.phase === 'effect' ? 'Resolve a card effect.' : view.result ? 'The match has ended.' : `Turn ${view.turn}`}</p><h1>Pass to {view.players[view.decisionPlayer].name}</h1><p>Reveal when you have the device.</p>
      <button type="button" className="primary reveal-button" onClick={() => setCurtain(false)}>Reveal for {view.players[view.decisionPlayer].name}</button>
      <div className="curtain-public">{view.players.map(player => <span key={player.id}>{player.name} <strong>{player.health} ♥</strong></span>)}</div>
    </main> : <>
      <div className="match-status"><span>Turn {view.turn} · {view.players[view.turnPlayer].name}</span><strong>{view.result ? 'Match complete' : view.phase === 'trap' ? 'Trap response' : view.phase === 'effect' ? 'Resolve effect' : `${2 - view.actionsUsed} ${view.actionsUsed === 1 ? 'action' : 'actions'} left`}</strong>{snapshot.openHands && <span className="mode-label">Open hands</span>}</div>
      <main className="game-workspace"><div className="table-play">
        {source?.def === 'boseki' && <section className="target-tray" aria-label="Boseki graveyard targets">{view.players.map(player => <div key={player.id}><strong>{player.name}’s graveyard</strong><div className="target-tray-cards">{candidates.cards.filter(card => card.controller === player.id).map(card => <button type="button" key={card.id} aria-label={`Summon ${card.definition.name} from ${player.name}’s graveyard`} aria-pressed={draft.targets.includes(card.id)} onClick={() => onCard(card)}><CardFace card={card} /><span>{card.definition.name}</span></button>)}{!candidates.cards.some(card => card.controller === player.id) && <small>No eligible yokai</small>}</div></div>)}</section>}
        <Table view={view} openHands={snapshot.openHands} selectedId={draft.attackSourceId ?? draft.allocationCardId ?? draft.selectedId} targetIds={candidates.cards.map(card => card.id)} targetTrapSeats={candidates.hiddenTrapSeats} chosenTargets={draft.targets} allocations={draft.allocations} onCard={onCard} onTrap={onTrap} onGraveyard={setGraveyard} />
        {notice && <div className="action-notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss explanation" onClick={() => setNotice(null)}>×</button></div>}
        {view.result ? <div className="decision-bar result-panel"><strong>{view.result.winner === null ? 'A draw' : `${view.players[view.result.winner].name} wins`}</strong><span>{view.result.reason}</span><button type="button" className="primary" onClick={() => setRestart(true)}>Play again</button><button type="button" className="secondary" onClick={() => setHistory(true)}>History</button></div> : <DecisionBar view={view} draft={draft} busy={busy} onDraft={onDraft} onCommand={submit} onDetails={onDetails} onUnavailable={setNotice} />}
      </div>
      {rail && <aside className="details-rail" aria-label="Card details and public history"><section className="rail-inspector">{detailsContent}</section><section className="rail-history"><h2>Public history</h2><ol>{view.history.map((entry, index) => <li key={index}>{entry}</li>)}</ol></section></aside>}
      </main>
    </>}
    {menu && snapshot && <Modal title="Table menu" onClose={() => setMenu(false)}><div className="phone-menu-actions">
      <button type="button" className="secondary" onClick={() => { setMenu(false); setRules(true); }}>Rules & cards</button><button type="button" className="secondary" onClick={() => { setMenu(false); setHistory(true); }} disabled={curtain}>Public history</button>
      <button type="button" className="secondary" disabled={curtain || snapshot.openHands} onClick={hide}>Hide table</button>
      <label className="check-label"><input type="checkbox" checked={snapshot.openHands} onChange={event => toggleOpenHands(event.target.checked)} disabled={busy} /><span>Open hands<small>Show both hands and traps</small></span></label>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setMenu(false); setRestart(true); }}>New game</button></div></Modal>}
    {history && view && !curtain && <Modal title="Public history" onClose={() => setHistory(false)}><ol className="phone-history-list">{view.history.map((entry, index) => <li key={index}>{entry}</li>)}</ol></Modal>}
    {detailsOpen && !rail && view && !curtain && <Modal title="Card details" className="details-drawer" onClose={() => setDetailsOpen(false)}>{detailsContent}</Modal>}
    {rules && <Rules onClose={() => setRules(false)} onInspect={setReference} />}
    {reference && <Modal title={reference.name} onClose={() => setReference(null)}><Inspector definition={reference} /></Modal>}
    {graveyard !== null && view && !curtain && <Modal title={`${view.players[graveyard].name}’s graveyard`} onClose={() => setGraveyard(null)}><div className="graveyard-grid">{view.players[graveyard].graveyard.length ? view.players[graveyard].graveyard.map(card => <button type="button" className="graveyard-card" key={card.id} onClick={() => { setGraveyard(null); onDetails(card); }}><CardFace card={card} /><span>{card.definition.name}</span></button>) : <p>No cards here yet.</p>}</div></Modal>}
    {restart && <Modal title="Start a new game?" onClose={() => setRestart(false)}><p>Starting the next game replaces this match and its undo history.</p><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setRestart(false)}>Keep playing</button><button type="button" className="primary" disabled={busy} onClick={() => { clearPrivateUI(); setRestart(false); snapshotRef.current = null; setSnapshot(null); setCurtain(false); setError(null); }}>Set up new game</button></div></Modal>}
  </div>;
}
