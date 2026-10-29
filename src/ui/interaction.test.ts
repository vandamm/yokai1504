import { describe, expect, it } from 'vitest';
import { CARDS } from '../game/catalog';
import { createGame } from '../game/engine';
import { viewForLocalTesting } from '../game/views';
import type { CardDefId, GameView, PlayerId, VisibleCard } from '../game/types';
import { actionUnavailableReason, allocationLimit, canConfirmEffect, decisionCandidates, effectSource, emptyDraft, updateDraft } from './interaction';

function card(id: string, def: CardDefId, controller: PlayerId = 0, souls = 0, zone: VisibleCard['zone'] = 'field'): VisibleCard {
  return { id, def, controller, owner: controller, souls, summonedTurn: 0, zone, definition: CARDS[def], attack: CARDS[def].atk + souls * (def === 'kappa' ? 2 : 1) };
}
function position(): GameView {
  const view = viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
  view.turn = 2;
  for (const player of view.players) { player.field = []; player.hand = []; player.graveyard = []; player.trap = null; }
  return view;
}
function effect(def: CardDefId): GameView {
  const view = position();
  const source = card('source', def, 0, 0, 'graveyard');
  view.players[0].graveyard = [source];
  view.phase = 'effect';
  view.pending = { kind: 'effect', actor: 0, cardId: source.id, source: 'cast', attack: null };
  return view;
}

describe('table drafts', () => {
  it('selects or cancels without changing the original draft', () => {
    const original = emptyDraft();
    const selected = updateDraft(original, { type: 'select', id: 'kappa' });
    expect(selected.selectedId).toBe('kappa');
    expect(original).toEqual(emptyDraft());
    expect(updateDraft(selected, { type: 'select', id: 'kappa' })).toEqual(emptyDraft());
    expect(updateDraft(selected, { type: 'clear' })).toEqual(emptyDraft());
  });
  it('keeps the attacker selected and clears stale choices', () => {
    const draft = { ...emptyDraft(), targets: ['old'], allocations: { old: 2 }, allocationCardId: 'old' };
    expect(updateDraft(draft, { type: 'beginAttack', id: 'attacker' })).toEqual({ ...emptyDraft(), selectedId: 'attacker', attackSourceId: 'attacker' });
  });
  it('preserves source/recipient order and clears the pair if its source is removed', () => {
    let draft = updateDraft(emptyDraft(), { type: 'toggleTarget', id: 'donor', maximum: 2, ordered: true });
    draft = updateDraft(draft, { type: 'toggleTarget', id: 'recipient', maximum: 2, ordered: true });
    expect(draft.targets).toEqual(['donor', 'recipient']);
    expect(updateDraft(draft, { type: 'toggleTarget', id: 'third', maximum: 2 }).targets).toEqual(draft.targets);
    expect(updateDraft(draft, { type: 'toggleTarget', id: 'donor', maximum: 2, ordered: true }).targets).toEqual([]);
    expect(updateDraft(draft, { type: 'toggleTarget', id: 'recipient', maximum: 2, ordered: true }).targets).toEqual(['donor']);
    expect(updateDraft(draft, { type: 'toggleTarget', id: 'donor', maximum: 2 }).targets).toEqual(['recipient']);
  });
  it('replaces a single target and changes allocations independently', () => {
    let draft = updateDraft(emptyDraft(), { type: 'toggleTarget', id: 'first' });
    draft = updateDraft(draft, { type: 'toggleTarget', id: 'second' });
    expect(draft.targets).toEqual(['second']);
    draft = updateDraft(draft, { type: 'setAllocation', id: 'first', count: 2 });
    draft = updateDraft(draft, { type: 'selectAllocation', id: 'second' });
    expect(draft.allocations).toEqual({ first: 2 });
    expect(draft.allocationCardId).toBe('second');
    expect(updateDraft(draft, { type: 'setAllocation', id: 'first', count: 0 }).allocations).toEqual({});
    expect(draft.targets).toEqual(['second']);
  });
});

