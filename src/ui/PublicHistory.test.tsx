import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicHistory } from './PublicHistory';

it('groups actions under player turns, counting a round after both players act', () => {
  const html = renderToStaticMarkup(<PublicHistory entries={[
    'Both players prepare their decks.', 'Turn 1: Alex.', 'Alex plays Kappa.',
    'Turn 2: Poli.', 'Poli sets a trap.', 'Turn 3: Alex.', 'Alex attacks.', 'Turn 4: Poli.',
  ]} />);
  for (const heading of ['Turn 1: Alex', 'Turn 1: Poli', 'Turn 2: Alex', 'Turn 2: Poli']) {
    expect(html).toContain(`<h3>${heading}</h3>`);
  }
  expect(html).toContain('Both players prepare their decks.');
  expect(html).toContain('Alex plays ');
  expect(html).toContain('data-card-def="kappa"');
  expect(html).toContain('class="history-card-link"');
  expect(html).not.toContain('<ol');
});

it('preserves punctuation in names and rebuilds correctly after undo truncates history', () => {
  const entries = ['Turn 1: A: B.', 'A: B plays Kappa.', 'Turn 2: A: B.'];
  const html = renderToStaticMarkup(<PublicHistory entries={entries} />);
  expect(html.match(/<h3>Turn 1: A: B<\/h3>/g)).toHaveLength(2);
  expect(renderToStaticMarkup(<PublicHistory entries={entries.slice(0, 2)} />)).not.toContain('Turn 2');
});
