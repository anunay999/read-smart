// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const readerModeToggle = document.getElementById('readerModeToggle');
  const statusText = document.getElementById('statusText');
  
  if (!readerModeToggle || !statusText) {
    console.error('Required elements not found!');
    return;
  }

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
      
      // Send the toggle message
      const response = await chrome.tabs.sendMessage(tab.id, {action: "toggleReaderMode"});
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
  