import { expect, it } from 'vitest';
import { BASE_WEIGHTS } from './opponent';
import { playMatch, trainSelfPlay } from './training';

it('reproduces complete self-play matches from a seed', () => {
  const options = { seed: 109, players: ['random', 'random'] as const };
  const result = playMatch(options);
  expect(result).toEqual(playMatch(options));
  expect(result.finished).toBe(true);
  expect(result.steps).toBeGreaterThan(10);
  expect(result.steps).toBeLessThan(600);
});

it('runs exploratory learning and separates its validation games', () => {
  const result = trainSelfPlay({ seed: 77, generations: 1, population: 2, gamesPerCandidate: 2, validationGames: 2 });
  expect(result.report.trainingGames).toBe(4);
  expect(result.report.validation.games).toBe(2);
  expect(result.report.validation.unfinished).toBe(0);
  expect(Object.keys(result.weights).sort()).toEqual(Object.keys(BASE_WEIGHTS).sort());
  expect(Object.values(result.weights).every(Number.isFinite)).toBe(true);
  expect(result.report.generations).toHaveLength(1);
  expect(result.report.selectionCandidates[0].generation).toBe(0);
}, 30000);

it.each([
  { generations: 0 }, { population: 1 }, { gamesPerCandidate: 3 },
  { validationGames: 0 }, { seed: NaN },
])('rejects invalid training options %j', options => {
  expect(() => trainSelfPlay(options)).toThrow();
});

it('starts retraining from the incumbent instead of discarding learned weights', () => {
  const initialWeights = { ...BASE_WEIGHTS, hand: 1.75 };
  const result = trainSelfPlay({ seed: 77, generations: 1, population: 2, gamesPerCandidate: 2, validationGames: 2, initialWeights });
  expect(result.report.initialWeights).toEqual(initialWeights);
  expect(result.report.promoted).toBe(false);
  expect(result.weights).toEqual(initialWeights);
}, 30000);
