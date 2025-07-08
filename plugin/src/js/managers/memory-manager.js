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

      // React to configuration changes (guarded for test stubs)
      if (eventManager && typeof eventManager.on === 'function') {
        eventManager.on('config:updated', ({ data }) => {
          if (this.reader && typeof this.reader.applyConfig === 'function') {
            this.reader.applyConfig(data);
          }
        });
      }
    }
    
    async initialize(){
      try {
        this.initialized = false;
        this.initError = null;

        // Check if MemoryEnhancedReading is available
        if (typeof MemoryEnhancedReading === 'undefined') {
          throw new Error('MemoryEnhancedReading not loaded');
        }

        // Get configuration
        const cfg = configManager.getFeatureConfig('memory');
        
        // Create MemoryEnhancedReading instance with proper configuration
        this.reader = new MemoryEnhancedReading({
          mem0ApiKey: cfg.mem0ApiKey,
          geminiApiKey: cfg.geminiApiKey,
          geminiModel: cfg.geminiModel,
          userId: 'chrome_extension_user',
          maxMemories: cfg.maxMemories,
          relevanceThreshold: cfg.relevanceThreshold,
          debug: cfg.debug
        });
        
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
        
        console.log('🧠 Memory Manager: Starting addPageToMemory', {
          url: url,
          contentLength: content.length
        });
        
        let dup = null;
        if (!options.force) {
          console.log('🔍 Checking for duplicates...');
          dup = await deduplicator.checkDuplicate(content, url);

          if (dup) {
            // Duplicate found and not forced - return duplicate info for user confirmation
            console.log('✅ Duplicate detected, requiring user confirmation');
            await eventManager.emit('memory:add:duplicate', dup);
            return { success: true, processed: false, duplicate: true, info: dup };
          }

          console.log('❌ No duplicate found, proceeding with memory addition');
        } else {
          console.log('⚠️ Force flag set – skipping duplicate check');
        }
        
        const result = await this.reader.addPageToMemory(content, url, options);
        
        if(result.success){
          console.log('✅ Memory addition successful, caching content');
          await deduplicator.cacheContent(content, url, { snippetsCount: result.snippetsCount });
          await eventManager.emit('memory:add:success', result);
        } else {
          console.log('❌ Memory addition failed');
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
          rephrasedContent: null,
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
