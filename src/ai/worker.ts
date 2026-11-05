import { chooseAiCommand } from './opponent';
import weights from './trained.json';
import type { GameView } from '../game/types';

self.onmessage = (event: MessageEvent<GameView>) => {
  try {
    self.postMessage({ command: chooseAiCommand(event.data, { weights }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The AI could not choose a move.' });
  }
};
