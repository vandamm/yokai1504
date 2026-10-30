import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Setup } from './App';

it('offers online creation first and keeps local testing in its own disclosure', () => {
  const html = renderToStaticMarkup(<Setup onStart={() => {}} onCreate={() => {}} onJoin={() => {}} entry={{ room: null, invite: null }} recent={[]} busy={false} onRules={() => {}} />);
  expect(html.indexOf('Create online table')).toBeLessThan(html.indexOf('Local testing'));
  expect(html).toContain('maxLength="24"');
  expect(html).toContain('Start local game');
  expect(html).toContain('Open hands');
});

it('offers the invited seat explicitly without putting its invitation into form text', () => {
  const html = renderToStaticMarkup(<Setup onStart={() => {}} onCreate={() => {}} onJoin={() => {}} entry={{ room: 'room-a', invite: 'invite-private' }} recent={[]} busy={false} onRules={() => {}} />);
  expect(html).toContain('Join invited table');
  expect(html).not.toContain('invite-private');
});
