import { describe, expect, it } from 'vitest';
import { privacyAfterSnapshot } from './privacy';

describe('private table transitions', () => {
  it('keeps a manually hidden table hidden after same-player undo', () => {
    expect(privacyAfterSnapshot({ wasHidden: true, openHands: false, previousActor: 0, nextActor: 0 })).toBe(true);
  });
  it('keeps a revealed table open for the same player', () => {
    expect(privacyAfterSnapshot({ wasHidden: false, openHands: false, previousActor: 0, nextActor: 0 })).toBe(false);
  });
  it('hides the table when a turn or response changes the decision maker', () => {
    expect(privacyAfterSnapshot({ wasHidden: false, openHands: false, previousActor: 0, nextActor: 1 })).toBe(true);
  });
  it('hides a loaded or newly started private match', () => {
    expect(privacyAfterSnapshot({ wasHidden: false, openHands: false, nextActor: 0 })).toBe(true);
    expect(privacyAfterSnapshot({ wasHidden: false, openHands: false, previousActor: 0, nextActor: 0, forcePrivacy: true })).toBe(true);
  });
  it('hides the table immediately when switching back to private mode', () => {
    expect(privacyAfterSnapshot({ wasHidden: false, openHands: false, previousActor: 1, nextActor: 1, forcePrivacy: true })).toBe(true);
  });
  it('opens the table when open hands is enabled, including after a handoff or load', () => {
    expect(privacyAfterSnapshot({ wasHidden: true, openHands: true, previousActor: 0, nextActor: 1, forcePrivacy: true })).toBe(false);
    expect(privacyAfterSnapshot({ wasHidden: false, openHands: true, nextActor: 0 })).toBe(false);
  });
});
