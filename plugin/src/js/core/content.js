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

// Progress-overlay constants
const PROGRESS_ID = 'read-smart-progress-overlay';
let progressOverlayLoaded = false;

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

class ReadSmartState {
  constructor() {
    this.smartRephraseActive = false;
    this.overlay = null;
    this.geminiApiKey = null;
    this.originalArticle = null;
    this.rephrasedContent = null;
    this.noRelevantMemoriesFound = false; // Tracks if memory search failed for current page
    this.noMemoryPageUrl = null;
    this.contentGenerationFailed = false; // Tracks if content generation failed for current page
    this.generationFailureMessage = null; // Stores the specific error message
    this.generationFailurePageUrl = null; // Tracks which page the failure occurred on
    // Advanced configuration defaults
    this.config = {
      systemPrompt: '',
      relevanceThreshold: 0.5,
      maxMemories: 6,
      geminiModel: 'gemini-2.5-flash',
    };
  }

  setSmartRephraseMode(active) {
    this.smartRephraseActive = active;
  }

  reset() {
    this.smartRephraseActive = false;
    this.overlay = null;
    this.originalArticle = null;
    this.rephrasedContent = null;
    // Reset failure states
    this.noRelevantMemoriesFound = false;
    this.noMemoryPageUrl = null;
    this.contentGenerationFailed = false;
    this.generationFailureMessage = null;
    this.generationFailurePageUrl = null;
  }
}

const state = new ReadSmartState();

// =============================================================================
// DEBUG LOGGING
// =============================================================================

