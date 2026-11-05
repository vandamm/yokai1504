import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Setup } from './App';
import type { RecentGame } from '../session/online';

afterEach(() => vi.unstubAllGlobals());

const activeGame: RecentGame = { room: 'room-a', opponent: 'Poli', status: 'active', turn: 7, yourTurn: true };
function setup(recent: RecentGame[], entry = { room: null as string | null, invite: null as string | null }) {
  vi.stubGlobal('window', { location: { href: 'https://game.test/' } });
  return renderToStaticMarkup(<Setup onStart={() => {}} onCreate={() => {}} onJoin={() => {}} entry={entry} recent={recent} busy={false} onRules={() => {}} />);
}

it('offers online creation first and keeps local testing in its own disclosure', () => {
  const html = renderToStaticMarkup(<Setup onStart={() => {}} onCreate={() => {}} onJoin={() => {}} entry={{ room: null, invite: null }} recent={[]} busy={false} onRules={() => {}} />);
  expect(html.indexOf('Create online table')).toBeLessThan(html.indexOf('Local testing'));
  expect(html).toContain('maxLength="24"');
  expect(html).toContain('Start local game');
  expect(html).toContain('Open hands');
  expect(html).toContain('aria-pressed="false">Join a game');
});

it('offers a private AI game outside the local testing disclosure', () => {
  const html = renderToStaticMarkup(<Setup onStart={() => {}} onStartAi={() => {}} onCreate={() => {}} onJoin={() => {}} entry={{ room: null, invite: null }} recent={[]} busy={false} onRules={() => {}} />);
  expect(html).toContain('Play AI');
  expect(html.indexOf('Create online table')).toBeLessThan(html.indexOf('Play AI'));
  expect(html.indexOf('Play AI')).toBeLessThan(html.indexOf('Local testing'));
  expect(html).toContain('cannot see your hand');
});

it('offers the invited seat explicitly without putting its invitation into form text', () => {
  const html = renderToStaticMarkup(<Setup onStart={() => {}} onCreate={() => {}} onJoin={() => {}} entry={{ room: 'room-a', invite: 'invite-private' }} recent={[]} busy={false} onRules={() => {}} />);
  expect(html).toContain('Join invited table');
  expect(html).not.toContain('invite-private');
  expect(html).not.toContain('Invitation link<input');
  expect(html).not.toContain('Create online table');
});

it('makes unfinished games with opponent names the primary action before new-game setup', () => {
  const html = setup([activeGame]);
  expect(html).toContain('Continue your game');
  expect(html).toContain('vs Poli');
  expect(html).toContain('Your turn');
  expect(html).toContain('Turn 7');
  expect(html).toContain('href="https://game.test/?room=room-a"');
  expect(html.indexOf('vs Poli')).toBeLessThan(html.indexOf('Create online table'));
  expect(html).toMatch(/<details[^>]*><summary>Start or join another game<\/summary>/);
});

it('keeps create/join primary when saved games are finished or unavailable', () => {
  const html = setup([{ ...activeGame, status: 'finished' }, { ...activeGame, room: 'offline', opponent: null, status: 'unavailable' }]);
  expect(html).toContain('Take a seat.');
  expect(html).not.toContain('Continue your game');
  expect(html).not.toContain('Start or join another game');
  expect(html.indexOf('Create online table')).toBeLessThan(html.indexOf('Other saved games'));
  expect(html).toContain('vs Poli');
  expect(html).toContain('Finished');
  expect(html).toContain('Status unavailable');
});

it('offers a waiting table without pretending an opponent has joined', () => {
  const html = setup([{ ...activeGame, opponent: null, status: 'waiting', yourTurn: false }]);
  expect(html).toContain('Invite a friend');
  expect(html).toContain('Waiting for a player');
  expect(html).not.toContain('vs null');
});

it('keeps a direct invitation ready to join even when another game is unfinished', () => {
  const html = setup([activeGame], { room: 'invited-room', invite: 'invite-private' });
  expect(html).toContain('Join invited table');
  expect(html).not.toContain('Start or join another game');
  expect(html).not.toContain('invite-private');
});
