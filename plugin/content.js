// content.js - A modular reader mode implementation
console.log('Content script loaded');

let readerModeActive = false;
let overlay = null;

// Notify that content script is ready
chrome.runtime.sendMessage({action: "contentScriptReady"});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  
  if (request.action === "toggleReaderMode") {
    console.log('Toggling reader mode, current state:', readerModeActive);
    
    if (!readerModeActive) {
      console.log('Attempting to enable reader mode');
      enableReaderMode().then(() => {
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
  }
  return true;
});

// Main reader mode functions
async function enableReaderMode() {
  try {
    // Extract content using Readability
    const article = await extractContentWithReadability();
    if (article) {
      renderReaderOverlay(article);
      readerModeActive = true;
    }
  } catch (error) {
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
function renderReaderOverlay(article) {
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
  overlay.style.background = '#fff';
  overlay.style.zIndex = '2147483647';
  overlay.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.1)';

  overlay.innerHTML = `
    <div style="max-width: 800px; margin: 40px auto; padding: 32px; background: #fff; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">
      <h1 style="font-size: 2rem; margin-bottom: 1.5rem; color: #1a1a1a;">${article.title}</h1>
      <div id="reader-content">${article.content}</div>
    </div>
  `;
  document.body.appendChild(overlay);
}