function debugLog(message, data = null) {
  if (state.config.debug) {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

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

    // Reset memory-related flags for a fresh page load
    resetFailureStates();

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
  enableSmartRephrase: async () => {
    await enableSmartRephraseMode();
    return { success: true };
  },

  disableSmartRephrase: () => {
    disableSmartRephrase();
    return { success: true };
  },

  getState: () => ({
    smartRephraseActive: state.smartRephraseActive
  }),

  updateApiKeys: (request) => {
    state.geminiApiKey = request.geminiApiKey;
    configManager.set({
      geminiApiKey: request.geminiApiKey,
      mem0ApiKey: request.mem0ApiKey ?? configManager.get('mem0ApiKey')
    });

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
// STATE HELPERS
// =============================================================================

function checkAndHandleFailureState(currentUrl) {
  // Check for previous memory search failure
  if (state.noRelevantMemoriesFound && state.noMemoryPageUrl === currentUrl) {
    alert('No relevant memories found – cannot personalise article');
    throw new Error('No relevant memories found');
  }
  
  // Check for previous content generation failure
  if (state.contentGenerationFailed && state.generationFailurePageUrl === currentUrl) {
    alert(state.generationFailureMessage || 'Failed to generate personalized content');
    throw new Error('Content generation failed');
  }
  
  // Reset flags if on different page
  if (state.noRelevantMemoriesFound && state.noMemoryPageUrl !== currentUrl) {
    state.noRelevantMemoriesFound = false;
    state.noMemoryPageUrl = null;
  }
  
  if (state.contentGenerationFailed && state.generationFailurePageUrl !== currentUrl) {
    state.contentGenerationFailed = false;
    state.generationFailureMessage = null;
    state.generationFailurePageUrl = null;
  }
}

function resetFailureStates() {
  state.noRelevantMemoriesFound = false;
  state.noMemoryPageUrl = null;
  state.contentGenerationFailed = false;
  state.generationFailureMessage = null;
  state.generationFailurePageUrl = null;
}

async function handleCachedContent(pageUrl) {
  if (!window.readSmartPageCache) return null;
  
  const cached = window.readSmartPageCache.get(pageUrl);
  if (!cached?.markdown) return null;
  
  debugLog('✅ ReadSmart: L1 page cache hit. Skipping regeneration.');
  
  // Simulate progress for cached content with realistic timing
  const delays = [0, 300, 600, 900, 1200];
  for (let i = 0; i < 4; i++) {
    await new Promise(resolve => setTimeout(resolve, delays[i]));
    completeProgressStep(i);
  }
  
  const article = await extractMainContent();
  state.originalArticle = article;
  await renderReaderOverlay({
    title: article.title,
    content: cached.markdown
  }, true);

  state.setSmartRephraseMode(true);
  state.rephrasedContent = cached.markdown;
  
  completeProgressStep(4);
  setTimeout(hideProgressOverlay, 1500);
  return true; // Indicates cache was used
}

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
  const currentUrl = window.location.href;
  checkAndHandleFailureState(currentUrl);

  try {
    const steps = [
      'Extracting content',
      'Searching memories', 
      'Validating relevance',
      'Generating content',
      'Finalizing'
    ];
    await showProgressOverlay(steps);
    const pageUrl = window.location.href;

    // Attempt to serve from cache first
    if (await handleCachedContent(pageUrl)) {
      return; // Cache hit - we're done
    }

    const article = await extractMainContent();
    state.originalArticle = article;
    
    // Show skeleton loading
    await showSkeletonOverlay();
    completeProgressStep(0);
    
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
    if (error.message && error.message.includes('No relevant memories')) {
      state.noRelevantMemoriesFound = true;
      state.noMemoryPageUrl = window.location.href;
      try { alert('No relevant memories found – cannot personalise article'); } catch (_) {}
    }
    cleanupOverlays();
    hideProgressOverlay();
    // Ensure original page is visible again
    try { restoreOriginalContent(); } catch (_) {}
    console.error('Error in enableSmartRephraseMode:', error);
    throw error;
  }
}


function disableSmartRephrase() {
  cleanupOverlays();
  hideProgressOverlay();
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
      const extractedContent = article.textContent.trim();
      
      // Debug: Log content extraction details
      debugLog('📄 Content extracted via Readability:', {
        title: article.title || document.title || 'Untitled Page',
        contentLength: extractedContent.length,
        contentHash: await simpleHash(extractedContent),
        contentPreview: extractedContent.substring(0, 200) + '...',
        url: window.location.href
      });
      
      completeProgressStep(0);
      return {
        success: true,
        content: extractedContent,
        title: article.title || document.title || 'Untitled Page'
      };
    }
    
    // Fallback to visible text extraction
    const title = document.title || 'Untitled Page';
    const content = extractVisibleText();
    
    if (content.length < CONSTANTS.MIN_CONTENT_LENGTH) {
      throw new Error('Insufficient content found on page');
    }
    
    // Debug: Log fallback content extraction
    debugLog('📄 Content extracted via fallback:', {
      title: title,
      contentLength: content.length,
      contentHash: await simpleHash(content),
      contentPreview: content.substring(0, 200) + '...',
      url: window.location.href
    });
    
    completeProgressStep(0);
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

// Simple hash function for debugging content consistency
async function simpleHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
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
  
  // Add class for reader mode background
  document.body.classList.add('read-smart-active');
  
  state.overlay = document.createElement('div');
  state.overlay.id = CONSTANTS.OVERLAY_ID;
  state.overlay.className = `relative w-full bg-[#f4ecd8] z-[${CONSTANTS.Z_INDEX}]`;
  
  await injectReaderStyles();
  await loadReaderTemplate(state.overlay, article, isMarkdown);
  
  document.body.appendChild(state.overlay);
}

async function showSkeletonOverlay() {
  debugLog('Creating skeleton overlay');
  
  cleanupOverlays();
  disableReaderStyles();
  hideDOMExceptOverlay();
  injectSkeletonCSS();
  
  // Add class for reader mode background
  document.body.classList.add('read-smart-active');
  
  // Small delay to ensure DOM cleanup
  await new Promise(resolve => setTimeout(resolve, CONSTANTS.TRANSITION_DELAY));
  
  state.overlay = document.createElement('div');
  state.overlay.id = CONSTANTS.OVERLAY_ID;
  state.overlay.className = 'skeleton-overlay';
  
  await loadSkeletonTemplate(state.overlay);
  
  document.body.appendChild(state.overlay);
  
  // Ensure progress overlay stays on top
  const prog = document.getElementById(PROGRESS_ID);
  if (prog) {
    document.body.appendChild(prog);
  }
  
  // Force reflow
  state.overlay.offsetHeight;
  
  debugLog('Skeleton overlay created');
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
      throw new Error('Memory manager not properly initialized');
    }

    const result = await memoryManager.rephraseWithUserMemories(article.textContent, completeProgressStep);
    if (result.success && result.rephrasedContent) {
      debugLog('Successfully rephrased with memories');
      return result.rephrasedContent;
    }

    // If not successful, propagate error
    throw new Error(result.error || 'Failed to rephrase with memories');
  } catch (error) {
    console.error('Memory rephrasing failed:', error);
    
    // Set generation failure state for this page
    state.contentGenerationFailed = true;
    state.generationFailureMessage = 'Failed to generate personalized content: ' + (error.message || 'Unknown error');
    state.generationFailurePageUrl = window.location.href;
    
    // Show alert immediately
    try { 
      alert('Failed to generate personalized content: ' + (error.message || 'Unknown error')); 
    } catch (_) {}
    
    // Propagate the error up so caller can handle rollback
    throw error;
  }
}


