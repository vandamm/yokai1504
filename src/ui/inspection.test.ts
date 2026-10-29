import { describe, expect, it } from 'vitest';
import { CARDS } from '../game/catalog';
import { createGame } from '../game/engine';
import { viewForPlayer } from '../game/views';
import type { VisibleCard } from '../game/types';
import { allVisible } from './interaction';
import { inspectionLabel } from './inspection';

function position() {
  const view = viewForPlayer(createGame({ seed: 45, names: ['Dawn', 'Dusk'], startingPlayer: 0 }), 0);
  for (const player of view.players) { player.field = []; player.hand = []; player.graveyard = []; player.trap = null; }
  return view;
}

function kappa(id: string, souls = 0): VisibleCard {
  return { id, def: 'kappa', owner: 0, controller: 0, zone: 'field', souls, summonedTurn: 0, definition: CARDS.kappa, attack: 2 + 2 * souls };
}

describe('inspection labels', () => {
  it('distinguishes same-name yokai by slot and current attack/souls', () => {
    const view = position();
    const strong = kappa('strong', 2), base = { ...kappa('base'), owner: 1 as const };
    view.players[0].field = [strong, base];
    expect(inspectionLabel(view, strong)).toBe('Dawn · Kappa · field slot 1 · ATK 6 · souls 2/3');
    expect(inspectionLabel(view, base)).toBe('Dawn · Kappa · field slot 2 · ATK 2 · souls 0/3');
  });

  it('keeps identical cards distinguishable when their live stats match', () => {
    const view = position();
    const first = kappa('first'), second = { ...kappa('second'), owner: 1 as const };
    view.players[0].field = [first, second];
    expect(inspectionLabel(view, first)).not.toBe(inspectionLabel(view, second));
    view.players[0].field.reverse();
    expect(inspectionLabel(view, first)).toContain('field slot 2');
    expect(inspectionLabel(view, second)).toContain('field slot 1');
  });

  it('uses the current controller and their field slot after an exchange', () => {
    const view = position();
    const exchanged = { ...kappa('exchanged', 1), controller: 1 as const };
    view.players[1].field = [exchanged];
    expect(inspectionLabel(view, exchanged)).toBe('Dusk · Kappa · field slot 1 · ATK 4 · souls 1/3');
  });

  it('retains short owner/name/zone labels outside the field without changing state', () => {
    const view = position();
    const hand = { ...kappa('hand'), zone: 'hand' as const }, grave = { ...kappa('grave'), zone: 'graveyard' as const };
    view.players[0].hand = [hand]; view.players[0].graveyard = [grave];
    const before = structuredClone(view);
    expect(inspectionLabel(view, hand)).toBe('Dawn · Kappa · hand');
    expect(inspectionLabel(view, grave)).toBe('Dawn · Kappa · graveyard');
    expect(view).toEqual(before);
  });

  it('labels only projected visible cards, leaving hidden hand and trap identities absent', () => {
    const view = position(), visible = kappa('public');
    view.players[0].field = [visible];
    view.players[1].hand = null;
    view.players[1].trap = { hidden: true };
    expect(allVisible(view).map(card => inspectionLabel(view, card))).toEqual(['Dawn · Kappa · field slot 1 · ATK 2 · souls 0/3']);
  });
});
