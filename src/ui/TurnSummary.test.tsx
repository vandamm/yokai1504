import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../game/engine';
import { viewForPlayer } from '../game/views';
import { TurnSummary } from './App';

it('names the turn owner from each online seat and in local testing', () => {
  const view = viewForPlayer(createGame({ seed: 45, names: ['Alex', 'Poli'], startingPlayer: 0 }), 0);
  expect(renderToStaticMarkup(<TurnSummary view={view} viewer={0} openHands={false} />)).toContain('Your turn');
  expect(renderToStaticMarkup(<TurnSummary view={view} viewer={1} openHands={false} />)).toContain('Alex’s turn');
  expect(renderToStaticMarkup(<TurnSummary view={view} openHands />)).toContain('Alex’s turn');
});

it('keeps the turn owner visible when the opponent must respond or finish the attack', () => {
  const view = viewForPlayer(createGame({ seed: 45, names: ['Alex', 'Poli'], startingPlayer: 0 }), 1);
  view.decisionPlayer = 1;
  for (const phase of ['trap', 'effect', 'turnEnd'] as const) {
    view.phase = phase;
    const responder = renderToStaticMarkup(<TurnSummary view={view} viewer={1} openHands={false} />);
    expect(responder).toContain('Alex’s turn');
    expect(responder).toContain(phase === 'trap' ? 'Your trap response' : phase === 'effect' ? 'Resolve your effect' : 'Attack complete · End the turn when ready');
    const attacker = renderToStaticMarkup(<TurnSummary view={view} viewer={0} openHands={false} />);
    expect(attacker).toContain('Your turn');
    expect(attacker).toContain('Waiting for Poli');
  }
});

it('shows a finished result without calling it anyone’s turn', () => {
  const view = viewForPlayer(createGame({ seed: 45, names: ['Alex', 'Poli'], startingPlayer: 0 }), 0);
  view.phase = 'finished';
  view.result = { winner: 1, reason: 'Health depleted' };
  const html = renderToStaticMarkup(<TurnSummary view={view} viewer={0} openHands={false} />);
  expect(html).toContain('Poli wins');
  expect(html).not.toContain('Your turn');
});
