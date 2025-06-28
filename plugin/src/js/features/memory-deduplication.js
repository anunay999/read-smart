(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../managers/storage-manager.js'),
      require('../managers/event-manager.js').eventManager,
      require('../managers/config-manager.js')
    );
  } else {
    root.deduplicator = factory(root.storageManager, root.eventManager, root.configManager);
  }
})(typeof self !== 'undefined' ? self : this, function(storageManager, eventManager, configManager){
  /**
   * MemoryDeduplicator – fast in-extension duplicate detection.
   * Strategy:
   * 1.  Cheap URL-based lookup (normalized URL key).
   * 2.  Content fingerprint (first + last slice) SHA-256.
   * Both keys are stored so either path can detect duplicates next time.
   */
  class MemoryDeduplicator {
    constructor(){
      this.cachePrefix = 'memoryDuplication_';
      this.cacheSize = 0; // reserved for future LRU trim
    }

    /* ---------------------------------------------------------------------- */
    async initialize(){
      const { maxCacheSize } = configManager.getFeatureConfig('deduplication');
      this.cacheSize = maxCacheSize;
    }

    /** Normalize URL for duplicate detection. */
    _normalizeUrl(url){
      try {
        const u = new URL(url);
        let host = u.hostname.replace(/^www\./, '');
        let path = u.pathname.replace(/\/$/, '');
        return host + path; // drop protocol, query, hash
      } catch (_) {
        // Fallback if URL constructor fails
        return url.replace(/^https?:\/\//, '')
                  .replace(/^www\./, '')
                  .replace(/[?#].*$/, '')
                  .replace(/\/$/, '');
      }
    }

    /** SHA-256 helper that returns hex string. */
    async _hash(bufferOrString){
      const data = bufferOrString instanceof Uint8Array ? bufferOrString : new TextEncoder().encode(bufferOrString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray  = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
    }

    /**
     * Check if given page content / url is duplicate.
     * Returns the cached entry if found or null.
     */
    async checkDuplicate(content, url){
      // -------- Stage 1: URL key ------------------------------------------
      const normUrl = this._normalizeUrl(url);
      const urlKey  = this.cachePrefix + 'url_' + normUrl;

      const byUrl = await storageManager.getLocal(urlKey);
      if (byUrl) {
        console.log('✅ Duplicate (URL) found:', byUrl);
        await eventManager.emit('dedup:hit', byUrl);
        return byUrl;
      }

      // -------- Stage 2: Content fingerprint ------------------------------
      // Slice sampling – take first and last 5 KB of content for hash
      const sliceSize = 5000;
      const sample    = content.slice(0, sliceSize) + content.slice(-sliceSize) + content.length;
      const hash      = await this._hash(sample);
      const hashKey   = this.cachePrefix + 'cnt_' + hash.substring(0,16);

      const byContent = await storageManager.getLocal(hashKey);
      if (byContent) {
        console.log('✅ Duplicate (content) found:', byContent);
        await eventManager.emit('dedup:hit', byContent);
        return byContent;
      }

      console.log('❌ No duplicate found for', urlKey, hashKey);
      await eventManager.emit('dedup:miss', { hash });
      return null;
    }

    /** Cache the processed page so future calls can detect duplicates. */
    async cacheContent(content, url, metadata = {}){
      const normUrl  = this._normalizeUrl(url);
      const urlKey   = this.cachePrefix + 'url_' + normUrl;

      const sliceSize = 5000;
      const sample    = content.slice(0, sliceSize) + content.slice(-sliceSize) + content.length;
      const hash      = await this._hash(sample);
      const hashKey   = this.cachePrefix + 'cnt_' + hash.substring(0,16);

      const entry = {
        hash,
        pageUrl: url,
        processedAt: Date.now(),
        contentLength: content.length,
        ...metadata
      };

      console.log('💾 Caching content with keys:', urlKey, hashKey, entry);

      await storageManager.setLocal(urlKey,  entry);
      await storageManager.setLocal(hashKey, entry);

      // TODO: optional size trimming based on this.cacheSize
    }
  }

  const deduplicator = new MemoryDeduplicator();
  return deduplicator;
});
