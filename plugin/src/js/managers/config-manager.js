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
    relevanceThreshold: 0.5,
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
      const stored = await storageManager.get(Object.keys(DEFAULT_CONFIG));
      this.config = { ...DEFAULT_CONFIG, ...stored };
      this.initialized = true;
      await eventManager.emit('config:initialized', this.config);
    }
    get(key){
      if (!key) return { ...this.config };
      return this.config[key];
    }
    async set(key, value){
      if (typeof key === 'object') {
        Object.assign(this.config, key);
        await storageManager.set(key);
      } else {
        this.config[key] = value;
        await storageManager.set({ [key]: value });
      }
      await eventManager.emit('config:updated', { [key]: value });
    }
    getFeatureConfig(feature){
      const cfg = this.config;
      if (feature === 'memory') {
        const { mem0ApiKey, geminiApiKey, geminiModel, maxMemories, relevanceThreshold, debugMode } = cfg;
        return { mem0ApiKey, geminiApiKey, geminiModel, maxMemories, relevanceThreshold, debug: debugMode };
      }
      if (feature === 'deduplication') {
        const { enableDeduplication, maxDuplicationCacheSize, allowDuplicateAfterDays, debugDeduplication } = cfg;
        return { enableDeduplication, maxCacheSize: maxDuplicationCacheSize, allowDuplicateAfterDays, debug: debugDeduplication };
      }
      if (feature === 'ai') {
        const { geminiApiKey, geminiModel, systemPrompt, debugMode } = cfg;
        return { geminiApiKey, geminiModel, systemPrompt, debug: debugMode };
      }
      return { ...cfg };
    }
  }

  const configManager = new ConfigManager();
  return configManager;
});
