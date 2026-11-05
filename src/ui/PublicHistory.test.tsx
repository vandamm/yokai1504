import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublicHistory } from './PublicHistory';
import type { HistoryEntry } from '../game/types';

it('groups actions under player turns, counting a round after both players act', () => {
  const html = renderToStaticMarkup(<PublicHistory entries={[
    'Both players prepare their decks.', 'Turn 1: Alex.', 'Alex plays Kappa.',
    'Turn 2: Poli.', 'Poli sets a trap.', 'Turn 3: Alex.', 'Alex attacks.', 'Turn 4: Poli.',
  ]} />);
  for (const heading of ['Turn 1: Alex', 'Turn 1: Poli', 'Turn 2: Alex', 'Turn 2: Poli']) {
    expect(html).toContain(`<h3>${heading}</h3>`);
  }
  expect(html).toContain('Both players prepare their decks');
  expect(html).toContain('Alex plays ');
  expect(html).toContain('data-card-def="kappa"');
  expect(html).toContain('class="history-card-link"');
  expect(html).not.toContain('<ol');
});

const plain = (html: string) => html.replace(/<[^>]*>/g, '');
it.each([
  ['Alex draws a card.', ''],
  ['Alex summons Rokurokubi.', '⛩️ Rokurokubi'],
  ['Alex attacks with Rokurokubi directly.', 'Rokurokubi ⚔️ Poli'],
  ['Alex attacks with Rokurokubi against Kappa.', 'Rokurokubi ⚔️ Kappa'],
  ['Poli takes 3 damage (battle).', 'Poli -3 ❤️'],
  ['Chochin-kozo is destroyed.', '💀 Chochin-kozo'],
  ['Alex reveals Jufu.', '💥 Jufu'],
  ['Alex casts Jufu.', '💥 Jufu'],
  ['Alex sets a spell trap.', 'Alex sets a spell trap'],
])('simplifies %s', (entry, expected) => {
  const html = renderToStaticMarkup(<PublicHistory entries={[entry]} names={['Alex', 'Poli']} />);
  expect(plain(html)).toBe(expected);
});

it('keeps empty-deck damage and displays the original soul icon instead of prose', () => {
  const html = renderToStaticMarkup(<PublicHistory names={['Alex', 'Poli']} entries={[
    'Alex draws a card.', 'Poli takes 1 damage (Alex could not draw).',
    'Alex evokes a soul onto Chochin-kozo.',
  ]} />);
  expect(plain(html)).toContain('Poli -1 ❤️ (Alex could not draw)');
  expect(plain(html)).toContain('Chochin-kozo +');
  expect(html).toContain('src="/icons/soul.svg"');
  expect(html).not.toContain('draws a card'); expect(html).not.toContain('evokes a soul');
});

it('colors repeated card names by actual owner, including cards controlled by the other player', () => {
  const entries: HistoryEntry[] = [{ actor: 0, parts: [
    'Alex attacks with ', { card: 'kappa', owner: 1 }, ' against ', { card: 'kappa', owner: 0 }, '.',
  ] }];
  const html = renderToStaticMarkup(<PublicHistory entries={entries} names={['Alex', 'Poli']} viewer={0} />);
  expect(html).toContain('data-owner="1" data-affiliation="opponent"');
  expect(html).toContain('data-owner="0" data-affiliation="own"');
  expect(plain(html)).toBe('Kappa ⚔️ Kappa');
  expect(html.match(/data-card-def="kappa"/g)).toHaveLength(2);
  const reversed = renderToStaticMarkup(<PublicHistory entries={entries} names={['Alex', 'Poli']} viewer={1} />);
  expect(reversed).toContain('data-owner="1" data-affiliation="own"');
});

it('does not turn player names that match a card into card links', () => {
  const entries: HistoryEntry[] = [{ actor: 0, parts: ['Kappa sets a spell trap.'] }];
  const html = renderToStaticMarkup(<PublicHistory entries={entries} names={['Kappa', 'Jufu']} />);
  expect(plain(html)).toBe('Kappa sets a spell trap'); expect(html).not.toContain('data-card-def');
});

it('uses the acting seat for a direct attack even when player names are identical', () => {
  const entries: HistoryEntry[] = [{ actor: 1, parts: ['Alex attacks with ', { card: 'nekomata', owner: 0 }, ' directly.'] }];
  expect(plain(renderToStaticMarkup(<PublicHistory entries={entries} names={['Alex', 'Alex']} />))).toBe('Nekomata ⚔️ Alex');
});

it('preserves punctuation in names and rebuilds correctly after undo truncates history', () => {
  const entries = ['Turn 1: A: B.', 'A: B plays Kappa.', 'Turn 2: A: B.'];
  const html = renderToStaticMarkup(<PublicHistory entries={entries} />);
  expect(html.match(/<h3>Turn 1: A: B<\/h3>/g)).toHaveLength(2);
  expect(renderToStaticMarkup(<PublicHistory entries={entries.slice(0, 2)} />)).not.toContain('Turn 2');
});

it('uses the same ownership colors for player names in turn headings, actions, attack targets and damage reasons', () => {
  const entries = ['Turn 1: Alex.', 'Alex sets a spell trap.', 'Alex attacks with Rokurokubi directly.', 'Poli takes 3 damage (battle).', 'Turn 2: Poli.', 'Poli takes 1 damage (Alex could not draw).'];
  const html = renderToStaticMarkup(<PublicHistory entries={entries} names={['Alex', 'Poli']} viewer={0} />);
  expect(html.match(/class="history-player-name" data-player="0" data-affiliation="own"/g)).toHaveLength(3);
  expect(html.match(/class="history-player-name" data-player="1" data-affiliation="opponent"/g)).toHaveLength(4);
  expect(plain(html)).toContain('Rokurokubi ⚔️ Poli');
  const reversed = renderToStaticMarkup(<PublicHistory entries={entries} names={['Alex', 'Poli']} viewer={1} />);
  expect(reversed).toContain('data-player="0" data-affiliation="opponent"');
  expect(reversed).toContain('data-player="1" data-affiliation="own"');
});

it('treats punctuation in player names literally and avoids matching inside longer words', () => {
  const html = renderToStaticMarkup(<PublicHistory entries={['Always Al greets A.+[x]. Alex']} names={['Al', 'A.+[x]']} />);
  expect(plain(html)).toBe('Always Al greets A.+[x]. Alex');
  expect(html.match(/class="history-player-name"/g)).toHaveLength(2);
  expect(html).toContain('data-affiliation="own">Al</span>');
  expect(html).toContain('data-affiliation="opponent">A.+[x]</span>');
});

it('keeps card ownership distinct when a player has the same name as a yokai', () => {
  const entries: HistoryEntry[] = [{actor:0,parts:['Kappa sets a spell trap.']},{actor:0,parts:['Kappa summons ',{card:'kappa',owner:1},'.']}];
  const html = renderToStaticMarkup(<PublicHistory entries={entries} names={['Kappa','Poli']} viewer={0} />);
  expect(html).toContain('data-player="0" data-affiliation="own">Kappa</span>');
  expect(html).toContain('data-card-def="kappa" data-owner="1" data-affiliation="opponent"');
});