async function addPageToMemory(force = false) {
  try {
    const steps = [
      'Extracting content',
      'Generating snippets',
      'Uploading to memory',
      'Finalizing'
    ];
    await showProgressOverlay(steps);
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
    
    const result = force ? 
      await memoryManager.forceAddToMemory(contentResult.content, pageUrl, completeProgressStep) :
      await memoryManager.addPageToMemory(contentResult.content, pageUrl, completeProgressStep);
    
    if (result.success && result.processed) {
      // Final step completion - other steps should be completed by progress callback
      setTimeout(() => {
        completeProgressStep(3);
        hideProgressOverlay();
      }, 1500);
    } else {
      hideProgressOverlay();
    }

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
    
    alert(userFriendlyMessage);
    
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
  debugLog('Transitioning from skeleton to content');
  removeOverlay();
  await new Promise(resolve => setTimeout(resolve, CONSTANTS.TRANSITION_DELAY));
  await renderReaderOverlay({
    title: article.title,
    content: rephrasedContent
  }, true);
  
  // Only complete the final step - other steps should be completed by progress callback
  setTimeout(() => {
    completeProgressStep(4);
    hideProgressOverlay();
  }, 1500);
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
  // Store original body styles
  if (!window.readSmartOriginalStyles) {
    window.readSmartOriginalStyles = {
      body: {
        overflow: document.body.style.overflow,
        background: document.body.style.background,
        backgroundColor: document.body.style.backgroundColor,
        backgroundImage: document.body.style.backgroundImage,
        minHeight: document.body.style.minHeight,
        height: document.body.style.height
      },
      html: {
        overflow: document.documentElement.style.overflow,
        background: document.documentElement.style.background,
        backgroundColor: document.documentElement.style.backgroundColor,
        height: document.documentElement.style.height
      }
    };
  }

  Array.from(document.body.children).forEach(child => {
    if (child.id !== CONSTANTS.OVERLAY_ID && child.id !== PROGRESS_ID) {
      child.style.display = 'none';
    }
  });

  // Ensure body and html can scroll properly
  document.body.style.overflow = 'auto';
  document.body.style.height = 'auto';
  document.body.style.minHeight = '100vh';
  document.documentElement.style.overflow = 'auto';
  document.documentElement.style.height = 'auto';
}

function restoreOriginalContent() {
  Array.from(document.body.children).forEach(child => {
    if (child.id !== CONSTANTS.OVERLAY_ID && child.id !== PROGRESS_ID) {
      child.style.display = '';
    }
  });

  // Remove reader mode class
  document.body.classList.remove('read-smart-active');

  // Restore original body and html styles
  if (window.readSmartOriginalStyles) {
    // Restore body styles
    Object.keys(window.readSmartOriginalStyles.body).forEach(prop => {
      document.body.style[prop] = window.readSmartOriginalStyles.body[prop];
    });

    // Restore html styles
    Object.keys(window.readSmartOriginalStyles.html).forEach(prop => {
      document.documentElement.style[prop] = window.readSmartOriginalStyles.html[prop];
    });

    // Clean up
    delete window.readSmartOriginalStyles;
  }

  // Remove reader mode background styles that may have been applied
  const readerStyles = document.getElementById(CONSTANTS.READER_STYLES_ID);
  if (readerStyles) {
    readerStyles.disabled = true;
  }
}

// =============================================================================
// PROGRESS OVERLAY HELPERS
// =============================================================================

async function ensureProgressAssets() {
  if (progressOverlayLoaded) return;

  // Inject stylesheet once
  const cssHref = chrome.runtime.getURL('src/css/progress-overlay.css');
  if (!document.querySelector(`link[href="${cssHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssHref;
    document.head.appendChild(link);
  }

  // Inject HTML template once
  const res = await fetch(chrome.runtime.getURL('src/html/progress-overlay.html'));
  const html = await res.text();
  const temp = document.createElement('div');
  temp.innerHTML = html;
  document.body.appendChild(temp.firstElementChild);

  progressOverlayLoaded = true;
}

async function showProgressOverlay(steps) {
  await ensureProgressAssets();

  const container = document.getElementById(PROGRESS_ID);
  if (!container) return;
  container.classList.remove('hidden');

  const contentEl = document.getElementById('read-smart-progress-content');
  if (!contentEl) return;
  contentEl.innerHTML = '';

  steps.forEach((s, idx) => {
    const step = document.createElement('div');
    step.className = 'rs-step' + (idx === 0 ? ' current' : '');
    step.id = `rs-step-${idx}`;

    const circle = document.createElement('div');
    circle.className = 'rs-step-circle';
    step.appendChild(circle);

    const label = document.createElement('div');
    label.textContent = s;
    step.appendChild(label);

    contentEl.appendChild(step);
  });
}

function completeProgressStep(idx) {
  const step = document.getElementById(`rs-step-${idx}`);
  if (step) {
    step.classList.remove('current');
    step.classList.add('completed');
    const circle = step.querySelector('.rs-step-circle');
    if (circle) circle.textContent = '✓';
  }
  const next = document.getElementById(`rs-step-${idx + 1}`);
  if (next) next.classList.add('current');
}

function hideProgressOverlay() {
  const container = document.getElementById(PROGRESS_ID);
  if (container) container.classList.add('hidden');
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
