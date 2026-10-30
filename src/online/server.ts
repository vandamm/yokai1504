import { applyCommand, createGame } from '../game/engine';
import { viewForPlayer } from '../game/views';
import type { GameCommand, GameState, PlayerId } from '../game/types';
import type { OnlineAction, OnlineSnapshot } from './protocol';

type Position = Omit<GameState, 'history'> & { historyLength: number };
type ReplayAction = { actor: PlayerId; command: GameCommand };
export interface ReplayFile {
  format: 'yokai1504-replay'; version: 1; initial: GameState; final: GameState; actions: ReplayAction[];
  openHands: false; audit: Room['audit'];
}
export type RoomValue = OnlineSnapshot | ReplayFile;
export interface Room {
  matchId: string; revision: number; tokenHashes: [string, string | null]; inviteHash: string | null;
  joinReceipt: { inviteHash: string; tokenHash: string; name: string } | null;
  initial: GameState; state: GameState; checkpoints: Position[]; actions: ReplayAction[];
  audit: ((ReplayAction & { kind: 'command' }) | { kind: 'undo' })[];
  receipts: { actor: PlayerId; commandId: string; payload: string }[];
  undoRequestedBy: PlayerId | null; // Legacy rooms may still contain a pending approval.
  undoWindow?: { player: PlayerId; floor: number } | null;
}
export type RoomRequest =
  | { type: 'create'; matchId: string; name: string; tokenHash: string; inviteHash: string; seed: number }
  | { type: 'join'; name: string; tokenHash: string; inviteHash: string }
  | { type: 'snapshot'; tokenHash: string }
  | { type: 'replay'; tokenHash: string }
  | { type: 'command'; tokenHash: string; action: OnlineAction };
