(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../managers/storage-manager.js'), require('../managers/event-manager.js').eventManager, require('../managers/config-manager.js'));
  } else {
    root.deduplicator = factory(root.storageManager, root.eventManager, root.configManager);
  }
})(typeof self !== 'undefined' ? self : this, function(storageManager, eventManager, configManager){
  class MemoryDeduplicator {
    constructor(){
      this.cachePrefix = 'memoryDuplication_';
      this.cacheSize = 0;
    }
    async initialize(){
      const { maxCacheSize } = configManager.getFeatureConfig('deduplication');
      this.cacheSize = maxCacheSize;
    }
    async _hash(content){
      const msgUint8 = new TextEncoder().encode(content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
    }
    async checkDuplicate(content, url){
      const hash = await this._hash(content+'|'+url+'|'+content.length);
      const key = this.cachePrefix + hash.substring(0,16);
      const existing = await storageManager.getLocal(key);
      if(existing){
        await eventManager.emit('dedup:hit', existing);
        return existing;
      }
      await eventManager.emit('dedup:miss', {hash});
      return null;
    }
    async cacheContent(content, url, metadata={}){
      const hash = await this._hash(content+'|'+url+'|'+content.length);
      const key = this.cachePrefix + hash.substring(0,16);
      const entry = { hash, pageUrl:url, processedAt:Date.now(), contentLength:content.length, ...metadata };
      await storageManager.setLocal(key, entry);
    }
  }
  const deduplicator = new MemoryDeduplicator();
  return deduplicator;
});
