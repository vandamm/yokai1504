import { expect, it } from 'vitest';
import { LocalSession } from '../session/local';
import { reduceRoom, validateAction, validateName, type RoomRequest } from './server';
import type { CardDefId, GameCommand, GameState, PlayerId } from '../game/types';
import type { OnlineCommand } from './protocol';

const host = 'host-hash', guest = 'guest-hash';
function setup() {
  let room = reduceRoom(null, { type: 'create', matchId: 'room', name: 'Host', tokenHash: host, inviteHash: 'invite-hash', seed: 42 }).room;
  const send = (request: RoomRequest) => { const result = reduceRoom(room, request); room = result.room; return result.value; };
  const join = () => send({ type: 'join', name: 'Guest', inviteHash: 'invite-hash', tokenHash: guest });
  const command = (tokenHash: string, type: 'endTurn' | 'undo' | 'requestUndo', id = `id-${room!.revision}`, revision = room!.revision) => send({ type: 'command', tokenHash, action: { commandId: id, expectedRevision: revision, command: { type } as OnlineCommand } });
  return { send, join, command, get room() { return room!; } };
}

it('keeps seats fixed, hides all opponent cards and blocks play before the one-use join', () => {
  const game = setup();
  const before = game.send({ type: 'snapshot', tokenHash: host }) as any;
  expect(before.viewer).toBe(0); expect(before.waitingForOpponent).toBe(true);
  expect(before.view.players[1].hand).toBeNull(); expect(JSON.stringify(before)).not.toContain('"deck":');
  expect(() => game.command(host, 'endTurn')).toThrow(/opponent/);
  game.join();
  expect(() => game.join()).not.toThrow();
  expect(() => game.send({ type: 'join', name: 'Stranger', inviteHash: 'invite-hash', tokenHash: 'another-guest' })).toThrow(/authorized/);
  const view = game.send({ type: 'snapshot', tokenHash: guest }) as any;
  expect(view.viewer).toBe(1); expect(view.view.players[0].hand).toBeNull();
  expect(view.view.players[1].hand).toHaveLength(game.room.state.players[1].hand.length); expect(view.waitingForOpponent).toBe(false);
  expect(JSON.stringify(view)).not.toMatch(/tokenHash|inviteHash|checkpoints|receipts/);
  expect(() => game.send({ type: 'snapshot', tokenHash: 'invite-hash' })).toThrow(/authorized/);
  expect(() => reduceRoom(null, { type: 'snapshot', tokenHash: host })).toThrow(/authorized/);
});

it('recovers creation and join response loss with independent chosen credentials', () => {
  const game = setup(), create: RoomRequest = { type: 'create', matchId: 'room', name: 'Host', tokenHash: host, inviteHash: 'invite-hash', seed: 999 };
  expect(reduceRoom(game.room, create).room).toBe(game.room);
  expect(() => reduceRoom(game.room, { ...create, tokenHash: 'another-host' })).toThrow(/authorized/);
  const join: RoomRequest = { type: 'join', name: 'Guest', inviteHash: 'invite-hash', tokenHash: guest };
  game.send(join); const persisted = JSON.parse(JSON.stringify(game.room));
  expect(reduceRoom(persisted, join).room).toBe(persisted);
  expect(reduceRoom(persisted, create).room).toBe(persisted);
  expect(() => reduceRoom(persisted, { ...join, name: 'Different' })).toThrow(/authorized/);
  expect(game.room.inviteHash).toBeNull();
});

it('names the guest starter in initial history without changing a host named Opponent', () => {
  for (let seed = 0; seed < 10; seed++) {
    const created = reduceRoom(null, { type: 'create', matchId: 'room', name: 'Opponent', tokenHash: host, inviteHash: 'invite-hash', seed });
    const joined = reduceRoom(created.room, { type: 'join', name: 'Guest', tokenHash: guest, inviteHash: 'invite-hash' }).room;
    const starter = joined.state.turnPlayer === 1 ? 'Guest' : 'Opponent';
    expect(joined.state.history).toContain(`Turn 1: ${starter}.`);
    expect(joined.state.history).toContain(`${starter} draws a card.`);
    expect(joined.initial).toEqual(joined.state); expect(joined.state.players[0].name).toBe('Opponent');
  }
});

