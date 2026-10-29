import { expect, it } from 'vitest';
import { DragGesture } from './gesture';
it('only the finger that picked up the card can move, drop or cancel it', () => {
  const gesture = new DragGesture();
  expect(gesture.begin('card-a', 1, 20, 30)).toBe(true);
  expect(gesture.begin('card-b', 2, 90, 90)).toBe(false);
  expect(gesture.move(1, 25, 32)?.moved).toBe(false);
  expect(gesture.move(1, 50, 60)?.moved).toBe(true);
  expect(gesture.finish(2)).toBeNull(); expect(gesture.cancel(2)).toBe(false);
  expect(gesture.move(2, 150, 200)).toBeNull();
  expect(gesture.finish(1)).toMatchObject({ id: 'card-a', moved: true });
  expect(gesture.finish(1)).toBeNull();
});
it('cancels without committing and accepts a new gesture afterward', () => {
  const gesture = new DragGesture(); gesture.begin('a', 1, 10, 10); gesture.move(1, 30, 30);
  expect(gesture.cancel(1)).toBe(true); expect(gesture.finish(1)).toBeNull();
  expect(gesture.begin('b', 2, 0, 0)).toBe(true); gesture.cancel(); expect(gesture.finish(2)).toBeNull();
});
