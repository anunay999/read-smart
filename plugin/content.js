// content.js - A modular reader mode implementation
console.log('Content script loaded');

let readerModeActive = false;
let originalContent = null;

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
    console.log('Starting enableReaderMode');
    
    // Save original content
    originalContent = {
      html: document.documentElement.innerHTML,
      title: document.title,
      url: window.location.href
    };
    
    console.log('Saved original content');
    
    // Extract content using Readability
    const article = await extractContentWithReadability();
    console.log('Content extracted:', article ? 'success' : 'failed');
    
    if (article) {
      renderReaderView(article);
      readerModeActive = true;
      console.log('Reader view rendered');
    }
  } catch (error) {
    console.error('Error in enableReaderMode:', error);
    throw error;
  }
}

function disableReaderMode() {
  if (originalContent) {
    document.open();
    document.write(originalContent.html);
    document.close();
    document.title = originalContent.title;
    readerModeActive = false;
  }
}

// Content extraction
async function extractContentWithReadability() {
  // Create a clone of the document to work with
  const documentClone = document.cloneNode(true);
  
  // Create a new Readability object
  const reader = new Readability(documentClone, {
    charThreshold: 20,
    classesToPreserve: ['important', 'highlight']
  });
  
  // Parse the document
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
function renderReaderView(article) {
  const readerHTML = `
    <html>
    <head>
      <title>${article.title}</title>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          line-height: 1.6;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
          background: #fff;
        }
        img { 
          max-width: 100%; 
          height: auto; 
          margin: 1rem 0;
          display: block;
        }
        h1 { 
          font-size: 2rem;
          margin-bottom: 1.5rem;
          color: #1a1a1a;
        }
        h2 { 
          font-size: 1.5rem;
          margin: 1.5rem 0 1rem;
          color: #2a2a2a;
        }
        p {
          margin: 1rem 0;
          font-size: 1.1rem;
        }
        a { 
          color: #0066cc;
          text-decoration: none;
        }
        a:hover {
          text-decoration: underline;
        }
        .important {
          background-color: #fff3cd;
          padding: 0.2rem;
        }
        .highlight {
          background-color: #d4edda;
          padding: 0.2rem;
        }
      </style>
    </head>
    <body>
      <h1>${article.title}</h1>
      <div id="reader-content">${article.content}</div>
    </body>
    </html>
  `;
  
  document.open();
  document.write(readerHTML);
  document.close();
}
