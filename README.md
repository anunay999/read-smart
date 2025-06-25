# Read Smart - Memory-Enhanced Reading Chrome Extension

A Chrome extension that personalizes web content based on your reading history using AI-powered memory analysis. Built with a clean separation between memory storage and content personalization.

## 🧠 Core Concept

Read Smart transforms how you consume web content by:
1. **Learning from your reading** - Extracts key insights and stores them as memories
2. **Personalizing new content** - Rephrases articles with a focus on what you haven't read yet
3. **Maintaining author voice** - Preserves the original writing style while adding personal context
4. **Connecting knowledge** - Shows how new content relates to your existing understanding

## 🏗️ Architecture & Approach

### Design Philosophy

The extension follows a **separation of concerns** approach with two distinct operations:

1. **Memory Addition** (`addPageToMemory`): 
   - Extracts 3-5 key insights from content
   - Stores them as discrete memory snippets
   - Focused solely on knowledge capture

2. **Content Rephrasing** (`rephraseWithUserMemories`):
   - Searches for relevant existing memories
   - Rephrases content in author's original style
   - Provides two sections: personalized content + knowledge connections

### Technical Stack

```
┌─────────────────────────────────────────┐
│           Chrome Extension              │
├─────────────────────────────────────────┤
│  Popup UI ← → Content Script ← → Page  │
├─────────────────────────────────────────┤
│      Memory-Enhanced Reading Library    │
├─────────────────────────────────────────┤
│  Mem0 API (Memory Storage)              │
│  Gemini API (Content Analysis)          │
└─────────────────────────────────────────┘
```

### Key Components

1. **Memory-Enhanced Reading Library** (`plugin/lib/memory-enhanced-reading.js`)
   - Core logic for memory operations and content processing
   - API integrations with Mem0 and Gemini
   - Error handling and fallback mechanisms

2. **Content Script** (`plugin/content.js`)
   - Page content extraction using Readability.js
   - Reader mode overlay rendering
   - Message passing between popup and library

3. **Popup Interface** (`plugin/popup.js`)
   - User controls for memory addition and smart rephrasing
   - API key configuration
   - Status feedback and error handling

## 🚀 Features

### Current Capabilities

- **Smart Memory Creation**: Automatically extracts 3-5 key insights from any webpage
- **Author-Aware Rephrasing**: Maintains original writing style while personalizing content
- **Knowledge Connections**: Shows how new content relates to existing memories
- **Reference Links**: Recap section lists source URLs for the memories used
- **Read Less, Learn More**: Personalized content skips what you've already stored and focuses on new insights
- **Reader Mode Integration**: Clean reading experience with memory-enhanced content
- **Dual-Section Output**: Main personalized content + knowledge recap
- **Graceful Fallbacks**: Works even when memory operations fail

### User Interface

- **Add to Memory**: Single-click to extract and store page insights
- **Smart Rephrase Toggle**: Personalizes content based on reading history
- **Reader Mode**: Distraction-free reading with optional personalization
- **Configuration Modal**: Easy API key setup and management

## 🔧 Installation & Setup

### 1. Clone and Load Extension

```bash
git clone https://github.com/anunay999/read-smart
cd read-smart
```

Load the `plugin` folder as an unpacked extension in Chrome.

### 2. Configure API Keys

1. **Get Mem0 API Key**: Sign up at [mem0.ai](https://mem0.ai)
2. **Get Gemini API Key**: Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
3. Click the settings icon in the extension popup
4. Enter your API keys and save

### 3. Start Using

- **Add memories**: Click "Add to Memory" on any interesting page
- **Smart reading**: Toggle "Smart Rephrase" for personalized content
- **Reader mode**: Click the reader mode toggle for distraction-free reading

## 🔧 Development

### Project Structure

```
read-smart/
├── plugin/                    # Chrome extension
│   ├── lib/
|   |   ├── Readability.js  
│   │   ├── memory-enhanced-reading.js  # Core library
│   │   └── README.md                   # Library documentation
│   ├── content.js            # Content script
│   ├── popup.js             # Popup interface
│   ├── popup.html           # Popup UI
│   ├── manifest.json        # Extension manifest
│   └── styles.css           # UI styles
└── notebook/                # Research & prototyping
    ├── memory.ipynb         # Jupyter notebook with full experiments
    ├── pyproject.toml       # Python dependencies
    ├── uv.lock              # Dependency lock file
    └── .python-version      # Python version specification
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper testing
4. Update documentation as needed
5. Submit a pull request

## 📄 License

MIT License - feel free to use and modify for your projects.

---

**Read Smart: Making every article personally relevant** 🧠✨


