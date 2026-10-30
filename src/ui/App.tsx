import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CARDS } from '../game/catalog';
import type { CardDefId, CardDefinition, GameCommand, GameView, PlayerId, VisibleCard } from '../game/types';
import { LocalSession, SAVE_KEY } from '../session/local';
import { OnlineSession, inviteLink, roomLocation } from '../session/online';
import type { OnlineCommand, OnlineSnapshot } from '../online/protocol';
import { DragSurface } from './DragSurface';
import { useTableDrag } from './DragSurface';
import { resolveDrop, resolveEffectTarget } from './drag';
import { transitionEvents } from './presentation';
import { Playback, captureGeometry } from './Playback';
import type { Geometry } from './Playback';
import type { SessionSnapshot } from '../session/local';
import { createId } from '../session/id';
import { Table, CardFace } from './Table';
import { DecisionBar, TurnControls } from './DecisionBar';
import { allVisible, allocationLimit, decisionCandidates, effectSource, emptyDraft, updateDraft } from './interaction';
import type { DraftEvent } from './interaction';
import { inspectionLabel, inspectionPosition } from './inspection';
import { publicAsset } from './assets';
import { PublicHistory } from './PublicHistory';

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
        <li><strong>Take up to two main actions.</strong> Play a yokai, cast a spell from your hand or set trap, or evoke one soul onto a yokai. Drag a yokai onto your field or a spell onto your field. Use + soul beside an eligible yokai to evoke. Playing and evoking share the same two-action budget.</li>
        <li><strong>Prepare freely.</strong> Drag a spell to your Trap slot to set it face down, or release a yokai’s soul to activate its release effect. These do not use a main action. Your field holds three yokai and one trap.</li>
        <li><strong>Attack once, or end your turn.</strong> Drag one of your yokai onto an opposing yokai. If the opposing field is empty, drag onto the player’s health. The first player cannot attack on the first turn. Declaring an attack ends your main phase. Battle results stay on the table until you press End turn.</li>
        <li><strong>Let the defender respond.</strong> The defender can drag their set trap onto their field or keep it hidden. Resolve its effect before battle. A set trap stays hidden until activated.</li>
      </ol>
      <h3>Souls & battle</h3><p>Each attached soul adds one attack, up to the card’s cap. Kappa gains another one attack per soul. Possession effects require at least one soul; passive effects are always active on the field. Release effects spend one attached soul.</p>
      <p>The weaker yokai is destroyed, and its controller takes the attack difference as damage. Ties destroy both without damage. A direct attack deals the attacker’s attack. Destroyed cards go to their original owner’s graveyard; all their souls return to the shared pool.</p>
      <h3>Local testing</h3><p>Play both sides on this device. Open hands shows both hands and traps; switching it off shows only the decision player’s hand. The table stays visible between decisions.</p>
      <p>Undo restores the position before the last action, including automatic draws and damage. It cannot remove knowledge of cards you have seen. The match saves automatically. Online Undo is immediate until the opponent takes an action, including after you end your turn.</p>
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

