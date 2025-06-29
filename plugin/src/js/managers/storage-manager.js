(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.storageManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function(){
  class StorageManager {
    async get(keys){
      return new Promise(resolve => {
        chrome.storage.sync.get(keys, result => resolve(result));
      });
    }
    async set(items){
      return new Promise(resolve => {
        chrome.storage.sync.set(items, () => resolve());
      });
    }
    async getLocal(key){
      return new Promise(resolve => {
        chrome.storage.local.get([key], res => resolve(res[key]));
      });
    }
    async setLocal(key, value){
      return new Promise(resolve => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    }
    /**
     * Remove one or multiple keys from `chrome.storage.local`.
     * Accepts a single string key or an array of keys.
     */
    async removeLocal(keys){
      const toRemove = Array.isArray(keys) ? keys : [keys];
      if(!toRemove.length) return;
      return new Promise(resolve => {
        chrome.storage.local.remove(toRemove, () => resolve());
      });
    }
    async getLocalByPattern(prefix){
      return new Promise(resolve => {
        chrome.storage.local.get(null, items => {
          const result = {};
          for (const [k,v] of Object.entries(items)) {
            if(k.startsWith(prefix)) result[k] = v;
          }
          resolve(result);
        });
      });
    }
    async removeLocalByPattern(prefix){
      const items = await this.getLocalByPattern(prefix);
      if(Object.keys(items).length){
        return new Promise(resolve => {
          chrome.storage.local.remove(Object.keys(items), () => resolve());
        });
      }
    }
  }
  return new StorageManager();
});
