import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../game/engine';
import { viewForLocalTesting } from '../game/views';
import type { GameView } from '../game/types';
import { DecisionBar, TurnControls } from './DecisionBar';
import { CARDS } from '../game/catalog';
import { emptyDraft } from './interaction';

function position() {
  return viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
}
function render(view: GameView, selectedId?: string) {
  return renderToStaticMarkup(<TurnControls view={view} draft={{ ...emptyDraft(), selectedId }} busy={false} onCommand={() => {}} onDetails={() => {}} />);
}

it('offers an explicit yes or no trap response without a drag instruction', () => {
  const view = position(); view.phase = 'trap';
  const html = renderToStaticMarkup(<DecisionBar view={view} draft={emptyDraft()} busy={false} onDraft={() => {}} onCommand={() => {}} onDetails={() => {}} />);
  expect(html).toContain('Do you want to activate the trap?');
  expect(html).toContain('Activate trap'); expect(html).toContain('Keep hidden');
  expect(html).not.toContain('Drag your trap');
});

it('asks for Ougi targets on the field without a second list of target buttons', () => {
  const view = position(), source = view.players[0].hand![0];
  source.def = 'ougi'; source.definition = CARDS.ougi; source.zone = 'graveyard';
  view.players[0].graveyard = [source]; view.phase = 'effect';
  view.pending = { kind: 'effect', actor: 0, cardId: source.id, source: 'cast', attack: null };
  const renderDraft = (targets: string[]) => renderToStaticMarkup(<DecisionBar view={view} draft={{...emptyDraft(),targets}} busy={false} onDraft={() => {}} onCommand={() => {}} onDetails={() => {}} />);
  expect(renderDraft([])).toContain('Select the soul donor on the field.');
  expect(renderDraft([source.id])).toContain('Select the yokai to receive the soul on the field.');
  expect(renderDraft([])).not.toContain('effect-targets');
  expect(renderDraft([])).not.toContain('Drag Ougi');
});

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

it('keeps Undo available after ending your turn while hiding the opponent’s action controls', () => {
  const view = position(); view.decisionPlayer = view.turnPlayer = 1;
  const html = renderToStaticMarkup(<TurnControls view={view} viewer={0} draft={emptyDraft()} busy={false} onCommand={() => {}} onDetails={() => {}} onUndo={() => {}} canUndo />);
  expect(html).toContain('aria-label="Undo"');
  expect(html).not.toContain('disabled');
  expect(html).not.toContain('End turn');
  expect(html).not.toContain('actions left');
});
