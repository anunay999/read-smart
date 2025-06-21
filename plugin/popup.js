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
    MEM0_API_KEY: 'mem0ApiKey',
    REPHRASE_WITH_GEMINI: 'rephraseWithGemini'
  };

  // Load saved states and API keys
  function loadSavedData() {
    chrome.storage.sync.get([
      STORAGE_KEYS.GEMINI_API_KEY, 
      STORAGE_KEYS.MEM0_API_KEY, 
      STORAGE_KEYS.REPHRASE_WITH_GEMINI
    ], function(result) {
      // Load API keys and update status
      if (result[STORAGE_KEYS.GEMINI_API_KEY]) {
        geminiApiKeyInput.value = result[STORAGE_KEYS.GEMINI_API_KEY];
        updateApiKeyStatus(geminiStatus, true);
      } else {
        updateApiKeyStatus(geminiStatus, false);
      }
      
      if (result[STORAGE_KEYS.MEM0_API_KEY]) {
        mem0ApiKeyInput.value = result[STORAGE_KEYS.MEM0_API_KEY];
        updateApiKeyStatus(mem0Status, true);
      } else {
        updateApiKeyStatus(mem0Status, false);
      }
      
      // Load rephrase toggle state (default ON)
      rephraseToggle.checked = result[STORAGE_KEYS.REPHRASE_WITH_GEMINI] !== false;
      
      // Check if API keys are configured
      const hasGeminiKey = !!result[STORAGE_KEYS.GEMINI_API_KEY];
      const hasMem0Key = !!result[STORAGE_KEYS.MEM0_API_KEY];
      const hasAnyApiKey = hasGeminiKey || hasMem0Key;
      
      // Update UI based on API key status
      updateUIForApiKeyStatus(hasAnyApiKey);
      
      // Show configuration modal if no API keys are configured
      if (!hasAnyApiKey) {
        showConfigModal();
      }
    });
  }

  // Update UI based on API key configuration status
  function updateUIForApiKeyStatus(hasApiKeys) {
    // Enable/disable buttons based on API key status
    memoryButton.disabled = !hasApiKeys;
    dashboardButton.disabled = !hasApiKeys;
    readerModeToggle.disabled = !hasApiKeys;
    rephraseToggle.disabled = !hasApiKeys;
    
    // Update status text
    if (!hasApiKeys) {
      statusText.textContent = 'Please configure API keys';
      statusText.className = 'status';
    } else {
      statusText.textContent = 'Normal reading mode';
      statusText.className = 'status';
    }
    
    // Add visual indication for disabled state
    if (!hasApiKeys) {
      memoryButton.style.opacity = '0.5';
      dashboardButton.style.opacity = '0.5';
      document.querySelector('.feature-item:nth-child(1)').style.opacity = '0.5';
      document.querySelector('.feature-item:nth-child(2)').style.opacity = '0.5';
    } else {
      memoryButton.style.opacity = '1';
      dashboardButton.style.opacity = '1';
      document.querySelector('.feature-item:nth-child(1)').style.opacity = '1';
      document.querySelector('.feature-item:nth-child(2)').style.opacity = '1';
    }
  }

  // Update API key status display
  function updateApiKeyStatus(statusElement, isConfigured) {
    if (isConfigured) {
      statusElement.textContent = 'Configured';
      statusElement.className = 'api-status configured';
    } else {
      statusElement.textContent = 'Not configured';
      statusElement.className = 'api-status missing';
    }
    
    // Check if any API keys are configured and update UI accordingly
    const hasGeminiKey = geminiApiKeyInput.value.trim().length > 0;
    const hasMem0Key = mem0ApiKeyInput.value.trim().length > 0;
    updateUIForApiKeyStatus(hasGeminiKey || hasMem0Key);
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
    
    // At least one API key should be provided
    if (!geminiKey && !mem0Key) {
      alert('Please enter at least one API key');
      return;
    }

    try {
      const storageData = {};
      
      if (geminiKey) {
        storageData[STORAGE_KEYS.GEMINI_API_KEY] = geminiKey;
      }
      
      if (mem0Key) {
        storageData[STORAGE_KEYS.MEM0_API_KEY] = mem0Key;
      }
      
      await chrome.storage.sync.set(storageData);
      
      // Update API key status displays
      updateApiKeyStatus(geminiStatus, !!geminiKey);
      updateApiKeyStatus(mem0Status, !!mem0Key);
      
      // Update UI for enabled state
      updateUIForApiKeyStatus(true);
      
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
        console.log('Could not update content script:', error);
      }
      
      hideConfigModal();
      
      // Show success message
      const originalText = statusText.textContent;
      statusText.textContent = 'Configuration saved successfully!';
      statusText.className = 'status active';
      setTimeout(() => {
        statusText.textContent = originalText;
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
    console.log('🧠 Starting Add to Memory process...');
    
    try {
      // Check if API keys are configured
      console.log('🔍 Checking API keys...');
      const storage = await chrome.storage.sync.get([STORAGE_KEYS.GEMINI_API_KEY, STORAGE_KEYS.MEM0_API_KEY]);
      const geminiKey = storage[STORAGE_KEYS.GEMINI_API_KEY];
      const mem0Key = storage[STORAGE_KEYS.MEM0_API_KEY];

      console.log('🔑 Gemini key present:', !!geminiKey);
      console.log('🔑 Mem0 key present:', !!mem0Key);

      if (!geminiKey || !mem0Key) {
        console.warn('⚠️ Missing API keys - showing config modal');
        alert('Please configure both Gemini and Mem0 API keys first.');
        showConfigModal();
        return;
      }

      // Show loading state
      console.log('⏳ Setting loading state...');
      const originalText = memoryButton.textContent;
      memoryButton.textContent = 'Adding...';
      memoryButton.disabled = true;

      // Get current tab
      console.log('🔍 Getting current tab...');
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tab) {
        throw new Error('No active tab found');
      }
      console.log('📑 Current tab:', tab.url, tab.title);

      // Process page content with memory library in content script
      console.log('🔄 Processing page content with memory library...');
      statusText.textContent = 'Processing with AI...';
      statusText.className = 'status active';
      
      // First, inject content script if needed
      try {
        console.log('💉 Ensuring content script is injected...');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['lib/Readability.js', 'lib/marked.min.js', 'content.js']
        });
        console.log('✅ Content script injected successfully');
      } catch (scriptError) {
        console.log('⚠️ Content script might already be injected:', scriptError.message);
      }
      
      // Send message to content script to add page to memory
      const result = await chrome.tabs.sendMessage(tab.id, {
        action: "addPageToMemory",
        geminiApiKey: geminiKey,
        mem0ApiKey: mem0Key
      });

      console.log('📊 Memory processing result:', result);

      if (result.success && result.processed) {
        console.log('✅ Memory addition completed successfully');
        console.log(`📝 Added ${result.snippetsCount} memory snippets`);
        
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
  geminiApiKeyInput.addEventListener('input', () => {
    updateApiKeyStatus(geminiStatus, geminiApiKeyInput.value.trim().length > 0);
  });

  mem0ApiKeyInput.addEventListener('input', () => {
    updateApiKeyStatus(mem0Status, mem0ApiKeyInput.value.trim().length > 0);
  });

    // Save rephrase toggle state
  rephraseToggle.addEventListener('change', async () => {
    chrome.storage.sync.set({ [STORAGE_KEYS.REPHRASE_WITH_GEMINI]: rephraseToggle.checked });
    
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) return;
    
    try {
      // Get API keys for memory-enhanced rephrasing
      const storage = await chrome.storage.sync.get([STORAGE_KEYS.GEMINI_API_KEY, STORAGE_KEYS.MEM0_API_KEY]);
      const geminiKey = storage[STORAGE_KEYS.GEMINI_API_KEY];
      const mem0Key = storage[STORAGE_KEYS.MEM0_API_KEY];
      
      // Check if reader mode is active
      const response = await chrome.tabs.sendMessage(tab.id, {action: "getState"});
      
      if (rephraseToggle.checked) {
        // Smart Rephrase turned ON
        if (response && response.readerModeActive) {
          // If reader mode is already active, rephrase in place with memory enhancement
          await chrome.tabs.sendMessage(tab.id, {
            action: "rephraseInReaderMode",
            geminiApiKey: geminiKey,
            mem0ApiKey: mem0Key
          });
        } else {
          // If reader mode is not active, enable it with memory-enhanced rephrase
          await enableReaderModeWithRephrase(tab.id);
        }
      } else {
        // Smart Rephrase turned OFF
        if (response && response.readerModeActive) {
          // Show original content in reader mode
          await chrome.tabs.sendMessage(tab.id, {action: "showOriginalInReaderMode"});
        }
      }
    } catch (error) {
      console.log('Could not communicate with content script:', error);
    }
  });

  // Function to update UI state
  function updateUIState(isActive) {
    readerModeToggle.checked = isActive;
    statusText.textContent = isActive ? 'Smart reading mode active' : 'Normal reading mode';
    statusText.className = isActive ? 'status active' : 'status';
  }

  // Helper function to enable reader mode with rephrase without updating toggle
  async function enableReaderModeWithRephrase(tabId) {
    try {
      // Get API keys for memory-enhanced rephrasing
      const storage = await chrome.storage.sync.get([STORAGE_KEYS.GEMINI_API_KEY, STORAGE_KEYS.MEM0_API_KEY]);
      const geminiKey = storage[STORAGE_KEYS.GEMINI_API_KEY];
      const mem0Key = storage[STORAGE_KEYS.MEM0_API_KEY];
      
      // First, inject the required libraries and content script
      try {
        // Inject Readability.js
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['lib/Readability.js']
        });
        
        // Inject marked.js for markdown parsing
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['lib/marked.min.js']
        });
        
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        console.log('Scripts injected successfully');
      } catch (error) {
        console.log('Scripts might already be injected:', error);
      }
      
      // Enable reader mode with memory-enhanced rephrase
      const response = await chrome.tabs.sendMessage(tabId, {
        action: "toggleReaderMode",
        rephrase: true,
        fromSmartRephrase: true,
        geminiApiKey: geminiKey,
        mem0ApiKey: mem0Key
      });
      
      if (response && response.error) {
        console.error('Reader mode error:', response.error);
        statusText.textContent = 'Error activating reader mode';
        statusText.className = 'status';
      } else if (response && response.readerModeActive) {
        statusText.textContent = 'Smart reading mode active';
        statusText.className = 'status active';
      }
    } catch (error) {
      console.error('Error enabling reader mode with rephrase:', error);
      statusText.textContent = 'Error communicating with page';
      statusText.className = 'status';
    }
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
      
      // First, inject the required libraries and content script
      try {
        // Inject Readability.js
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['lib/Readability.js']
        });
        
        // Inject marked.js for markdown parsing
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['lib/marked.min.js']
        });
        
        // Inject content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log('Scripts injected successfully');
      } catch (error) {
        console.log('Scripts might already be injected:', error);
      }
      
      // Send the toggle message with rephrase state
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "toggleReaderMode",
        rephrase: rephraseToggle.checked,
      });
      console.log('Received response:', response);
      
      if (response) {
        if (response.error) {
          console.error('Reader mode error:', response.error);
          // Reset toggle state on error
          readerModeToggle.checked = false;
          statusText.textContent = 'Error activating reader mode';
          statusText.className = 'status';
        } else {
        updateUIState(response.readerModeActive);
        }
      }
    } catch (error) {
      console.error('Error in popup:', error);
      // Reset toggle state on error
      readerModeToggle.checked = false;
      statusText.textContent = 'Error communicating with page';
      statusText.className = 'status';
    }
  }

  // Add click listener to toggle
  readerModeToggle.addEventListener('change', async () => {
    // If reader mode is being turned off and smart rephrase is on, we need special handling
    if (!readerModeToggle.checked && rephraseToggle.checked) {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        try {
          // Disable reader mode without affecting rephrase toggle
          await chrome.tabs.sendMessage(tab.id, {action: "disableReaderModeOnly"});
          statusText.textContent = 'Normal reading mode';
          statusText.className = 'status';
          return;
        } catch (error) {
          console.log('Could not communicate with content script:', error);
        }
      }
    }
    
    toggleReaderMode();
  });

  // Check initial state
  async function checkInitialState() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        const response = await chrome.tabs.sendMessage(tab.id, {action: "getState"});
        if (response) {
          // If reader mode was activated by smart rephrase, don't update reader mode toggle
          if (response.activatedBySmartRephrase) {
            // Keep reader mode toggle OFF but update status
            readerModeToggle.checked = false;
            if (response.readerModeActive) {
              statusText.textContent = 'Smart reading mode active';
              statusText.className = 'status active';
            }
          } else {
            // Normal reader mode activation
            updateUIState(response.readerModeActive);
          }
        }
      }
    } catch (error) {
      console.log('Error checking initial state:', error);
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
  