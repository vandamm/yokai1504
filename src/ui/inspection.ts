import type { GameView, VisibleCard } from '../game/types';

/** Label a projected card without changing the selection or any game state. */
export function inspectionLabel(view: GameView, card: VisibleCard): string {
  const player = view.players[card.controller];
  const zone = card.zone === 'field'
    ? `field slot ${player.field.findIndex(candidate => candidate.id === card.id) + 1} · ATK ${card.attack} · souls ${card.souls}/${card.definition.cap}`
    : card.zone;
  return `${player.name} · ${card.definition.name} · ${zone}`;
}
