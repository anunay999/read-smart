// content.js - Modular reader mode implementation

// Prevent duplicate initialization
if (typeof window.readSmartInitialized !== 'undefined') {
  // Content script already initialized, skipping
} else {
  window.readSmartInitialized = true;

// --- State ---
let readerModeActive = false;
let smartRephraseActive = false;
let overlay = null;
let geminiApiKey = null;
let originalArticle = null;
let rephrasedContent = null;

// --- Initialization ---
chrome.storage.sync.get(['geminiApiKey'], function(result) {
  geminiApiKey = result.geminiApiKey;
});

// Notify that content script is ready
chrome.runtime.sendMessage({action: "contentScriptReady"});

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enableReaderMode") {
    (async () => {
      try {
        await enablePlainReaderMode();
        sendResponse({success: true});
      } catch (error) {
        console.error('❌ Error enabling reader mode:', error.message);
        sendResponse({success: false, error: error.message});
      }
    })();
    return true;
    
  } else if (request.action === "disableReaderMode") {
    disableReaderMode();
    sendResponse({success: true});
  } else if (request.action === "toggleReaderMode") {
    if (readerModeActive) {
      disableReaderMode();
      sendResponse({success: true, active: false});
    } else {
      (async () => {
        try {
          await enablePlainReaderMode();
          sendResponse({success: true, active: true});
        } catch (error) {
          console.error('❌ Error enabling reader mode:', error.message);
          sendResponse({success: false, error: error.message});
        }
      })();
    }
    return true;
    
  } else if (request.action === "enableSmartRephrase") {
    (async () => {
      try {
        await enableSmartRephraseMode(request.geminiApiKey, request.mem0ApiKey);
        sendResponse({success: true});
      } catch (error) {
        console.error('❌ Error enabling smart rephrase:', error.message);
        sendResponse({success: false, error: error.message});
      }
    })();
    return true;
    
  } else if (request.action === "disableSmartRephrase") {
    disableSmartRephrase();
    sendResponse({success: true});
    
  } else if (request.action === "getState") {
    sendResponse({readerModeActive, smartRephraseActive});
  } else if (request.action === "updateApiKeys") {
    geminiApiKey = request.geminiApiKey;
    // Store mem0ApiKey if needed for future use
    sendResponse({success: true});
  } else if (request.action === "extractPageContent") {
    extractPageContentForMemory().then(result => {
      sendResponse(result);
    }).catch(error => {
      console.error('❌ Content extraction failed:', error);
      console.error('❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      sendResponse({success: false, error: error.message});
    });
    return true; // Keep message channel open for async response

  } else if (request.action === "addPageToMemory") {
    addPageToMemory(request.geminiApiKey, request.mem0ApiKey).then(result => {
      sendResponse(result);
    }).catch(error => {
      console.error('❌ Memory addition failed:', error);
      sendResponse({success: false, processed: false, error: error.message});
    });
    return true; // Keep message channel open for async response
  }
  return true;
});
async function extractPageContentForMemory() {
  try {
    // Try to extract with Readability first
    const documentClone = document.cloneNode(true);
    fixLazyLoadedImages(documentClone);
    const reader = new Readability(documentClone, {
      charThreshold: 20,
      classesToPreserve: ['important', 'highlight']
    });
    const article = reader.parse();
    
    if (article && article.textContent && article.textContent.trim().length > 100) {
      // Successfully extracted with Readability
      const result = {
        success: true,
        content: article.textContent.trim(),
        title: article.title || document.title || 'Untitled Page'
      };
      return result;
    } else {
      // Fallback to extracting visible text from page
      const title = document.title || 'Untitled Page';
      
      const content = extractVisibleText();
      
      if (content.length < 50) {
        console.error('❌ Insufficient content found:', content.length, 'characters');
        throw new Error('Insufficient content found on page');
      }
      
      const result = {
        success: true,
        content: content,
        title: title
      };
      return result;
    }
  } catch (error) {
    console.error('❌ Error extracting page content:', error);
    console.error('❌ Error stack:', error.stack);
    throw new Error('Failed to extract page content: ' + error.message);
  }
}

