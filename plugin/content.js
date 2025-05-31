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
  overlay.style.background = '#f4ecd8'; // Sepia
  overlay.style.zIndex = '2147483647';
  overlay.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.1)';

  overlay.innerHTML = `
    <div style="max-width: 800px; margin: 40px auto; padding: 32px; background: transparent; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); font-family: 'Georgia', 'Times New Roman', Times, serif; line-height: 1.8; color: #3e2f1c;">
      <h1 style="font-size: 2.2rem; margin-bottom: 2rem; color: #5b4636; font-weight: 700; letter-spacing: 0.01em;">${article.title}</h1>
      <div id="reader-content" style="font-size: 1.18rem;">
        ${article.content}
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
