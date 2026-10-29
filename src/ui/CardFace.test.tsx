import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARDS } from '../game/catalog';
import type { VisibleCard } from '../game/types';
import { CardFace } from './CardFace';

const wall: VisibleCard = { id: 'wall', def: 'nurikabe', owner: 0, controller: 0, zone: 'field', souls: 0, summonedTurn: 1, definition: CARDS.nurikabe, attack: 5 };
it('restores Nurikabe’s artwork beneath live stats instead of using a flat grey fill', () => {
  const html = renderToStaticMarkup(<CardFace card={wall} />);
  expect(html).toContain('cards/nurikabe-stats.svg');
  expect(html).toContain('--card-color:transparent');
  expect(html).toContain('aria-hidden="true">5</span>');
  expect(html).toContain('class="soul-slot "');
});
it('keeps the live attack and one filled soul when Nurikabe is evoked', () => {
  const html = renderToStaticMarkup(<CardFace card={{ ...wall, souls: 1, attack: 6 }} />);
  expect(html).toContain('class="live-attack modified" aria-hidden="true">6</span>');
  expect(html.match(/class="soul-slot filled"/g)).toHaveLength(1);
});
it('keeps the original printed artwork in hand and leaves other yokai unchanged', () => {
  expect(renderToStaticMarkup(<CardFace card={{ ...wall, zone: 'hand' }} />)).not.toContain('nurikabe-stats.svg');
  expect(renderToStaticMarkup(<CardFace card={{ ...wall, def: 'tengu', definition: CARDS.tengu }} />)).not.toContain('nurikabe-stats.svg');
});
