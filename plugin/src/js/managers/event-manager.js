(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.EventManager = exports.EventManager;
    root.eventManager = exports.eventManager;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  class EventManager {
    constructor() {
      this.listeners = {};
      this.history = [];
    }
    on(event, handler) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(handler);
    }
    once(event, handler) {
      const wrapper = (...args) => {
        this.off(event, wrapper);
        handler(...args);
      };
      this.on(event, wrapper);
    }
    off(event, handler) {
      if (!this.listeners[event]) return;
      const idx = this.listeners[event].indexOf(handler);
      if (idx >= 0) this.listeners[event].splice(idx, 1);
    }
    async emit(event, data) {
      this.history.push({ event, data, ts: Date.now() });
      const handlers = this.listeners[event] || [];
      await Promise.all(handlers.map(h => Promise.resolve().then(() => h({ event, data }))));
    }
    waitFor(event, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = timeoutMs ? setTimeout(() => {
          this.off(event, handler);
          reject(new Error('timeout'));
        }, timeoutMs) : null;
        const handler = (e) => {
          if (timer) clearTimeout(timer);
          this.off(event, handler);
          resolve(e);
        };
        this.on(event, handler);
      });
    }
    getHistory() {
      return this.history.slice();
    }
  }
  const eventManager = new EventManager();
  return { EventManager, eventManager };
});
