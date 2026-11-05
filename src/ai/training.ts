import { applyCommand, createGame } from '../game/engine';
import { viewForPlayer } from '../game/views';
import type { PlayerId } from '../game/types';
import { BASE_WEIGHTS, chooseAiCommand, legalCommands, seededRandom } from './opponent';
import type { AiWeights } from './opponent';

export const TRAINING_SEARCH = { samples: 1, depth: 3, beamWidth: 2 };
type SearchBudget = typeof TRAINING_SEARCH;
type Policy = AiWeights | 'random';
interface MatchOptions {
  seed: number;
  players: readonly [Policy, Policy];
  search?: SearchBudget;
  exploration?: number;
}

export function playMatch({ seed, players, search = TRAINING_SEARCH, exploration = 0 }: MatchOptions) {
  let state = createGame({ seed, startingPlayer: 0 });
  const random = [seededRandom(seed ^ 0x51ed270b), seededRandom(seed ^ 0x68bc21eb)];
  let steps = 0;
  while (!state.result && steps < 600) {
    const actor = state.decisionPlayer, policy = players[actor];
    // The trainer owns the state; the policy receives only this seat's observation.
    const view = viewForPlayer(state, actor);
    const commands = policy === 'random' ? legalCommands(view) : undefined;
    const command = commands
      ? commands[Math.floor(random[actor]() * commands.length)]
      : chooseAiCommand(view, { ...search, weights: policy as AiWeights, random: random[actor], exploration });
    state = applyCommand(state, actor, command);
    steps++;
  }
  return { winner: state.result?.winner ?? null, finished: state.result !== null, steps };
}

interface Score { games: number; wins: number; losses: number; draws: number; unfinished: number; score: number; }
function emptyScore(): Score { return { games: 0, wins: 0, losses: 0, draws: 0, unfinished: 0, score: 0 }; }
function record(score: Score, result: ReturnType<typeof playMatch>, seat: PlayerId) {
  score.games++;
  if (!result.finished) score.unfinished++;
  else if (result.winner === null) score.draws++;
  else if (result.winner === seat) score.wins++;
  else score.losses++;
  score.score = (score.wins + score.draws / 2) / score.games;
}

export function evaluatePolicies(weights: AiWeights, opponent: Policy, games: number, seed: number, search = TRAINING_SEARCH): Score {
  requireInteger(games, 2, 10000, 'games');
  if (games % 2) throw new Error('games must be even for paired seats.');
  const score = emptyScore();
  const random = seededRandom(seed);
  for (let pair = 0; pair < games / 2; pair++) {
    const matchSeed = (Math.floor(random() * 0x40000000) | 0x40000000) >>> 0;
    for (const seat of [0, 1] as const) {
      record(score, playMatch({ seed: matchSeed, players: seat === 0 ? [weights, opponent] : [opponent, weights], search }), seat);
    }
  }
  return score;
}

interface TrainingOptions {
  initialWeights?: AiWeights;
  seed?: number;
  generations?: number;
  population?: number;
  gamesPerCandidate?: number;
  validationGames?: number;
  onGeneration?: (generation: Generation) => void;
}
interface Generation { generation: number; score: number; changed: boolean; games: number; unfinished: number; }
function requireInteger(value: number, min: number, max: number, name: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
}

function mutate(weights: AiWeights, random: () => number): AiWeights {
  const next = { ...weights }, keys = Object.keys(next);
  const forced = Math.floor(random() * keys.length);
  for (const [index, key] of keys.entries()) {
    if (index === forced || random() < 0.35) {
      next[key] = Number((next[key] + (random() * 2 - 1) * Math.max(0.5, Math.abs(next[key])) * 0.45).toFixed(5));
    }
  }
  return next;
}

export function trainSelfPlay({ seed = 1504, generations = 6, population = 5, gamesPerCandidate = 16, validationGames = 32, initialWeights = BASE_WEIGHTS, onGeneration }: TrainingOptions = {}) {
  requireInteger(seed, 0, 0xffffffff, 'seed');
  requireInteger(generations, 1, 1000, 'generations');
  requireInteger(population, 2, 100, 'population');
  requireInteger(gamesPerCandidate, 2, 1000, 'gamesPerCandidate');
  requireInteger(validationGames, 2, 10000, 'validationGames');
  if (gamesPerCandidate % 2 || validationGames % 2) throw new Error('Game counts must be even for paired seats.');
  const initial = { ...BASE_WEIGHTS, ...initialWeights };
  if (!Object.values(initial).every(Number.isFinite)) throw new Error('Initial AI weights must be finite numbers.');
  const random = seededRandom(seed);
  let champion = { ...initial }, trainingGames = 0;
  const league: AiWeights[] = [{ ...BASE_WEIGHTS }], progress: Generation[] = [];
  const checkpoints = [{ generation: 0, weights: initial }];
  for (let generation = 1; generation <= generations; generation++) {
    const opponents = [champion, ...league];
    const fixtures = Array.from({ length: gamesPerCandidate / 2 }, (_, pair) => ({
      seed: Math.floor(random() * 0x40000000), opponent: pair % 2 === 0 ? initial : opponents[Math.floor(pair / 2) % opponents.length],
    }));
    const candidates = [champion, ...Array.from({ length: population - 1 }, () => mutate(champion, random))];
    const scores = candidates.map(weights => {
      const score = emptyScore();
      for (const fixture of fixtures) for (const seat of [0, 1] as const) {
        record(score, playMatch({ seed: fixture.seed, players: seat === 0 ? [weights, fixture.opponent] : [fixture.opponent, weights] }), seat);
        trainingGames++;
      }
      return score;
    });
    let best = 0;
    for (let index = 1; index < scores.length; index++) if (scores[index].score > scores[best].score) best = index;
    champion = { ...candidates[best] };
    if (best !== 0) {
      league.push(champion); if (league.length > 5) league.splice(1, 1);
      checkpoints.push({ generation, weights: champion });
    }
    const entry = { generation, score: scores[best].score, changed: best !== 0, games: population * gamesPerCandidate, unfinished: scores.reduce((sum, score) => sum + score.unfinished, 0) };
    progress.push(entry); onGeneration?.(entry);
  }
  const selectionGames = Math.max(16, gamesPerCandidate);
  const selectionCandidates = checkpoints.map(checkpoint => ({
    generation: checkpoint.generation,
    ...evaluatePolicies(checkpoint.weights, initial, selectionGames, seed ^ 0x6bc94d52),
  }));
  let selected = 0;
  for (let index = 1; index < checkpoints.length; index++) {
    if (selectionCandidates[index].unfinished === 0 && selectionCandidates[index].score > selectionCandidates[selected].score) selected = index;
  }
  // Selection chooses a checkpoint; untouched validation can only accept or reject it.
  const validation = evaluatePolicies(checkpoints[selected].weights, initial, validationGames, seed ^ 0x34a73e19);
  const promoted = selected !== 0 && validation.unfinished === 0 && validation.score >= 0.5;
  return {
    weights: promoted ? checkpoints[selected].weights : initial,
    report: { seed, initialWeights: initial, search: TRAINING_SEARCH, exploration: 'mutated evaluation weights and sampled unseen cards; no random-move noise during scoring', population, gamesPerCandidate, trainingGames, generations: progress, selectionCandidates, selectedGeneration: checkpoints[selected].generation, selectionGames: selectionGames * checkpoints.length, validation, promoted },
  };
}