it('authenticates actors and rejects invalid or stale commands without changing the position', () => {
  const game = setup(); game.join(); const before = JSON.stringify(game.room);
  const wrong = game.room.state.decisionPlayer === 0 ? guest : host;
  expect(() => game.command(wrong, 'endTurn')).toThrow();
  expect(() => game.command(host, 'endTurn', 'stale', 0)).toThrow(/revision/);
  expect(() => game.command('invalid', 'endTurn')).toThrow(/authorized/);
  expect(JSON.stringify(game.room)).toBe(before);
  const token = game.room.state.decisionPlayer === 0 ? host : guest;
  game.command(token, 'endTurn'); expect(game.room.state.turn).toBe(2);
});

it('persists receipts across reload and accepts identical retries while rejecting changed payloads', () => {
  const game = setup(); game.join(); const actor = game.room.state.decisionPlayer === 0 ? host : guest;
  const request: RoomRequest = { type: 'command', tokenHash: actor, action: { commandId: 'retry', expectedRevision: game.room.revision, command: { type: 'endTurn' } } };
  game.send(request); const saved = JSON.stringify(game.room);
  const retry = reduceRoom(JSON.parse(saved), request);
  expect(JSON.stringify(retry.room)).toBe(saved);
  expect(() => reduceRoom(game.room, { ...request, action: { ...request.action as any, command: { type: 'requestUndo' } } })).toThrow(/reused/);
});

function relocate(state: GameState, owner: PlayerId, def: CardDefId, zone: 'field' | 'trap' | 'graveyard') {
  const card = Object.values(state.cards).find(card => card.owner === owner && card.def === def)!;
  const player = state.players[owner];
  player.hand = player.hand.filter(id => id !== card.id); player.deck = player.deck.filter(id => id !== card.id);
  if (zone === 'trap') player.trap = card.id; else player[zone].push(card.id);
  return card.id;
}
it.each(['trap', 'effect', 'turnEnd'] as const)('enforces the authenticated decision seat during %s', phase => {
  const game = setup(); game.join(); const state = game.room.state;
  state.turn = 3; state.turnPlayer = 0; state.phase = phase; state.decisionPlayer = phase === 'turnEnd' ? 0 : 1;
  let command: GameCommand = { type: 'endTurn' };
  if (phase === 'trap') {
    const attacker = relocate(state, 0, 'kappa', 'field'); relocate(state, 1, 'sake', 'trap');
    state.pending = { kind: 'trap', actor: 1, attacker, target: null }; command = { type: 'respond', activate: false };
  }
  if (phase === 'effect') {
    const cardId = relocate(state, 1, 'sake', 'graveyard'), target = relocate(state, 1, 'kappa', 'field');
    state.pending = { kind: 'effect', actor: 1, cardId, source: 'cast', attack: null };
    command = { type: 'choose', allocations: [{ cardId: target, count: 1 }] };
  }
  const action = { commandId: 'phase-action', expectedRevision: game.room.revision, command };
  const wrong = state.decisionPlayer === 0 ? guest : host, right = state.decisionPlayer === 0 ? host : guest;
  const before = JSON.stringify(game.room);
  expect(() => game.send({ type: 'command', tokenHash: wrong, action })).toThrow(/other player/);
  expect(JSON.stringify(game.room)).toBe(before);
  game.send({ type: 'command', tokenHash: right, action }); expect(game.room.revision).toBe(action.expectedRevision + 1);
});

function act(game: ReturnType<typeof setup>, actor: PlayerId, command: GameCommand) {
  return game.send({ type: 'command', tokenHash: actor === 0 ? host : guest, action: { commandId: `move-${game.room.revision}`, expectedRevision: game.room.revision, command } });
}

