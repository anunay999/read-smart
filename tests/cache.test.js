const path = require('path');

// Execute the cache script so it attaches the singleton to window.
require(path.resolve(__dirname, '../plugin/src/js/cache.js'));

const cache = window.readSmartPageCache;

describe('L1PageCache', () => {
  beforeEach(() => {
    cache.clear();
  });

  test('stores and retrieves values', () => {
    cache.set('pageA', { foo: 'bar' });
    expect(cache.get('pageA')).toEqual({ foo: 'bar' });
  });

  test('evicts least-recently-used item when capacity is exceeded', () => {
    // Fill the cache to its max capacity (5 entries).
    ['a', 'b', 'c', 'd', 'e'].forEach((key, idx) => cache.set(key, idx));
    expect(cache.size).toBe(5);

    // Adding one more entry should evict the oldest ("a").
    cache.set('f', 42);
    expect(cache.size).toBe(5);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('f')).toBe(42);
  });
}); 