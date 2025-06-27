// Prevent duplicate initialization
if (typeof window.readSmartInitialized !== 'undefined') {
  // Content script already initialized, skipping
} else {
  window.readSmartInitialized = true;

// =============================================================================
// CONSTANTS
// =============================================================================

const CONSTANTS = {
  OVERLAY_ID: 'read-smart-overlay',
  READER_STYLES_ID: 'read-smart-reader-styles',
  SKELETON_STYLES_ID: 'read-smart-skeleton-css',
  Z_INDEX: '2147483647',
  MIN_CONTENT_LENGTH: 50,
  MAX_CONTENT_LENGTH: 8000,
  SKELETON_MIN_DISPLAY_TIME: 1000,
  TRANSITION_DELAY: 100,
  USER_ID: 'chrome_extension_user'
};

const SELECTORS = {
  CONTENT_CONTAINERS: [
    'main', 'article', '[role="main"]', 
    '.content', '.post-content', '.entry-content',
    '.article-content', '.story-body', '.post-body',
    'body'
  ]
};

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

class ReadSmartState {
  constructor() {
    this.readerModeActive = false;
    this.smartRephraseActive = false;
    this.overlay = null;
    this.geminiApiKey = null;
    this.originalArticle = null;
    this.rephrasedContent = null;
    // Advanced configuration defaults
    this.config = {
      systemPrompt: '',
      relevanceThreshold: 0.5,
      maxMemories: 6,
      geminiModel: 'gemini-2.5-flash',
    };
  }

  setReaderMode(active) {
    this.readerModeActive = active;
    this.smartRephraseActive = !active;
  }

  setSmartRephraseMode(active) {
    this.smartRephraseActive = active;
    this.readerModeActive = !active;
  }

  reset() {
    this.readerModeActive = false;
    this.smartRephraseActive = false;
    this.overlay = null;
    this.originalArticle = null;
    this.rephrasedContent = null;
  }
}

const state = new ReadSmartState();

// =============================================================================
// INITIALIZATION
// =============================================================================

function initializeContentScript() {
  // Load stored API key and advanced config
  chrome.storage.sync.get([
    'geminiApiKey',
    'systemPrompt',
    'relevanceThreshold',
    'maxMemories',
    'geminiModel',
  ], (result) => {
    state.geminiApiKey = result.geminiApiKey;
    state.config.systemPrompt = result.systemPrompt || state.config.systemPrompt;
    if (typeof result.relevanceThreshold === 'number') {
      state.config.relevanceThreshold = result.relevanceThreshold;
    }
    if (typeof result.maxMemories === 'number') {
      state.config.maxMemories = result.maxMemories;
    }
    if (typeof result.geminiModel === 'string') {
      state.config.geminiModel = result.geminiModel;
    }
  });

  // Notify that content script is ready
  chrome.runtime.sendMessage({ action: "contentScriptReady" });
}

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

const messageHandlers = {
  enableReaderMode: async () => {
    await enablePlainReaderMode();
    return { success: true };
  },

  disableReaderMode: () => {
    disableReaderMode();
    return { success: true };
  },

  toggleReaderMode: async () => {
    if (state.readerModeActive) {
      disableReaderMode();
      return { success: true, active: false };
    } else {
      await enablePlainReaderMode();
      return { success: true, active: true };
    }
  },

  enableSmartRephrase: async (request) => {
    await enableSmartRephraseMode(request.geminiApiKey, request.mem0ApiKey);
    return { success: true };
  },

  disableSmartRephrase: () => {
    disableSmartRephrase();
    return { success: true };
  },

  getState: () => ({
    readerModeActive: state.readerModeActive,
    smartRephraseActive: state.smartRephraseActive
  }),

  updateApiKeys: (request) => {
    state.geminiApiKey = request.geminiApiKey;
    return { success: true };
  },

  // NEW: handle dynamic config updates
  configUpdated: (request) => {
    if (request.config) {
      state.config = {
        ...state.config,
        ...request.config
      };
      if (request.config.geminiApiKey) {
        state.geminiApiKey = request.config.geminiApiKey;
      }
    }
    return { success: true };
  },

  extractPageContent: async () => {
    return await extractPageContentForMemory();
  },

  addPageToMemory: async (request) => {
    return await addPageToMemory(request.geminiApiKey, request.mem0ApiKey);
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = messageHandlers[request.action];
  
  if (!handler) {
    return false;
  }

  // Handle async operations
  if (handler.constructor.name === 'AsyncFunction') {
    (async () => {
      try {
        const result = await handler(request);
        sendResponse(result);
      } catch (error) {
        console.error(`❌ Error handling ${request.action}:`, error.message);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open
  } else {
    // Handle synchronous operations
    try {
      const result = handler(request);
      sendResponse(result);
    } catch (error) {
      console.error(`❌ Error handling ${request.action}:`, error.message);
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }
});

// =============================================================================
// CORE FUNCTIONALITY
// =============================================================================

async function enablePlainReaderMode() {
  try {
    const article = await extractMainContent();
    state.originalArticle = article;
    
    await renderReaderOverlay({
      title: article.title,
      content: article.content
    }, false);
    
    state.setReaderMode(true);
  } catch (error) {
    console.error('❌ Error in enablePlainReaderMode:', error.message);
    throw error;
  }
}

async function enableSmartRephraseMode(geminiApiKey, mem0ApiKey) {
  try {
    const pageUrl = window.location.href;

    // Attempt to serve from in-memory L1 cache first
    if (window.readSmartPageCache) {
      const cached = window.readSmartPageCache.get(pageUrl);
      if (cached && cached.markdown) {
        console.log('✅ ReadSmart: L1 page cache hit. Skipping regeneration.');
        const article = await extractMainContent();
        state.originalArticle = article;
        await renderReaderOverlay({
          title: article.title,
          content: cached.markdown
        }, true);

        state.setSmartRephraseMode(true);
        state.rephrasedContent = cached.markdown;
        return; // Short-circuit – we're done.
      }
    }

    const article = await extractMainContent();
    state.originalArticle = article;
    
    // Show skeleton loading
    await showSkeletonOverlay();
    
    // Ensure minimum display time for skeleton
    const minDisplayTime = new Promise(resolve => 
      setTimeout(resolve, CONSTANTS.SKELETON_MIN_DISPLAY_TIME)
    );
    
    // Try memory-enhanced rephrasing first, then fallback to regular Gemini
    const rephrasedContent = await tryRephraseWithMemories(article, geminiApiKey, mem0ApiKey);
    
    // Wait for minimum display time and show content
    await minDisplayTime;
    await transitionFromSkeletonToContent(article, rephrasedContent);
    
    state.setSmartRephraseMode(true);
    state.rephrasedContent = rephrasedContent;

    // Store in cache for the remainder of this page session
    if (window.readSmartPageCache) {
      window.readSmartPageCache.set(pageUrl, {
        markdown: rephrasedContent,
        generatedAt: Date.now()
      });
    }
  } catch (error) {
    cleanupOverlays();
    console.error('Error in enableSmartRephraseMode:', error);
    throw error;
  }
}

function disableReaderMode() {
  cleanupOverlays();
  restoreOriginalContent();
  state.reset();
}

function disableSmartRephrase() {
  cleanupOverlays();
  restoreOriginalContent();
  state.reset();
}

// =============================================================================
// CONTENT EXTRACTION
// =============================================================================

async function extractMainContent() {
  if (typeof Readability === 'undefined') {
    throw new Error('Readability library not loaded');
  }
  
  const documentClone = document.cloneNode(true);
  fixLazyLoadedImages(documentClone);
  
  const reader = new Readability(documentClone, {
    charThreshold: 20,
    classesToPreserve: ['important', 'highlight']
  });
  
  const article = reader.parse();
  
  if (!article) {
    throw new Error('Could not extract article content');
  }
  
  return {
    title: article.title,
    content: article.content,
    textContent: article.textContent,
    length: article.length,
    excerpt: article.excerpt
  };
}

async function extractPageContentForMemory() {
  try {
    // Try Readability first
    const documentClone = document.cloneNode(true);
    fixLazyLoadedImages(documentClone);
    const reader = new Readability(documentClone, {
      charThreshold: 20,
      classesToPreserve: ['important', 'highlight']
    });
    const article = reader.parse();
    
    if (article && article.textContent && article.textContent.trim().length > 100) {
      return {
        success: true,
        content: article.textContent.trim(),
        title: article.title || document.title || 'Untitled Page'
      };
    }
    
    // Fallback to visible text extraction
    const title = document.title || 'Untitled Page';
    const content = extractVisibleText();
    
    if (content.length < CONSTANTS.MIN_CONTENT_LENGTH) {
      throw new Error('Insufficient content found on page');
    }
    
    return {
      success: true,
      content: content,
      title: title
    };
  } catch (error) {
    console.error('❌ Error extracting page content:', error);
    throw new Error('Failed to extract page content: ' + error.message);
  }
}

function extractVisibleText() {
  let content = '';
  
  for (const selector of SELECTORS.CONTENT_CONTAINERS) {
    const element = document.querySelector(selector);
    if (!element) continue;
    
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          const style = window.getComputedStyle(parent);
          
          // Skip hidden elements and script/style tags
          if (['script', 'style', 'noscript'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    
    const textContent = [];
    let textNode;
    while (textNode = walker.nextNode()) {
      const text = textNode.textContent.trim();
      if (text.length > 0) {
        textContent.push(text);
      }
    }
    
    content = textContent.join(' ').trim();
    
    // If we got substantial content, use it
    if (content.length > 200) {
      break;
    }
  }
  
  // Clean and limit content
  content = content.replace(/\s+/g, ' ').trim();
  
  if (content.length > CONSTANTS.MAX_CONTENT_LENGTH) {
    content = content.substring(0, CONSTANTS.MAX_CONTENT_LENGTH) + '...';
  }
  
  return content;
}

function fixLazyLoadedImages(doc) {
  const imgs = doc.querySelectorAll('img');
  imgs.forEach(img => {
    if (!img.getAttribute('src')) {
      const dataSrc = img.getAttribute('data-src') || 
                     img.getAttribute('data-original') || 
                     img.getAttribute('data-lazy-src');
      if (dataSrc) {
        img.setAttribute('src', dataSrc);
      }
    }
  });
}

// =============================================================================
// OVERLAY RENDERING
// =============================================================================

async function renderReaderOverlay(article, isMarkdown = false) {
  cleanupOverlays();
  hideDOMExceptOverlay();
  
  state.overlay = document.createElement('div');
  state.overlay.id = CONSTANTS.OVERLAY_ID;
  state.overlay.className = `fixed inset-0 w-screen h-screen overflow-auto bg-[#f4ecd8] z-[${CONSTANTS.Z_INDEX}]`;
  
  await injectReaderStyles();
  await loadReaderTemplate(state.overlay, article, isMarkdown);
  
  document.body.appendChild(state.overlay);
}

async function showSkeletonOverlay() {
  console.log('Creating skeleton overlay');
  
  cleanupOverlays();
  disableReaderStyles();
  hideDOMExceptOverlay();
  injectSkeletonCSS();
  
  // Small delay to ensure DOM cleanup
  await new Promise(resolve => setTimeout(resolve, CONSTANTS.TRANSITION_DELAY));
  
  state.overlay = document.createElement('div');
  state.overlay.id = CONSTANTS.OVERLAY_ID;
  state.overlay.className = 'skeleton-overlay';
  
  await loadSkeletonTemplate(state.overlay);
  
  document.body.appendChild(state.overlay);
  
  // Force reflow
  state.overlay.offsetHeight;
  
  console.log('Skeleton overlay created');
}

// =============================================================================
// TEMPLATE LOADING
// =============================================================================

async function loadReaderTemplate(overlay, article, isMarkdown) {
  try {
    const response = await fetch(chrome.runtime.getURL('src/html/reader.html'));
    const template = await response.text();
    
    const processedContent = isMarkdown && window.marked ? 
      window.marked.parse(article.content) : article.content;
    
    const html = template
      .replace('{{TITLE}}', article.title)
      .replace('{{CONTENT}}', processedContent);
    
    overlay.innerHTML = html;
  } catch (error) {
    console.error('Failed to load reader template:', error);
    throw new Error('Reader template could not be loaded');
  }
}

async function loadSkeletonTemplate(overlay) {
  try {
    const response = await fetch(chrome.runtime.getURL('src/html/skeleton.html'));
    const template = await response.text();
    overlay.innerHTML = template;
  } catch (error) {
    console.error('Failed to load skeleton template:', error);
    throw new Error('Skeleton template could not be loaded');
  }
}

// =============================================================================
// CSS MANAGEMENT
// =============================================================================

async function injectReaderStyles() {
  const existingStyles = document.getElementById(CONSTANTS.READER_STYLES_ID);
  
  if (!existingStyles) {
    const link = document.createElement('link');
    link.id = CONSTANTS.READER_STYLES_ID;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('src/css/reader-styles.css');
    document.head.appendChild(link);
  } else {
    // Re-enable if disabled
    existingStyles.disabled = false;
  }
}

function injectSkeletonCSS() {
  if (document.getElementById(CONSTANTS.SKELETON_STYLES_ID)) return;
  
  const link = document.createElement('link');
  link.id = CONSTANTS.SKELETON_STYLES_ID;
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = chrome.runtime.getURL('src/css/skeleton.css');
  document.head.appendChild(link);
}

function disableReaderStyles() {
  const readerStyles = document.getElementById(CONSTANTS.READER_STYLES_ID);
  if (readerStyles) {
    readerStyles.disabled = true;
  }
}

// =============================================================================
// CONTENT REPHRASING
// =============================================================================

async function tryRephraseWithMemories(article, geminiApiKey, mem0ApiKey) {
  try {
    const result = await rephraseWithMemoriesUsingArticle(article, geminiApiKey, mem0ApiKey);
    if (result.success && result.rephrasedContent) {
      console.log('Successfully rephrased with memories');
      return result.rephrasedContent;
    }
  } catch (error) {
    console.error('Memory rephrasing failed, falling back to Gemini:', error);
  }
  
  // Fallback to regular Gemini rephrasing
  console.log('Using fallback Gemini rephrasing');
  return await rephraseWithGemini(article.textContent);
}

async function rephraseWithGemini(text) {
  if (!state.geminiApiKey) {
    throw new Error('Gemini API key not set. Please set it in the extension settings.');
  }
  
  if (typeof MemoryEnhancedReading === 'undefined') {
    throw new Error('MemoryEnhancedReading library not loaded');
  }
  
  const promptBase = state.config.systemPrompt && state.config.systemPrompt.trim().length > 0
    ? state.config.systemPrompt.trim()
    : 'Please rephrase the following text in a clear, engaging, and easy-to-read style while maintaining the original meaning and key information. Render in Markdown format:';
  const prompt = `${promptBase}\n\n---\n\n${text}`;
  
  const memoryReader = new MemoryEnhancedReading({
    geminiApiKey: state.geminiApiKey,
    geminiModel: state.config.geminiModel,
    userId: CONSTANTS.USER_ID,
    debug: state.config.debug
  });
  
  return await memoryReader.generateWithGemini(prompt);
}

async function rephraseWithMemoriesUsingArticle(article, geminiApiKey, mem0ApiKey) {
  if (typeof MemoryEnhancedReading === 'undefined') {
    throw new Error('MemoryEnhancedReading library not loaded');
  }
  
  const memoryReader = new MemoryEnhancedReading({
    mem0ApiKey: mem0ApiKey,
    geminiApiKey: geminiApiKey,
    geminiModel: state.config.geminiModel,
    userId: CONSTANTS.USER_ID,
    debug: state.config.debug,
    maxMemories: state.config.maxMemories,
    relevanceThreshold: state.config.relevanceThreshold
  });

  const result = await memoryReader.rephraseWithUserMemories(article.textContent);
  
  if (result.success && result.rephrasedContent && result.rephrasedContent.trim().length > 0) {
    return result;
  }
  
  return {
    success: false,
    error: 'No content generated from memory rephrasing'
  };
}

async function addPageToMemory(geminiApiKey, mem0ApiKey) {
  try {
    if (typeof MemoryEnhancedReading === 'undefined') {
      throw new Error('MemoryEnhancedReading library not loaded');
    }
    
    const contentResult = await extractPageContentForMemory();
    
    if (!contentResult.success) {
      throw new Error('Failed to extract page content');
    }
    
    const memoryReader = new MemoryEnhancedReading({
      mem0ApiKey: mem0ApiKey,
      geminiApiKey: geminiApiKey,
      geminiModel: state.config.geminiModel,
      userId: CONSTANTS.USER_ID,
      debug: state.config.debug,
      maxMemories: state.config.maxMemories,
      relevanceThreshold: state.config.relevanceThreshold
    });
    
    const pageUrl = window.location.href;
    return await memoryReader.addPageToMemory(contentResult.content, pageUrl);
    
  } catch (error) {
    console.error('❌ Error in addPageToMemory:', error);
    return {
      success: false,
      processed: false,
      error: error.message
    };
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

async function transitionFromSkeletonToContent(article, rephrasedContent) {
  console.log('Transitioning from skeleton to content');
  removeOverlay();
  await new Promise(resolve => setTimeout(resolve, CONSTANTS.TRANSITION_DELAY));
  await renderReaderOverlay({
    title: article.title,
    content: rephrasedContent
  }, true);
}

function cleanupOverlays() {
  removeOverlay();
  
  // Remove any stray overlays by ID
  let existingOverlay = document.getElementById(CONSTANTS.OVERLAY_ID);
  while (existingOverlay) {
    existingOverlay.remove();
    existingOverlay = document.getElementById(CONSTANTS.OVERLAY_ID);
  }
}

function removeOverlay() {
  if (state.overlay) {
    state.overlay.remove();
    state.overlay = null;
  }
}

function hideDOMExceptOverlay() {
  Array.from(document.body.children).forEach(child => {
    if (child.id !== CONSTANTS.OVERLAY_ID) {
      child.style.display = 'none';
    }
  });

  // Disable scrolling on the main page to avoid double scrollbars
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function restoreOriginalContent() {
  Array.from(document.body.children).forEach(child => {
    if (child.id !== CONSTANTS.OVERLAY_ID) {
      child.style.display = '';
    }
  });

  // Re-enable page scrolling
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
}

// =============================================================================
// INITIALIZATION
// =============================================================================

initializeContentScript();

} // End of readSmartInitialized check