it('projects the post-Ougi battle frame privately to both seats and clears it on Undo', () => {
  const game = setup(); game.join(); const state = game.room.state;
  state.turn = 3; state.turnPlayer = state.decisionPlayer = 0;
  const yuki = relocate(state, 0, 'yuki-onna', 'field'), kappa = relocate(state, 1, 'kappa', 'field');
  state.cards[yuki].souls = 2; state.supply -= 2; relocate(state, 1, 'ougi', 'trap');
  act(game, 0, { type: 'attack', attacker: yuki, target: kappa });
  act(game, 1, { type: 'respond', activate: true });
  act(game, 1, { type: 'choose', targets: [yuki, kappa] });
  for (const viewer of [0, 1] as const) {
    const snapshot = game.send({ type: 'snapshot', tokenHash: viewer === 0 ? host : guest }) as any;
    expect(snapshot.battleView.players[0].field[0]).toMatchObject({ id: yuki, souls: 1, attack: 4 });
    expect(snapshot.battleView.players[1].field[0]).toMatchObject({ id: kappa, souls: 1, attack: 4 });
    expect(snapshot.view.players[1].field).toEqual([]);
    expect(snapshot.battleView.players[viewer].hand).not.toBeNull();
    expect(snapshot.battleView.players[viewer === 0 ? 1 : 0].hand).toBeNull();
    const serialized = JSON.stringify(snapshot.battleView);
    expect(serialized).not.toMatch(/"deck":|tokenHash|checkpoints/);
    for (const id of game.room.state.players[viewer === 0 ? 1 : 0].hand) expect(serialized).not.toContain(id);
  }
  const reloaded = reduceRoom(JSON.parse(JSON.stringify(game.room)), { type: 'snapshot', tokenHash: host }).value as any;
  expect(reloaded.battleView.players[1].field[0].attack).toBe(4);
  game.command(guest, 'undo');
  expect((game.send({ type: 'snapshot', tokenHash: host }) as any).battleView).toBeUndefined();
});
function canUndo(game: ReturnType<typeof setup>, actor: PlayerId) {
  return (game.send({ type: 'snapshot', tokenHash: actor === 0 ? host : guest }) as any).canUndo;
}
function playYokai(game: ReturnType<typeof setup>, actor: PlayerId) {
  const id = game.room.state.players[actor].hand.find(id => !['sake','jufu','boseki','ougi','hamaya','kozuchi'].includes(game.room.state.cards[id].def))!;
  expect(id).toBeTruthy(); act(game, actor, { type: 'play', cardId: id }); return id;
}

it('undoes own actions immediately, repeatedly, without a consent state', () => {
  const game = setup(); game.join(); const initial = structuredClone(game.room.state), actor = initial.decisionPlayer;
  const token = actor === 0 ? host : guest, id = playYokai(game, actor);
  act(game, actor, { type: 'evoke', cardId: id });
  expect(canUndo(game, actor)).toBe(true); expect(canUndo(game, actor === 0 ? 1 : 0)).toBe(false);
  game.command(token, 'undo'); expect(game.room.state.cards[id].souls).toBe(0);
  game.command(token, 'undo'); expect(game.room.state).toEqual(initial);
  expect(game.room.undoRequestedBy).toBeNull(); expect(canUndo(game, actor)).toBe(false);
  expect(() => game.command(token, 'undo')).toThrow(/undo/i);
});

it('allows undoing End turn and earlier own actions before the opponent acts', () => {
  const game = setup(); game.join(); const initial = structuredClone(game.room.state), actor = initial.decisionPlayer, token = actor === 0 ? host : guest;
  playYokai(game, actor); game.command(token, 'endTurn');
  const next = game.room.state.decisionPlayer;
  expect(canUndo(game, actor)).toBe(true); expect(canUndo(game, next)).toBe(false);
  expect(() => act(game, next, { type: 'evoke', cardId: 'missing' })).toThrow();
  expect(canUndo(game, actor)).toBe(true);
  game.command(token, 'undo'); expect(game.room.state.turn).toBe(initial.turn);
  game.command(token, 'undo'); expect(game.room.state).toEqual(initial);
});

