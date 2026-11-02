import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Table } from './Table';
import { DecisionBar } from './DecisionBar';
import { emptyDraft } from './interaction';
import { createGame } from '../game/engine';
import { viewForPlayer, viewForLocalTesting } from '../game/views';
import { CARDS } from '../game/catalog';
import type { GameView, PlayerId, VisibleCard } from '../game/types';

afterEach(() => vi.unstubAllEnvs());

function markup(view: GameView, openHands = false, viewer?: PlayerId) {
  return renderToStaticMarkup(<Table view={view} viewer={viewer} openHands={openHands} targetIds={[]} chosenTargets={[]} allocations={{}} onSoul={() => {}} onCard={() => {}} onTrap={() => {}} onGraveyard={() => {}} />);
}

it('renders a private rival hand and trap without private identities or inspectable controls', () => {
  const state = createGame({ seed: 45, startingPlayer: 0 });
  const hiddenHandIds = [...state.players[1].hand];
  const trapId = state.players[1].hand.pop()!;
  state.players[1].trap = trapId;
  const html = markup(viewForPlayer(state, 0));
  expect(html).toContain('Player 2’s hidden trap');
  expect(html).toContain('Player 2’s hidden hand cards');
  for (const id of hiddenHandIds) expect(html).not.toContain(id);
  const topHand = html.slice(html.indexOf('class="top-hand'), html.indexOf('class="battlefield'));
  expect(topHand).not.toContain('class="table-card');
  expect(topHand).toContain('/cards/back-ochre.svg');
});

it('seats the defender at the near edge during a trap response, independently of turn ownership', () => {
  const state = createGame({ seed: 45, startingPlayer: 0 });
  state.decisionPlayer = 1;
  state.phase = 'trap';
  const html = markup(viewForPlayer(state, 1));
  expect(html).toContain('Player 1’s hand, far edge');
  expect(html).toContain('Player 2’s hand, near edge');
  expect(html.indexOf('Player 1’s yokai')).toBeLessThan(html.indexOf('class="table-divider'));
  expect(html.indexOf('Player 2’s yokai')).toBeGreaterThan(html.indexOf('class="table-divider'));
  const far = html.slice(html.indexOf('class="top-hand'), html.indexOf('class="battlefield'));
  const near = html.slice(html.indexOf('class="bottom-hand'));
  expect(far).not.toContain('side-active');
  expect(near).toContain('side-active');
  const defender = html.slice(html.indexOf('class="table-seat lower-seat'), html.indexOf('class="bottom-hand'));
  expect(defender).toContain('side-active');
});

it('renders current combat values and exactly the card’s capacity using original soul art slots', () => {
  const view = viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
  view.players.forEach(player => { player.field = []; });
  const card: VisibleCard = { id: 'field-card', def: 'kappa', owner: 1, controller: 0, zone: 'field', souls: 2, summonedTurn: 1, definition: CARDS.kappa, attack: 6 };
  view.players[0].field = [card];
  const html = markup(view, true);
  expect(html).toContain('Kappa, 6 attack, base 2, 2 of 3 souls');
  expect(html).toContain('class="live-attack modified"');
  expect(html.match(/class="soul-slot filled"/g)).toHaveLength(2);
  expect(html.match(/class="soul-slot "/g)).toHaveLength(1);
  const field = html.slice(html.indexOf('Player 1’s yokai'), html.lastIndexOf('class="rear-piles"'));
  expect(field).not.toContain('class="card-name"');
});

