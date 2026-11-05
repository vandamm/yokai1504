import { useEffect, useRef, useState } from 'react';
import type { GameView, PlayerId } from '../game/types';
import { publicAsset } from './assets';

export function MatchSign({ view, viewer, show }: { view: GameView; viewer?: PlayerId; show: boolean }) {
  const [visible, setVisible] = useState(true);
  const started = useRef(false);
  const result = view.result;
  const own = result ? result.winner === viewer : view.turnPlayer === viewer;
  const label = result ? result.winner === null ? 'Draw' : viewer === undefined ? `${view.players[result.winner].name} wins` : own ? 'You win' : 'You lose'
    : own ? 'Your turn' : `${view.players[view.turnPlayer].name}’s turn`;
  useEffect(() => {
    if (!show) { if (started.current) setVisible(false); return; }
    started.current = true;
    const timer = window.setTimeout(() => setVisible(false), result ? 5000 : 2000);
    return () => window.clearTimeout(timer);
  }, [show]);
  useEffect(() => {
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setVisible(false); };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, []);
  if (!show || !visible) return null;
  return <div className={`match-sign-layer ${own ? 'own-sign' : 'enemy-sign'} ${result ? 'result-sign' : ''}`} onClick={() => setVisible(false)}>
    <button type="button" className="match-sign" aria-label={`${label}. Dismiss announcement`}>
      <span role={result ? 'alert' : 'status'}><img src={publicAsset('icons/soul.svg')} alt="" /><strong>{label}</strong><small>Tap to continue</small></span>
    </button>
  </div>;
}