it('permanently closes the prior player window after the opponent first acts, even if that action is undone', () => {
  const game = setup(); game.join(); const first = game.room.state.decisionPlayer, second = first === 0 ? 1 : 0;
  game.command(first === 0 ? host : guest, 'endTurn');
  const beginning = structuredClone(game.room.state); playYokai(game, second);
  expect(canUndo(game, first)).toBe(false); expect(canUndo(game, second)).toBe(true);
  expect(() => game.command(first === 0 ? host : guest, 'undo')).toThrow(/undo/i);
  game.command(second === 0 ? host : guest, 'undo'); expect(game.room.state).toEqual(beginning);
  expect(canUndo(game, first)).toBe(false); expect(canUndo(game, second)).toBe(false);
  expect(() => game.command(second === 0 ? host : guest, 'undo')).toThrow(/undo/i);
});

it('resolves the first-opponent-action versus undo race by revision, without changing rejected positions', () => {
  const game = setup(); game.join(); const first = game.room.state.decisionPlayer, second = first === 0 ? 1 : 0;
  game.command(first === 0 ? host : guest, 'endTurn'); const revision = game.room.revision;
  game.command(second === 0 ? host : guest, 'endTurn'); const saved = JSON.stringify(game.room);
  expect(() => game.command(first === 0 ? host : guest, 'undo', 'race', revision)).toThrow(/revision/);
  expect(JSON.stringify(game.room)).toBe(saved);
  game.command(second === 0 ? host : guest, 'undo');
  const retry: RoomRequest = { type: 'command', tokenHash: second === 0 ? host : guest, action: {commandId:`id-${revision + 1}`,expectedRevision:revision + 1,command:{type:'undo'}} };
  const persisted = JSON.parse(JSON.stringify(game.room));
  expect(reduceRoom(persisted, retry).room).toBe(persisted);
  expect((reduceRoom(persisted, {type:'snapshot',tokenHash:first === 0 ? host : guest}).value as any).canUndo).toBe(false);
});

it('treats a trap response as an opponent action and never undoes the opponent’s choices', () => {
  const game = setup(); game.join(); const state = game.room.state;
  state.turn = 3; state.turnPlayer = state.decisionPlayer = 0;
  const attacker = relocate(state,0,'kappa','field'); relocate(state,1,'sake','trap');
  act(game,0,{type:'attack',attacker,target:null}); expect(canUndo(game,0)).toBe(true);
  act(game,1,{type:'respond',activate:true}); expect(canUndo(game,0)).toBe(false); expect(canUndo(game,1)).toBe(true);
  game.command(guest,'undo'); expect(game.room.state.phase).toBe('trap');
  expect(canUndo(game,0)).toBe(false); expect(canUndo(game,1)).toBe(false);
});

it('upgrades existing rooms and clears obsolete approval prompts without losing game state', () => {
  const game = setup(); game.join(); const actor = game.room.state.decisionPlayer;
  game.command(actor === 0 ? host : guest,'endTurn');
  const old = JSON.parse(JSON.stringify(game.room)); delete old.undoWindow; old.undoRequestedBy = actor;
  const result = reduceRoom(old,{type:'snapshot',tokenHash:actor === 0 ? host : guest});
  expect(result.room.state).toEqual(old.state); expect(result.room.revision).toBe(old.revision + 1);
  expect((result.value as any).undoRequestedBy).toBeNull(); expect((result.value as any).canUndo).toBe(true);
  const undone = reduceRoom(result.room,{type:'command',tokenHash:actor === 0 ? host : guest,action:{commandId:'old-client',expectedRevision:result.room.revision,command:{type:'requestUndo'}}});
  expect(undone.room.state.turn).toBe(1); expect(undone.room.undoRequestedBy).toBeNull();
});

it('exports only a finished, authenticated replay that the local session can import after undo', async () => {
  const game = setup(); game.join();
  expect(() => game.send({ type: 'replay', tokenHash: host })).toThrow(/finished/);
  const actor = game.room.state.decisionPlayer === 0 ? host : guest;
  game.command(actor, 'endTurn'); game.command(actor, 'undo');
  for (let i = 0; !game.room.state.result && i < 100; i++) game.command(game.room.state.decisionPlayer === 0 ? host : guest, 'endTurn');
  expect(game.room.state.phase).toBe('finished');
  expect(() => game.send({ type: 'replay', tokenHash: 'bad' })).toThrow(/authorized/);
  const file = game.send({ type: 'replay', tokenHash: guest });
  let saved: string | null = null;
  const session = new LocalSession({ getItem: () => saved, setItem: (_key, raw) => { saved = raw; } });
  const snapshot = await session.importReplay(JSON.stringify(file));
  expect(snapshot.view.result).toEqual(game.room.state.result);
  expect((file as any).audit.some((event: any) => event.kind === 'undo')).toBe(true);
});

