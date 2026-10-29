import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../game/engine';
import { viewForLocalTesting } from '../game/views';
import type { GameView } from '../game/types';
import { TurnControls } from './DecisionBar';
import { emptyDraft } from './interaction';

function position() {
  return viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
}
function render(view: GameView, selectedId?: string) {
  return renderToStaticMarkup(<TurnControls view={view} draft={{ ...emptyDraft(), selectedId }} busy={false} onCommand={() => {}} onDetails={() => {}} />);
}

it.each([0, 1, 2])('shows the remaining main actions in the current decision after %i actions', used => {
  const view = position();
  view.actionsUsed = used;
  const left = 2 - used;
  const html = render(view);
  expect(html).not.toContain('Drag a card to play');
  expect(html).toContain(`aria-label="${left} main ${left === 1 ? 'action' : 'actions'} left"`);
  expect(html).toContain('role="status"');
});

it('keeps the count visible when card actions replace the tap prompt', () => {
  const view = position();
  const html = render(view, view.players[0].hand![0].id);
  expect(html).not.toContain('Drag a card to play');
  expect(html).toContain('aria-label="2 main actions left"');
});

it.each(['trap', 'effect'] as const)('does not attribute the attacker’s main actions to a defender resolving %s', phase => {
  const view = position();
  view.phase = phase;
  view.decisionPlayer = 1;
  view.pending = phase === 'trap'
    ? { kind: 'trap', actor: 1, attacker: view.players[0].hand![0].id, target: null }
    : { kind: 'effect', actor: 1, cardId: view.players[1].hand![0].id, source: 'trap', attack: null };
  expect(render(view)).not.toMatch(/aria-label="\d main actions? left"/);
});

it('keeps Undo beside End turn with a drawn arrow and no extra action cost', () => {
  const html=renderToStaticMarkup(<TurnControls view={position()} draft={emptyDraft()} busy={false} onCommand={()=>{}} onDetails={()=>{}} onUndo={()=>{}} canUndo />);
  expect(html).toContain('class="turn-buttons"');
  expect(html).toContain('<svg');
  expect(html).toContain('Undo');
  expect(html).toContain('End turn');
});

it('keeps inspection available without attributing the opponent’s controls to a fixed online viewer', () => {
  const view = position(), draft = { ...emptyDraft(), selectedId: view.players[1].hand![0].id };
  const html = renderToStaticMarkup(<TurnControls view={view} viewer={1} draft={draft} busy onCommand={() => {}} onDetails={() => {}} showInspect />);
  expect(html).toContain('Inspect');
  expect(html).not.toContain('End turn');
  expect(html).not.toContain('actions left');
});