it('loads card faces, hidden backs and soul icons beneath the deployed base URL', () => {
  vi.stubEnv('BASE_URL', '/yokai1504/');
  const view = viewForPlayer(createGame({ seed: 45, startingPlayer: 0 }), 0);
  const card: VisibleCard = { id: 'field-card', def: 'kappa', owner: 0, controller: 0, zone: 'field', souls: 0, summonedTurn: 1, definition: CARDS.kappa, attack: 2 };
  const spell: VisibleCard = { ...card, id: 'spell', def: 'sake', zone: 'graveyard', definition: CARDS.sake, attack: 0 };
  view.players[0].field = [card];
  view.players[0].graveyard = [spell];
  view.players[1].trap = { hidden: true };
  view.phase = 'effect';
  view.pending = { kind: 'effect', actor: 0, cardId: spell.id, source: 'cast', attack: null };
  const html = markup(view) + renderToStaticMarkup(<DecisionBar view={view} draft={{ ...emptyDraft(), allocationCardId: card.id }} busy={false} onDraft={() => {}} onCommand={() => {}} onDetails={() => {}} />);
  expect(html).toContain('src="/yokai1504/cards/kappa.png"');
  expect(html).toContain('src="/yokai1504/cards/back.svg"');
  expect(html).toContain('src="/yokai1504/cards/back-ochre.svg"');
  expect(html).toContain('src="/yokai1504/cards/sake.png"');
  expect(html).toContain('src="/yokai1504/icons/soul.svg"');
  expect(html).not.toMatch(/src="\/(cards|icons)\//);
});

it('places turn controls on the divider independently of the hand', () => {
  const view = viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
  const html = renderToStaticMarkup(<Table view={view} openHands targetIds={[]} chosenTargets={[]} allocations={{}} onCard={() => {}} onTrap={() => {}} onGraveyard={() => {}} turnControls={<button>Undo test</button>} />);
  const divider = html.slice(html.indexOf('class="table-divider'), html.indexOf('class="table-seat lower-seat'));
  expect(divider).toContain('Undo test');
  expect(divider).toContain('Supply:');
  expect(html.match(/Undo test/g)).toHaveLength(1);
});

it('keeps the online viewer near even when the opponent is deciding', () => {
  const state = createGame({ seed: 45, startingPlayer: 0 });
  const view = viewForPlayer(state, 1);
  const html = renderToStaticMarkup(<Table view={view} viewer={1} openHands={false} targetIds={[]} chosenTargets={[]} allocations={{}} onCard={() => {}} onTrap={() => {}} onGraveyard={() => {}} />);
  expect(html).toContain('Player 2’s hand, near edge');
  expect(html).toContain('Player 1’s hand, far edge');
  const near = html.slice(html.indexOf('class="bottom-hand'));
  expect(near).toContain('class="table-card');
  for (const id of state.players[0].hand) expect(html).not.toContain(id);
});

it('highlights the whole acting side and clears it when the game ends', () => {
  const view = viewForPlayer(createGame({ seed: 45, startingPlayer: 0 }), 0);
  view.turnPlayer = view.decisionPlayer = 1;
  const html = markup(view, false, 0);
  const far = html.slice(html.indexOf('class="top-hand'), html.indexOf('class="battlefield'));
  expect(far).toContain('side-active');
  expect(html).toContain('table-surface active-far');
  expect(html).toContain('class="turn-atmosphere"');
  expect(html.match(/side-active/g)).toHaveLength(2);
  expect(html).not.toContain('class="seat-turn"');
  view.result = { winner: 1, reason: 'Health depleted' };
  expect(markup(view)).not.toContain('side-active');
  expect(markup(view)).not.toContain('class="seat-turn"');
});


it('does not offer normal soul actions to the nonacting online viewer or a full yokai', () => {
  const view = viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
  const card: VisibleCard = { id: 'kappa', def: 'kappa', owner: 0, controller: 0, zone: 'field', souls: 0, summonedTurn: 1, definition: CARDS.kappa, attack: 2 };
  view.players[0].field = [card];
  expect(markup(view, true, 0)).toContain('aria-label="Evoke soul onto Kappa"');
  expect(markup(view, true, 0)).toContain('soul-add-token');
  expect(markup(view, true, 1)).not.toContain('aria-label="Evoke soul onto Kappa"');
  card.souls = 3; card.attack = 8;
  expect(markup(view, true, 0)).not.toContain('aria-label="Evoke soul onto Kappa"');
  card.souls = 0; view.actionsUsed = 2;
  expect(markup(view, true, 0)).not.toContain('aria-label="Evoke soul onto Kappa"');
});

it('allows Sake allocation on either field without leaking ordinary evoke controls', () => {
  const view = viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
  const source = view.players[0].hand![0];
  source.def = 'sake'; source.definition = CARDS.sake; source.zone = 'graveyard';
  view.players[0].graveyard = [source]; view.phase = 'effect';
  view.pending = { kind: 'effect', actor: 0, cardId: source.id, source: 'cast', attack: null };
  view.players[1].field = [{ id: 'enemy-kappa', def: 'kappa', owner: 1, controller: 1, zone: 'field', souls: 0, summonedTurn: 1, definition: CARDS.kappa, attack: 2 }];
  expect(markup(view, true, 0)).toContain('aria-label="Allocate soul to Kappa"');
  expect(markup(view, true, 1)).not.toContain('aria-label="Allocate soul to Kappa"');
});