it('strictly bounds and validates every untrusted action and name', () => {
  expect(validateName(' Host ')).toBe('Host');
  for (const name of ['', 'x'.repeat(25), 'a\nb', 42]) expect(() => validateName(name)).toThrow();
  const action = { commandId: 'id', expectedRevision: 0, command: { type: 'endTurn' } };
  expect(() => validateAction(action)).not.toThrow();
  for (const bad of [null, { ...action, actor: 0 }, { ...action, expectedRevision: -1 }, { ...action, commandId: 'x'.repeat(129) }, { ...action, command: { type: 'endTurn', actor: 1 } }, { ...action, command: { type: 'choose', targets: Array(31).fill('id') } }, { ...action, command: { type: 'choose', allocations: [{ cardId: 'id', count: 12 }] } }]) expect(() => validateAction(bad)).toThrow();
});

function finish(game: ReturnType<typeof setup>) {
  for (let i=0; !game.room.state.result && i<100; i++) game.command(game.room.state.decisionPlayer === 0 ? host : guest,'endTurn');
  expect(game.room.state.phase).toBe('finished');
}
it('finalizes an authenticated finished-game export once and permanently closes both Undo windows', () => {
  const game=setup(); game.join(); const before=JSON.stringify(game.room);
  expect(() => game.send({type:'replay',tokenHash:host})).toThrow(/finished/);
  expect(JSON.stringify(game.room)).toBe(before);
  finish(game); const owner=game.room.actions.at(-1)!.actor, token=owner===0?host:guest;
  expect(canUndo(game,owner)).toBe(true);
  game.command(token,'undo'); expect(game.room.state.result).toBeNull(); finish(game);
  const revision=game.room.revision, terminal=structuredClone(game.room.state);
  const unauthorized=JSON.stringify(game.room);
  expect(() => game.send({type:'replay',tokenHash:'wrong'})).toThrow(/authorized/);
  expect(JSON.stringify(game.room)).toBe(unauthorized);
  const file=game.send({type:'replay',tokenHash:owner===0?guest:host});
  expect(game.room.finalized).toBe(true); expect(game.room.revision).toBe(revision+1);
  expect(game.room.state).toEqual(terminal);
  for(const seat of [0,1] as const) expect(canUndo(game,seat)).toBe(false);
  expect(() => game.command(token,'undo')).toThrow(/finalized/i);
  expect(() => game.command(token,'requestUndo')).toThrow(/finalized/i);
  const persisted=JSON.parse(JSON.stringify(game.room));
  const repeated=reduceRoom(persisted,{type:'replay',tokenHash:host});
  expect(repeated.room).toBe(persisted); expect(repeated.value).toEqual(file);
  expect((reduceRoom(persisted,{type:'snapshot',tokenHash:guest}).value as any).finalized).toBe(true);
});
it('serializes export versus final-action Undo so an undone result never exposes a replay', () => {
  const game=setup(); game.join(); finish(game);
  const token=game.room.actions.at(-1)!.actor===0?host:guest;
  const undo:RoomRequest={type:'command',tokenHash:token,action:{commandId:'race-undo',expectedRevision:game.room.revision,command:{type:'undo'}}};
  const finished=JSON.parse(JSON.stringify(game.room));
  const exported=reduceRoom(finished,{type:'replay',tokenHash:host}).room;
  expect(() => reduceRoom(exported,undo)).toThrow(/revision/);
  const undone=reduceRoom(finished,undo).room;
  expect(undone.state.result).toBeNull();
  expect(() => reduceRoom(undone,{type:'replay',tokenHash:guest})).toThrow(/finished/);
  expect(undone.finalized).not.toBe(true);
});
