// content.js - Modular reader mode implementation
console.log('Content script loaded');

// Prevent duplicate initialization
if (typeof window.readSmartInitialized !== 'undefined') {
  console.log('Content script already initialized, skipping...');
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
  console.log('Content script received message:', request);
  
  if (request.action === "enableReaderMode") {
    (async () => {
      try {
        await enablePlainReaderMode();
        console.log('✅ Reader mode enabled');
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
        console.log('✅ Smart rephrase enabled');
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
    console.log('📨 Received extractPageContent request');
    console.log('📄 Document ready state:', document.readyState);
    console.log('📄 Document URL:', document.URL);
    console.log('📄 Document title:', document.title);
    console.log('📄 Document body exists:', !!document.body);
    console.log('📄 Document body children count:', document.body ? document.body.children.length : 0);
    
    extractPageContentForMemory().then(result => {
      console.log('✅ Content extraction completed successfully:', result);
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
    console.log('💾 Adding page to memory...');
    addPageToMemory(request.geminiApiKey, request.mem0ApiKey).then(result => {
      console.log('✅ Memory addition completed:', result);
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
  console.log('📄 Starting page content extraction for memory...');
  
  try {
    // Try to extract with Readability first
    console.log('📚 Attempting Readability extraction...');
    const documentClone = document.cloneNode(true);
    fixLazyLoadedImages(documentClone);
    const reader = new Readability(documentClone, {
      charThreshold: 20,
      classesToPreserve: ['important', 'highlight']
    });
    const article = reader.parse();
    
    console.log('📚 Readability result:', article ? 'Success' : 'Failed');
    if (article) {
      console.log('📚 Readability - Title:', article.title);
      console.log('📚 Readability - Text length:', article.textContent?.length || 0);
    }
    
    if (article && article.textContent && article.textContent.trim().length > 100) {
      // Successfully extracted with Readability
      console.log('✅ Using Readability extraction');
      const result = {
        success: true,
        content: article.textContent.trim(),
        title: article.title || document.title || 'Untitled Page'
      };
      console.log('📄 Final result from Readability:', {
        contentLength: result.content.length,
        title: result.title
      });
      return result;
    } else {
      // Fallback to extracting visible text from page
      console.log('🔄 Readability insufficient, falling back to visible text extraction...');
      const title = document.title || 'Untitled Page';
      console.log('📑 Document title:', title);
      
      const content = extractVisibleText();
      console.log('📄 Visible text extraction result length:', content.length);
      
      if (content.length < 50) {
        console.error('❌ Insufficient content found:', content.length, 'characters');
        throw new Error('Insufficient content found on page');
      }
      
      const result = {
        success: true,
        content: content,
        title: title
      };
      console.log('📄 Final result from visible text:', {
        contentLength: result.content.length,
        title: result.title
      });
      return result;
    }
  } catch (error) {
    console.error('❌ Error extracting page content:', error);
    console.error('❌ Error stack:', error.stack);
    throw new Error('Failed to extract page content: ' + error.message);
  }
}

function extractVisibleText() {
  console.log('👁️ Starting visible text extraction...');
  
  // Extract visible text from common content containers
  const selectors = [
    'main', 'article', '[role="main"]', 
    '.content', '.post-content', '.entry-content',
    '.article-content', '.story-body', '.post-body',
    'body'
  ];
  
  console.log('🔍 Trying selectors:', selectors);
  
  let content = '';
  
  for (const selector of selectors) {
    console.log('🔍 Trying selector:', selector);
    const element = document.querySelector(selector);
    if (element) {
      console.log('✅ Found element for selector:', selector);
      
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
      console.log('📄 Extracted text length from', selector + ':', content.length);
      
      // If we got substantial content, use it
      if (content.length > 200) {
        console.log('✅ Found substantial content, using selector:', selector);
        break;
      }
    } else {
      console.log('❌ No element found for selector:', selector);
    }
  }
  
  console.log('🧹 Cleaning up content...');
  // Clean up the content
  content = content.replace(/\s+/g, ' ').trim();
  console.log('📄 Content after cleanup, length:', content.length);
  
  // Limit content length to avoid API limits
  if (content.length > 8000) {
    console.log('✂️ Truncating content from', content.length, 'to 8000 characters');
    content = content.substring(0, 8000) + '...';
  }
  
  console.log('📄 Final visible text length:', content.length);
  console.log('📄 Content preview:', content.substring(0, 200) + '...');
  
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
          console.log('🧠 Using memory-enhanced rephrasing in reader mode...');
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
              console.log('⚠️ Memory rephrasing failed, falling back to regular rephrasing');
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
          console.log('📝 Using regular Gemini rephrasing in reader mode...');
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
    
    // Show skeleton loading overlay
    showSkeletonOverlay();
    
    // Use memory-enhanced rephrasing with the same content extraction as reader mode
    console.log('🧠 Using memory-enhanced rephrasing...');
    try {
      const result = await rephraseWithMemoriesUsingArticle(article, geminiApiKey, mem0ApiKey);
      if (result.success) {
        rephrasedContent = result.rephrasedContent;
        // Remove skeleton and show content
        renderReaderOverlay({
          title: article.title,
          content: rephrasedContent
        }, true);
      } else {
        // Fallback to regular Gemini rephrasing
        console.log('⚠️ Memory rephrasing failed, falling back to regular rephrasing');
        rephrasedContent = await rephraseWithGemini(article.textContent);
        // Remove skeleton and show content
        renderReaderOverlay({
          title: article.title,
          content: rephrasedContent
        }, true);
      }
    } catch (error) {
      console.error('Error in memory-enhanced rephrasing, falling back:', error);
      rephrasedContent = await rephraseWithGemini(article.textContent);
      // Remove skeleton and show content
      renderReaderOverlay({
        title: article.title,
        content: rephrasedContent
      }, true);
    }
    
    readerModeActive = false;
    smartRephraseActive = true;
  } catch (error) {
    // Make sure to remove skeleton on error
    removeFloatingSkeletonLoader();
    removeOverlay();
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
  hideDOMExceptOverlay();
  removeOverlay();
  
  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.className = 'fixed inset-0 w-screen h-screen overflow-auto bg-[#f4ecd8] z-[2147483647]';
  
  // Create style element for better text visibility
  const style = document.createElement('style');
  style.textContent = `
    #read-smart-overlay {
      color: #3e2f1c !important;
      background: #f4ecd8 !important;
    }
    #read-smart-overlay *,
    #read-smart-overlay *:before,
    #read-smart-overlay *:after {
      color: #3e2f1c !important;
      background-color: transparent !important;
    }
    #read-smart-overlay h1, #read-smart-overlay h2, #read-smart-overlay h3, 
    #read-smart-overlay h4, #read-smart-overlay h5, #read-smart-overlay h6 {
      color: #5b4636 !important;
      font-weight: bold !important;
      background-color: transparent !important;
    }
    #read-smart-overlay p, #read-smart-overlay div, #read-smart-overlay span,
    #read-smart-overlay li, #read-smart-overlay td, #read-smart-overlay th,
    #read-smart-overlay article, #read-smart-overlay section {
      color: #3e2f1c !important;
      background-color: transparent !important;
    }
    #read-smart-overlay a, #read-smart-overlay a:visited, #read-smart-overlay a:hover {
      color: #8b5a2b !important;
      text-decoration: underline !important;
      background-color: transparent !important;
    }
         #read-smart-overlay strong, #read-smart-overlay b {
       color: #1a0f08 !important;
       font-weight: bold !important;
       background-color: transparent !important;
     }
     #read-smart-overlay em, #read-smart-overlay i {
       color: #3e2f1c !important;
       font-style: italic !important;
       background-color: transparent !important;
     }
     #read-smart-overlay code {
       color: #d97706 !important;
       background-color: #2d1b0a !important;
       padding: 3px 6px !important;
       border-radius: 4px !important;
       font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace !important;
       font-size: 0.9em !important;
     }
     #read-smart-overlay pre {
       color: #2d1f0f !important;
       background-color: #e8dcc6 !important;
       padding: 12px !important;
       border-radius: 6px !important;
       overflow-x: auto !important;
     }
     #read-smart-overlay pre code {
       color: #2d1f0f !important;
       background-color: transparent !important;
       padding: 0 !important;
       border-radius: 0 !important;
     }
    #read-smart-overlay blockquote {
      color: #5b4636 !important;
      background-color: transparent !important;
      border-left: 4px solid #8b5a2b;
      padding-left: 16px;
      margin: 16px 0;
    }
  `;
  
  overlay.innerHTML = `
    <div class="max-w-4xl mx-auto my-10 p-8 bg-transparent rounded-xl shadow-lg font-serif leading-relaxed">
      <h1 class="text-3xl mb-8 font-bold tracking-tight">${article.title}</h1>
      <div id="reader-content" class="prose prose-lg prose-neutral">
        ${isMarkdown && window.marked ? window.marked.parse(article.content) : article.content}
      </div>
    </div>
  `;
  
  overlay.appendChild(style);
  document.body.appendChild(overlay);
}

function showSkeletonOverlay() {
  hideDOMExceptOverlay();
  removeOverlay();
  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.className = 'fixed inset-0 w-screen h-screen overflow-auto bg-[#f4ecd8] z-[2147483647] flex items-center';
  overlay.innerHTML = `
    <div class="max-w-4xl w-full mx-auto p-8 bg-transparent rounded-xl shadow-lg animate-pulse">
      <div class="h-10 w-3/5 bg-[#e0d6c3] rounded mb-6"></div>
      <div class="h-5 w-full bg-[#e0d6c3] rounded mb-4"></div>
      <div class="h-5 w-full bg-[#e0d6c3] rounded mb-4"></div>
      <div class="h-5 w-full bg-[#e0d6c3] rounded mb-4"></div>
    </div>
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
  console.log('🧠 Starting memory addition...');
  
  try {
    // Check if MemoryEnhancedReading is available
    if (typeof MemoryEnhancedReading === 'undefined') {
      throw new Error('MemoryEnhancedReading library not loaded');
    }
    
    // Extract page content first
    console.log('📄 Extracting page content...');
    const contentResult = await extractPageContentForMemory();
    
    if (!contentResult.success) {
      throw new Error('Failed to extract page content');
    }
    
    console.log('📄 Content extracted successfully, length:', contentResult.content.length);
    
    // Initialize Memory Reader
    console.log('🧠 Initializing Memory Reader...');
    const memoryReader = new MemoryEnhancedReading({
      mem0ApiKey: mem0ApiKey,
      geminiApiKey: geminiApiKey,
      userId: "chrome_extension_user",
      debug: true
    });
    
    // Add page content to memory only
    console.log('💾 Adding page content to memory...');
    const pageUrl = window.location.href;
    const result = await memoryReader.addPageToMemory(contentResult.content, pageUrl);
    
    console.log('📊 Memory addition completed:', result);
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
  console.log('🔄 Starting content rephrasing with memories using article...');
  
  try {
    // Check if MemoryEnhancedReading is available
    if (typeof MemoryEnhancedReading === 'undefined') {
      throw new Error('MemoryEnhancedReading library not loaded');
    }
    
    console.log('📄 Using extracted article content, length:', article.textContent.length);
    
    // Initialize Memory Reader with lower relevance threshold
    console.log('🧠 Initializing Memory Reader...');
    const memoryReader = new MemoryEnhancedReading({
      mem0ApiKey: mem0ApiKey,
      geminiApiKey: geminiApiKey,
      userId: "chrome_extension_user",
      debug: true,
      relevanceThreshold: 0.1  // Lower threshold to be more inclusive
    });
    
    // Rephrase content with user memories
    console.log('✨ Rephrasing content with user memories...');
    const result = await memoryReader.rephraseWithUserMemories(
      article.textContent,
      {
        includeContext: true,
        maxMemories: 10,
        relevanceThreshold: 0.1
      }
    );
    
    console.log('📊 Content rephrasing result:', {
      success: result.success,
      memoriesUsed: result.relevantMemoriesCount || 0,
      hasContent: !!result.rephrasedContent
    });
    
    // If we got a successful result with content, use it
    if (result.success && result.rephrasedContent && result.rephrasedContent.trim().length > 0) {
      console.log('✅ Memory-enhanced rephrasing successful');
      return result;
    } else {
      console.log('⚠️ Memory rephrasing returned empty or invalid content');
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
  console.log('🔄 Starting content rephrasing with memories...');
  
  try {
    // Check if MemoryEnhancedReading is available
    if (typeof MemoryEnhancedReading === 'undefined') {
      throw new Error('MemoryEnhancedReading library not loaded');
    }
    
    // Extract page content first
    console.log('📄 Extracting page content...');
    const contentResult = await extractPageContentForMemory();
    
    if (!contentResult.success) {
      throw new Error('Failed to extract page content');
    }
    
    console.log('📄 Content extracted successfully, length:', contentResult.content.length);
    
    // Initialize Memory Reader with lower relevance threshold
    console.log('🧠 Initializing Memory Reader...');
    const memoryReader = new MemoryEnhancedReading({
      mem0ApiKey: mem0ApiKey,
      geminiApiKey: geminiApiKey,
      userId: "chrome_extension_user",
      debug: true,
      relevanceThreshold: 0.1  // Lower threshold to be more inclusive
    });
    
    // Rephrase content with user memories
    console.log('✨ Rephrasing content with user memories...');
    const result = await memoryReader.rephraseWithUserMemories(
      contentResult.content,
      {
        includeContext: true,
        maxMemories: 10,
        relevanceThreshold: 0.1
      }
    );
    
    console.log('📊 Content rephrasing result:', {
      success: result.success,
      memoriesUsed: result.relevantMemoriesCount || 0,
      hasContent: !!result.rephrasedContent
    });
    
    // If we got a successful result with content, use it
    if (result.success && result.rephrasedContent && result.rephrasedContent.trim().length > 0) {
      console.log('✅ Memory-enhanced rephrasing successful');
      return result;
    } else {
      console.log('⚠️ Memory rephrasing returned empty or invalid content');
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