export function Setup({ onStart, onCreate, onJoin, entry, recent, busy, onRules }: { onStart: (names: [string, string], starter: PlayerId | undefined, openHands: boolean) => void; onCreate: (name: string) => void; onJoin: (room: string, invite: string, name: string) => void; entry: { room: string | null; invite: string | null }; recent: string[]; busy: boolean; onRules: () => void }) {
  const [names, setNames] = useState<[string, string]>(['', '']);
  const [name, setName] = useState('');
  const [joinLink, setJoinLink] = useState('');
  const [joinError, setJoinError] = useState<string>();
  const [starter, setStarter] = useState('random');
  const [openHands, setOpenHands] = useState(true);
  return <main className="welcome"><section className="setup-panel">
    <h1>Yokai 1504</h1><p>Two players, one table. Reduce your rival’s 15 health to zero.</p>
    <form className="online-setup" onSubmit={event => { event.preventDefault(); if (entry.room && entry.invite) onJoin(entry.room, entry.invite, name); else onCreate(name); }}>
      <label>Your name<input value={name} maxLength={24} placeholder="Your name" autoComplete="nickname" onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="primary start-button" disabled={busy}>{busy ? 'Preparing…' : entry.room && entry.invite ? 'Join invited table' : 'Create online table'}</button>
      <p className="small muted">Share an invitation. Return in this browser to keep your private seat.</p>
    </form>
    {entry.room && !entry.invite && <p className="small muted">No saved seat for this room is available here. Open its invitation to join, or return in the browser you used before.</p>}
    <details className="setup-disclosure"><summary>Join with an invitation</summary><form onSubmit={event => { event.preventDefault(); try { const location = roomLocation(joinLink.trim()); if (!location.room || !location.invite) throw new Error('Paste the complete invitation link.'); setJoinError(undefined); onJoin(location.room, location.invite, name); } catch { setJoinError('Paste the complete invitation link, including its invitation.'); } }}><label>Invitation link<input type="url" value={joinLink} onChange={event => setJoinLink(event.target.value)} required /></label>{joinError && <p role="alert">{joinError}</p>}<button type="submit" className="secondary" disabled={busy}>Join table</button></form></details>
    {recent.length > 0 && <details className="setup-disclosure"><summary>Recent online tables</summary><div className="recent-rooms">{recent.map(room => <a key={room} href={inviteLink(window.location.href, room)}>Reopen table {room.slice(-8)}</a>)}</div></details>}
    <details className="setup-disclosure"><summary>Local testing · both sides on this device</summary>
    <form onSubmit={event => { event.preventDefault(); onStart([names[0].trim() || 'Player 1', names[1].trim() || 'Player 2'], starter === 'random' ? undefined : Number(starter) as PlayerId, openHands); }}>
      <div className="name-fields">{([0, 1] as const).map(id => <label key={id}>Player {id + 1}<input value={names[id]} maxLength={24} placeholder={`Player ${id + 1}`} autoComplete="off" onChange={event => setNames(old => id === 0 ? [event.target.value, old[1]] : [old[0], event.target.value])} /></label>)}</div>
      <label className="starter-label">First turn<select value={starter} onChange={event => setStarter(event.target.value)}><option value="random">Choose at random</option><option value="0">{names[0].trim() || 'Player 1'}</option><option value="1">{names[1].trim() || 'Player 2'}</option></select></label>
      <label className="check-label"><input type="checkbox" checked={openHands} onChange={event => setOpenHands(event.target.checked)} /><span>Open hands <small>Show both hands and traps for testing</small></span></label>
      <button type="submit" className="secondary start-button" disabled={busy}>{busy ? 'Preparing…' : 'Start local game'}</button>
    </form><p className="setup-note">Local testing. Auto-saved in this browser.</p></details><button type="button" className="text-button" onClick={onRules}>Rules & cards</button>
  </section></main>;
}

