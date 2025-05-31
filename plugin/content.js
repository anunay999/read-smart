// Content script that will be injected into the page
let readerModeActive = false;
let originalHTML = '';

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleReaderMode") {
    if (!readerModeActive) {
      enableReaderMode();
    } else {
      disableReaderMode();
    }
    sendResponse({success: true, readerModeActive});
  }
  return true;
});

// Function to enable reader mode
function enableReaderMode() {
  // Save original HTML for restoration later
  originalHTML = document.documentElement.innerHTML;
  
  // Create a new article parser using Mozilla's Readability
  const documentClone = document.cloneNode(true);
  const readability = new Readability(documentClone);
  const article = readability.parse();
  
  if (article) {
    // Create reader view HTML
    const readerHTML = `
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
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
          .reader-content {
            font-size: 1.125rem;
          }
          img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 1.5rem 0;
          }
          h1 {
            font-size: 1.8rem;
            margin-top: 0;
          }
          h2 {
            font-size: 1.5rem;
          }
          a {
            color: #0066cc;
          }
          @media (prefers-color-scheme: dark) {
            body {
              background: #222;
              color: #eee;
            }
            a {
              color: #88bbff;
            }
          }
        </style>
      </head>
      <body>
        <h1>${article.title}</h1>
        <div class="reader-content">${article.content}</div>
      </body>
      </html>
    `;
    
    // Replace the page content
    document.documentElement.innerHTML = readerHTML;
    readerModeActive = true;
  }
}

// Function to disable reader mode
function disableReaderMode() {
  if (originalHTML) {
    document.documentElement.innerHTML = originalHTML;
    readerModeActive = false;
  }
}
