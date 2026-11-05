import { CARDS } from './catalog';
import { applyCommand } from './engine';
import { historyText } from './history';
import type { GameCommand, GameState, PlayerId } from './types';

type Checkpoint = Omit<GameState, 'history'> & { historyLength: number };
type Action = { actor: PlayerId; command: GameCommand };
const cardNames = new RegExp(Object.values(CARDS).map(card => card.name).join('|'));
const legacy = (entry: GameState['history'][number]) => typeof entry === 'string' && cardNames.test(entry) && !/^Turn |(?: draws a card| sets a spell trap| wins| declines to activate a trap)\.$/.test(entry);
const positionKey = (state: GameState | Checkpoint) => JSON.stringify(state, (key, value) => key === 'history' || key === 'historyLength' ? undefined : value);

/** Old saves omitted card ownership; recover it from accepted transitions, never from a name guess. */
export function recoverHistory(state: GameState, checkpoints: Checkpoint[], candidates: Action[][]): GameState['history'] {
  if (!state.history.some(legacy)) return state.history;
  const history = [...state.history];
  let changed = false;
  for (const [index, checkpoint] of checkpoints.entries()) {
    const start = checkpoint.historyLength, end = checkpoints[index + 1]?.historyLength ?? history.length;
    const entries = history.slice(start, end);
    if (!entries.some(legacy)) continue;
    const { historyLength: _length, ...position } = checkpoint;
    const before: GameState = { ...position, history: history.slice(0, start) };
    const expected = checkpoints[index + 1] ?? state;
    for (const action of candidates[index] ?? []) {
      try {
        let next = applyCommand(before, action.actor, action.command, expected.phase === 'trap');
        if (next.phase === 'turnEnd' && expected.turn === next.turn + 1) next = applyCommand(next, next.decisionPlayer, { type: 'endTurn' });
        const generated = next.history.slice(start);
        if (positionKey(next) !== positionKey(expected) || JSON.stringify(generated.map(historyText)) !== JSON.stringify(entries.map(historyText))) continue;
        history.splice(start, entries.length, ...generated); changed = true; break;
      } catch { /* Receipts on an abandoned Undo branch do not describe this transition. */ }
    }
  }
  return changed ? history : state.history;
}
