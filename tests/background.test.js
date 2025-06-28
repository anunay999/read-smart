const path = require('path');

describe('background.js', () => {
  beforeEach(() => {
    // Clear mocks before each test
    Object.values(global.chrome).forEach(section => {
      if (typeof section === 'object') {
        Object.values(section).forEach(value => {
          if (jest.isMockFunction(value)) value.mockClear();
        });
      }
    });
  });

  test('registers chrome listeners on load', () => {
    jest.isolateModules(() => {
      require(path.resolve(__dirname, '../plugin/src/js/core/background.js'));
    });

    expect(global.chrome.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
    expect(global.chrome.action.onClicked.addListener).toHaveBeenCalledTimes(1);
    expect(global.chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });
}); 