function extractVisibleText() {
  // Extract visible text from common content containers
  const selectors = [
    'main', 'article', '[role="main"]', 
    '.content', '.post-content', '.entry-content',
    '.article-content', '.story-body', '.post-body',
    'body'
  ];
  
  let content = '';
  
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      
      // Get text content but filter out script/style tags
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            
            const tagName = parent.tagName.toLowerCase();
            const style = window.getComputedStyle(parent);
            
            // Skip hidden elements and script/style tags
            if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
              return NodeFilter.FILTER_REJECT;
            }
            
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
            
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );
      
      let textNode;
      const textContent = [];
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
  }
  
  // Clean up the content
  content = content.replace(/\s+/g, ' ').trim();
  
  // Limit content length to avoid API limits
  if (content.length > 8000) {
    content = content.substring(0, 8000) + '...';
  }
  
  return content;
}

// --- Main Reader Mode Logic ---
async function enableReaderMode(rephrase = true, geminiApiKey = null, mem0ApiKey = null) {
  try {
    const article = await extractMainContent();
    originalArticle = article;
    rephrasedContent = null;
    if (article) {
      if (rephrase) {
        showSkeletonOverlay();
        
        // Use memory-enhanced rephrasing if API keys are available
        if (geminiApiKey && mem0ApiKey) {
          try {
            const result = await rephraseWithMemories(geminiApiKey, mem0ApiKey);
            if (result.success) {
              rephrasedContent = result.rephrasedContent;
              renderReaderOverlay({
                title: article.title,
                content: rephrasedContent
              }, true);
            } else {
              // Fallback to regular Gemini rephrasing
              rephrasedContent = await rephraseWithGemini(article.textContent);
              renderReaderOverlay({
                title: article.title,
                content: rephrasedContent
              }, true);
            }
          } catch (error) {
            console.error('Error in memory-enhanced rephrasing, falling back:', error);
            rephrasedContent = await rephraseWithGemini(article.textContent);
            renderReaderOverlay({
              title: article.title,
              content: rephrasedContent
            }, true);
          }
        } else {
          // Use regular Gemini rephrasing
          rephrasedContent = await rephraseWithGemini(article.textContent);
          renderReaderOverlay({
            title: article.title,
            content: rephrasedContent
          }, true);
        }
      } else {
        renderReaderOverlay({
          title: article.title,
          content: article.content
        }, false);
      }
      readerModeActive = true;
    }
  } catch (error) {
    removeFloatingSkeletonLoader();
    console.error('Error in enableReaderMode:', error);
    throw error;
  }
}

function disableReaderMode() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  // Restore original content visibility
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'read-smart-overlay') {
      child.style.display = '';
    }
  });
  readerModeActive = false;
}

// --- New Clean Functions ---
async function enablePlainReaderMode() {
  try {
    const article = await extractMainContent();
    originalArticle = article;
    
    renderReaderOverlay({
      title: article.title,
      content: article.content
    }, false);
    
    readerModeActive = true;
    smartRephraseActive = false;
  } catch (error) {
    console.error('❌ Error in enablePlainReaderMode:', error.message);
    throw error;
  }
}

