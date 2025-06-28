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
    constructor(){ 
      this.reader = null; 
      this.initialized = false;
      this.initError = null;
    }
    
    async initialize(){
      try {
        this.initialized = false;
        this.initError = null;

        // Check if MemoryEnhancedReading is available
        if (typeof MemoryEnhancedReading === 'undefined') {
          throw new Error('MemoryEnhancedReading not loaded');
        }

        // Create new instance
        this.reader = new MemoryEnhancedReading();
        
        if (!this.reader) {
          throw new Error('Failed to create MemoryEnhancedReading instance');
        }

        this.initialized = true;
        
      } catch (error) {
        this.initError = error.message;
        console.error('Memory manager initialization failed:', error);
        throw error;
      }
    }
    
    _ensureInitialized() {
      if (!this.initialized || !this.reader) {
        const errorMsg = this.initError 
          ? `MemoryManager not properly initialized: ${this.initError}`
          : 'MemoryManager not initialized. Call initialize() first.';
        throw new Error(errorMsg);
      }
    }
    
    async addPageToMemory(content, url, options = {}){
      if (!this.initialized || !this.reader) {
        throw new Error('Memory manager not properly initialized');
      }

      if (!this.reader.addPageToMemory || typeof this.reader.addPageToMemory !== 'function') {
        throw new Error('addPageToMemory method not available');
      }

      try {
        this._ensureInitialized();
        
        if(!options.force){
          const dup = await deduplicator.checkDuplicate(content, url);
          if(dup){
            await eventManager.emit('memory:add:duplicate', dup);
            return { success:true, processed:false, duplicate:true, info: dup };
          }
        }
        
        const result = await this.reader.addPageToMemory(content, url, options);
        
        if(result.success){
          await deduplicator.cacheContent(content, url, { snippetsCount: result.snippetsCount });
          await eventManager.emit('memory:add:success', result);
        } else {
          await eventManager.emit('memory:add:failed', result);
        }
        return result;
        
      } catch (error) {
        console.error('❌ Error in MemoryManager.addPageToMemory:', error);
        const result = { 
          success: false, 
          processed: false, 
          error: error.message,
          debugInfo: {
            initialized: this.initialized,
            hasReader: !!this.reader,
            initError: this.initError,
            timestamp: new Date().toISOString()
          }
        };
        await eventManager.emit('memory:add:failed', result);
        return result;
      }
    }

    async forceAddToMemory(content, url){
      return await this.addPageToMemory(content, url, { force: true });
    }
    
    async rephraseWithUserMemories(text, context = {}){
      if (!this.initialized || !this.reader) {
        throw new Error('Memory manager not properly initialized');
      }

      if (!this.reader.rephraseWithUserMemories || typeof this.reader.rephraseWithUserMemories !== 'function') {
        throw new Error('rephraseWithUserMemories method not available');
      }

      try {
        this._ensureInitialized();
        
        const result = await this.reader.rephraseWithUserMemories(text, context);
        
        if(result.success){
          await eventManager.emit('rephrase:success', result);
        } else {
          await eventManager.emit('rephrase:failed', result);
        }
        return result;
        
      } catch (error) {
        console.error('❌ Error in MemoryManager.rephraseWithUserMemories:', error);
        const result = { 
          success: false, 
          processed: false, 
          error: error.message,
          rephrasedContent: text, // fallback to original
          originalContent: text,
          relevantMemoriesCount: 0
        };
        await eventManager.emit('rephrase:failed', result);
        return result;
      }
    }
    
    // Debug method to check manager state
    getDebugInfo() {
      return {
        initialized: this.initialized,
        hasReader: !!this.reader,
        initError: this.initError,
        readerMethods: this.reader ? Object.getOwnPropertyNames(Object.getPrototypeOf(this.reader)).filter(name => typeof this.reader[name] === 'function') : []
      };
    }
  }
  
  const memoryManager = new MemoryManager();
  return memoryManager;
});
