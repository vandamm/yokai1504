import { expect, it, vi } from 'vitest';
import { CARDS } from '../game/catalog';
import { createGame } from '../game/engine';
import { viewForLocalTesting } from '../game/views';
import type { CardDefId, VisibleCard } from '../game/types';
import { attackArrowPath, contactTravel, forecastAttack, animateAttack } from './combat';

const card = (def: CardDefId, attack: number, souls = 0, owner: 0 | 1 = 0): VisibleCard => ({ id: `${owner}-${def}`, def, attack, souls, owner, controller: owner, zone: 'field', summonedTurn: 1, definition: CARDS[def] });
const view = () => viewForLocalTesting(createGame({ seed: 42, startingPlayer: 0 }));

it('predicts lethal attacks, ties, both soul shields and retaliation without marking survivors', () => {
  const game = view();
  expect(forecastAttack(game, card('kappa', 8), card('tengu', 6, 0, 1))).toMatchObject({ attackerDies: false, targetDies: true, opponentDamage: 2, ownDamage: 0 });
  expect(forecastAttack(game, card('kappa', 6), card('tengu', 6, 0, 1))).toMatchObject({ attackerDies: true, targetDies: true, opponentDamage: 0 });
  expect(forecastAttack(game, card('yuki-onna', 4, 1), card('tengu', 6, 0, 1))).toMatchObject({ attackerDies: false, targetDies: false, ownDamage: 2 });
  expect(forecastAttack(game, card('kappa', 8), card('yuki-onna', 5, 2, 1))).toMatchObject({ targetDies: false, opponentDamage: 3 });
  expect(forecastAttack(game, card('kappa', 8), card('chochin-kozo', 4, 1, 1))).toMatchObject({ attackerDies: true, targetDies: true, opponentDamage: 4 });
});
it('predicts direct damage and warns about a trap without inspecting its hidden definition', () => {
  const game = view(); game.players[1].trap = { hidden: true };
  expect(forecastAttack(game, card('kappa', 8), null)).toMatchObject({ targetDies: false, attackerDies: false, opponentDamage: 8, trapRisk: true, opponent: 1 });
});
it('does not resolve retaliation after lethal health damage and includes known empty-deck Rokurokubi damage', () => {
  const game = view(); game.players[1].health = 4;
  expect(forecastAttack(game, card('kappa', 8), card('chochin-kozo', 4, 1, 1)).attackerDies).toBe(false);
  game.players[1].health = 15; game.players[0].deckCount = 0;
  expect(forecastAttack(game, card('rokurokubi', 7, 1), card('tengu', 6, 0, 1)).opponentDamage).toBe(2);
});
it('stops at shallow card contact for vertical and diagonal attacks on phone and desktop', () => {
  for (const width of [70, 90, 160]) for (const x of [0, 110, 220]) {
    const height = width * 947 / 640;
    const from = { x: 0, y: 500, width, height }, to = { x, y: 70, width, height };
    const shift = contactTravel(from, to);
    const overlapX = Math.min(from.x + width + shift.x, to.x + width) - Math.max(from.x + shift.x, to.x);
    const overlapY = Math.min(from.y + height + shift.y, to.y + height) - Math.max(from.y + shift.y, to.y);
    expect(Math.min(overlapX, overlapY)).toBeCloseTo(4);
  }
});
it('keeps the pointer at the arrow tip and a horizontal tail without invalid short paths', () => {
  for (const end of [{ x: 20, y: 50 }, { x: 220, y: 50 }, { x: -150, y: 330 }, { x: 450, y: 299 }]) {
    const path = attackArrowPath({ x: 20, y: 300 }, end);
    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path).toContain(`${end.x.toFixed(2)},${end.y.toFixed(2)}`);
    const tail = path.split('Z')[0].match(/-?[\d.]+,-?[\d.]+/g)!;
    expect(tail[0].split(',')[1]).toBe(tail.at(-1)!.split(',')[1]);
  }
  expect(attackArrowPath({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe('');
});
it('shows impact only at completed contact and starts returning in the same turn without a hold', async () => {
  let arrive!: () => void, returnHome!: () => void;
  const outbound = { finished: new Promise<void>(resolve => { arrive = resolve; }), cancel: vi.fn() };
  const inbound = { finished: new Promise<void>(resolve => { returnHome = resolve; }), cancel: vi.fn() };
  const animate = vi.fn().mockReturnValueOnce(outbound).mockReturnValueOnce(inbound);
  const impact = vi.fn(), motion = animateAttack({ animate } as unknown as HTMLElement, { x: 10, y: -100 }, impact);
  expect(impact).not.toHaveBeenCalled();
  arrive(); await Promise.resolve();
  expect(impact).toHaveBeenCalledOnce(); expect(animate).toHaveBeenCalledTimes(2);
  returnHome(); await motion.finished;
});
it('cancels stale hits and honors reduced motion', async () => {
  let reject!: (error: Error) => void;
  const finished = new Promise<void>((_, fail) => { reject = fail; });
  const animate = vi.fn(() => ({ finished, cancel: () => reject(new Error('cancelled')) }));
  const impact = vi.fn(), motion = animateAttack({ animate } as unknown as HTMLElement, { x: 0, y: -50 }, impact);
  motion.cancel(); await motion.finished; expect(impact).not.toHaveBeenCalled();
  const instant = vi.fn(() => ({ finished: Promise.resolve(), cancel() {} }));
  await animateAttack({ animate: instant } as unknown as HTMLElement, { x: 0, y: -50 }, impact, true).finished;
  expect(impact).toHaveBeenCalledOnce(); expect(instant.mock.calls.every(call => (call as unknown as [unknown, { duration: number }])[1].duration === 0)).toBe(true);
});