function useMediaQuery(query: string) {
  const [enabled, setEnabled] = useState(() => window.matchMedia(query).matches);
  useEffect(() => { const media = window.matchMedia(query); const change = () => setEnabled(media.matches); change(); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  return enabled;
}

function Inspector({ definition, card, onClose }: { definition: CardDefinition; card?: VisibleCard; onClose?: () => void }) {
  return <div className="inspector"><div className="inspector-heading"><div><span className="card-type">{definition.kind === 'yokai' ? `${definition.effectType} yokai` : 'Spell · can be set as a trap'}</span><h2>{definition.name}</h2><p lang="ja">{definition.japanese}</p></div>{onClose && <button type="button" className="icon-button" aria-label="Close card inspector" onClick={onClose}>×</button>}</div><img className="inspector-image" src={imagePath(definition.id)} alt={`${definition.name} official card illustration`} /><div className="inspector-rule">{definition.kind === 'yokai' && <div className="inspector-stats"><span><strong>{card?.attack ?? definition.atk}</strong> {card ? 'attack now' : 'base attack'}</span><span><strong>{card?.souls ?? 0}/{definition.cap}</strong> souls</span></div>}<p>{definition.text}</p>{definition.effectType === 'possession' && <p className="small muted">Active while this yokai has at least one soul.</p>}{definition.effectType === 'release' && <p className="small muted">Spend one attached soul during your main phase.</p>}{definition.id === 'kappa' && <p className="small muted">Total attack: 2 + twice its souls.</p>}</div></div>;
}

function GraveyardTarget({ card, selected, onInspect }: { card: VisibleCard; selected: boolean; onInspect: () => void }) {
  const drag = useTableDrag(), bindings = drag.bind(card.id);
  return <button type="button" {...bindings} data-card-id={card.id} aria-label={`${bindings['data-drag'] ? 'Drag' : 'Choose'} ${card.definition.name} from the graveyard`} aria-pressed={selected} onClick={onInspect}><CardFace card={card} /><span>{card.definition.name}</span></button>;
}

function TurnSummary({ view, openHands }: { view: GameView; openHands: boolean }) {
  return <div className="turn-summary"><span>Turn {Math.ceil(view.turn / 2)} · {view.players[view.turnPlayer].name}</span>{view.phase !== 'main' && <strong>{view.result ? `${view.result.winner === null ? 'Draw' : view.players[view.result.winner].name + ' wins'}` : view.phase === 'trap' ? 'Trap response' : view.phase === 'turnEnd' ? 'Attack complete' : 'Resolve effect'}</strong>}{openHands && <span className="mode-label">Open hands</span>}</div>;
}

export function App() {
  const [entry] = useState(() => roomLocation(window.location.href));
  const [setupEntry, setSetupEntry] = useState(entry);
  const [online] = useState(() => new OnlineSession({ getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) }));
  const [onlineActive, setOnlineActive] = useState(false);
  const onlineActiveRef = useRef(false);
  const [pendingRetry, setPendingRetry] = useState(false);
  const [shareLink, setShareLink] = useState<string>();
  const [storageKey] = useState(() => { const id = new URLSearchParams(window.location.search).get('session'); return id && /^[a-zA-Z0-9-]{1,80}$/.test(id) ? `${SAVE_KEY}.${id}` : SAVE_KEY; });
  const [session] = useState(() => new LocalSession({ getItem: () => window.localStorage.getItem(storageKey), setItem: (_key, value) => window.localStorage.setItem(storageKey, value) }, createId));
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const snapshotRef = useRef<SessionSnapshot | null>(null);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [menu, setMenu] = useState(false);
  const [history, setHistory] = useState(false);
  const [rules, setRules] = useState(false);
  const [reference, setReference] = useState<CardDefinition | null>(null);
  const [graveyard, setGraveyard] = useState<PlayerId | null>(null);
  const [restart, setRestart] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayText, setReplayText] = useState('');
  const [replayThrough, setReplayThrough] = useState('');
  let replayCount: number | undefined;
  try { const count = JSON.parse(replayText).actions?.length; if (Number.isSafeInteger(count) && count >= 0) replayCount = count; } catch { /* The importer reports invalid files on submission. */ }
  const [replayError, setReplayError] = useState<string>();
  const [playback, setPlayback] = useState<{ before: SessionSnapshot; next: SessionSnapshot; command?: GameCommand; geometry: Geometry }>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [inspectionId, setInspectionId] = useState<string>();
  const rail = useMediaQuery('(min-width: 1280px) and (min-height: 650px)');
  const desktop = useMediaQuery('(min-width: 900px)');
  const [shiftHeld, setShiftHeld] = useState(false);
  const [hovered, setHovered] = useState<{ id?: string; def?: CardDefId; left: number; right: number; top: number }>();
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Shift') setShiftHeld(true); };
    const keyUp = (event: KeyboardEvent) => { if (event.key === 'Shift') setShiftHeld(false); };
    const clear = () => { setShiftHeld(false); setHovered(undefined); };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', clear); window.addEventListener('resize', clear);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clear); window.removeEventListener('resize', clear); };
  }, []);
  const resetTableUI = () => { setDraft(emptyDraft()); setInspectionId(undefined); setDetailsOpen(false); setReference(null); setGraveyard(null); setMenu(false); setHistory(false); setRules(false); setNotice(null); setHovered(undefined); };
  const adopt = (next: SessionSnapshot) => {
    setConnectionError(null);
    resetTableUI();
    snapshotRef.current = next;
    setSnapshot(next);
  };
  const activateOnline = (next: OnlineSnapshot) => {
    onlineActiveRef.current = true; setOnlineActive(true); setPendingRetry(false);
    setSetupEntry({ room: null, invite: null });
    window.history.replaceState(null, '', inviteLink(window.location.href, next.matchId));
    setShareLink(online.invite ? inviteLink(window.location.href, next.matchId, online.invite) : undefined);
    return next;
  };
  useEffect(() => { let live = true; (entry.room ? online.load(entry.room) : online.resumeCreation().then(created => created ?? session.load())).then(saved => { if (live && saved) adopt('viewer' in saved ? activateOnline(saved as OnlineSnapshot) : saved); }).catch(reason => { if (live) setError(errorMessage(reason)); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [session, online, entry]);
  const perform = async (work: () => Promise<SessionSnapshot>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null); setNotice(null);
    try { adopt(await work()); } catch (reason) { setError(errorMessage(reason)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const start = (names: [string, string], startingPlayer: PlayerId | undefined, openHands: boolean) => void perform(async () => {
    const next = await session.start({ seed: secureNumber(), names, startingPlayer, openHands });
    onlineActiveRef.current = false; setOnlineActive(false); setPendingRetry(false); setShareLink(undefined);
    setSetupEntry({ room: null, invite: null });
    const url = new URL(window.location.href); url.searchParams.delete('room'); url.hash = ''; window.history.replaceState(null, '', url.href);
    return next;
  });
  const createOnline = (name: string) => void perform(async () => activateOnline(await online.start(name)));
  const joinOnline = (room: string, invite: string, name: string) => void perform(async () => activateOnline(await online.join(room, invite, name)));
  const mayAct = () => {
    const current = snapshotRef.current;
    if (!onlineActiveRef.current) return true;
    const match = current as OnlineSnapshot | null;
    return !!match && !online.pending && !match.waitingForOpponent && match.viewer === match.view.decisionPlayer && !match.view.result;
  };
  const present = (before: SessionSnapshot, next: SessionSnapshot, command?: GameCommand, geometry = captureGeometry()) => {
    if (next.revision <= before.revision) { acceptPlayback(before); return; }
    if (!transitionEvents(before.view, next.view, command).length) acceptPlayback(next);
    else setPlayback({ before, next, command, geometry });
  };
  useEffect(() => {
    if (!onlineActive) return;
    let live = true, polling = false;
    const poll = async () => {
      if (!live || polling || document.visibilityState !== 'visible' || busyRef.current || online.pending) return;
      polling = true;
      try {
        const next = await online.getSnapshot(), current = snapshotRef.current;
        if (live) setConnectionError(null);
        if (live && !busyRef.current && current && current.matchId === next.matchId && next.revision > current.revision) {
          busyRef.current = true; setBusy(true); present(current, next);
        }
      } catch (reason) { if (live) setConnectionError(errorMessage(reason)); }
      finally { polling = false; }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    document.addEventListener('visibilitychange', poll);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [onlineActive, online, snapshot?.matchId]);
  const submit = async (command: GameCommand) => {
    const before = snapshotRef.current; if (!before || busyRef.current || !mayAct()) return;
    busyRef.current = true; setBusy(true); setError(null); setNotice(null); setHovered(undefined);
    const geometry = captureGeometry();
    try {
      const next = onlineActiveRef.current ? await online.submit({ commandId: createId(), expectedRevision: before.revision, command }) : await session.submit({ matchId: before.matchId, commandId: createId(), expectedRevision: before.revision, actor: before.view.decisionPlayer, command });
      present(before, next, command, geometry);
    } catch (reason) { setError(errorMessage(reason)); setPendingRetry(!!online.pending); busyRef.current = false; setBusy(false); }
  };
  const onlineAction = async (command?: OnlineCommand) => {
    const before = snapshotRef.current; if (!before || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const next = command ? await online.submit({ commandId: createId(), expectedRevision: before.revision, command }) : await online.retry();
      setPendingRetry(false); acceptPlayback(next);
    } catch (reason) { setError(errorMessage(reason)); setPendingRetry(!!online.pending); busyRef.current = false; setBusy(false); }
  };
  const acceptPlayback = (next: SessionSnapshot) => { adopt(next); setPlayback(undefined); busyRef.current = false; setBusy(false); };
  const finishPlayback = () => { if (playback) acceptPlayback(playback.next); };
  const exportReplay = async () => {
    try { const raw = await (onlineActiveRef.current ? online.exportReplay() : session.exportReplay()); const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `yokai1504-turn-${snapshotRef.current?.view.turn}.json`; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Replay exported. It includes both hands and deck order.'); setMenu(false); }
    catch (reason) { setError(errorMessage(reason)); }
  };
  const importReplay = async () => {
    setReplayError(undefined);
    try {
      const id = createId(), key = `${SAVE_KEY}.${id}`;
      const other = new LocalSession({ getItem: () => window.localStorage.getItem(key), setItem: (_key, value) => window.localStorage.setItem(key, value) }, createId);
      await other.importReplay(replayText, replayThrough.trim() ? Number(replayThrough) : undefined);
      const url = new URL(window.location.href); url.searchParams.delete('room'); url.hash = ''; url.searchParams.set('session', id);
      window.open(url.href, '_blank', 'noopener'); setReplayOpen(false); setNotice('Replay opened in a separate session. Your current match is unchanged.');
    } catch (reason) { setReplayError(errorMessage(reason)); }
  };
  const undo = () => { const before = snapshotRef.current; if (before) { if (onlineActiveRef.current) void onlineAction({ type: 'undo' }); else void perform(() => session.undo(before.revision)); } };
  const toggleOpenHands = (value: boolean) => void perform(() => session.setOpenHands(value));
  const onDraft = (event: DraftEvent) => { if (!busyRef.current && mayAct()) { setDraft(old => updateDraft(old, event)); setNotice(null); setError(null); } };
  const view = snapshot?.view;
  const onlineMatch = onlineActive && snapshot ? snapshot as OnlineSnapshot : undefined;
  const actionBlocked = busy || !mayAct();
  const cards = view ? allVisible(view) : [];
  const source = view ? effectSource(view) : undefined;
  const selected = cards.find(card => card.id === draft.selectedId);
  const inspected = cards.find(card => card.id === inspectionId) ?? selected ?? source;
  const candidates = view && !actionBlocked ? decisionCandidates(view, draft) : { cards: [], hiddenTrapSeats: [], minimum: 0, maximum: 1 };
  const onDetails = (card?: VisibleCard) => { setInspectionId(card?.id ?? inspected?.id ?? cards[0]?.id); setDetailsOpen(true); };
  const chooseTarget = (id: string) => {
    if (!view || busyRef.current || !mayAct()) return;
    const result = resolveEffectTarget(view, draft, id);
    if (result.command) void submit(result.command); else if (result.event) onDraft(result.event); else setNotice(result.reason ?? 'Choose a marked target.');
  };
  const onCard = (card: VisibleCard) => { if (shiftHeld) return; if (!busyRef.current) { if (mayAct() && view?.phase === 'effect' && candidates.cards.some(target => target.id === card.id)) chooseTarget(card.id); else { setDraft(old => updateDraft(old, { type: 'select', id: card.id })); setInspectionId(card.id); } } };
  const onTrap = (seat: PlayerId) => { if (shiftHeld) return; if (view?.phase === 'effect' && candidates.hiddenTrapSeats.includes(seat)) { chooseTarget(`trap:${seat}`); return; } const trap = view?.players[seat].trap; if (trap && !('hidden' in trap)) onCard(trap); else setNotice('This trap is face down.'); };
  const drop = (sourceId: string, targetId: string) => {
    if (!view || busyRef.current || !mayAct()) return;
    const result = resolveDrop(view, draft, sourceId, targetId);
    if (result.command) void submit(result.command); else if (result.event) onDraft(result.event); else setNotice(result.reason ?? 'Choose a highlighted destination.');
  };
  const soul = (card: VisibleCard) => {
    if (!view || busyRef.current || !mayAct()) return;
    if (view.phase === 'effect' && source?.def === 'sake') {
      const count = draft.allocations[card.id] ?? 0;
      if (count < allocationLimit(view, draft, card.id)) onDraft({ type: 'setAllocation', id: card.id, count: count + 1 });
    } else void submit({ type: 'evoke', cardId: card.id });
  };
  const detailsContent = view && <>
    <label className="inspect-picker">Inspect card<select aria-label="Inspect card" value={inspected?.id ?? ''} onChange={event => setInspectionId(event.target.value)}><option value="" disabled>Choose a visible card</option>{cards.map(card => <option key={card.id} value={card.id}>{inspectionLabel(view, card)}</option>)}</select></label>
    {inspected ? <Inspector definition={inspected.definition} card={inspected} /> : <p className="muted">Select a card to read its effect.</p>}
  </>;
  const hoveredCard = cards.find(card => card.id === hovered?.id);
  const hoveredDefinition = hovered?.def ? CARDS[hovered.def] : hoveredCard?.definition;
  const historyEntries = playback?.next.view.history ?? view?.history ?? [];
  const errorBanner = (error || connectionError) && <div className="error-banner" role="alert"><p>{error || connectionError}</p><button type="button" className="icon-button" aria-label="Dismiss error" onClick={() => { setError(null); setConnectionError(null); }}>×</button></div>;
  return <div className={`app-shell ${view ? 'in-match' : ''}`} onPointerLeave={() => setHovered(undefined)} onFocus={event => {
    const el = (event.target as Element).closest<HTMLElement>('[data-card-def]');
    if (el) { const rect = el.getBoundingClientRect(); setHovered({ def: el.dataset.cardDef as CardDefId, left: rect.left, right: rect.right, top: rect.top }); }
  }} onBlur={() => setHovered(undefined)} onPointerMove={event => {
    if (!desktop || event.buttons) { setHovered(undefined); return; }
    const el = (event.target as Element).closest<HTMLElement>('[data-card-id],[data-card-def]');
    const id = el?.dataset.cardId, def = el?.dataset.cardDef as CardDefId | undefined;
    if (!el || !id && !def) setHovered(undefined);
    else setHovered(old => { if (old?.id === id && old?.def === def) return old; const rect = el.getBoundingClientRect(); return { id, def, left: rect.left, right: rect.right, top: rect.top }; });
  }}>
    <header className="app-header"><a className="wordmark" href="#" onClick={event => event.preventDefault()} aria-label="Yokai 1504">Yokai <small>1504</small></a>
      {view && <span className="toolbar-supply" aria-label={`Supply: ${view.supply} souls`}><span>Supply</span><strong>{view.supply}</strong><img src={publicAsset('icons/soul.svg')} alt="" /></span>}
      <div className="header-tools"><button type="button" className="header-button" disabled={busy} onClick={() => snapshot ? setMenu(true) : setRules(true)}>{snapshot ? 'Menu' : 'Rules'}</button>{!snapshot && <button type="button" className="header-button" onClick={() => setReplayOpen(true)}>Import replay</button>}</div>
    </header>
    {errorBanner}
    {loading ? <main className="loading-screen"><p>Setting the table…</p></main> : !view || !snapshot ? <Setup onStart={start} onCreate={createOnline} onJoin={joinOnline} entry={setupEntry} recent={online.rooms()} busy={busy} onRules={() => setRules(true)} /> : <>
      {!rail && <div className="match-status"><TurnSummary view={view} openHands={snapshot.openHands} /></div>}
      {onlineMatch && <section className="online-status" aria-label="Online table" role="status">
        {pendingRetry && <div className="online-status-actions"><strong>Your last action needs a connection retry.</strong><button type="button" className="secondary" disabled={busy} onClick={() => void onlineAction()}>Retry last action</button></div>}
        {onlineMatch.waitingForOpponent ? <><strong>Waiting for your opponent to join</strong>{shareLink && <div className="invite-share"><label>Invitation link<input readOnly value={shareLink} onFocus={event => event.target.select()} /></label><button type="button" className="secondary" onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(shareLink).then(() => setNotice('Invitation copied.')).catch(() => setNotice('Select and copy the invitation link.')); else setNotice('Select and copy the invitation link.'); }}>Copy invite</button></div>}</>
          : view.result ? <span>Finished table · replay available in Menu</span>
          : <span>{view.decisionPlayer === onlineMatch.viewer ? view.phase === 'trap' ? 'Your trap response' : 'Your decision' : `Waiting for ${view.players[view.decisionPlayer].name}${view.phase === 'trap' ? '’s trap response' : view.phase === 'effect' ? ' to resolve an effect' : ' to play'}`}</span>}
      </section>}
      {notice && <div className="table-notice" role="status"><span>{notice}</span><button type="button" className="icon-button" aria-label="Dismiss explanation" onClick={() => setNotice(null)}>×</button></div>}
      <main className="game-workspace"><DragSurface view={view} draft={draft} disabled={actionBlocked} onDrop={drop} onPick={id => { setInspectionId(id); setDraft(old => ({ ...old, selectedId: id })); }}><div className="table-play">
        {!playback && !actionBlocked && view.phase !== 'trap' && <DecisionBar view={view} draft={draft} busy={busy} onDraft={onDraft} onCommand={submit} onDetails={onDetails} onUnavailable={setNotice} />}
        {!actionBlocked && source?.def === 'boseki' && <section className="target-tray" aria-label="Boseki graveyard targets">{view.players.map(player => <div key={player.id}><strong>{player.name}’s graveyard</strong><div className="target-tray-cards">{candidates.cards.filter(card => card.controller === player.id).map(card => <GraveyardTarget key={card.id} card={card} selected={draft.targets.includes(card.id)} onInspect={() => onCard(card)} />)}{!candidates.cards.some(card => card.controller === player.id) && <small>No eligible yokai</small>}</div></div>)}</section>}
        <Table view={view} viewer={onlineMatch?.viewer} openHands={snapshot.openHands} selectedId={draft.attackSourceId ?? draft.allocationCardId ?? draft.selectedId} targetIds={candidates.cards.map(card => card.id)} targetTrapSeats={candidates.hiddenTrapSeats} chosenTargets={draft.targets} allocations={draft.allocations} onCard={onCard} onTrap={onTrap} onGraveyard={setGraveyard} turnControls={<>
          <TurnControls view={view} viewer={onlineMatch?.viewer} draft={draft} busy={busy || pendingRetry || !!onlineMatch?.waitingForOpponent} onCommand={submit} onDetails={onDetails} showInspect={!desktop} onUndo={undo} canUndo={snapshot.canUndo} />
          {playback && <span className="resolving-label" role="status">Resolving…</span>}
          {view.result && <button type="button" className="primary" onClick={() => setRestart(true)}>Play again</button>}
        </>} onSoul={actionBlocked ? undefined : soul} onRelease={actionBlocked ? undefined : card => void submit({ type: 'release', cardId: card.id })} />
        {!playback && !actionBlocked && view.phase === 'trap' && <DecisionBar view={view} draft={draft} busy={busy} onDraft={onDraft} onCommand={submit} onDetails={onDetails} onUnavailable={setNotice} />}
      </div></DragSurface>
      {rail && <aside className="details-rail" aria-label="Public history sidebar"><div className="sidebar-turn-status"><TurnSummary view={view} openHands={snapshot.openHands} /></div><section className="rail-history"><h2>Public history</h2><PublicHistory entries={historyEntries} onInspect={setReference} /></section></aside>}
      </main>
    </>}
    {playback && <Playback events={transitionEvents(playback.before.view, playback.next.view, playback.command)} geometry={playback.geometry} onComplete={finishPlayback} />}
    {menu && snapshot && <Modal title="Table menu" onClose={() => setMenu(false)}><div className="phone-menu-actions">
      <button type="button" className="secondary" onClick={() => { setMenu(false); setRules(true); }}>Rules & cards</button><button type="button" className="secondary" onClick={() => { setMenu(false); setHistory(true); }}>Public history</button>
      {!onlineMatch && <label className="check-label"><input type="checkbox" checked={snapshot.openHands} onChange={event => toggleOpenHands(event.target.checked)} disabled={busy} /><span>Open hands<small>Show both hands and traps</small></span></label>}
      {(!onlineMatch || view?.result) && <><p className="small muted">Replay files include both hands and deck order.</p><button type="button" className="secondary" disabled={busy} onClick={() => void exportReplay()}>Export replay</button></>}<button type="button" className="secondary" disabled={busy} onClick={() => { setMenu(false); setReplayOpen(true); }}>Import replay in new session</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { setMenu(false); setRestart(true); }}>New game</button></div></Modal>}
    {replayOpen && <Modal title="Import replay" onClose={() => setReplayOpen(false)}><p>Choose an exported JSON file or paste it below. The replay opens in a separate session with its own save.</p><input type="file" accept=".json,application/json" aria-label="Replay file" onChange={async event => { const file = event.target.files?.[0]; if (file) { if (file.size > 5_000_000) setReplayError('The replay file is too large.'); else setReplayText(await file.text()); } }} /><textarea className="replay-input" aria-label="Replay JSON" value={replayText} onChange={event => setReplayText(event.target.value)} placeholder="Paste replay JSON" /><label className="replay-through">Replay through action<input type="number" min="0" max={replayCount} value={replayThrough} onChange={event => setReplayThrough(event.target.value)} placeholder={replayCount === undefined ? 'All actions' : `All ${replayCount} actions`} /></label>{replayError && <p role="alert">{replayError}</p>}<button type="button" className="primary" disabled={!replayText.trim()} onClick={() => void importReplay()}>Open replay in new session</button></Modal>}
    {history && view && snapshot && <Modal title="Public history" className="history-drawer" onClose={() => setHistory(false)}><div className="sidebar-turn-status"><TurnSummary view={view} openHands={snapshot.openHands} /></div><PublicHistory entries={historyEntries} onInspect={setReference} /></Modal>}
    {desktop && (shiftHeld || hovered?.def) && hovered && hoveredDefinition && !busy && !detailsOpen && !menu && !rules && createPortal(<div className="shift-inspector" role="tooltip" aria-label={`${hoveredDefinition.name} details`} style={inspectionPosition(hovered, { width: window.innerWidth, height: window.innerHeight })}><Inspector definition={hoveredDefinition} card={hoveredCard} /></div>, document.querySelector('dialog[open]') ?? document.body)}
    {detailsOpen && view && <Modal title="Card details" className="details-drawer" onClose={() => setDetailsOpen(false)}>{detailsContent}</Modal>}
    {rules && <Rules onClose={() => setRules(false)} onInspect={setReference} />}
    {reference && <Modal title={reference.name} onClose={() => setReference(null)}><Inspector definition={reference} /></Modal>}
    {graveyard !== null && view && <Modal title={`${view.players[graveyard].name}’s graveyard`} onClose={() => { setGraveyard(null); setHovered(undefined); }}><div className="graveyard-grid">{view.players[graveyard].graveyard.length ? view.players[graveyard].graveyard.map(card => <button type="button" className="graveyard-card" data-card-id={card.id} key={card.id} onClick={() => { if (desktop) return; setGraveyard(null); onDetails(card); }}><CardFace card={card} /><span>{card.definition.name}</span></button>) : <p>No cards here yet.</p>}</div></Modal>}
    {restart && <Modal title="Start a new game?" onClose={() => setRestart(false)}><p>{onlineMatch ? 'This online table stays saved. Reopen its room link in this browser to return.' : 'Starting the next local game replaces this match and its undo history.'}</p><div className="dialog-actions"><button type="button" className="secondary" onClick={() => setRestart(false)}>Keep playing</button><button type="button" className="primary" disabled={busy} onClick={() => { resetTableUI(); setRestart(false); onlineActiveRef.current = false; setOnlineActive(false); snapshotRef.current = null; setSnapshot(null); setPendingRetry(false); setError(null); const url = new URL(window.location.href); url.searchParams.delete('room'); url.hash = ''; window.history.replaceState(null, '', url.href); }}>Set up new game</button></div></Modal>}
  </div>;
}
