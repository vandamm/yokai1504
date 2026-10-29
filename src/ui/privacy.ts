import type { PlayerId } from '../game/types';

export interface PrivacyTransition {
  wasHidden: boolean;
  openHands: boolean;
  previousActor?: PlayerId;
  nextActor: PlayerId;
  forcePrivacy?: boolean;
}

export function privacyAfterSnapshot({ wasHidden, openHands, previousActor, nextActor, forcePrivacy = false }: PrivacyTransition): boolean {
  return !openHands && (wasHidden || forcePrivacy || previousActor === undefined || previousActor !== nextActor);
}
