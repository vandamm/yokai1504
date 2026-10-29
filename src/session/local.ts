import { CARDS, DECK } from '../game/catalog';
import { applyCommand, canResolvePendingEffect, createGame } from '../game/engine';
import { viewForLocalTesting, viewForPlayer } from '../game/views';
import { createId } from './id';
import type { GameCommand, GameState, GameView, PlayerId, SetupOptions } from '../game/types';

export const SAVE_KEY = 'yokai-1504.local-match.v1';
export interface SessionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export interface SessionSnapshot { matchId: string; revision: number; view: GameView; openHands: boolean; canUndo: boolean; recentHistory: string[]; }
interface Submission { matchId: string; commandId: string; expectedRevision: number; actor: PlayerId; command: GameCommand; }
type Position = Omit<GameState, 'history'> & { historyLength: number };
interface Receipt { commandId: string; payload: string; acceptedRevision: number; }
type ReplayAction = { actor: PlayerId; command: GameCommand };
type AuditEvent = ({ kind: 'command' } & ReplayAction) | { kind: 'undo' } | { kind: 'openHands'; value: boolean };
interface SavedMatch {
  schemaVersion: 1;
  catalogVersion: 1;
  matchId: string;
  revision: number;
  openHands: boolean;
  state: GameState;
  checkpoints: Position[];
  receipts: Receipt[];
  audit?: AuditEvent[];
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const object = (value: unknown): value is Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const player = (value: unknown): value is PlayerId => value === 0 || value === 1;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function check(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  check(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'Unexpected or missing fields.');
}

function validateCommand(value: unknown): asserts value is GameCommand {
  check(object(value) && text(value.type), 'Invalid command.');
  switch (value.type) {
    case 'play': case 'evoke': case 'release': case 'setTrap':
      keys(value, ['type', 'cardId']);
      check(text(value.cardId), 'Invalid card selection.');
      break;
    case 'attack':
      keys(value, ['type', 'attacker', 'target']);
      check(text(value.attacker) && (value.target === null || text(value.target)), 'Invalid attack selection.');
      break;
    case 'respond':
      keys(value, ['type', 'activate']);
      check(typeof value.activate === 'boolean', 'Invalid trap response.');
      break;
    case 'choose':
      keys(value, ['type'], ['targets', 'allocations']);
      check(value.targets === undefined || (Array.isArray(value.targets) && value.targets.every(text)), 'Invalid effect targets.');
      check(value.allocations === undefined || (Array.isArray(value.allocations) && value.allocations.every((allocation: unknown) => {
        if (!object(allocation)) return false;
        keys(allocation, ['cardId', 'count']);
        return text(allocation.cardId) && integer(allocation.count, 0, 11);
      })), 'Invalid soul allocation.');
      break;
    case 'endTurn': keys(value, ['type']); break;
    default: throw new Error('Unknown command.');
  }
}

function validateAudit(value: unknown): asserts value is AuditEvent[] {
  check(Array.isArray(value) && value.length <= 10000, 'Invalid action audit.');
  for (const event of value) {
    check(object(event), 'Invalid audit event.');
    if (event.kind === 'command') { keys(event, ['kind', 'actor', 'command']); check(player(event.actor), 'Invalid audit actor.'); validateCommand(event.command); }
    else if (event.kind === 'undo') keys(event, ['kind']);
    else { keys(event, ['kind', 'value']); check(event.kind === 'openHands' && typeof event.value === 'boolean', 'Invalid audit event.'); }
  }
}

function validateGame(value: unknown): asserts value is GameState {
  check(object(value), 'The game position is missing.');
  keys(value, ['rulesVersion', 'turn', 'turnPlayer', 'decisionPlayer', 'phase', 'actionsUsed', 'supply', 'cards', 'players', 'pending', 'result', 'history']);
  check(value.rulesVersion === 1, 'The rules version is incompatible.');
  check(integer(value.turn, 1) && player(value.turnPlayer) && player(value.decisionPlayer), 'Invalid turn or player.');
  check(['main', 'trap', 'effect', 'turnEnd', 'finished'].includes(value.phase), 'Invalid game phase.');
  check(integer(value.actionsUsed, 0, 2) && integer(value.supply, 0, 11), 'Invalid action budget or soul supply.');
  check(Array.isArray(value.history) && value.history.every((entry: unknown) => typeof entry === 'string'), 'Invalid public history.');
  check(object(value.cards) && Object.keys(value.cards).length === 30, 'The match must contain 30 cards.');
  check(Array.isArray(value.players) && value.players.length === 2, 'The match needs two players.');
  const zones = new Map<string, { player: PlayerId; zone: string }>();
  value.players.forEach((seat: unknown, index: number) => {
    check(object(seat), 'Invalid player position.');
    keys(seat, ['name', 'health', 'deck', 'hand', 'field', 'graveyard', 'trap']);
    check(text(seat.name) && integer(seat.health, 0, 15), 'Invalid player name or health.');
    for (const zone of ['deck', 'hand', 'field', 'graveyard'] as const) {
      check(Array.isArray(seat[zone]) && seat[zone].every(text), `Invalid ${zone}.`);
      check(zone !== 'field' || seat[zone].length <= 3, 'Too many yokai on a field.');
      for (const id of seat[zone]) {
        check(!zones.has(id), 'A card appears in more than one zone.');
        zones.set(id, { player: index as PlayerId, zone });
      }
    }
    check(seat.trap === null || text(seat.trap), 'Invalid set trap.');
    if (seat.trap !== null) {
      check(!zones.has(seat.trap), 'A trap appears in more than one zone.');
      zones.set(seat.trap, { player: index as PlayerId, zone: 'trap' });
    }
  });
  check(zones.size === 30, 'A card is missing from its zone.');
  let souls = value.supply;
  const composition = [new Map<string, number>(), new Map<string, number>()];
  for (const [id, card] of Object.entries(value.cards)) {
    check(object(card), 'Invalid card.');
    keys(card, ['id', 'def', 'owner', 'souls', 'summonedTurn']);
    check(text(id) && card.id === id && text(card.def) && Object.hasOwn(CARDS, card.def) && player(card.owner), 'Invalid card identity, definition, or owner.');
    const definition = CARDS[card.def as keyof typeof CARDS];
    check(integer(card.souls, 0, definition.cap) && integer(card.summonedTurn, 0, value.turn), 'Invalid soul capacity or summon turn.');
    const location = zones.get(id);
    check(location, 'A card is missing from its zone.');
    check(location.zone === 'field' || card.souls === 0, 'Only a field yokai can hold souls.');
    check(location.zone !== 'field' || definition.kind === 'yokai', 'A spell cannot occupy a yokai field.');
    check(location.zone !== 'trap' || definition.kind === 'spell', 'Only a spell can be set as a trap.');
    check(!['deck', 'hand', 'graveyard', 'trap'].includes(location.zone) || location.player === card.owner, 'A card is in the wrong owner’s zone.');
    souls += card.souls;
    composition[card.owner].set(card.def, (composition[card.owner].get(card.def) ?? 0) + 1);
  }
  check(souls === 11, 'The match must conserve all 11 souls.');
  for (const ownerDeck of composition) {
    check(ownerDeck.size === new Set(DECK).size && DECK.every(def => ownerDeck.get(def) === DECK.filter(card => card === def).length), 'The saved card catalog composition is invalid.');
  }

  if (value.phase === 'main' || value.phase === 'turnEnd' || value.phase === 'finished') {
    check(value.pending === null && (value.phase === 'turnEnd' || value.decisionPlayer === value.turnPlayer), 'The game has an inconsistent decision maker.');
  } else {
    const pending = value.pending;
    check(object(pending) && pending.kind === value.phase && player(pending.actor) && pending.actor === value.decisionPlayer, 'The pending decision is invalid.');
    let attack: Record<string, any> | null;
    if (pending.kind === 'trap') {
      keys(pending, ['kind', 'actor', 'attacker', 'target']);
      check(pending.actor === 1 - value.turnPlayer && value.players[pending.actor].trap !== null, 'The defending player must own the trap decision.');
      attack = { attacker: pending.attacker, target: pending.target };
    } else {
      keys(pending, ['kind', 'actor', 'cardId', 'source', 'attack']);
      check(text(pending.cardId) && Object.hasOwn(value.cards, pending.cardId) && ['cast', 'trap', 'release'].includes(pending.source), 'Invalid pending effect.');
      const location = zones.get(pending.cardId)!;
      const definition = CARDS[value.cards[pending.cardId].def as keyof typeof CARDS];
      if (pending.source === 'release') {
        check(pending.actor === value.turnPlayer && location.zone === 'field' && location.player === pending.actor && definition.effectType === 'release' && pending.attack === null, 'Invalid release decision.');
      } else {
        check(location.zone === 'graveyard' && definition.kind === 'spell' && location.player === pending.actor, 'The resolving spell must be in its owner’s graveyard.');
        check(pending.source === 'trap' ? pending.actor === 1 - value.turnPlayer && pending.attack !== null : pending.actor === value.turnPlayer && pending.attack === null, 'Invalid spell decision actor or continuation.');
      }
      attack = pending.attack;
    }
    if (attack !== null) {
      check(object(attack), 'Invalid pending attack.');
      keys(attack, ['attacker', 'target']);
      check(text(attack.attacker) && zones.get(attack.attacker)?.zone === 'field' && zones.get(attack.attacker)?.player === value.turnPlayer, 'The pending attacker is invalid.');
      check(attack.target === null || (text(attack.target) && zones.get(attack.target)?.zone === 'field' && zones.get(attack.target)?.player === 1 - value.turnPlayer), 'The pending attack target is invalid.');
    }
  }
  if (value.phase === 'finished') {
    check(object(value.result), 'A finished game needs a result.');
    keys(value.result, ['winner', 'reason']);
    check((value.result.winner === null || player(value.result.winner)) && text(value.result.reason), 'Invalid game result.');
  } else {
    check(value.result === null && value.players.every((seat: any) => seat.health > 0), 'An unfinished game has an invalid result or health.');
  }
  if (value.phase === 'effect') check(canResolvePendingEffect(value as unknown as GameState), 'The pending effect has no legal choice or should already have resolved.');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function parseSaved(raw: string): SavedMatch {
  try {
    const saved: unknown = JSON.parse(raw);
    check(object(saved), 'The match record is missing.');
    check(saved.schemaVersion === 1 && saved.catalogVersion === 1, 'The save or catalog version is incompatible.');
    keys(saved, ['schemaVersion', 'catalogVersion', 'matchId', 'revision', 'openHands', 'state', 'checkpoints', 'receipts'], ['audit']);
    if (saved.audit !== undefined) validateAudit(saved.audit);
    check(text(saved.matchId) && integer(saved.revision) && typeof saved.openHands === 'boolean', 'Invalid match metadata.');
    validateGame(saved.state);
    check(Array.isArray(saved.checkpoints), 'Invalid undo history.');
    let previousLength = 0;
    for (const checkpoint of saved.checkpoints) {
      check(object(checkpoint) && integer(checkpoint.historyLength, previousLength, saved.state.history.length) && !Object.hasOwn(checkpoint, 'history'), 'Invalid undo checkpoint.');
      const { historyLength, ...position } = checkpoint;
      validateGame({ ...position, history: saved.state.history.slice(0, historyLength) });
      previousLength = historyLength;
    }
    check(saved.checkpoints.length <= saved.revision && Array.isArray(saved.receipts), 'Invalid undo or command history.');
    const ids = new Set<string>();
    for (const receipt of saved.receipts) {
      check(object(receipt), 'Invalid command receipt.');
      keys(receipt, ['commandId', 'payload', 'acceptedRevision']);
      check(text(receipt.commandId) && !ids.has(receipt.commandId) && text(receipt.payload) && integer(receipt.acceptedRevision, 1, saved.revision), 'Invalid command receipt.');
      const payload: unknown = JSON.parse(receipt.payload);
      check(object(payload), 'Invalid command receipt payload.');
      keys(payload, ['matchId', 'expectedRevision', 'actor', 'command']);
      check(payload.matchId === saved.matchId && integer(payload.expectedRevision, 0, receipt.acceptedRevision - 1) && player(payload.actor), 'Invalid command receipt payload.');
      validateCommand(payload.command);
      check(canonical(payload) === receipt.payload, 'Invalid command receipt encoding.');
      ids.add(receipt.commandId);
    }
    return saved as unknown as SavedMatch;
  } catch (error) {
    throw new Error(`Could not load the saved match: ${error instanceof Error ? error.message : 'Invalid data.'} Start a new game to replace this save.`);
  }
}

export class LocalSession {
  private saved: SavedMatch | null = null;
  private persisted: string | null = null;

  constructor(private readonly storage: SessionStorage, private readonly makeId: () => string = createId) {}

  private read(): string | null {
    try { return this.storage.getItem(SAVE_KEY); }
    catch { throw new Error('Could not read browser storage. Allow local storage and try again.'); }
  }

  private current(): SavedMatch {
    if (!this.saved) throw new Error('Start or load a match first.');
    return this.saved;
  }

  private snapshot(): SessionSnapshot {
    const match = this.current();
    const view = match.openHands ? viewForLocalTesting(match.state) : viewForPlayer(match.state, match.state.decisionPlayer);
    return copy({ matchId: match.matchId, revision: match.revision, view, openHands: match.openHands, canUndo: match.checkpoints.length > 0, recentHistory: match.state.history.slice(match.checkpoints.at(-1)?.historyLength ?? 0) });
  }

  private checkRevision(expected: number) {
    if (!integer(expected) || expected !== this.current().revision) throw new Error('This action has a stale match revision. Refresh the match and try again.');
  }

  private checkStorage() {
    if (this.read() !== this.persisted) throw new Error('This match changed in another tab. Close the older tab, then reload this match.');
  }

  private persist(next: SavedMatch, expected = this.persisted) {
    if (this.read() !== expected) throw new Error('This match changed in another tab. Close the older tab, then reload this match.');
    const raw = JSON.stringify(next);
    try { this.storage.setItem(SAVE_KEY, raw); }
    catch { throw new Error('Could not save the match to browser storage. Free some storage or allow local storage, then retry. Your last accepted position is unchanged.'); }
    this.saved = next;
    this.persisted = raw;
  }

  async load(): Promise<SessionSnapshot | null> {
    const raw = this.read();
    const next = raw === null ? null : parseSaved(raw);
    this.saved = next;
    this.persisted = raw;
    return next ? this.snapshot() : null;
  }

  async start(options: SetupOptions & { openHands?: boolean }): Promise<SessionSnapshot> {
    if (this.saved) this.checkStorage();
    const expected = this.saved ? this.persisted : this.read();
    check(integer(options.seed, 0, 0xffffffff), 'The game seed must be a 32-bit unsigned integer.');
    check(options.openHands === undefined || typeof options.openHands === 'boolean', 'Open hands must be enabled or disabled.');
    const state = createGame(options);
    validateGame(state);
    const matchId = this.makeId();
    check(text(matchId), 'Could not create a match ID.');
    this.persist({ schemaVersion: 1, catalogVersion: 1, matchId, revision: 0, openHands: options.openHands ?? false, state, checkpoints: [], receipts: [], audit: [] }, expected);
    return this.snapshot();
  }

  async getSnapshot(): Promise<SessionSnapshot> { return this.snapshot(); }

  async submit(submission: Submission): Promise<SessionSnapshot> {
    const current = this.current();
    check(object(submission) && submission.matchId === current.matchId, 'This action belongs to a different match.');
    keys(submission as unknown as Record<string, unknown>, ['matchId', 'commandId', 'expectedRevision', 'actor', 'command']);
    check(text(submission.commandId) && integer(submission.expectedRevision) && player(submission.actor), 'Invalid command ID, actor, or revision.');
    validateCommand(submission.command);
    const payload = canonical({ matchId: submission.matchId, expectedRevision: submission.expectedRevision, actor: submission.actor, command: submission.command });
    const receipt = current.receipts.find(entry => entry.commandId === submission.commandId);
    if (receipt) {
      check(receipt.payload === payload, 'This command ID was reused with a different payload. Use a new command ID.');
      this.checkStorage();
      return this.snapshot();
    }
    this.checkRevision(submission.expectedRevision);
    this.checkStorage();
    const state = applyCommand(current.state, submission.actor, submission.command);
    validateGame(state);
    const { history, ...position } = current.state;
    const revision = current.revision + 1;
    this.persist({ ...current, revision, state, audit: [...this.audit(current), { kind: 'command', actor: submission.actor, command: submission.command }], checkpoints: [...current.checkpoints, { ...position, historyLength: history.length }], receipts: [...current.receipts, { commandId: submission.commandId, payload, acceptedRevision: revision }] });
    return this.snapshot();
  }

  async undo(expectedRevision: number): Promise<SessionSnapshot> {
    const current = this.current();
    this.checkRevision(expectedRevision);
    this.checkStorage();
    check(current.checkpoints.length > 0, 'There is no accepted action to undo.');
    const { historyLength, ...position } = current.checkpoints[current.checkpoints.length - 1];
    const state: GameState = { ...position, history: current.state.history.slice(0, historyLength) };
    this.persist({ ...current, revision: current.revision + 1, state, audit: [...this.audit(current), { kind: 'undo' }], checkpoints: current.checkpoints.slice(0, -1) });
    return this.snapshot();
  }

  private audit(match: SavedMatch): AuditEvent[] {
    return match.audit ?? match.receipts.map(receipt => {
      const { actor, command } = JSON.parse(receipt.payload) as ReplayAction;
      return { kind: 'command', actor, command };
    });
  }

  async exportReplay(): Promise<string> {
    const match = this.current(); this.checkStorage();
    const positions: GameState[] = [...match.checkpoints.map(({ historyLength, ...position }) => ({ ...position, history: match.state.history.slice(0, historyLength) })), match.state];
    const actions: ReplayAction[] = [];
    const candidates: ReplayAction[] = match.receipts.map(receipt => JSON.parse(receipt.payload));
    for (let index = 0; index < positions.length - 1; index++) {
      const before = positions[index], expected = canonical(positions[index + 1]);
      let found: ReplayAction[] | undefined;
      for (const { actor, command } of candidates) {
        try {
          let next = applyCommand(before, actor, command, positions[index + 1].phase === 'trap');
          const steps = [{ actor, command }];
          // Older saves started the next turn immediately after combat.
          if (next.phase === 'turnEnd' && positions[index + 1].turn === next.turn + 1) {
            steps.push({ actor: next.decisionPlayer, command: { type: 'endTurn' } });
            next = applyCommand(next, next.decisionPlayer, { type: 'endTurn' });
          }
          if (canonical(next) === expected) { found = steps; break; }
        } catch { /* This receipt belongs to a different undo branch. */ }
      }
      check(found, 'An action in this save could not be reconstructed.');
      actions.push(...found);
    }
    return JSON.stringify({ format: 'yokai1504-replay', version: 1, initial: positions[0], actions, final: match.state, openHands: match.openHands, audit: this.audit(match) }, null, 2);
  }

  async importReplay(raw: string, throughAction?: number): Promise<SessionSnapshot> {
    check(raw.length <= 5_000_000, 'The replay file is too large.');
    const file: unknown = JSON.parse(raw);
    check(object(file), 'Invalid replay file.');
    keys(file, ['format', 'version', 'initial', 'actions', 'final', 'openHands', 'audit']);
    check(file.format === 'yokai1504-replay' && file.version === 1, 'Incompatible replay format.');
    validateGame(file.initial); validateGame(file.final); validateAudit(file.audit);
    check(typeof file.openHands === 'boolean' && Array.isArray(file.actions) && file.actions.length <= 2000, 'Invalid replay actions.');
    const through = throughAction ?? file.actions.length;
    check(integer(through, 0, file.actions.length), 'The replay action index is out of range.');
    let state = copy(file.initial);
    const checkpoints: Position[] = [], receipts: Receipt[] = [];
    const matchId = this.makeId(); check(text(matchId), 'Could not create a match ID.');
    for (const [index, action] of file.actions.entries()) {
      check(object(action), 'Invalid replay action.'); keys(action, ['actor', 'command']);
      check(player(action.actor), 'Invalid replay actor.'); validateCommand(action.command);
      const { history, ...position } = state;
      checkpoints.push({ ...position, historyLength: history.length });
      const recordedResponse = file.actions[index + 1]?.command?.type === 'respond' || index === file.actions.length - 1 && file.final.phase === 'trap';
      state = applyCommand(state, action.actor, action.command, recordedResponse); validateGame(state);
      const revision = receipts.length;
      receipts.push({ commandId: `replay-${revision}`, acceptedRevision: revision + 1, payload: canonical({ matchId, expectedRevision: revision, actor: action.actor, command: action.command }) });
    }
    check(canonical(state) === canonical(file.final), 'The replay does not reproduce its final position.');
    if (through < file.actions.length) {
      const { historyLength, ...position } = checkpoints[through];
      state = { ...position, history: state.history.slice(0, historyLength) };
      checkpoints.splice(through); receipts.splice(through);
    }
    const expected = this.saved ? this.persisted : this.read();
    this.persist({ schemaVersion: 1, catalogVersion: 1, matchId, revision: receipts.length, state, checkpoints, receipts, openHands: file.openHands, audit: file.audit }, expected);
    return this.snapshot();
  }

  async setOpenHands(value: boolean): Promise<SessionSnapshot> {
    const current = this.current();
    check(typeof value === 'boolean', 'Open hands must be enabled or disabled.');
    this.checkStorage();
    if (value !== current.openHands) this.persist({ ...current, revision: current.revision + 1, openHands: value, audit: [...this.audit(current), { kind: 'openHands', value }] });
    return this.snapshot();
  }
}
