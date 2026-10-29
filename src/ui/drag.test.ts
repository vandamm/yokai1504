import { expect, it } from 'vitest';
import { createGame } from '../game/engine';
import { viewForLocalTesting } from '../game/views';
import { emptyDraft } from './interaction';
import { resolveDrop } from './drag';
const view = () => { const v = viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 })); v.turn = 3; return v; };
it('maps a hand yokai to its field and spells only to Play or Set trap', () => {
  const v = view(), yokai = v.players[0].hand!.find(c => c.definition.kind === 'yokai')!, spell = v.players[0].hand!.find(c => c.definition.kind === 'spell')!;
  expect(resolveDrop(v, emptyDraft(), yokai.id, 'field:0').command).toEqual({ type: 'play', cardId: yokai.id });
  expect(resolveDrop(v, emptyDraft(), yokai.id, 'field:1').command).toBeUndefined();
  expect(resolveDrop(v, emptyDraft(), spell.id, 'trap:0').command).toEqual({ type: 'setTrap', cardId: spell.id });
  expect(resolveDrop(v, emptyDraft(), spell.id, 'play').command).toEqual({ type: 'play', cardId: spell.id });
});
it('rejects opponent cards, full fields, no actions, and invalid targets', () => {
  const v = view(), c = v.players[0].hand!.find(c => c.definition.kind === 'yokai')!;
  v.actionsUsed = 2; expect(resolveDrop(v, emptyDraft(), c.id, 'field:0').command).toBeUndefined();
  expect(resolveDrop(v, emptyDraft(), v.players[1].hand![0].id, 'field:0').command).toBeUndefined();
});
it('declares attacks by dropping a field yokai on a defender or an empty-field player', () => {
  const v = view(), a = v.players[0].hand![0], b = v.players[1].hand![0]; a.zone = b.zone = 'field'; v.players[0].field = [a]; v.players[1].field = [b];
  expect(resolveDrop(v, emptyDraft(), a.id, b.id).command).toEqual({ type: 'attack', attacker: a.id, target: b.id });
  expect(resolveDrop(v, emptyDraft(), a.id, 'player:1').command).toBeUndefined();
  v.players[1].field = []; expect(resolveDrop(v, emptyDraft(), a.id, 'player:1').command).toEqual({ type: 'attack', attacker: a.id, target: null });
  v.phase = 'turnEnd'; expect(resolveDrop(v, emptyDraft(), a.id, 'player:1').command).toBeUndefined();
});
