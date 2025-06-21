# Memory-Enhanced Reading Library

This is the core JavaScript library for the Read Smart Chrome extension. It provides AI-powered memory creation and content personalization capabilities.

## 📚 Documentation

For comprehensive documentation, including:
- Complete setup instructions
- Architecture overview
- Current challenges and limitations
- Planned improvements
- Usage examples
- API reference

Please see the **[main README](../../README.md)** in the project root.

## 🚀 Quick Start

### Basic Memory Addition

```javascript
// Initialize the library
const memoryReader = new MemoryEnhancedReading({
    mem0ApiKey: 'your-mem0-api-key',
    geminiApiKey: 'your-gemini-api-key',
    userId: 'unique-user-id'
});

// Add page content to memory
const result = await memoryReader.addPageToMemory(pageContent);
if (result.success) {
    console.log(`Added ${result.snippetsCount} memory snippets`);
}
```

### Smart Content Rephrasing

```javascript
// Rephrase content based on user memories
const result = await memoryReader.rephraseWithUserMemories(pageContent);
if (result.success) {
    console.log(`Personalized using ${result.relevantMemoriesCount} memories`);
    displayPersonalizedContent(result.rephrasedContent);
}
```

### Chrome Extension Integration

```javascript
// Content script integration
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "addPageToMemory") {
        addPageToMemory(request.geminiApiKey, request.mem0ApiKey)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
});
```

---

#### Configuration Options

```javascript
const config = {
    mem0ApiKey: string,          // Required: Mem0 API key
    geminiApiKey: string,        // Required: Gemini API key
    userId: string,              // Required: Unique user identifier
    geminiModel: string,         // Optional: 'gemini-2.5-flash' (default)
    maxMemories: number,         // Optional: 10 (default)
    relevanceThreshold: number,  // Optional: 0.3 (default)
    debug: boolean              // Optional: false (default)
};
```


## 🏗️ Architecture

The library follows a **separation of concerns** approach:

1. **Memory Addition**: Focused solely on extracting and storing key insights
2. **Content Rephrasing**: Searches memories and personalizes content while preserving author style

This clean separation makes the code more maintainable and allows for focused improvements to each operation.

---

For detailed documentation, examples, and development information, see the **[main README](../../README.md)**. 