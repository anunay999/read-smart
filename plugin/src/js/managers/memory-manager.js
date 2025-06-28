(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config-manager.js'),
      require('./event-manager.js').eventManager,
      require('../features/memory-deduplication.js'),
      require('../../../lib/memory-enhanced-reading.js')
    );
  } else {
    root.memoryManager = factory(root.configManager, root.eventManager, root.deduplicator, root.MemoryEnhancedReading);
  }
})(typeof self !== 'undefined' ? self : this, function(configManager, eventManager, deduplicator, MemoryEnhancedReading){
  class MemoryManager {
    constructor(){ this.reader = null; }
    async initialize(){
      const cfg = configManager.getFeatureConfig('memory');
      this.reader = new MemoryEnhancedReading({
        mem0ApiKey: cfg.mem0ApiKey,
        geminiApiKey: cfg.geminiApiKey,
        geminiModel: cfg.geminiModel,
        userId: 'chrome_extension_user',
        maxMemories: cfg.maxMemories,
        relevanceThreshold: cfg.relevanceThreshold,
        debug: cfg.debug
      });
    }
    async addPageToMemory(content, url){
      const dup = await deduplicator.checkDuplicate(content, url);
      if(dup){
        await eventManager.emit('memory:add:duplicate', dup);
        return { success:true, processed:false, duplicate:true };
      }
      const result = await this.reader.addPageToMemory(content, url);
      if(result.success){
        await deduplicator.cacheContent(content, url, { snippetsCount: result.snippetsCount });
        await eventManager.emit('memory:add:success', result);
      } else {
        await eventManager.emit('memory:add:failed', result);
      }
      return result;
    }
    async rephraseWithUserMemories(content){
      const result = await this.reader.rephraseWithUserMemories(content);
      if(result.success){
        await eventManager.emit('rephrase:success', result);
      } else {
        await eventManager.emit('rephrase:failed', result);
      }
      return result;
    }
  }
  const memoryManager = new MemoryManager();
  return memoryManager;
});
