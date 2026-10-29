import type { GameCommand, GameView, PlayerId, VisibleCard } from '../game/types';
import { allVisible } from './interaction';
export interface VisualEvent { kind: 'attack' | 'death' | 'move' | 'draw' | 'damage'; from: string; to: string; card?: VisibleCard; seat?: PlayerId; amount?: number; }
export function transitionEvents(before: GameView, after: GameView, command?: GameCommand): VisualEvent[] {
  const events: VisualEvent[] = [], old = allVisible(before);
  const history = after.history.slice(before.history.length);
  let attack = command?.type === 'attack' ? command : before.pending?.kind === 'trap' ? before.pending : before.pending?.kind === 'effect' ? before.pending.attack : null;
  if (!command && !attack) {
    const pending = after.pending?.kind === 'trap' ? after.pending : after.pending?.kind === 'effect' ? after.pending.attack : null;
    attack = pending;
    if (!attack) for (const card of before.players[before.turnPlayer].field) {
      const prefix = `${before.players[before.turnPlayer].name} attacks with ${card.definition.name}`;
      if (history.includes(`${prefix} directly.`)) attack = { attacker: card.id, target: null };
      else for (const target of before.players[before.turnPlayer === 0 ? 1 : 0].field) if (history.includes(`${prefix} against ${target.definition.name}.`)) attack = { attacker: card.id, target: target.id };
    }
  }
  const cancelled = history.includes('The declared attack is cancelled.');
  if (attack && !cancelled && (command?.type === 'attack' || after.phase === 'turnEnd' || after.phase === 'finished')) {
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
    if (!command) {
      for (const card of changed.field) {
        const previous = old.find(previous => previous.id === card.id);
        if (previous?.zone !== 'field') events.push({ kind: 'move', card, from: `${previous?.zone === 'graveyard' ? 'graveyard' : 'hand'}:${card.owner}`, to: `field:${seat}:${changed.field.findIndex(c => c.id === card.id)}` });
      }
      for (const card of changed.graveyard) {
        const previous = old.find(previous => previous.id === card.id);
        if (!previous || previous.zone === 'hand' || previous.zone === 'trap') events.push({ kind: 'move', card, from: `${previous?.zone === 'trap' || player.trap && 'hidden' in player.trap && !changed.trap ? 'trap' : 'hand'}:${card.owner}`, to: `graveyard:${seat}` });
      }
      if (!player.trap && changed.trap && 'hidden' in changed.trap) events.push({ kind: 'move', from: `hand:${seat}`, to: `trap:${seat}`, seat });
    }
    if (changed.health < player.health) events.push({ kind: 'damage', from: `health:${seat}`, to: `health:${seat}`, amount: player.health - changed.health, seat });
    if (changed.deckCount < player.deckCount) events.push({ kind: 'draw', from: `deck:${seat}`, to: `hand:${seat}`, seat, amount: player.deckCount - changed.deckCount });
  }
  return events;
}
