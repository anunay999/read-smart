/* Jest global setup for Chrome extension scripts */

const noop = () => {};
const asyncNoop = () => Promise.resolve();

if (typeof global.chrome === 'undefined') {
  global.chrome = {
    storage: {
      sync: {
        get: jest.fn((keys, cb) => cb({})),
        set: jest.fn((items, cb) => cb && cb()),
      },
      local: {
        get: jest.fn((keys, cb) => cb({})),
        set: jest.fn((items, cb) => cb && cb()),
        remove: jest.fn((keys, cb) => cb && cb()),
      },
    },
    runtime: {
      sendMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
      },
      onInstalled: {
        addListener: jest.fn(),
      },
    },
    action: {
      onClicked: {
        addListener: jest.fn(),
      },
    },
    tabs: {
      sendMessage: jest.fn(),
    },
    scripting: {
      executeScript: jest.fn(() => Promise.resolve()),
    },
  };
}

// Provide a minimal fetch mock for content.js template loading
if (!global.fetch) {
  global.fetch = jest.fn(() => Promise.resolve({ text: () => Promise.resolve('<html></html>') }));
}

// Provide basic stubs for manager modules used by content.js during tests
if (typeof global.configManager === 'undefined') {
  global.configManager = {
    initialize: jest.fn(() => Promise.resolve()),
    get: jest.fn(() => undefined),
    set: jest.fn(() => Promise.resolve()),
    getFeatureConfig: jest.fn(() => ({})),
  };
}
if (typeof global.deduplicator === 'undefined') {
  global.deduplicator = {
    initialize: jest.fn(() => Promise.resolve()),
  };
}
if (typeof global.memoryManager === 'undefined') {
  global.memoryManager = {
    initialize: jest.fn(() => Promise.resolve()),
    addPageToMemory: jest.fn(() => Promise.resolve({ success: true })),
    rephraseWithUserMemories: jest.fn(() => Promise.resolve({ success: true })),
    reader: { generateWithGemini: jest.fn(() => Promise.resolve('')) }
  };
}
