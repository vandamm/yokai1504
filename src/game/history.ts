import { CARDS } from './catalog';
import type { HistoryEntry } from './types';

export function historyText(entry: HistoryEntry): string {
  return typeof entry === 'string' ? entry : entry.parts.map(part => typeof part === 'string' ? part : CARDS[part.card].name).join('');
}
