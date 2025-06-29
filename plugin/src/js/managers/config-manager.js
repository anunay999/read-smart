(function(root, factory){
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./storage-manager.js'), require('./event-manager.js').eventManager);
  } else {
    root.configManager = factory(root.storageManager, root.eventManager);
  }
})(typeof self !== 'undefined' ? self : this, function(storageManager, eventManager){
  const DEFAULT_CONFIG = {
    geminiApiKey: '',
    mem0ApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    systemPrompt: '',
    relevanceThreshold: 0.3,
    maxMemories: 6,
    enableDeduplication: true,
    maxDuplicationCacheSize: 1000,
    allowDuplicateAfterDays: 30,
    debugDeduplication: false,
    debugMode: false
  };

  class ConfigManager {
    constructor(){
      this.config = { ...DEFAULT_CONFIG };
      this.initialized = false;
    }
    async initialize(){
      const raw = await storageManager.get(Object.keys(DEFAULT_CONFIG));
      // Remove undefined/null so defaults survive when user hasn't saved anything
      const stored = Object.fromEntries(
        Object.entries(raw).filter(([_, v]) => v !== undefined && v !== null)
      );
      this.config = { ...DEFAULT_CONFIG, ...stored };
      this.initialized = true;
      await eventManager.emit('config:initialized', this.config);
    }
    get(key){
      if (!key) return { ...this.config };
      return this.config[key];
    }
    async set(key, value){
      let updatedData;
      if (typeof key === 'object') {
        Object.assign(this.config, key);
        await storageManager.set(key);
        updatedData = { ...key };
      } else {
        this.config[key] = value;
        await storageManager.set({ [key]: value });
        updatedData = { [key]: value };
      }
      await eventManager.emit('config:updated', updatedData);
    }
    getFeatureConfig(feature){
      const c = key => (this.config[key] ?? DEFAULT_CONFIG[key]);

      if (feature === 'memory') {
        return {
          mem0ApiKey: c('mem0ApiKey'),
          geminiApiKey: c('geminiApiKey'),
          geminiModel: c('geminiModel'),
          maxMemories: c('maxMemories'),
          relevanceThreshold: c('relevanceThreshold'),
          debug: c('debugMode')
        };
      }
      if (feature === 'deduplication') {
        return {
          enableDeduplication: c('enableDeduplication'),
          maxCacheSize: c('maxDuplicationCacheSize'),
          allowDuplicateAfterDays: c('allowDuplicateAfterDays'),
          debug: c('debugDeduplication')
        };
      }
      if (feature === 'ai') {
        return {
          geminiApiKey: c('geminiApiKey'),
          geminiModel: c('geminiModel'),
          systemPrompt: c('systemPrompt'),
          debug: c('debugMode')
        };
      }
      return { ...this.config };
    }
  }

  const configManager = new ConfigManager();
  return configManager;
});
