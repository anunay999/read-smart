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

async function initializeContentScript() {
  try {
    await configManager.initialize();
    await deduplicator.initialize();
    await memoryManager.initialize();

    state.geminiApiKey = configManager.get('geminiApiKey');
    state.config.systemPrompt = configManager.get('systemPrompt');
    state.config.relevanceThreshold = configManager.get('relevanceThreshold');
    state.config.maxMemories = configManager.get('maxMemories');
    state.config.geminiModel = configManager.get('geminiModel');
    state.config.debug = configManager.get('debugMode');

    chrome.runtime.sendMessage({ action: 'contentScriptReady' });
    
  } catch (error) {
    console.error('❌ Content script initialization failed:', error);
    
    // Try to provide a fallback state
    try {
      if (configManager && typeof configManager.get === 'function') {
        state.geminiApiKey = configManager.get('geminiApiKey');
      }
    } catch (fallbackError) {
      console.error('❌ Fallback initialization also failed:', fallbackError);
    }
  }
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

  enableSmartRephrase: async () => {
    await enableSmartRephraseMode();
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
    configManager.set('geminiApiKey', request.geminiApiKey);
    return { success: true };
  },

  // NEW: handle dynamic config updates
  configUpdated: (request) => {
    if (request.config) {
      configManager.set(request.config);
      state.config = { ...state.config, ...request.config };
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
    return await addPageToMemory(request.force);
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

async function enableSmartRephraseMode() {
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
    const rephrasedContent = await tryRephraseWithMemories(article);
    
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

async function tryRephraseWithMemories(article) {
  try {
    // Check if memoryManager is properly initialized
    if (!memoryManager || !memoryManager.reader) {
      console.error('Memory manager not properly initialized, falling back to Gemini');
      return await rephraseWithGemini(article.textContent);
    }

    const result = await memoryManager.rephraseWithUserMemories(article.textContent);
    if (result.success && result.rephrasedContent) {
      console.log('Successfully rephrased with memories');
      return result.rephrasedContent;
    }
  } catch (error) {
    console.error('Memory rephrasing failed, falling back to Gemini:', error);
  }

  console.log('Using fallback Gemini rephrasing');
  return await rephraseWithGemini(article.textContent);
}

async function rephraseWithGemini(text) {
  if (!state.geminiApiKey) {
    throw new Error('Gemini API key not set. Please set it in the extension settings.');
  }

  // Check if memoryManager and reader are available
  if (!memoryManager || !memoryManager.reader || typeof memoryManager.reader.generateWithGemini !== 'function') {
    throw new Error('Memory manager not properly initialized. Cannot access Gemini functionality.');
  }

  const promptBase = state.config.systemPrompt && state.config.systemPrompt.trim().length > 0
    ? state.config.systemPrompt.trim()
    : 'Please rephrase the following text in a clear, engaging, and easy-to-read style while maintaining the original meaning and key information. Render in Markdown format:';
  const prompt = `${promptBase}\n\n---\n\n${text}`;

  return await memoryManager.reader.generateWithGemini(prompt);
}


async function addPageToMemory(force = false) {
  try {
    // Check if memoryManager is properly initialized
    if (typeof memoryManager === 'undefined' || memoryManager === null) {
      throw new Error('Memory manager not available. Please refresh the page and try again.');
    }

    // Check if memoryManager has the required method
    if (!memoryManager.addPageToMemory || typeof memoryManager.addPageToMemory !== 'function') {
      throw new Error('Memory manager missing addPageToMemory method. Please refresh the page.');
    }

    const contentResult = await extractPageContentForMemory();
    if (!contentResult.success) {
      throw new Error('Failed to extract page content: ' + contentResult.error);
    }

    const pageUrl = window.location.href;
    const opts = force ? { force: true } : {};
    
    const result = await memoryManager.addPageToMemory(contentResult.content, pageUrl, opts);
    
    return result;
  } catch (error) {
    console.error('❌ Error in addPageToMemory:', error);
    
    // Provide more specific error messages
    let userFriendlyMessage = error.message;
    if (error.message.includes('not available')) {
      userFriendlyMessage = 'Extension not properly loaded. Please refresh the page and try again.';
    } else if (error.message.includes('Failed to fetch')) {
      userFriendlyMessage = 'Network error. Please check your internet connection and API keys.';
    } else if (error.message.includes('API key')) {
      userFriendlyMessage = 'Invalid API key. Please check your settings.';
    }
    
    return { 
      success: false, 
      processed: false, 
      error: userFriendlyMessage,
      debugInfo: {
        originalError: error.message,
        timestamp: new Date().toISOString()
      }
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

// Simple debug function for troubleshooting if needed
window.readSmartDebug = function() {
  console.log('🔍 Read Smart Extension Status:');
  console.log('- Content script loaded:', typeof window.readSmartInitialized !== 'undefined');
  console.log('- Memory manager available:', typeof memoryManager !== 'undefined' && !!memoryManager);
  console.log('- Config manager available:', typeof configManager !== 'undefined' && !!configManager);
  
  if (typeof memoryManager !== 'undefined' && memoryManager && typeof memoryManager.getDebugInfo === 'function') {
    const debugInfo = memoryManager.getDebugInfo();
    console.log('- Memory manager initialized:', debugInfo.initialized);
    console.log('- Has reader instance:', debugInfo.hasReader);
    if (debugInfo.initError) {
      console.log('- Initialization error:', debugInfo.initError);
    }
  }
  
  if (typeof configManager !== 'undefined' && configManager) {
    const config = configManager.get();
    console.log('- API keys configured:', {
      gemini: !!config.geminiApiKey,
      mem0: !!config.mem0ApiKey
    });
  }
};

(async () => { await initializeContentScript(); })();

} // End of readSmartInitialized check
