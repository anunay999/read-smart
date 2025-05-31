// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(() => {
  console.log('Read Smart extension installed/updated');
});

// Listen for clicks on the extension icon
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked on tab:', tab.id);
  chrome.tabs.sendMessage(tab.id, {action: "toggleReaderMode"});
});

// Inject Readability library when needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request);
  
  if (request.action === "injectReadability") {
    console.log('Injecting Readability.js');
    chrome.scripting.executeScript({
      target: {tabId: sender.tab.id},
      files: ['lib/Readability.js']
    }).then(() => {
      console.log('Readability.js injected successfully');
      sendResponse({success: true});
    }).catch(error => {
      console.error('Error injecting Readability.js:', error);
      sendResponse({error: error.message});
    });
  }
  return true;
});
  