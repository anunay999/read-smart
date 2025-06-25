// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(() => {
});

// Listen for clicks on the extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, {action: "toggleReaderMode"});
});

// Inject Readability library when needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === "injectReadability") {
    chrome.scripting.executeScript({
      target: {tabId: sender.tab.id},
      files: ['lib/Readability.js']
    }).then(() => {
      sendResponse({success: true});
    }).catch(error => {
      console.error('Error injecting Readability.js:', error);
      sendResponse({error: error.message});
    });
  }
  return true;
});
  