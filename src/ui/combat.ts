import type { GameView, PlayerId, VisibleCard } from '../game/types';

export interface Point { x: number; y: number; }
export interface Bounds extends Point { width: number; height: number; }
export interface CombatForecast {
  attacker: VisibleCard; target: VisibleCard | null; opponent: PlayerId;
  attackerDies: boolean; targetDies: boolean; ownDamage: number; opponentDamage: number; trapRisk: boolean;
}
export function forecastAttack(view: GameView, attacker: VisibleCard, target: VisibleCard | null): CombatForecast {
  const opponent = attacker.controller === 0 ? 1 : 0;
  const possession = (card: VisibleCard | null, def: string) => card?.def === def && card.souls > 0;
  const ownBattleDeath = !!target && attacker.attack <= target.attack && !possession(attacker, 'yuki-onna');
  const targetBattleDeath = !!target && target.attack <= attacker.attack && !possession(target, 'yuki-onna');
  let ownDamage = target ? Math.max(0, target.attack - attacker.attack) : 0;
  let opponentDamage = Math.max(0, attacker.attack - (target?.attack ?? 0));
  const alive = () => view.players[attacker.controller].health > ownDamage && view.players[opponent].health > opponentDamage;
  if (alive() && possession(attacker, 'rokurokubi') && targetBattleDeath && view.players[attacker.controller].deckCount === 0) opponentDamage++;
  if (alive() && possession(target, 'rokurokubi') && ownBattleDeath && view.players[opponent].deckCount === 0) ownDamage++;
  return { attacker, target, opponent, ownDamage, opponentDamage, trapRisk: !!view.players[opponent].trap,
    attackerDies: ownBattleDeath || alive() && possession(target, 'chochin-kozo'),
    targetDies: targetBattleDeath || !!target && alive() && possession(attacker, 'chochin-kozo') };
}

export function contactTravel(from: Bounds, to: Bounds): Point {
  const x = to.x + to.width / 2 - from.x - from.width / 2, y = to.y + to.height / 2 - from.y - from.height / 2;
  const reach = Math.max(0, 1 - ((from.width + to.width) / 2 - 4) / (Math.abs(x) || 1), 1 - ((from.height + to.height) / 2 - 4) / (Math.abs(y) || 1));
  return { x: x * reach, y: y * reach };
}

export function animateAttack(element: Pick<HTMLElement, 'animate'>, travel: Point, onImpact: () => void, reduced = false) {
  let animation: Animation | undefined, cancelled = false;
  const strike = `translate(${travel.x}px,${travel.y}px)`;
  const finished = (async () => {
    try {
      animation = element.animate([{ transform: 'none' }, { transform: strike }], { duration: reduced ? 0 : 270, easing: 'cubic-bezier(.55,0,1,1)', fill: 'forwards' });
      await animation.finished;
      if (cancelled) return;
      onImpact();
      animation.cancel();
      animation = element.animate([{ transform: strike }, { transform: 'none' }], { duration: reduced ? 0 : 360, easing: 'cubic-bezier(0,0,.2,1)', fill: 'forwards' });
      await animation.finished;
    } catch (error) { if (!cancelled) throw error; }
    finally { animation?.cancel(); }
  })();
  return { finished, cancel: () => { cancelled = true; animation?.cancel(); } };
}

export function attackArrowPath(start: Point, end: Point, width = 16): string {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length < 8) return '';
  const shift = (p: Point, x: number, y: number, amount: number): Point => ({ x: p.x + x * amount, y: p.y + y * amount });
  const polygon = (points: Point[]) => `M${points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L')}Z`;
  const reach = Math.min(96, length * .38), rise = dy > 0 ? 1 : -1;
  const control = { x: start.x + Math.min(42, length * .17), y: start.y + rise * reach };
  const tipX = end.x - control.x, tipY = end.y - control.y, tipLength = Math.hypot(tipX, tipY);
  const ux = tipX / tipLength, uy = tipY / tipLength, nx = -uy, ny = ux;
  const headLength = Math.min(width * 1.4, length * .45), headHalf = Math.min(width * .8, length * .28);
  const base = shift(end, ux, uy, -headLength);
  const point = (t: number): Point => ({ x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t * t * base.x, y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t * t * base.y });
  const samples = [{ t: 0, p: start, d: 0 }];
  for (let i = 1; i <= 80; i++) {
    const t = i / 80, p = point(t), previous = samples[i - 1];
    samples.push({ t, p, d: previous.d + Math.hypot(p.x - previous.p.x, p.y - previous.p.y) });
  }
  const total = samples[80].d, half = Math.min(width * .5, headHalf * .75);
  function at(distance: number) {
    let i = 1; while (i < 80 && samples[i].d < distance) i++;
    const a = samples[i - 1], b = samples[i], t = a.t + (b.t - a.t) * (distance - a.d) / (b.d - a.d || 1), p = point(t);
    const vx = 2 * (1 - t) * (control.x - start.x) + 2 * t * (base.x - control.x);
    const vy = 2 * (1 - t) * (control.y - start.y) + 2 * t * (base.y - control.y);
    const size = Math.hypot(vx, vy) || 1;
    return { p, ty: vy / size, nx: -vy / size, ny: vx / size };
  }
  const gap = 3, count = Math.max(1, Math.round((total + gap) / (Math.max(18, width * 1.5) + gap)));
  const segment = (total - gap * (count - 1)) / count, paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const from = i * (segment + gap), steps = Math.max(2, Math.ceil(segment / 4)), left: Point[] = [], right: Point[] = [];
    for (let j = 0; j <= steps; j++) {
      const s = at(from + segment * j / steps);
      if (i === 0 && j === 0) {
        left.push({ x: start.x - half / s.ty, y: start.y }); right.push({ x: start.x + half / s.ty, y: start.y });
      } else { left.push(shift(s.p, s.nx, s.ny, half)); right.push(shift(s.p, s.nx, s.ny, -half)); }
    }
    paths.push(polygon([...left, ...right.reverse()]));
  }
  paths.push(polygon([shift(base, nx, ny, headHalf), end, shift(base, nx, ny, -headHalf)]));
  return paths.join('');
}
