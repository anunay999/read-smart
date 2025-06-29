const path = require('path');

const storagePath = path.resolve(__dirname, '../plugin/src/js/managers/storage-manager.js');
const eventPath   = path.resolve(__dirname, '../plugin/src/js/managers/event-manager.js');
const dedupPath   = path.resolve(__dirname, '../plugin/src/js/features/memory-deduplication.js');

describe('MemoryDeduplicator', () => {
  test('trims cache when exceeding max size', async () => {
    jest.resetModules();

    const mockRemoveLocal = jest.fn();
    const mockGetLocalByPattern = jest.fn();

    // Simulate 4 existing cached entries with timestamps
    const now = Date.now();
    const fakeEntries = {
      'memoryDuplication_cnt_old1': { processedAt: now - 4000, pageUrl: 'https://a.com' },
      'memoryDuplication_cnt_old2': { processedAt: now - 3000, pageUrl: 'https://b.com' },
      'memoryDuplication_cnt_new1': { processedAt: now - 2000, pageUrl: 'https://c.com' },
      'memoryDuplication_cnt_new2': { processedAt: now - 1000, pageUrl: 'https://d.com' },
    };

    mockGetLocalByPattern.mockResolvedValue(fakeEntries);

    // Mock dependent modules before requiring deduplicator
    jest.mock(storagePath, () => ({
      setLocal: jest.fn(),
      getLocalByPattern: mockGetLocalByPattern,
      removeLocal: mockRemoveLocal,
      getLocal: jest.fn(),
      setLocal: jest.fn(),
    }));
    jest.mock(eventPath, () => ({ eventManager: { emit: jest.fn() } }));

    const deduplicator = require(dedupPath);

    // Configure small cache limit and invoke trim
    deduplicator.cacheSize = 2;
    await deduplicator._trimCache();

    expect(mockRemoveLocal).toHaveBeenCalled();
    const removedKeys = mockRemoveLocal.mock.calls[0][0];
    expect(Array.isArray(removedKeys)).toBe(true);
    expect(removedKeys.length).toBeGreaterThan(0);
  });
}); 