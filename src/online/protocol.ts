import type { GameCommand, PlayerId } from '../game/types';
import type { SessionSnapshot } from '../session/local';
export interface OnlineSnapshot extends SessionSnapshot {
  viewer: PlayerId;
  finalized: boolean;
  waitingForOpponent: boolean;
  undoRequestedBy: PlayerId | null;
}
export type OnlineCommand = GameCommand | { type: 'undo' | 'requestUndo' };
export interface OnlineAction { commandId: string; expectedRevision: number; command: OnlineCommand; }
export interface OnlineCreated { matchId: string; token: string; invite: string; snapshot: OnlineSnapshot; }
export interface OnlineJoined { token: string; snapshot: OnlineSnapshot; }
