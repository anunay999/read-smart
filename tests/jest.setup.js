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