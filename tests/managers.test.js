const path = require('path');

const configPath = path.resolve(__dirname, '../plugin/src/js/managers/config-manager.js');
const eventPath = path.resolve(__dirname, '../plugin/src/js/managers/event-manager.js');
const storagePath = path.resolve(__dirname, '../plugin/src/js/managers/storage-manager.js');
const memoryPath = path.resolve(__dirname, '../plugin/src/js/managers/memory-manager.js');
const dedupPath = path.resolve(__dirname, '../plugin/src/js/features/memory-deduplication.js');
const memLibPath = path.resolve(__dirname, '../plugin/lib/memory-enhanced-reading.js');

// Utility to load a fresh copy of a module
function freshRequire(modulePath) {
  jest.isolateModules(() => {
    delete require.cache[require.resolve(modulePath)];
  });
  return require(modulePath);
}

describe('manager modules', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('ConfigManager', () => {
    test('initializes from storage and emits event', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => cb({ geminiApiKey: 'abc' }));
      const { eventManager } = freshRequire(eventPath);
      jest.spyOn(eventManager, 'emit');
      const configManager = freshRequire(configPath);
      await configManager.initialize();
      expect(configManager.get('geminiApiKey')).toBe('abc');
      expect(eventManager.emit).toHaveBeenCalledWith('config:initialized', expect.any(Object));
    });

    test('set updates value in storage and emits', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => cb({}));
      const { eventManager } = freshRequire(eventPath);
      jest.spyOn(eventManager, 'emit');
      const configManager = freshRequire(configPath);
      await configManager.initialize();
      await configManager.set('debugMode', true);
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ debugMode: true }, expect.any(Function));
      expect(eventManager.emit).toHaveBeenCalledWith('config:updated', { debugMode: true });
      expect(configManager.get('debugMode')).toBe(true);
    });
  });

  describe('EventManager', () => {
    test('on and emit trigger listeners', async () => {
      const { EventManager } = freshRequire(eventPath);
      const em = new EventManager();
      const handler = jest.fn();
      em.on('test', handler);
      await em.emit('test', { foo: 1 });
      expect(handler).toHaveBeenCalledWith({ event: 'test', data: { foo: 1 } });
    });

    test('once only fires once', async () => {
      const { EventManager } = freshRequire(eventPath);
      const em = new EventManager();
      const handler = jest.fn();
      em.once('test', handler);
      await em.emit('test');
      await em.emit('test');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('StorageManager', () => {
    test('get and set proxy to chrome.storage.sync', async () => {
      chrome.storage.sync.get.mockImplementation((keys, cb) => cb({ key: 'val' }));
      const storageManager = freshRequire(storagePath);
      const val = await storageManager.get('key');
      expect(val.key).toBe('val');
      await storageManager.set({ key: 'v2' });
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ key: 'v2' }, expect.any(Function));
    });

    test('local storage helpers work', async () => {
      chrome.storage.local.get.mockImplementation((keys, cb) => cb({ localKey: '1' }));
      const storageManager = freshRequire(storagePath);
      const val = await storageManager.getLocal('localKey');
      expect(val).toBe('1');
      await storageManager.setLocal('localKey', '2');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ localKey: '2' }, expect.any(Function));
    });
  });

  describe('MemoryManager', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.mock(configPath, () => ({ getFeatureConfig: () => ({ mem0ApiKey: 'm', geminiApiKey: 'g', geminiModel: 'model', maxMemories: 6, relevanceThreshold: 0.5, debug: false }) }));
      jest.mock(dedupPath, () => ({ checkDuplicate: jest.fn().mockResolvedValue(null), cacheContent: jest.fn() }));
      jest.mock(memLibPath, () => {
        return jest.fn().mockImplementation(() => ({
          addPageToMemory: jest.fn().mockResolvedValue({ success: true, snippetsCount: 2 }),
          rephraseWithUserMemories: jest.fn().mockResolvedValue({ success: true, rephrasedContent: 'out' })
        }));
      });
      jest.mock(eventPath, () => ({ eventManager: { emit: jest.fn() } }));
    });

    test('returns duplicate result when deduplicator finds match', async () => {
      const dedup = require(dedupPath);
      dedup.checkDuplicate.mockResolvedValue({ exists: true });
      const memoryManager = freshRequire(memoryPath);
      await memoryManager.initialize();
      const res = await memoryManager.addPageToMemory('c', 'u');
      expect(res.duplicate).toBe(true);
    });

    test('caches content and emits success on add', async () => {
      const dedup = require(dedupPath);
      dedup.checkDuplicate.mockResolvedValue(null);
      const { eventManager } = require(eventPath);
      const memoryManager = freshRequire(memoryPath);
      await memoryManager.initialize();
      const res = await memoryManager.addPageToMemory('c', 'u');
      expect(res.success).toBe(true);
      expect(dedup.cacheContent).toHaveBeenCalled();
      expect(eventManager.emit).toHaveBeenCalledWith('memory:add:success', expect.any(Object));
    });
  });
});