async function enableSmartRephraseMode(geminiApiKey, mem0ApiKey) {
  try {
    const article = await extractMainContent();
    originalArticle = article;
    
    // Show skeleton loading overlay (this hides DOM and shows skeleton)
    showSkeletonOverlay();
    
    // Use memory-enhanced rephrasing with the same content extraction as reader mode
    try {
      const result = await rephraseWithMemoriesUsingArticle(article, geminiApiKey, mem0ApiKey);
      if (result.success) {
        rephrasedContent = result.rephrasedContent;
        // Explicitly remove skeleton overlay and show rephrased content
        removeOverlay();
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure clean transition
        renderReaderOverlay({
          title: article.title,
          content: rephrasedContent
        }, true);
      } else {
        // Fallback to regular Gemini rephrasing
        rephrasedContent = await rephraseWithGemini(article.textContent);
        // Explicitly remove skeleton overlay and show rephrased content
        removeOverlay();
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure clean transition
        renderReaderOverlay({
          title: article.title,
          content: rephrasedContent
        }, true);
      }
    } catch (error) {
      console.error('Error in memory-enhanced rephrasing, falling back:', error);
      rephrasedContent = await rephraseWithGemini(article.textContent);
      // Explicitly remove skeleton overlay and show rephrased content
      removeOverlay();
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure clean transition
      renderReaderOverlay({
        title: article.title,
        content: rephrasedContent
      }, true);
    }
    
    readerModeActive = false;
    smartRephraseActive = true;
  } catch (error) {
    // Make sure to remove all overlays on error
    removeOverlay();
    removeFloatingSkeletonLoader();
    console.error('Error in enableSmartRephraseMode:', error);
    throw error;
  }
}

function disableSmartRephrase() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  // Restore original content visibility
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'read-smart-overlay') {
      child.style.display = '';
    }
  });
  smartRephraseActive = false;
}

// --- Content Extraction ---
async function extractMainContent() {
  // Check if Readability is available
  if (typeof Readability === 'undefined') {
    throw new Error('Readability library not loaded');
  }
  
  // Extracts the main article content using Readability
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

function fixLazyLoadedImages(doc) {
  const imgs = doc.querySelectorAll('img');
  imgs.forEach(img => {
    if (!img.getAttribute('src')) {
      const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
      if (dataSrc) {
        img.setAttribute('src', dataSrc);
      }
    }
  });
}

// --- Overlay Rendering ---
function renderReaderOverlay(article, isMarkdown = false) {
  // Ensure clean state - remove any existing overlays first
  removeOverlay();
  removeFloatingSkeletonLoader();
  
  // Hide DOM content
  hideDOMExceptOverlay();
  
  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.className = 'fixed inset-0 w-screen h-screen overflow-auto bg-[#f4ecd8] z-[2147483647]';
  
  // Inject reader styles if not already present
  if (!document.getElementById('read-smart-reader-styles')) {
    const link = document.createElement('link');
    link.id = 'read-smart-reader-styles';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('reader-styles.css');
    document.head.appendChild(link);
  }
  
  overlay.innerHTML = `
    <div class="max-w-5xl mx-auto my-8 p-12 bg-transparent rounded-2xl shadow-2xl font-serif leading-relaxed">
      <header class="mb-12 pb-6 border-b-2 border-amber-200">
        <h1 class="text-4xl md:text-5xl mb-4 font-bold tracking-tight text-stone-900">${article.title}</h1>
        <div class="flex items-center gap-4 text-sm text-stone-600">
          <span class="px-3 py-1 bg-amber-100 rounded-full">Enhanced Reading Mode</span>
        </div>
      </header>
      <main id="reader-content" class="prose prose-xl prose-stone max-w-none">
        ${isMarkdown && window.marked ? window.marked.parse(article.content) : article.content}
      </main>
    </div>
  `;
  
  document.body.appendChild(overlay);
}

function showSkeletonOverlay() {
  // Ensure clean state - remove any existing overlays first
  removeOverlay();
  removeFloatingSkeletonLoader();
  
  // Hide DOM content
  hideDOMExceptOverlay();
  
  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.className = 'fixed inset-0 w-screen h-screen overflow-auto bg-[#f4ecd8] z-[2147483647] flex items-center';
  // Inject reader styles if not already present
  if (!document.getElementById('read-smart-reader-styles')) {
    const link = document.createElement('link');
    link.id = 'read-smart-reader-styles';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('reader-styles.css');
    document.head.appendChild(link);
  }
  
  overlay.innerHTML = `
    <div class="skeleton-container" style="opacity: 0; animation: fadeIn 0.3s ease-in forwards;">
      <div class="skeleton-title" style="height: 3rem; width: 60%; background: linear-gradient(90deg, #e8dcc6 25%, #f0e6d6 50%, #e8dcc6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 8px; margin-bottom: 2rem;"></div>
      <div class="skeleton-line" style="height: 1rem; width: 100%; background: linear-gradient(90deg, #e8dcc6 25%, #f0e6d6 50%, #e8dcc6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 1rem;"></div>
      <div class="skeleton-line" style="height: 1rem; width: 95%; background: linear-gradient(90deg, #e8dcc6 25%, #f0e6d6 50%, #e8dcc6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 1rem;"></div>
      <div class="skeleton-line" style="height: 1rem; width: 90%; background: linear-gradient(90deg, #e8dcc6 25%, #f0e6d6 50%, #e8dcc6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 1rem;"></div>
      <div class="skeleton-line" style="height: 1rem; width: 85%; background: linear-gradient(90deg, #e8dcc6 25%, #f0e6d6 50%, #e8dcc6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 2rem;"></div>
      <div class="skeleton-line" style="height: 1rem; width: 100%; background: linear-gradient(90deg, #e8dcc6 25%, #f0e6d6 50%, #e8dcc6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 1rem;"></div>
      <div class="skeleton-line" style="height: 1rem; width: 88%; background: linear-gradient(90deg, #e8dcc6 25%, #f0e6d6 50%, #e8dcc6 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 4px; margin-bottom: 1rem;"></div>
    </div>
    <style>
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes fadeIn {
        to { opacity: 1; }
      }
    </style>
  `;
  document.body.appendChild(overlay);
}

function hideDOMExceptOverlay() {
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'read-smart-overlay') {
      child.style.display = 'none';
    }
  });
}

