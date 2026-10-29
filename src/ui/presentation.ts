import type { GameCommand, GameView, PlayerId, VisibleCard } from '../game/types';
import { allVisible } from './interaction';
export function presentationView(before: GameView, next: GameView, openHands: boolean): GameView {
  const view = structuredClone(next); view.decisionPlayer = before.decisionPlayer;
  if (!openHands && before.decisionPlayer !== next.decisionPlayer) for (const player of view.players) {
    player.hand = null; if (player.trap) player.trap = { hidden: true };
  }
  return view;
}
export interface VisualEvent { kind: 'attack' | 'death' | 'move' | 'draw' | 'damage'; from: string; to: string; card?: VisibleCard; seat?: PlayerId; amount?: number; }
export function transitionEvents(before: GameView, after: GameView, command: GameCommand): VisualEvent[] {
  const events: VisualEvent[] = [], old = allVisible(before);
  const attack = command.type === 'attack' ? command : before.pending?.kind === 'trap' ? before.pending : before.pending?.kind === 'effect' ? before.pending.attack : null;
  const cancelled = after.history.slice(before.history.length).includes('The declared attack is cancelled.');
  if (attack && !cancelled && (command.type === 'attack' || after.phase === 'turnEnd' || after.phase === 'finished')) {
    const card = old.find(c => c.id === attack.attacker);
    if (card) events.push({ kind: 'attack', card, from: card.id, to: attack.target ?? `health:${before.turnPlayer === 0 ? 1 : 0}` });
  }
  for (const player of before.players) {
    for (const card of player.field) {
      const to = after.players.flatMap(p => p.field).find(c => c.id === card.id);
      if (!to && after.players.some(p => p.graveyard.some(c => c.id === card.id))) events.push({ kind: 'death', card, from: card.id, to: `graveyard:${card.owner}` });
      if (to && to.controller !== card.controller) events.push({ kind: 'move', card, from: card.id, to: `field:${to.controller}:${after.players[to.controller].field.findIndex(c => c.id === card.id)}` });
    }
    const seat = player.id, changed = after.players[seat];
    if (changed.health < player.health) events.push({ kind: 'damage', from: `health:${seat}`, to: `health:${seat}`, amount: player.health - changed.health, seat });
    if (changed.deckCount < player.deckCount) events.push({ kind: 'draw', from: `deck:${seat}`, to: `hand:${seat}`, seat, amount: player.deckCount - changed.deckCount });
  }
  return events;
}
