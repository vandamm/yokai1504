import type { CSSProperties } from 'react';
import type { CardDefId, VisibleCard } from '../game/types';
import { publicAsset } from './assets';

const cardColors: Partial<Record<CardDefId, string>> = {
  'karakasa-kozo': '#7c9554', kappa: '#ab525e', nekomata: '#d95d47',
  'zashiki-warashi': '#d89fae', 'chochin-kozo': '#579d95', rokurokubi: '#9f8bbf',
  'yuki-onna': '#324d88', tengu: '#686868', nurikabe: '#b2abaa',
};
/** Original artwork with live values over its printed attack and soul slots. */
export function CardFace({ card, allocation = 0 }: { card: VisibleCard; allocation?: number }) {
  return <span className="card-face" style={{ '--card-color': cardColors[card.def] } as CSSProperties}>
    <img src={publicAsset(`cards/${card.def}.png`)} alt="" draggable={false} />
    {card.zone === 'field' && <>
      <span className={`live-attack ${card.attack !== card.definition.atk ? 'modified' : ''}`} aria-hidden="true">{card.attack}</span>
      <span className="soul-slots" aria-hidden="true">{Array.from({ length: card.definition.cap }, (_, index) => <span key={index} className={`soul-slot ${index < card.souls ? 'filled' : index < card.souls + allocation ? 'pending' : ''}`} />)}</span>
    </>}
  </span>;
}

