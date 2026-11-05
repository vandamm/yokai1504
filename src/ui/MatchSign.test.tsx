import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../game/engine';
import { viewForPlayer } from '../game/views';
import { MatchSign } from './MatchSign';

it('announces whose turn is starting from the human perspective', () => {
  const view = viewForPlayer(createGame({ seed: 1, names: ['Me', 'Raider'], startingPlayer: 0 }), 0);
  expect(renderToStaticMarkup(<MatchSign view={view} viewer={0} show />)).toContain('Your turn');
  view.turnPlayer = 1;
  expect(renderToStaticMarkup(<MatchSign view={view} viewer={0} show />)).toContain('Raider’s turn');
  expect(renderToStaticMarkup(<MatchSign view={view} viewer={0} show={false} />)).toBe('');
});

it('gives clear human win and loss signs, and handles draws', () => {
  const view = viewForPlayer(createGame({ seed: 1 }), 0);
  view.result = { winner: 0, reason: 'health reached zero' };
  expect(renderToStaticMarkup(<MatchSign view={view} viewer={0} show />)).toContain('You win');
  expect(renderToStaticMarkup(<MatchSign view={view} viewer={1} show />)).toContain('You lose');
  view.result.winner = null;
  expect(renderToStaticMarkup(<MatchSign view={view} viewer={0} show />)).toContain('Draw');
});
