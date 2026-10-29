import type { GameCommand, GameView } from '../game/types';
import { actionUnavailableReason, allVisible, canConfirmEffect, decisionCandidates, effectCommand, effectSource, effectUnavailableReason, emptyDraft, updateDraft } from './interaction';
import type { DraftEvent, TableDraft } from './interaction';
export interface DropResult { command?: GameCommand; event?: DraftEvent; reason?: string; }
const invalid = (reason = 'Drop on a highlighted destination.') => ({ reason });
export function resolveDrop(view: GameView, draft: TableDraft, sourceId: string, targetId: string): DropResult {
  const cards = allVisible(view), card = cards.find(c => c.id === sourceId), target = cards.find(c => c.id === targetId);
  if (!card || view.result || sourceId === targetId) return invalid();
  const own = view.decisionPlayer, opponent = own === 0 ? 1 : 0;
  if (view.phase === 'trap') {
    if (card.zone === 'trap' && card.controller === own && targetId === 'play') { const reason = effectUnavailableReason(view, card); return reason ? invalid(reason) : { command: { type: 'respond', activate: true } }; }
    return invalid('Drag your trap to Play, or keep it hidden.');
  }
  if (view.phase === 'effect') {
    const source = effectSource(view); if (!source) return invalid();
    if (source.def === 'boseki' && card.zone === 'graveyard' && (targetId === `field:${own}` || target?.zone === 'field' && target.controller === own)) {
      const choice = { ...emptyDraft(), targets: [card.id] };
      return canConfirmEffect(view, choice) ? { command: effectCommand(view, choice) } : invalid();
    }
    if (source.def === 'ougi' && card.zone === 'field' && target?.zone === 'field') {
      const choice = { ...emptyDraft(), targets: [card.id, target.id] };
      return canConfirmEffect(view, choice) ? { command: effectCommand(view, choice) } : invalid('Move a soul from a yokai that has one to a different yokai with room.');
    }
    if (sourceId !== source.id) return invalid('Drag the resolving card to a marked target.');
    if (targetId === 'resolve') return canConfirmEffect(view, draft) ? { command: effectCommand(view, draft) } : invalid('Choose the required targets first.');
    const candidates = decisionCandidates(view, draft);
    const hidden = candidates.hiddenTrapSeats.some(seat => targetId === `trap:${seat}`);
    if (!hidden && !candidates.cards.some(c => c.id === targetId)) return invalid('This target cannot be affected by the effect.');
    if (source.def === 'sake') return invalid('Use + soul on each recipient, then drag Sake to Resolve.');
    const event: DraftEvent = { type: 'toggleTarget', id: targetId, maximum: candidates.maximum };
    if (source.def === 'jufu') return { event };
    const choice = updateDraft(emptyDraft(), event);
    return canConfirmEffect(view, choice) ? { command: effectCommand(view, choice) } : invalid();
  }
  if (view.phase !== 'main' || card.controller !== own) return invalid('Finish the current decision first.');
  if (card.zone === 'hand' || card.zone === 'trap') {
    const action = card.definition.kind === 'spell' && card.zone === 'hand' && targetId === `trap:${own}` ? 'setTrap' : 'play';
    const destination = action === 'setTrap' || (card.definition.kind === 'spell' ? targetId === 'play' : targetId === `field:${own}` || target?.zone === 'field' && target.controller === own);
    if (!destination) return invalid(card.definition.kind === 'spell' ? 'Drop this spell on Play or your empty trap slot.' : 'Drop this yokai on your field.');
    const reason = actionUnavailableReason(view, card, action);
    return reason ? invalid(reason) : { command: { type: action, cardId: card.id } };
  }
  if (card.zone === 'field') {
    const reason = actionUnavailableReason(view, card, 'attack');
    if (reason) return invalid(reason);
    if (target?.zone === 'field' && target.controller === opponent) return { command: { type: 'attack', attacker: card.id, target: target.id } };
    if (targetId === `player:${opponent}` && !view.players[opponent].field.length) return { command: { type: 'attack', attacker: card.id, target: null } };
  }
  return invalid();
}
