// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readStartSlideIndex, clearStartSlideParam } from '../usePresentationMode';

const setSearch = (search: string) => window.history.replaceState(null, '', `/${search}`);

describe('presenter start slide', () => {
  afterEach(() => setSearch(''));

  it('reads the 1-based ?slide= parameter as a 0-based index', () => {
    setSearch('?mode=presenter&slide=3');
    expect(readStartSlideIndex()).toBe(2);
  });

  it('ignores a missing or invalid parameter', () => {
    setSearch('?mode=presenter');
    expect(readStartSlideIndex()).toBeNull();
    for (const bad of ['0', '-1', '1.5', 'abc']) {
      setSearch(`?mode=presenter&slide=${bad}`);
      expect(readStartSlideIndex()).toBeNull();
    }
  });

  it('clears the parameter but keeps the mode', () => {
    setSearch('?mode=presenter&slide=3');
    clearStartSlideParam();
    expect(window.location.search).toBe('?mode=presenter');
    expect(readStartSlideIndex()).toBeNull();
  });
});
