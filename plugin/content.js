// content.js - A modular reader mode implementation
console.log('Content script loaded');

let readerModeActive = false;
let overlay = null;
let geminiApiKey = null;

// Initialize by getting the API key
chrome.storage.sync.get(['geminiApiKey'], function(result) {
  geminiApiKey = result.geminiApiKey;
});

// Notify that content script is ready
chrome.runtime.sendMessage({action: "contentScriptReady"});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === "toggleReaderMode") {
    console.log('Toggling reader mode, current state:', readerModeActive);
    
    if (!readerModeActive) {
      console.log('Attempting to enable reader mode');
      enableReaderMode(request.rephrase).then(() => {
        console.log('Reader mode enabled successfully');
        sendResponse({readerModeActive: true});
      }).catch(error => {
        console.error('Error enabling reader mode:', error);
        sendResponse({error: error.message});
      });
    } else {
      console.log('Disabling reader mode');
      disableReaderMode();
      sendResponse({readerModeActive: false});
    }
  } else if (request.action === "getState") {
    console.log('Sending current state:', readerModeActive);
    sendResponse({readerModeActive});
  } else if (request.action === "updateApiKey") {
    geminiApiKey = request.apiKey;
    sendResponse({success: true});
  }
  return true;
});

// Main reader mode functions
async function enableReaderMode(rephrase = true) {
  try {
    // Extract content using Readability (no skeleton, no DOM hiding yet)
    const article = await extractContentWithReadability();
    let isMarkdown = false;
    if (article) {
      if (rephrase) {
        // Show overlay with skeleton loader and hide DOM
        showSkeletonOverlay();
        // Rephrase content using Gemini Pro
        const rephrasedContent = await rephraseWithGemini(article.textContent);
        article.content = rephrasedContent;
        isMarkdown = true;
        renderReaderOverlay(article, isMarkdown);
      } else {
        // Show overlay with extracted content (hide DOM)
        renderReaderOverlay(article, isMarkdown);
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

// Content extraction
async function extractContentWithReadability() {
  // Create a clone of the document to work with
  const documentClone = document.cloneNode(true);

  // Fix lazy-loaded images in the clone
  const imgs = documentClone.querySelectorAll('img');
  imgs.forEach(img => {
    if (!img.getAttribute('src')) {
      const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
      if (dataSrc) {
        img.setAttribute('src', dataSrc);
      }
    }
  });

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

// View rendering
function renderReaderOverlay(article, isMarkdown = false) {
  // Hide all body children except the overlay
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'read-smart-overlay') {
      child.style.display = 'none';
    }
  });

  // Remove existing overlay if present
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.overflow = 'auto';
  overlay.style.background = '#f4ecd8'; // Sepia
  overlay.style.zIndex = '2147483647';
  overlay.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.1)';

  let renderedContent = isMarkdown && window.marked ? window.marked.parse(article.content) : article.content;
  overlay.innerHTML = `
    <div style="max-width: 800px; margin: 40px auto; padding: 32px; background: transparent; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); font-family: 'Georgia', 'Times New Roman', Times, serif; line-height: 1.8; color: #3e2f1c;">
      <h1 style="font-size: 2.2rem; margin-bottom: 2rem; color: #5b4636; font-weight: 700; letter-spacing: 0.01em;">${article.title}</h1>
      <div id="reader-content" style="font-size: 1.18rem;">
        ${renderedContent}
      </div>
    </div>
    <style>
      #reader-content p {
        margin: 1.3em 0;
        letter-spacing: 0.01em;
      }
      #reader-content h2, #reader-content h3 {
        margin-top: 2em;
        margin-bottom: 1em;
        color: #7a5c3e;
        font-weight: 600;
      }
      #reader-content a {
        color: #b05e19;
        text-decoration: underline;
      }
      #reader-content img {
        display: block;
        margin: 2em auto;
        max-width: 100%;
        height: auto;
        border-radius: 6px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.07);
      }
    </style>
  `;
  document.body.appendChild(overlay);
}

// Show skeleton loader overlay and hide DOM
function showSkeletonOverlay() {
  // Hide all body children except the overlay
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'read-smart-overlay') {
      child.style.display = 'none';
    }
  });

  // Remove existing overlay if present
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.overflow = 'auto';
  overlay.style.background = '#f4ecd8'; // Sepia
  overlay.style.zIndex = '2147483647';
  overlay.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.1)';

  overlay.innerHTML = `
    <div class="skeleton-loader" style="max-width: 800px; margin: 40px auto; padding: 32px; background: transparent; border-radius: 12px;">
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
  document.body.appendChild(overlay);
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

// Gemini Pro integration
async function rephraseWithGemini(text) {
  if (!geminiApiKey) {
    throw new Error('Gemini API key not set. Please set it in the extension settings.');
  }

  const prompt = `Please rephrase the following text in a clear, engaging, and easy-to-read style while maintaining the original meaning and key information. Make it more conversational and user-friendly:

${text}`;

  try {
    const geminiModel = 'gemini-2.0-flash';
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }]
          })
        }
      );

    if (!response.ok) {
      throw new Error('Failed to get response from Gemini API');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}
