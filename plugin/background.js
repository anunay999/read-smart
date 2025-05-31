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
      });
      sendResponse({success: true});
    }
    return true;
  });
  