function removeOverlay() {
  if (overlay) overlay.remove();
}

// --- Rephrase Functions ---
async function rephraseWithGemini(text) {
  if (!geminiApiKey) throw new Error('Gemini API key not set. Please set it in the extension settings.');
  const prompt = `Please rephrase the following text in a clear, engaging, and easy-to-read style while maintaining the original meaning and key information. Make it more conversational and user-friendly:\n\n${text}`;
  const geminiModel = 'gemini-2.5-flash';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    if (!response.ok) throw new Error('Failed to get response from Gemini API');
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw error;
  }
}

// TODO: Replace this stub with your actual API call
async function rephraseWithCustomAPI(text) {
  // Example: return await fetch('https://your-api.com/rephrase', { ... })
  return `**[Custom API Response]**\n\n${text}`;
}

// Show a floating skeleton loader (does not hide DOM)
function showFloatingSkeletonLoader() {
  if (document.getElementById('read-smart-skeleton')) return;
  const skeleton = document.createElement('div');
  skeleton.id = 'read-smart-skeleton';
  skeleton.style.position = 'fixed';
  skeleton.style.top = '40px';
  skeleton.style.left = '50%';
  skeleton.style.transform = 'translateX(-50%)';
  skeleton.style.zIndex = '2147483647';
  skeleton.innerHTML = `
    <div class="skeleton-loader" style="max-width: 800px; padding: 32px; background: #f4ecd8; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">
      <div class="skeleton-title" style="height: 2.2rem; width: 60%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
      <div class="skeleton-paragraph" style="height: 1.2rem; width: 100%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
      <div class="skeleton-paragraph" style="height: 1.2rem; width: 100%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
      <div class="skeleton-paragraph" style="height: 1.2rem; width: 100%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
    </div>
    <style>
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    </style>
  `;
  document.body.appendChild(skeleton);
}

function removeFloatingSkeletonLoader() {
  const skeleton = document.getElementById('read-smart-skeleton');
  if (skeleton) skeleton.remove();
}

