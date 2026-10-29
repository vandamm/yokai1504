import type { GameView, VisibleCard } from '../game/types';

/** Label a projected card without changing the selection or any game state. */
export function inspectionLabel(view: GameView, card: VisibleCard): string {
  const player = view.players[card.controller];
  const zone = card.zone === 'field'
    ? `field slot ${player.field.findIndex(candidate => candidate.id === card.id) + 1} · ATK ${card.attack} · souls ${card.souls}/${card.definition.cap}`
    : card.zone;
  return `${player.name} · ${card.definition.name} · ${zone}`;
}

export function inspectionPosition(card: { left: number; right: number; top: number }, viewport: { width: number; height: number }) {
  const width = Math.min(480, viewport.width - 24), height = Math.min(480, viewport.height - 24);
  const preferred = card.right + 16 + width <= viewport.width - 12 ? card.right + 16 : card.left - width - 16;
  return { left: Math.max(12, Math.min(preferred, viewport.width - width - 12)), top: Math.max(12, Math.min(card.top, viewport.height - height - 12)) };
}
