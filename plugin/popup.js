// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const readerModeToggle = document.getElementById('readerModeToggle');
  const statusText = document.getElementById('statusText');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyButton = document.getElementById('saveApiKey');
  const rephraseToggle = document.getElementById('rephraseToggle');
  
  if (!readerModeToggle || !statusText || !apiKeyInput || !saveApiKeyButton || !rephraseToggle) {
    console.error('Required elements not found!');
    return;
  }

  // Load saved API key and rephrase toggle states
  chrome.storage.sync.get(['geminiApiKey', 'rephraseWithGemini'], function(result) {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
    rephraseToggle.checked = result.rephraseWithGemini !== false; // default ON
  });

  // Save API key
  saveApiKeyButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      alert('Please enter a valid API key');
      return;
    }

    try {
      await chrome.storage.sync.set({ geminiApiKey: apiKey });
      
      // Update the API key in the content script
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, {
          action: "updateApiKey",
          apiKey: apiKey
        });
      }
      
      alert('API key saved successfully!');
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('Error saving API key. Please try again.');
    }
  });

  // Save rephrase toggle state
  rephraseToggle.addEventListener('change', async () => {
    chrome.storage.sync.set({ rephraseWithGemini: rephraseToggle.checked });
    // If toggled ON and reader mode is already active, rephrase in place
    if (rephraseToggle.checked) {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        // Check if reader mode is active
        const response = await chrome.tabs.sendMessage(tab.id, {action: "getState"});
        if (response && response.readerModeActive) {
          await chrome.tabs.sendMessage(tab.id, {action: "rephraseInReaderMode"});
        }
      }
    } else {
      // If toggled OFF and reader mode is already active, show original content
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        const response = await chrome.tabs.sendMessage(tab.id, {action: "getState"});
        if (response && response.readerModeActive) {
          await chrome.tabs.sendMessage(tab.id, {action: "showOriginalInReaderMode"});
        }
      }
    }
  });


  // Function to update UI state
  function updateUIState(isActive) {
    readerModeToggle.checked = isActive;
    statusText.textContent = isActive ? 'Smart reading mode active' : 'Normal reading mode';
    statusText.className = isActive ? 'status active' : 'status';
  }

  // Function to toggle reader mode
  async function toggleReaderMode() {
    try {
      console.log('Toggling reader mode');
      
      // Get the current active tab
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      if (!tab) {
        console.error('No active tab found');
        return;
      }
      
      console.log('Current tab:', tab);
      
      // First, inject the content script if it's not already there
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log('Content script injected');
      } catch (error) {
        console.log('Content script might already be injected:', error);
      }
      
      // Send the toggle message with rephrase state
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "toggleReaderMode",
        rephrase: rephraseToggle.checked,
      });
      console.log('Received response:', response);
      
      if (response) {
        updateUIState(response.readerModeActive);
      }
    } catch (error) {
      console.error('Error in popup:', error);
    }
  }

  // Add click listener to toggle
  readerModeToggle.addEventListener('change', () => {
    toggleReaderMode();
  });

  // Check initial state
  async function checkInitialState() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        const response = await chrome.tabs.sendMessage(tab.id, {action: "getState"});
        if (response) {
          updateUIState(response.readerModeActive);
        }
      }
    } catch (error) {
      console.log('Error checking initial state:', error);
    }
  }

  // Check initial state when popup opens
  checkInitialState();
});
  