const path = require('path');

describe('content.js', () => {
  beforeEach(() => {
    // Ensure flag reset for each test
    delete window.readSmartInitialized;
  });

  test('sets window.readSmartInitialized flag on execution', () => {
    jest.isolateModules(() => {
      require(path.resolve(__dirname, '../plugin/src/js/core/content.js'));
    });
    expect(window.readSmartInitialized).toBe(true);
  });
}); 