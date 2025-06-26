// L1 in-memory cache for re-phrased pages. Lives only while the content-script instance is active.
(() => {
  class L1PageCache {
    constructor(maxEntries = 5) {
      this.maxEntries = maxEntries;
      this.map = new Map(); // Preserves insertion order for easy LRU eviction
    }

    /**
     * Retrieve a cached entry.
     * @param {string} key – usually the page URL.
     * @returns {object|undefined} value previously stored via set().
     */
    get(key) {
      return this.map.get(key);
    }

    /**
     * Insert or update a cache entry and perform simple LRU eviction.
     * @param {string} key – usually the page URL.
     * @param {object} value – arbitrary JSON-serialisable data.
     */
    set(key, value) {
      // If key already exists, delete so we can re-insert (marks as most-recently-used)
      if (this.map.has(key)) {
        this.map.delete(key);
      }

      // Evict the oldest entry if exceeding capacity
      if (this.map.size >= this.maxEntries) {
        const oldestKey = this.map.keys().next().value;
        this.map.delete(oldestKey);
      }

      this.map.set(key, value);
    }

    /**
     * Wipe the entire cache (currently unused but handy for debugging).
     */
    clear() {
      this.map.clear();
    }

    /**
     * Current number of stored entries.
     */
    get size() {
      return this.map.size;
    }
  }

  // Expose a singleton so content.js can access it regardless of evaluation order.
  window.readSmartPageCache = new L1PageCache(5);
})(); 