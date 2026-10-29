import type { GameCommand, GameView, PlayerId, VisibleCard } from '../game/types';

export interface TableDraft {
  selectedId?: string;
  attackSourceId?: string;
  targets: string[];
  allocations: Record<string, number>;
  allocationCardId?: string;
}

export type DraftEvent =
  | { type: 'select'; id: string }
  | { type: 'beginAttack'; id: string }
  | { type: 'toggleTarget'; id: string; maximum?: number; ordered?: boolean }
  | { type: 'setAllocation'; id: string; count: number }
  | { type: 'selectAllocation'; id: string }
  | { type: 'clear' };

export const emptyDraft = (): TableDraft => ({ targets: [], allocations: {} });

export function updateDraft(draft: TableDraft, event: DraftEvent): TableDraft {
  switch (event.type) {
    case 'select': return draft.selectedId === event.id ? emptyDraft() : { ...emptyDraft(), selectedId: event.id };
    case 'beginAttack': return { ...emptyDraft(), selectedId: event.id, attackSourceId: event.id };
    case 'toggleTarget': {
      const position = draft.targets.indexOf(event.id);
      const maximum = event.maximum ?? 1;
      const targets = position >= 0
        ? event.ordered ? draft.targets.slice(0, position) : draft.targets.filter(id => id !== event.id)
        : maximum === 1 ? [event.id] : draft.targets.length < maximum ? [...draft.targets, event.id] : draft.targets;
      return { ...draft, targets };
    }
    case 'selectAllocation': return { ...draft, allocationCardId: event.id };
    case 'setAllocation': {
      const allocations = { ...draft.allocations };
      if (Number.isInteger(event.count) && event.count > 0) allocations[event.id] = event.count;
      else delete allocations[event.id];
      return { ...draft, allocations };
    }
    case 'clear': return emptyDraft();
  }
}

const other = (seat: PlayerId): PlayerId => seat === 0 ? 1 : 0;
const isVisible = (trap: GameView['players'][number]['trap']): trap is VisibleCard => !!trap && !('hidden' in trap);
const spellImmune = (card: VisibleCard) => card.def === 'zashiki-warashi' && card.souls > 0;
const field = (view: GameView) => view.players.flatMap(player => player.field);
const spellTargets = (view: GameView) => field(view).filter(card => !spellImmune(card));

export function allVisible(view: GameView): VisibleCard[] {
  return view.players.flatMap(player => [...(player.hand ?? []), ...player.field, ...player.graveyard, ...(isVisible(player.trap) ? [player.trap] : [])]);
}

export function effectSource(view: GameView): VisibleCard | undefined {
  const pending = view.pending;
  return pending?.kind === 'effect' ? allVisible(view).find(card => card.id === pending.cardId) : undefined;
}

export function allocationLimit(view: GameView, draft: TableDraft, cardId: string): number {
  const card = spellTargets(view).find(candidate => candidate.id === cardId);
  if (!card) return 0;
  const usedElsewhere = Object.entries(draft.allocations).reduce((sum, [id, count]) => sum + (id === cardId ? 0 : count), 0);
  return Math.max(0, Math.min(card.definition.cap - card.souls, Math.min(3, view.supply) - usedElsewhere));
}

export interface DecisionCandidates {
  cards: VisibleCard[];
  hiddenTrapSeats: PlayerId[];
  minimum: number;
  maximum: number;
}

function effectCandidates(view: GameView, source: VisibleCard, draft: TableDraft): DecisionCandidates {
  const result: DecisionCandidates = { cards: [], hiddenTrapSeats: [], minimum: 1, maximum: 1 };
  const eligible = spellTargets(view);
  switch (source.def) {
    case 'sake':
      result.minimum = 0; result.maximum = 0;
      result.cards = eligible.filter(card => card.souls < card.definition.cap && ((draft.allocations[card.id] ?? 0) > 0 || allocationLimit(view, draft, card.id) > 0));
      break;
    case 'jufu':
      result.minimum = 0; result.maximum = 2;
      result.cards = eligible.filter(card => card.souls > 0 && (draft.targets.length < 2 || draft.targets.includes(card.id)));
      break;
    case 'boseki':
      result.cards = view.players[view.decisionPlayer].field.length < 3 ? view.players.flatMap(player => player.graveyard).filter(card => card.definition.kind === 'yokai') : [];
      break;
    case 'ougi': {
      result.minimum = 2; result.maximum = 2;
      const donor = eligible.find(card => card.id === draft.targets[0]);
      result.cards = draft.targets.length === 0
        ? eligible.filter(from => from.souls > 0 && eligible.some(to => to.id !== from.id && to.souls < to.definition.cap))
        : donor && donor.souls > 0 ? eligible.filter(card => card.id === donor.id || (card.souls < card.definition.cap && (draft.targets.length < 2 || draft.targets.includes(card.id)))) : [];
      break;
    }
    case 'hamaya': {
      const highest = Math.max(...field(view).map(card => card.attack));
      result.cards = eligible.filter(card => card.attack === highest);
      break;
    }
    case 'karakasa-kozo':
      result.cards = view.players.flatMap(player => isVisible(player.trap) ? [player.trap] : []);
      result.hiddenTrapSeats = view.players.filter(player => player.trap && !isVisible(player.trap)).map(player => player.id);
      break;
    case 'nekomata': result.cards = view.players[other(view.decisionPlayer)].field; break;
  }
  return result;
}