describe('direct decision candidates', () => {
  it('targets opposing controlled cards, even when original owners differ', () => {
    const view = position();
    const attacker = card('attacker', 'kappa');
    const target = { ...card('target', 'nekomata', 1), owner: 0 as const };
    view.players[0].field = [attacker]; view.players[1].field = [target];
    const draft = updateDraft(emptyDraft(), { type: 'beginAttack', id: attacker.id });
    expect(decisionCandidates(view, draft).cards).toEqual([target]);
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([]);
  });
  it('does not expose attack candidates after an actor change', () => {
    const view = position(); view.players[0].field = [card('attacker', 'kappa')];
    view.decisionPlayer = 1;
    const draft = updateDraft(emptyDraft(), { type: 'beginAttack', id: 'attacker' });
    expect(decisionCandidates(view, draft).cards).toEqual([]);
  });
  it('offers Sake only legal field receivers and respects pool, three-soul limit and capacity', () => {
    const view = effect('sake'); view.supply = 2;
    const nearFull = card('near-full', 'kappa', 0, 2);
    const free = card('free', 'nekomata', 1);
    const immune = card('immune', 'zashiki-warashi', 1, 1);
    const full = card('full', 'nurikabe', 0, 1);
    view.players[0].field = [nearFull, full]; view.players[1].field = [free, immune];
    let draft = emptyDraft();
    expect(decisionCandidates(view, draft).cards).toEqual([nearFull, free]);
    expect(allocationLimit(view, draft, nearFull.id)).toBe(1);
    expect(allocationLimit(view, draft, free.id)).toBe(2);
    expect(allocationLimit(view, draft, immune.id)).toBe(0);
    draft = updateDraft(draft, { type: 'setAllocation', id: free.id, count: 2 });
    expect(decisionCandidates(view, draft).cards).toEqual([free]);
    expect(allocationLimit(view, draft, nearFull.id)).toBe(0);
    view.supply = 11;
    expect(allocationLimit(view, emptyDraft(), free.id)).toBe(3);
  });
  it('allows Sake to equip a previously unprotected Zashiki and to resolve with zero allocations', () => {
    const view = effect('sake'); view.supply = 0;
    const zashiki = card('zashiki', 'zashiki-warashi'); view.players[0].field = [zashiki];
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([]);
    expect(canConfirmEffect(view, emptyDraft())).toBe(true);
    view.supply = 1;
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([zashiki]);
  });
  it('limits Ougi donors to those with a soul and a distinct eligible recipient', () => {
    const view = effect('ougi');
    const donor = card('donor', 'kappa', 0, 1), recipient = card('recipient', 'nekomata', 1), immune = card('immune', 'zashiki-warashi', 1, 1);
    view.players[0].field = [donor]; view.players[1].field = [recipient, immune];
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([donor]);
    const draft = updateDraft(emptyDraft(), { type: 'toggleTarget', id: donor.id, maximum: 2 });
    expect(decisionCandidates(view, draft).cards).toEqual([donor, recipient]);
    view.players[1].field = [immune];
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([]);
  });
  it('validates the complete Ougi pair before confirmation', () => {
    const view = effect('ougi'); const donor = card('donor', 'kappa', 0, 1), recipient = card('recipient', 'nekomata', 1);
    view.players[0].field = [donor]; view.players[1].field = [recipient];
    expect(canConfirmEffect(view, { ...emptyDraft(), targets: [donor.id] })).toBe(false);
    expect(canConfirmEffect(view, { ...emptyDraft(), targets: [recipient.id, donor.id] })).toBe(false);
    expect(canConfirmEffect(view, { ...emptyDraft(), targets: [donor.id, recipient.id] })).toBe(true);
    expect(canConfirmEffect(view, { ...emptyDraft(), targets: [donor.id, donor.id] })).toBe(false);
  });
  it('allows zero to two Jufu targets and excludes immune or soul-free cards', () => {
    const view = effect('jufu');
    const a = card('a', 'kappa', 0, 1), b = card('b', 'nekomata', 1, 1), c = card('c', 'tengu', 1, 1);
    view.players[0].field = [a, card('empty', 'nurikabe')]; view.players[1].field = [b, c, card('immune', 'zashiki-warashi', 1, 1)];
    expect(decisionCandidates(view, emptyDraft())).toMatchObject({ cards: [a, b, c], minimum: 0, maximum: 2 });
    expect(canConfirmEffect(view, emptyDraft())).toBe(true);
    const draft = { ...emptyDraft(), targets: [a.id, b.id] };
    expect(decisionCandidates(view, draft).cards).toEqual([a, b]);
    expect(canConfirmEffect(view, { ...draft, targets: [a.id, b.id, c.id] })).toBe(false);
  });
  it('preserves graveyard owners and filters Boseki spells', () => {
    const view = effect('boseki'); const own = card('own', 'kappa', 0, 0, 'graveyard'), rival = card('rival', 'tengu', 1, 0, 'graveyard');
    view.players[0].graveyard.push(own); view.players[1].graveyard = [rival, card('spell', 'sake', 1, 0, 'graveyard')];
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([own, rival]);
    expect(effectSource(view)?.def).toBe('boseki');
    view.players[0].field = [card('a', 'kappa'), card('b', 'tengu'), card('c', 'nurikabe')];
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([]);
  });
  it('represents hidden Karakasa targets only by public seat tokens', () => {
    const view = effect('karakasa-kozo'); const visible = card('known-trap', 'jufu', 0, 0, 'trap');
    view.pending = { kind: 'effect', actor: 0, source: 'release', cardId: 'source', attack: null };
    view.players[0].trap = visible; view.players[1].trap = { hidden: true };
    expect(decisionCandidates(view, emptyDraft())).toMatchObject({ cards: [visible], hiddenTrapSeats: [1] });
    expect(canConfirmEffect(view, { ...emptyDraft(), targets: ['trap:1'] })).toBe(true);
    expect(canConfirmEffect(view, { ...emptyDraft(), targets: ['secret-instance'] })).toBe(false);
  });
  it('computes Hamaya maximum before excluding immune Zashiki', () => {
    const view = effect('hamaya');
    const immune = { ...card('immune', 'zashiki-warashi', 1, 2), attack: 9 };
    view.players[0].field = [card('lower', 'kappa')]; view.players[1].field = [immune];
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([]);
    view.players[0].field.push({ ...card('tie', 'tengu'), attack: 9 });
    expect(decisionCandidates(view, emptyDraft()).cards.map(c => c.id)).toEqual(['tie']);
  });
  it('offers opposing Nekomata targets without applying spell immunity to its release', () => {
    const view = effect('nekomata'); view.pending = { kind: 'effect', actor: 0, source: 'release', cardId: 'source', attack: null };
    const protectedRival = card('rival', 'zashiki-warashi', 1, 1); view.players[1].field = [protectedRival];
    expect(decisionCandidates(view, emptyDraft()).cards).toEqual([protectedRival]);
  });
});