// Add page content to memory using MemoryEnhancedReading library
async function addPageToMemory(geminiApiKey, mem0ApiKey) {
  try {
    // Check if MemoryEnhancedReading is available
    if (typeof MemoryEnhancedReading === 'undefined') {
      throw new Error('MemoryEnhancedReading library not loaded');
    }
    
    // Extract page content first
    const contentResult = await extractPageContentForMemory();
    
    if (!contentResult.success) {
      throw new Error('Failed to extract page content');
    }
    
    // Initialize Memory Reader
    const memoryReader = new MemoryEnhancedReading({
      mem0ApiKey: mem0ApiKey,
      geminiApiKey: geminiApiKey,
      userId: "chrome_extension_user",
      debug: false
    });
    
    // Add page content to memory only
    const pageUrl = window.location.href;
    const result = await memoryReader.addPageToMemory(contentResult.content, pageUrl);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error in addPageToMemory:', error);
    return {
      success: false,
      processed: false,
      error: error.message
    };
  }
}

// Rephrase content with user memories using already extracted article
async function rephraseWithMemoriesUsingArticle(article, geminiApiKey, mem0ApiKey) {
  try {
    // Check if MemoryEnhancedReading is available
    if (typeof MemoryEnhancedReading === 'undefined') {
      throw new Error('MemoryEnhancedReading library not loaded');
    }
    
    // Initialize Memory Reader with lower relevance threshold
    const memoryReader = new MemoryEnhancedReading({
      mem0ApiKey: mem0ApiKey,
      geminiApiKey: geminiApiKey,
      userId: "chrome_extension_user",
      debug: false,
      relevanceThreshold: 0.1  // Lower threshold to be more inclusive
    });
    
    // Rephrase content with user memories
    const result = await memoryReader.rephraseWithUserMemories(
      article.textContent,
      {
        includeContext: true,
        maxMemories: 10,
        relevanceThreshold: 0.1
      }
    );
    
    // If we got a successful result with content, use it
    if (result.success && result.rephrasedContent && result.rephrasedContent.trim().length > 0) {
      return result;
    } else {
      return {
        success: false,
        error: 'No content generated from memory rephrasing'
      };
    }
    
  } catch (error) {
    console.error('❌ Error in rephraseWithMemoriesUsingArticle:', error);
    return {
      success: false,
      processed: false,
      error: error.message
    };
  }
}

// Rephrase content with user memories using MemoryEnhancedReading library  
async function rephraseWithMemories(geminiApiKey, mem0ApiKey) {
  try {
    // Check if MemoryEnhancedReading is available
    if (typeof MemoryEnhancedReading === 'undefined') {
      throw new Error('MemoryEnhancedReading library not loaded');
    }
    
    // Extract page content first
    const contentResult = await extractPageContentForMemory();
    
    if (!contentResult.success) {
      throw new Error('Failed to extract page content');
    }
    
    // Initialize Memory Reader with lower relevance threshold
    const memoryReader = new MemoryEnhancedReading({
      mem0ApiKey: mem0ApiKey,
      geminiApiKey: geminiApiKey,
      userId: "chrome_extension_user",
      debug: false,
      relevanceThreshold: 0.1  // Lower threshold to be more inclusive
    });
    
    // Rephrase content with user memories
    const result = await memoryReader.rephraseWithUserMemories(
      contentResult.content,
      {
        includeContext: true,
        maxMemories: 10,
        relevanceThreshold: 0.1
      }
    );
    
    // If we got a successful result with content, use it
    if (result.success && result.rephrasedContent && result.rephrasedContent.trim().length > 0) {
      return result;
    } else {
      return {
        success: false,
        error: 'No content generated from memory rephrasing'
      };
    }
    
  } catch (error) {
    console.error('❌ Error in rephraseWithMemories:', error);
    return {
      success: false,
      processed: false,
      error: error.message
    };
  }
}

} // End of readSmartInitialized check