export function decisionCandidates(view: GameView, draft: TableDraft): DecisionCandidates {
  const none: DecisionCandidates = { cards: [], hiddenTrapSeats: [], minimum: 0, maximum: 0 };
  if (view.phase === 'effect' && view.pending?.kind === 'effect') {
    const source = effectSource(view);
    return source ? effectCandidates(view, source, draft) : none;
  }
  if (view.phase === 'main' && draft.attackSourceId) {
    const attacker = view.players[view.decisionPlayer].field.find(card => card.id === draft.attackSourceId);
    if (attacker && !actionUnavailableReason(view, attacker, 'attack')) return { ...none, cards: view.players[other(view.decisionPlayer)].field, minimum: 1, maximum: 1 };
  }
  return none;
}

export function canConfirmEffect(view: GameView, draft: TableDraft): boolean {
  if (view.phase !== 'effect' || view.pending?.kind !== 'effect') return false;
  const source = effectSource(view);
  if (!source) return false;
  if (source.def === 'sake') {
    return draft.targets.length === 0 && Object.entries(draft.allocations).every(([id, count]) => Number.isInteger(count) && count > 0 && count <= allocationLimit(view, draft, id));
  }
  if (Object.keys(draft.allocations).length || new Set(draft.targets).size !== draft.targets.length) return false;
  const candidates = effectCandidates(view, source, emptyDraft());
  if (draft.targets.length < candidates.minimum || draft.targets.length > candidates.maximum) return false;
  if (source.def === 'ougi') {
    const eligible = spellTargets(view), from = eligible.find(card => card.id === draft.targets[0]), to = eligible.find(card => card.id === draft.targets[1]);
    return !!from && !!to && from.souls > 0 && to.souls < to.definition.cap;
  }
  const ids = [...candidates.cards.map(card => card.id), ...candidates.hiddenTrapSeats.map(seat => `trap:${seat}`)];
  return draft.targets.every(id => ids.includes(id));
}

export function effectCommand(view: GameView, draft: TableDraft): Extract<GameCommand, { type: 'choose' }> {
  return effectSource(view)?.def === 'sake'
    ? { type: 'choose', allocations: Object.entries(draft.allocations).filter(([, count]) => count > 0).map(([cardId, count]) => ({ cardId, count })) }
    : { type: 'choose', targets: [...draft.targets] };
}

export function effectUnavailableReason(view: GameView, card: VisibleCard): string | undefined {
  if (['sake', 'jufu', 'kozuchi'].includes(card.def)) return undefined;
  if (card.def === 'boseki' && view.players[view.decisionPlayer].field.length >= 3) return 'Your field already has three yokai.';
  const candidates = effectCandidates(view, card, emptyDraft());
  if (candidates.cards.length || candidates.hiddenTrapSeats.length) return undefined;
  switch (card.def) {
    case 'karakasa-kozo': return 'There is no set trap to destroy.';
    case 'nekomata': return 'The other player has no yokai to exchange.';
    case 'boseki': return 'There is no yokai in either graveyard.';
    case 'ougi': return 'A soul source and a different yokai with room are needed.';
    case 'hamaya': return 'No highest-attack yokai can be affected by this spell.';
    default: return 'This card has no activatable effect.';
  }
}

export type CardAction = 'play' | 'evoke' | 'release' | 'setTrap' | 'attack';

export function actionUnavailableReason(view: GameView, card: VisibleCard, action: CardAction): string | undefined {
  if (view.phase !== 'main' || view.decisionPlayer !== view.turnPlayer || view.result) return 'Finish the pending decision first.';
  if (card.controller !== view.decisionPlayer) return 'That card belongs to the other player’s area.';
  const actor = view.players[view.decisionPlayer];
  if (action === 'setTrap') {
    if (card.zone !== 'hand' || card.definition.kind !== 'spell') return 'Choose a spell in your hand.';
    return actor.trap ? 'You already have a set trap.' : undefined;
  }
  if (action === 'play') {
    if (card.zone !== 'hand' && !(card.zone === 'trap' && card.definition.kind === 'spell')) return 'Choose a card in your hand or your set spell.';
    if (view.actionsUsed >= 2) return 'Both main actions are spent.';
    if (card.definition.kind === 'yokai') return actor.field.length >= 3 ? 'Your field already has three yokai.' : undefined;
    return effectUnavailableReason(view, card);
  }
  if (card.zone !== 'field') return 'Choose a yokai on your field.';
  if (action === 'evoke') {
    if (view.actionsUsed >= 2) return 'Both main actions are spent.';
    if (card.souls >= card.definition.cap) return 'That yokai is at its soul capacity.';
    return view.supply <= 0 ? 'Supply is empty.' : undefined;
  }
  if (action === 'release') {
    if (card.definition.effectType !== 'release') return 'This yokai has no release effect.';
    if (card.souls <= 0) return 'This yokai needs a soul to release.';
    return effectUnavailableReason(view, card);
  }
  if (view.turn <= 1) return 'The starting player cannot attack on the first turn.';
  if (actor.field.some(card => card.def === 'nurikabe' && card.summonedTurn === view.turn)) return 'Nurikabe prevents attacks during its summon turn.';
  return undefined;
}