export class ServerError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
function check(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new ServerError(status, message);
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 64): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  check(required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), 'Unexpected or missing fields.');
}
export function validateName(value: unknown): string {
  check(typeof value === 'string' && text(value.trim(), 24) && !/[\u0000-\u001f\u007f]/.test(value), 'Enter a name of 1–24 characters.');
  return value.trim();
}
export function validateAction(value: unknown): asserts value is OnlineAction {
  check(object(value), 'Invalid action.'); keys(value, ['commandId', 'expectedRevision', 'command']);
  check(text(value.commandId, 128) && integer(value.expectedRevision), 'Invalid command ID or revision.');
  const command = value.command; check(object(command) && text(command.type), 'Invalid command.');
  switch (command.type) {
    case 'play': case 'evoke': case 'release': case 'setTrap':
      keys(command, ['type', 'cardId']); check(text(command.cardId), 'Invalid card.'); break;
    case 'attack':
      keys(command, ['type', 'attacker', 'target']); check(text(command.attacker) && (command.target === null || text(command.target)), 'Invalid attack.'); break;
    case 'respond': keys(command, ['type', 'activate']); check(typeof command.activate === 'boolean', 'Invalid trap response.'); break;
    case 'choose':
      keys(command, ['type'], ['targets', 'allocations']);
      check(command.targets === undefined || Array.isArray(command.targets) && command.targets.length <= 30 && command.targets.every(id => text(id)), 'Invalid effect targets.');
      check(command.allocations === undefined || Array.isArray(command.allocations) && command.allocations.length <= 30 && command.allocations.every(allocation => {
        if (!object(allocation)) return false;
        keys(allocation, ['cardId', 'count']); return text(allocation.cardId) && integer(allocation.count, 11);
      }), 'Invalid soul allocation.'); break;
    case 'endTurn': case 'undo': case 'requestUndo': keys(command, ['type']); break;
    default: throw new ServerError(400, 'Unknown command.');
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function undoBoundary(room: Room): Room['undoWindow'] {
  if (room.undoWindow !== undefined) return room.undoWindow;
  let window: Room['undoWindow'] = null, depth = 0;
  for (const event of room.audit) {
    if (event.kind === 'command') {
      if (!window || window.player !== event.actor) window = { player: event.actor, floor: depth };
      depth++;
    } else {
      depth = Math.max(0, depth - 1);
      if (window) window.floor = Math.min(window.floor, depth);
    }
  }
  return window;
}
function canUndo(room: Room, actor: PlayerId): boolean {
  const window = undoBoundary(room);
  return !!window && window.player === actor && room.actions.length > window.floor;
}
function snapshot(room: Room, viewer: PlayerId): OnlineSnapshot {
  return { matchId: room.matchId, revision: room.revision, view: viewForPlayer(room.state, viewer), viewer,
    openHands: false, canUndo: canUndo(room, viewer), waitingForOpponent: room.tokenHashes[1] === null,
    undoRequestedBy: room.undoRequestedBy, recentHistory: room.state.history.slice(room.checkpoints.at(-1)?.historyLength ?? 0) };
}

// Credentials are hashed before this synchronous reducer, so persistence never crosses an await.
export function reduceRoom(current: Room | null, request: RoomRequest, randomSource?: () => number): { room: Room; value: RoomValue } {
  if (request.type === 'create') {
    if (current) {
      check(current.matchId === request.matchId && current.tokenHashes[0] === request.tokenHash && current.initial.players[0].name === request.name && (current.inviteHash ?? current.joinReceipt?.inviteHash) === request.inviteHash, 'Not authorized.', 401);
      return { room: current, value: snapshot(current, 0) };
    }
    const state = createGame({ seed: request.seed, names: [validateName(request.name), 'Opponent'] }, randomSource);
    const room: Room = { matchId: request.matchId, revision: 0, tokenHashes: [request.tokenHash, null], inviteHash: request.inviteHash, joinReceipt: null,
      initial: state, state, checkpoints: [], actions: [], audit: [], receipts: [], undoRequestedBy: null, undoWindow: null };
    return { room, value: snapshot(room, 0) };
  }
  check(current, 'Not authorized.', 401);
  if (request.type === 'join') {
    if (current.joinReceipt) {
      check(current.joinReceipt.inviteHash === request.inviteHash && current.joinReceipt.tokenHash === request.tokenHash && current.joinReceipt.name === request.name, 'Not authorized.', 401);
      return { room: current, value: snapshot(current, 1) };
    }
    check(current.inviteHash !== null && current.inviteHash === request.inviteHash && current.tokenHashes[1] === null, 'Not authorized.', 401);
    check(request.tokenHash !== current.tokenHashes[0] && request.tokenHash !== request.inviteHash, 'Use a separate random seat credential.');
    const state = structuredClone(current.state); state.players[1].name = validateName(request.name);
    if (state.turnPlayer === 1) state.history = state.history.map(entry => entry === 'Turn 1: Opponent.' ? `Turn 1: ${state.players[1].name}.` : entry === 'Opponent draws a card.' ? `${state.players[1].name} draws a card.` : entry);
    const room: Room = { ...current, revision: current.revision + 1, tokenHashes: [current.tokenHashes[0], request.tokenHash], inviteHash: null,
      joinReceipt: { inviteHash: request.inviteHash, tokenHash: request.tokenHash, name: state.players[1].name }, state, initial: state };
    return { room, value: snapshot(room, 1) };
  }
  const actor = current.tokenHashes.findIndex(hash => hash !== null && hash === request.tokenHash);
  check(actor === 0 || actor === 1, 'Not authorized.', 401);
  if (current.undoWindow === undefined || current.undoRequestedBy !== null) current = { ...current, undoWindow: undoBoundary(current), undoRequestedBy: null, revision: current.revision + 1 };
  if (request.type === 'snapshot') return { room: current, value: snapshot(current, actor) };
  if (request.type === 'replay') {
    check(current.state.phase === 'finished', 'The replay is available after the match has finished.', 409);
    return { room: current, value: { format: 'yokai1504-replay', version: 1, initial: current.initial, final: current.state,
      actions: current.actions, openHands: false, audit: current.audit } };
  }
  validateAction(request.action);
  const action = request.action, payload = canonical({ actor, ...action });
  const receipt = current.receipts.find(entry => entry.actor === actor && entry.commandId === action.commandId);
  if (receipt) {
    check(receipt.payload === payload, 'This command ID was reused with a different payload.', 409);
    return { room: current, value: snapshot(current, actor) };
  }
  check(action.expectedRevision === current.revision, 'This action has a stale match revision. Refresh and try again.', 409);
  check(current.tokenHashes[1] !== null, 'Wait for your opponent to join.', 409);
  check(current.receipts.length < 10000, 'This match has reached its action limit.', 409);
  let room = { ...current, revision: current.revision + 1 };
  const command = action.command;
  switch (command.type) {
    case 'undo':
    case 'requestUndo': {
      check(canUndo(current, actor), 'Undo is unavailable after the opponent acts or before your own first action.', 409);
      const { historyLength, ...position } = current.checkpoints.at(-1)!;
      room = { ...room, state: { ...position, history: current.state.history.slice(0, historyLength) },
        undoWindow: undoBoundary(current), checkpoints: current.checkpoints.slice(0, -1), actions: current.actions.slice(0, -1), audit: [...current.audit, { kind: 'undo' }] }; break;
    }
    default: {
      check(current.actions.length < 2000 && current.audit.length < 10000, 'This match has reached its action limit.', 409);
      const state = applyCommand(current.state, actor, command);
      const { history, ...position } = current.state;
      const window = undoBoundary(current);
      room = { ...room, state, undoWindow: window?.player === actor ? window : { player: actor, floor: current.actions.length }, checkpoints: [...current.checkpoints, { ...position, historyLength: history.length }],
        actions: [...current.actions, { actor, command }], audit: [...current.audit, { kind: 'command', actor, command }] }; break;
    }
  }
  room.receipts = [...current.receipts, { actor, commandId: action.commandId, payload }];
  return { room, value: snapshot(room, actor) };
}
