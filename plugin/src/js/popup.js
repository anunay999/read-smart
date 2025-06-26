// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const readerModeToggle = document.getElementById('readerModeToggle');
  const statusText = document.getElementById('statusText');
  // memoryCount element removed from UI
  const rephraseToggle = document.getElementById('rephraseToggle');
  const configButton = document.getElementById('configButton');
  const memoryButton = document.getElementById('memoryButton');
  const dashboardButton = document.getElementById('dashboardButton');
  const configModal = document.getElementById('configModal');
  const closeModal = document.getElementById('closeModal');
  const cancelConfig = document.getElementById('cancelConfig');
  const saveConfig = document.getElementById('saveConfig');
  const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
  const mem0ApiKeyInput = document.getElementById('mem0ApiKeyInput');
  const geminiStatus = document.getElementById('geminiStatus');
  const mem0Status = document.getElementById('mem0Status');
  
  if (!readerModeToggle || !statusText || !rephraseToggle || !configButton || !configModal || !memoryButton) {
    console.error('Required elements not found!');
    return;
  }

  // API key storage keys
  const STORAGE_KEYS = {
    GEMINI_API_KEY: 'geminiApiKey',
    MEM0_API_KEY: 'mem0ApiKey'
  };

  // Load saved states and API keys
  async function loadSavedData() {
    try {
      const result = await chrome.storage.sync.get([
        STORAGE_KEYS.GEMINI_API_KEY, 
        STORAGE_KEYS.MEM0_API_KEY
      ]);
      
      // Load API keys into input fields
      const geminiKey = result[STORAGE_KEYS.GEMINI_API_KEY] || '';
      const mem0Key = result[STORAGE_KEYS.MEM0_API_KEY] || '';
      
      geminiApiKeyInput.value = geminiKey;
      mem0ApiKeyInput.value = mem0Key;
      
      // Don't set toggle states from storage - they should reflect actual page state
      // Toggle states will be set by checkInitialState() based on actual content script state
      rephraseToggle.checked = false;
      readerModeToggle.checked = false;
      
      // Update UI based on current API key status
      updateAllUIStates();
      
    } catch (error) {
      console.error('Error loading saved data:', error);
    }
  }

  // Check if API keys are configured
  function hasValidApiKeys() {
    const hasGemini = geminiApiKeyInput.value.trim().length > 0;
    const hasMem0 = mem0ApiKeyInput.value.trim().length > 0;
    return hasGemini || hasMem0;
  }

  // Update all UI states based on current API key status
  function updateAllUIStates() {
    const hasKeys = hasValidApiKeys();
    const hasGeminiKey = geminiApiKeyInput.value.trim().length > 0;
    const hasMem0Key = mem0ApiKeyInput.value.trim().length > 0;
    
    // Update API key status indicators
    updateApiKeyStatus(geminiStatus, hasGeminiKey);
    updateApiKeyStatus(mem0Status, hasMem0Key);
    
    // Reader Mode is always available (no API key required)
    readerModeToggle.disabled = false;
    document.querySelector('.feature-item:nth-child(1)').style.opacity = '1';
    
    // Smart Rephrase requires Gemini API key
    rephraseToggle.disabled = !hasGeminiKey;
    const rephraseOpacity = hasGeminiKey ? '1' : '0.5';
    document.querySelector('.feature-item:nth-child(2)').style.opacity = rephraseOpacity;
    
    // Memory features require Mem0 API key
    memoryButton.disabled = !hasMem0Key;
    memoryButton.style.opacity = hasMem0Key ? '1' : '0.5';
    
    // Dashboard requires at least one API key
    dashboardButton.disabled = !hasKeys;
    dashboardButton.style.opacity = hasKeys ? '1' : '0.5';
    
    // Update status text based on what's available
    if (!hasKeys) {
      statusText.textContent = 'Reader mode available - Configure API keys for AI features';
      statusText.className = 'status';
    } else {
      statusText.textContent = 'All features available';
      statusText.className = 'status';
    }
  }

  // Update individual API key status display
  function updateApiKeyStatus(statusElement, isConfigured) {
    statusElement.textContent = isConfigured ? 'Configured' : 'Not configured';
    statusElement.className = isConfigured ? 'api-status configured' : 'api-status missing';
  }

  // Show configuration modal
  function showConfigModal() {
    configModal.style.display = 'block';
    // Focus on first empty input
    if (!geminiApiKeyInput.value.trim()) {
      geminiApiKeyInput.focus();
    } else if (!mem0ApiKeyInput.value.trim()) {
      mem0ApiKeyInput.focus();
    }
  }

  // Hide configuration modal
  function hideConfigModal() {
    configModal.style.display = 'none';
  }

  // Save API configuration
  async function saveApiConfiguration() {
    const geminiKey = geminiApiKeyInput.value.trim();
    const mem0Key = mem0ApiKeyInput.value.trim();
    
    // API keys are optional, but at least show a warning if none are provided
    if (!geminiKey && !mem0Key) {
      const proceed = confirm('No API keys provided. You can only use Reader Mode without API keys. Continue?');
      if (!proceed) {
        return;
      }
    }

    try {
      // Save both API keys to storage
      await chrome.storage.sync.set({
        [STORAGE_KEYS.GEMINI_API_KEY]: geminiKey,
        [STORAGE_KEYS.MEM0_API_KEY]: mem0Key
      });
      
      // Show success alert
      alert('API keys saved successfully!');
      
      // Update all UI states
      updateAllUIStates();
      
      // Update content script with new API keys
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: "updateApiKeys",
            geminiApiKey: geminiKey,
            mem0ApiKey: mem0Key
          });
        }
      } catch (error) {
        // Could not update content script, likely not injected yet
      }
      
      // Close modal and show success status
      hideConfigModal();
      statusText.textContent = 'Configuration saved successfully!';
      statusText.className = 'status active';
      
      setTimeout(() => {
        statusText.textContent = readerModeToggle.checked ? 'Smart reading mode active' : 'Normal reading mode';
        statusText.className = readerModeToggle.checked ? 'status active' : 'status';
      }, 2000);
      
    } catch (error) {
      console.error('Error saving API configuration:', error);
      alert('Error saving configuration. Please try again.');
    }
  }

  // Initialize Memory-Enhanced Reading Library
  function initializeMemoryReader(geminiKey, mem0Key) {
    return new MemoryEnhancedReading({
      mem0ApiKey: mem0Key,
      geminiApiKey: geminiKey,
      userId: "chrome_extension_user",
      debug: true
    });
  }

  // Add current page to memory using Memory-Enhanced Reading Library
  async function addCurrentPageToMemory() {
    try {
      // Check if API keys are configured
      const storage = await chrome.storage.sync.get([STORAGE_KEYS.GEMINI_API_KEY, STORAGE_KEYS.MEM0_API_KEY]);
      const geminiKey = storage[STORAGE_KEYS.GEMINI_API_KEY];
      const mem0Key = storage[STORAGE_KEYS.MEM0_API_KEY];

      if (!mem0Key) {
        alert('Please configure Mem0 API key for memory features.');
        showConfigModal();
        return;
      }

      // Show loading state
      const originalText = memoryButton.textContent;
      memoryButton.textContent = 'Adding...';
      memoryButton.disabled = true;

      // Get current tab
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Process page content with memory library in content script
      statusText.textContent = 'Adding page to memory...';
      statusText.className = 'status active';
      
      // First, inject content script if needed
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['lib/Readability.js', 'lib/marked.min.js', 'lib/memory-enhanced-reading.js', 'content.js']
        });
      } catch (scriptError) {
        // Content script might already be injected
      }
      
      // Send message to content script to add page to memory
      const result = await chrome.tabs.sendMessage(tab.id, {
        action: "addPageToMemory",
        geminiApiKey: geminiKey,
        mem0ApiKey: mem0Key
      });

      if (result.success && result.processed) {
        // Show success
        memoryButton.textContent = 'Add to Memory';
        memoryButton.disabled = false;
        
        statusText.textContent = `Memory added! (${result.snippetsCount} snippets)`;
        statusText.className = 'status active';
        
        setTimeout(() => {
          const currentMode = readerModeToggle.checked ? 'Smart reading mode active' : 'Normal reading mode';
          statusText.textContent = currentMode;
          statusText.className = readerModeToggle.checked ? 'status active' : 'status';
        }, 3000);
      } else {
        throw new Error(result.error || 'Failed to add page to memory');
      }

    } catch (error) {
      console.error('❌ Error in addCurrentPageToMemory:', error);
      console.error('❌ Error stack:', error.stack);
      
      // Reset button state
      memoryButton.textContent = 'Add to Memory';
      memoryButton.disabled = false;
      
      // Show error message
      statusText.textContent = 'Failed to add memory';
      statusText.className = 'status';
      
      setTimeout(() => {
        const currentMode = readerModeToggle.checked ? 'Smart reading mode active' : 'Normal reading mode';
        statusText.textContent = currentMode;
        statusText.className = readerModeToggle.checked ? 'status active' : 'status';
      }, 3000);
      
      alert('Failed to add memory. Please check your API keys and try again.');
    }
  }

  // Event listeners for modal
  configButton.addEventListener('click', showConfigModal);
  closeModal.addEventListener('click', hideConfigModal);
  cancelConfig.addEventListener('click', hideConfigModal);
  saveConfig.addEventListener('click', saveApiConfiguration);

  // Event listener for memory button
  memoryButton.addEventListener('click', addCurrentPageToMemory);

  // Event listener for dashboard button
  dashboardButton.addEventListener('click', openDashboard);

  // Close modal when clicking outside
  configModal.addEventListener('click', (e) => {
    if (e.target === configModal) {
      hideConfigModal();
    }
  });

  // Handle ESC key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && configModal.style.display === 'block') {
      hideConfigModal();
    }
  });

  // Real-time API key status updates
  geminiApiKeyInput.addEventListener('input', updateAllUIStates);
  mem0ApiKeyInput.addEventListener('input', updateAllUIStates);

  // Handle rephrase toggle
  rephraseToggle.addEventListener('change', async () => {
    if (rephraseToggle.checked) {
      // Disable reader mode when smart rephrase is enabled
      readerModeToggle.checked = false;
      await enableSmartRephrase();
    } else {
      await disableSmartRephrase();
    }
  });

  // Handle reader mode toggle
  readerModeToggle.addEventListener('change', async () => {
    if (readerModeToggle.checked) {
      // Disable smart rephrase when reader mode is enabled
      rephraseToggle.checked = false;
      await enableReaderMode();
    } else {
      await disableReaderMode();
    }
  });

  // Enable plain reader mode
  async function enableReaderMode() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab) return;

      // Inject required scripts
      await injectScripts(tab.id);
      
      // Enable plain reader mode
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "enableReaderMode"
      });

      if (response && response.success) {
        statusText.textContent = 'Reader mode active';
        statusText.className = 'status active';
      } else {
        throw new Error(response?.error || 'Failed to enable reader mode');
      }
    } catch (error) {
      console.error('Error enabling reader mode:', error);
      readerModeToggle.checked = false;
      statusText.textContent = 'Error enabling reader mode';
      statusText.className = 'status';
    }
  }

  // Disable reader mode
  async function disableReaderMode() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab) return;

      await chrome.tabs.sendMessage(tab.id, {
        action: "disableReaderMode"
      });

      statusText.textContent = 'Normal reading mode';
      statusText.className = 'status';
    } catch (error) {
      console.error('Error disabling reader mode:', error);
    }
  }

  // Enable smart rephrase
  async function enableSmartRephrase() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab) return;

      // Get API keys
      const storage = await chrome.storage.sync.get([STORAGE_KEYS.GEMINI_API_KEY, STORAGE_KEYS.MEM0_API_KEY]);
      const geminiKey = storage[STORAGE_KEYS.GEMINI_API_KEY];
      const mem0Key = storage[STORAGE_KEYS.MEM0_API_KEY];

      if (!geminiKey || !mem0Key) {
        alert('Please configure both Gemini and Mem0 API keys for Smart Rephrase');
        rephraseToggle.checked = false;
        showConfigModal();
        return;
      }

      // Inject required scripts
      await injectScripts(tab.id);
      
      statusText.textContent = 'Generating with memory...';
      statusText.className = 'status active';
      
      // Enable smart rephrase with memory
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "enableSmartRephrase",
        geminiApiKey: geminiKey,
        mem0ApiKey: mem0Key
      });

      if (response && response.success) {
        statusText.textContent = 'Smart rephrase active';
        statusText.className = 'status active';
      } else {
        throw new Error(response?.error || 'Failed to enable smart rephrase');
      }
    } catch (error) {
      console.error('Error enabling smart rephrase:', error);
      rephraseToggle.checked = false;
      statusText.textContent = 'Error enabling smart rephrase';
      statusText.className = 'status';
    }
  }

  // Disable smart rephrase
  async function disableSmartRephrase() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab) return;

      await chrome.tabs.sendMessage(tab.id, {
        action: "disableSmartRephrase"
      });

      statusText.textContent = 'Normal reading mode';
      statusText.className = 'status';
    } catch (error) {
      console.error('Error disabling smart rephrase:', error);
    }
  }

  // Helper function to inject required scripts
  async function injectScripts(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['lib/Readability.js', 'lib/marked.min.js', 'lib/memory-enhanced-reading.js', 'content.js']
      });
          } catch (error) {
        // Scripts might already be injected
      }
  }

  // Check initial state
  async function checkInitialState() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        // Try to get state from content script
        const response = await chrome.tabs.sendMessage(tab.id, {action: "getState"});
        if (response) {
          if (response.readerModeActive) {
            readerModeToggle.checked = true;
            statusText.textContent = 'Reader mode active';
            statusText.className = 'status active';
          } else if (response.smartRephraseActive) {
            rephraseToggle.checked = true;
            statusText.textContent = 'Smart rephrase active';
            statusText.className = 'status active';
          } else {
            // Content script is loaded but no special mode is active
            statusText.textContent = 'Normal reading mode';
            statusText.className = 'status';
          }
        } else {
          // No response from content script - fresh page state
          statusText.textContent = 'Normal reading mode';
          statusText.className = 'status';
        }
      }
    } catch (error) {
      // Error checking initial state, content script not loaded or page just loaded
      // This is normal for fresh page loads - default to normal state
      statusText.textContent = 'Normal reading mode';
      statusText.className = 'status';
    }
  }

  // Open Mem0 dashboard
  function openDashboard() {
    chrome.tabs.create({ url: 'https://app.mem0.ai/dashboard' });
  }

  // Initialize the popup
  loadSavedData();
  checkInitialState();
});
  