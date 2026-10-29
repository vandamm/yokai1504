import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../game/engine';
import { viewForLocalTesting } from '../game/views';
import { DragSurface, useTableDrag } from './DragSurface';
import { CardFace } from './CardFace';
import { emptyDraft } from './interaction';
import type { VisibleCard } from '../game/types';
import { CARDS } from '../game/catalog';

function Sources({ ids }: { ids: string[] }) {
  const drag = useTableDrag();
  return <>{ids.map(id => <button key={id} {...drag.bind(id)}>{id}</button>)}</>;
}
it('does not bind opponent cards as pointer or keyboard drag sources', () => {
  const view = viewForLocalTesting(createGame({ seed: 45, startingPlayer: 0 }));
  const own=view.players[0].hand![0].id, rival=view.players[1].hand![0].id;
  const html=renderToStaticMarkup(<DragSurface view={view} draft={emptyDraft()} disabled={false} onDrop={()=>{}} onPick={()=>{}}><Sources ids={[own,rival]} /></DragSurface>);
  expect(html).toContain(`data-drag="${own}"`);
  expect(html).not.toContain(`data-drag="${rival}"`);
});
it('renders the same live values for a field card face used in the drag preview', () => {
  const card: VisibleCard={id:'a',def:'kappa',owner:0,controller:0,zone:'field',souls:2,summonedTurn:1,attack:6,definition:CARDS.kappa};
  const html=renderToStaticMarkup(<CardFace card={card} />);
  expect(html).toContain('class="live-attack modified" aria-hidden="true">6');
  expect(html.match(/soul-slot filled/g)).toHaveLength(2);
});