describe('unavailable action explanations', () => {
  it('retains free trap-setting after both main actions are spent', () => {
    const view = position(); view.actionsUsed = 2; const spell = card('spell', 'sake', 0, 0, 'hand'); view.players[0].hand = [spell];
    expect(actionUnavailableReason(view, spell, 'play')).toMatch(/both/i);
    expect(actionUnavailableReason(view, spell, 'setTrap')).toBeUndefined();
  });
  it('explains full field, empty Supply, soul capacity and unavailable release targets', () => {
    const view = position(), hand = card('hand', 'kappa', 0, 0, 'hand'); view.players[0].hand = [hand];
    const full = card('full', 'nurikabe', 0, 1); const release = card('release', 'karakasa-kozo', 0, 1);
    view.players[0].field = [full, release, card('third', 'nekomata')];
    expect(actionUnavailableReason(view, hand, 'play')).toMatch(/three/i);
    expect(actionUnavailableReason(view, full, 'evoke')).toMatch(/capacity/i);
    view.supply = 0;
    expect(actionUnavailableReason(view, release, 'evoke')).toMatch(/Supply/i);
    expect(actionUnavailableReason(view, release, 'release')).toMatch(/trap/i);
    view.players[1].trap = { hidden: true };
    expect(actionUnavailableReason(view, release, 'release')).toBeUndefined();
  });
  it('explains first-turn and Nurikabe attack restrictions for any controlled attacker', () => {
    const view = position(); const attacker = { ...card('attack', 'kappa'), owner: 1 as const }; view.players[0].field = [attacker];
    view.turn = 1; expect(actionUnavailableReason(view, attacker, 'attack')).toMatch(/first turn/i);
    view.turn = 2; view.players[0].field.push({ ...card('wall', 'nurikabe'), summonedTurn: 2 });
    expect(actionUnavailableReason(view, attacker, 'attack')).toMatch(/Nurikabe/i);
    view.players[0].field[1].summonedTurn = 1;
    expect(actionUnavailableReason(view, attacker, 'attack')).toBeUndefined();
  });
  it('does not grant actions for opponent cards in open-hands mode', () => {
    const view = position(); const rival = card('rival', 'kappa', 1, 0, 'hand'); view.players[1].hand = [rival];
    expect(actionUnavailableReason(view, rival, 'play')).toMatch(/other player/i);
    view.phase = 'effect';
    expect(actionUnavailableReason(view, rival, 'play')).toMatch(/pending/i);
  });
});
