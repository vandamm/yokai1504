import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';

afterEach(() => vi.unstubAllGlobals());

describe('match and command IDs', () => {
  it('creates a UUID on local-network HTTP without randomUUID', () => {
    const random = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal('crypto', { getRandomValues: random });
    const ids = Array.from({ length: 40 }, () => createId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('also creates valid IDs in secure browser contexts', () => {
    expect(createId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
