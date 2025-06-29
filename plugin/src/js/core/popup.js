// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Toggle elements
  const readerModeToggle = document.getElementById('readerModeToggle');
  const statusText = document.getElementById('statusText');
  const rephraseToggle = document.getElementById('rephraseToggle');
  const memoryButton = document.getElementById('memoryButton');
  const dashboardButton = document.getElementById('dashboardButton');
  
  // Configuration modal elements
  const configButton = document.getElementById('configButton');
  const configModal = document.getElementById('configModal');
  const closeModal = document.getElementById('closeModal');
  const cancelConfig = document.getElementById('cancelConfig');
  const saveConfig = document.getElementById('saveConfig');

  // API key input elements
  const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
  const mem0ApiKeyInput = document.getElementById('mem0ApiKeyInput');
  const geminiStatus = document.getElementById('geminiStatus');
  const mem0Status = document.getElementById('mem0Status');
  
  // BEGIN: Advanced configuration elements
  const systemPromptInput      = document.getElementById('systemPromptInput');
  const relevanceThresholdInput = document.getElementById('relevanceThresholdInput');
  const maxMemoriesInput        = document.getElementById('maxMemoriesInput');
  const geminiModelSelect       = document.getElementById('geminiModelSelect');
  // END: Advanced configuration elements
  
  // Progress overlay constants / helpers
  const PROGRESS_ID = 'read-smart-progress-overlay';
  const PROGRESS_CONTENT_ID = 'read-smart-progress-content';

  let progressSteps = [];

  function showProgressOverlay(steps) {
    const container = document.getElementById(PROGRESS_ID);
    const contentEl = document.getElementById(PROGRESS_CONTENT_ID);
    if (!container || !contentEl) return;

    progressSteps = steps;
    container.classList.remove('hidden');

    // Clear previous
    contentEl.innerHTML = '';

    steps.forEach((s, idx) => {
      const step = document.createElement('div');
      step.className = 'rs-step' + (idx === 0 ? ' current' : '');
      step.id = `rs-step-${idx}`;

      const circle = document.createElement('div');
      circle.className = 'rs-step-circle';
      step.appendChild(circle);

      const label = document.createElement('div');
      label.textContent = s;
      step.appendChild(label);

      contentEl.appendChild(step);
    });

    // Hide status banner while overlay is visible
    if (statusText) statusText.style.display = 'none';
  }

  function markProgressStep(idx) {
    const step = document.getElementById(`rs-step-${idx}`);
    if (step) {
      step.classList.remove('current');
      step.classList.add('completed');
      const circle = step.querySelector('.rs-step-circle');
      if (circle) circle.textContent = '✓';
    }
    const next = document.getElementById(`rs-step-${idx + 1}`);
    if (next) next.classList.add('current');
  }

  function hideProgressOverlay() {
    const container = document.getElementById(PROGRESS_ID);
    if (container) container.classList.add('hidden');
    if (statusText) statusText.style.display = '';
  }

  // Duplicate modal elements
  const duplicateModal = document.getElementById('duplicateModal');
  const closeDuplicateModal = document.getElementById('closeDuplicateModal');
  const cancelDuplicate = document.getElementById('cancelDuplicate');
  const forceAddButton = document.getElementById('forceAdd');
  let pendingTabId = null;
  
  if (!readerModeToggle || !statusText || !rephraseToggle || !configButton || !configModal || !memoryButton) {
    console.error('Required elements not found!');
    return;
  }

  // API key storage keys
  const STORAGE_KEYS = {
    GEMINI_API_KEY: 'geminiApiKey',
    MEM0_API_KEY: 'mem0ApiKey',
    // Advanced configuration keys
    SYSTEM_PROMPT: 'systemPrompt',
    RELEVANCE_THRESHOLD: 'relevanceThreshold',
    MAX_MEMORIES: 'maxMemories',
    GEMINI_MODEL: 'geminiModel',
    DEBUG_MODE: 'debugMode'
  };

  // Load saved states and API keys
  async function loadSavedData() {
    try {
      const result = await chrome.storage.sync.get(Object.values(STORAGE_KEYS));

      // Load API keys
      const geminiKey = result[STORAGE_KEYS.GEMINI_API_KEY] || '';
      const mem0Key   = result[STORAGE_KEYS.MEM0_API_KEY] || '';
      geminiApiKeyInput.value = geminiKey;
      mem0ApiKeyInput.value   = mem0Key;

      // Load advanced config (with sensible fallbacks)
      systemPromptInput.value        = result[STORAGE_KEYS.SYSTEM_PROMPT] || '';
      relevanceThresholdInput.value  = result[STORAGE_KEYS.RELEVANCE_THRESHOLD] ?? '';
      maxMemoriesInput.value         = result[STORAGE_KEYS.MAX_MEMORIES] ?? '';
      geminiModelSelect.value        = result[STORAGE_KEYS.GEMINI_MODEL] || 'gemini-2.5-flash';
      
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

  function showDuplicateModal(tabId) {
    pendingTabId = tabId;
    duplicateModal.style.display = 'block';
    // Update status banner
    statusText.textContent = 'Memory already added';
    statusText.className = 'status';
  }

  function hideDuplicateModal() {
    duplicateModal.style.display = 'none';
    pendingTabId = null;
    // Restore status banner to current mode
    const currentMode = readerModeToggle.checked ? 'Smart reading mode active' : 'Normal reading mode';
    statusText.textContent = currentMode;
    statusText.className = readerModeToggle.checked ? 'status active' : 'status';
    // Ensure progress is hidden
    hideProgress();
  }

  // Save API configuration
  async function saveApiConfiguration() {
    const geminiKey = geminiApiKeyInput.value.trim();
    const mem0Key = mem0ApiKeyInput.value.trim();

    // Advanced configuration values
    const systemPrompt       = systemPromptInput.value.trim();
    const relevanceThreshold = parseFloat(relevanceThresholdInput.value);
    const maxMemories        = parseInt(maxMemoriesInput.value, 10);
    const geminiModel        = geminiModelSelect.value;
    
    // API keys are optional, but warn if none provided
    if (!geminiKey && !mem0Key) {
      const proceed = confirm('No API keys provided. You can only use Reader Mode without API keys. Continue?');
      if (!proceed) {
        return;
      }
    }

    try {
      // Prepare storage payload
      const storagePayload = {
        [STORAGE_KEYS.GEMINI_API_KEY]: geminiKey,
        [STORAGE_KEYS.MEM0_API_KEY]: mem0Key,
        [STORAGE_KEYS.SYSTEM_PROMPT]: systemPrompt,
        [STORAGE_KEYS.RELEVANCE_THRESHOLD]: isNaN(relevanceThreshold) ? null : relevanceThreshold,
        [STORAGE_KEYS.MAX_MEMORIES]: isNaN(maxMemories) ? null : maxMemories,
        [STORAGE_KEYS.GEMINI_MODEL]: geminiModel,
        [STORAGE_KEYS.DEBUG_MODE]: false
      };

      // Persist to chrome.storage.sync
      await chrome.storage.sync.set(storagePayload);

      // Show success alert
      alert('Configuration saved successfully!');

      // Update UI states
      updateAllUIStates();

      // Prepare values for broadcast (sanitise NaN)
      const safeRelevance = isNaN(relevanceThreshold) ? null : relevanceThreshold;
      const safeMaxMemories = isNaN(maxMemories) ? null : maxMemories;
      
      // Broadcast configuration update to ALL tabs
      const allTabs = await chrome.tabs.query({});
      allTabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'configUpdated',
          config: {
            systemPrompt,
            relevanceThreshold: safeRelevance,
            maxMemories: safeMaxMemories,
            geminiModel,
            debug: false,
            geminiApiKey: geminiKey,
            mem0ApiKey: mem0Key
          }
        }).catch(() => {/* ignore errors for tabs without content script */});
      });

      // Also update active tab with new API keys for backwards compatibility
      try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'updateApiKeys',
            geminiApiKey: geminiKey,
            mem0ApiKey: mem0Key
          });
        }
      } catch (_) {/* ignore */}

      // Close modal and show success banner
      hideConfigModal();
      statusText.textContent = 'Configuration saved successfully!';
      statusText.className = 'status active';

      setTimeout(() => {
        statusText.textContent = readerModeToggle.checked ? 'Smart reading mode active' : 'Normal reading mode';
        statusText.className = readerModeToggle.checked ? 'status active' : 'status';
      }, 2000);

    } catch (error) {
      console.error('Error saving configuration:', error);
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
  async function addCurrentPageToMemory(force = false) {
    const steps = ['Preparing page', 'Uploading to Mem0', 'Done'];
    startProgress(steps);
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
      statusText.textContent = 'Uploading content...';
      statusText.className = 'status active';

      // First, inject content script if needed
      try {
        await injectScripts(tab.id);
        // Mark preparation done once scripts are injected/verified
        completeProgressStep(0, steps.length);
      } catch (scriptError) {
        // Content script might already be injected or injection failed
        completeProgressStep(0, steps.length); // still mark step done
      }
      
      // Send message to content script to add page to memory
      const result = await chrome.tabs.sendMessage(tab.id, {
        action: "addPageToMemory",
        geminiApiKey: geminiKey,
        mem0ApiKey: mem0Key,
        force
      });

      if (result.duplicate) {
        memoryButton.textContent = 'Add to Memory';
        memoryButton.disabled = false;
        hideProgress();
        showDuplicateModal(tab.id);
      } else if (result.success && result.processed) {
        // Show success
        memoryButton.textContent = 'Add to Memory';
        memoryButton.disabled = false;
        // Upload finished
        completeProgressStep(1, steps.length);
        
        statusText.textContent = `Memory added! (${result.snippetsCount} snippets)`;
        statusText.className = 'status active';
        
        setTimeout(() => {
          const currentMode = readerModeToggle.checked ? 'Smart reading mode active' : 'Normal reading mode';
          statusText.textContent = currentMode;
          statusText.className = readerModeToggle.checked ? 'status active' : 'status';
          // Hide after completing final step
          setTimeout(() => hideProgress(), 1200);
        }, 300);
      } else {
        throw new Error(result.error || 'Failed to add page to memory');
      }

    } catch (error) {
      console.error('❌ Error in addCurrentPageToMemory:', error);
      
      // Reset button state
      memoryButton.textContent = 'Add to Memory';
      memoryButton.disabled = false;
      
      // Provide specific error messages based on error type
      let userMessage = 'Failed to add memory';
      let shouldShowAlert = true;
      
      if (error.message.includes('not available') || error.message.includes('not properly loaded')) {
        userMessage = 'Extension loading error - refresh page';
        statusText.textContent = userMessage;
        statusText.className = 'status';
        
        // Show helpful alert for this specific issue
        setTimeout(() => {
          alert('The extension components are not properly loaded. Please:\n\n1. Refresh the current page\n2. Wait for the page to fully load\n3. Try adding to memory again\n\nIf the problem persists, try reloading the extension.');
        }, 100);
        shouldShowAlert = false;
        
      } else if (error.message.includes('API key') || error.message.includes('Invalid')) {
        userMessage = 'API key issue - check settings';
        statusText.textContent = userMessage;
        statusText.className = 'status';
        
        setTimeout(() => {
          alert('There is an issue with your API keys. Please:\n\n1. Open Settings\n2. Verify both Gemini and Mem0 API keys are correct\n3. Save the configuration\n4. Try again');
          showConfigModal();
        }, 100);
        shouldShowAlert = false;
        
      } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        userMessage = 'Network error - check connection';
        statusText.textContent = userMessage;
        statusText.className = 'status';
        
        setTimeout(() => {
          alert('Network error occurred. Please:\n\n1. Check your internet connection\n2. Verify API keys are valid\n3. Disable ad blockers temporarily\n4. Try again');
        }, 100);
        shouldShowAlert = false;
        
      } else if (error.message.includes('content blocker') || error.message.includes('ERR_BLOCKED')) {
        userMessage = 'Content blocker interference';
        statusText.textContent = userMessage;
        statusText.className = 'status';
        
        setTimeout(() => {
          alert('Content blocker is interfering with the extension. Please:\n\n1. Disable ad blockers on this page\n2. Add these domains to your allowlist:\n   - generativelanguage.googleapis.com\n   - api.mem0.ai\n3. Try again');
        }, 100);
        shouldShowAlert = false;
        
      } else {
        // Generic error
        statusText.textContent = userMessage;
        statusText.className = 'status';
      }
      
      // Reset status after a delay
      setTimeout(() => {
        const currentMode = readerModeToggle.checked ? 'Smart reading mode active' : 'Normal reading mode';
        statusText.textContent = currentMode;
        statusText.className = readerModeToggle.checked ? 'status active' : 'status';
      }, 5000);
      
      // Show generic alert only if we haven't shown a specific one
      if (shouldShowAlert) {
        setTimeout(() => {
          alert('Failed to add memory. Error: ' + error.message + '\n\nPlease check your API keys and try again.');
        }, 100);
      }
      
      hideProgress();
    }
  }

  // Event listeners for modal
  configButton.addEventListener('click', showConfigModal);
  closeModal.addEventListener('click', hideConfigModal);
  cancelConfig.addEventListener('click', hideConfigModal);
  saveConfig.addEventListener('click', saveApiConfiguration);

  closeDuplicateModal.addEventListener('click', hideDuplicateModal);
  cancelDuplicate.addEventListener('click', hideDuplicateModal);
  forceAddButton.addEventListener('click', async () => {
    if (pendingTabId) {
      await addCurrentPageToMemory(true);
    }
    hideDuplicateModal();
  });
  duplicateModal.addEventListener('click', (e) => {
    if (e.target === duplicateModal) hideDuplicateModal();
  });

  // Event listener for memory button
  memoryButton.addEventListener('click', () => addCurrentPageToMemory(false));

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
    if (e.key === 'Escape') {
      if (configModal.style.display === 'block') {
        hideConfigModal();
      }
      if (duplicateModal.style.display === 'block') {
        hideDuplicateModal();
      }
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
    const steps = ['Preparing page', 'Generating with memory', 'Done'];
    startProgress(steps);
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
        hideProgress();
        return;
      }

      // Inject required scripts
      await injectScripts(tab.id);
      completeProgressStep(0, steps.length);
      
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
        completeProgressStep(1, steps.length);

        setTimeout(() => {
          completeProgressStep(2, steps.length);
        }, 300);

        setTimeout(() => hideProgress(), 1500);
      } else {
        const errorMessage = response?.error || 'Failed to enable smart rephrase';
        console.error('Smart rephrase error:', errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error enabling smart rephrase:', error);
      rephraseToggle.checked = false;
      
      // Provide more specific error messages
      let errorMessage = 'Error enabling smart rephrase';
      if (error.message.includes('API key')) {
        errorMessage = 'API key issue - check settings';
      } else if (error.message.includes('not properly initialized')) {
        errorMessage = 'Initialization error - try refreshing page';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorMessage = 'Network error - check connection';
      }
      
      statusText.textContent = errorMessage;
      statusText.className = 'status';
      hideProgress();
      
      // Show alert for serious errors
      if (error.message.includes('not properly initialized')) {
        alert('Smart rephrase failed to initialize. Please refresh the page and try again.');
      }
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
      // Check if content script is already initialized
      const response = await chrome.tabs.sendMessage(tabId, {action: "getState"});
      if (response) {
        // Content script is already loaded and responding
        return;
      }
    } catch (error) {
      // Content script not loaded, proceed with injection
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          'lib/Readability.js',
          'lib/marked.min.js',
          'src/js/managers/event-manager.js',
          'src/js/managers/storage-manager.js',
          'src/js/managers/config-manager.js',
          'src/js/features/memory-deduplication.js',
          'lib/memory-enhanced-reading.js',
          'src/js/managers/memory-manager.js',
          'src/js/cache.js',
          'src/js/core/content.js'
        ]
      });
    } catch (error) {
      console.error('Error injecting scripts:', error);
      throw error;
    }
  }

  // Check initial state
  async function checkInitialState() {
    try {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      if (tab) {
        // Try to get state from content script with timeout
        const response = await Promise.race([
          chrome.tabs.sendMessage(tab.id, {action: "getState"}),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
        ]);
        
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
      console.log('Content script not loaded yet or page just loaded:', error.message);
      statusText.textContent = 'Normal reading mode';
      statusText.className = 'status';
    }
  }

  // Open Mem0 dashboard
  function openDashboard() {
    chrome.tabs.create({ url: 'https://app.mem0.ai/dashboard' });
  }

  // Helper: initialize progress steps using overlay
  function startProgress(steps) {
    showProgressOverlay(steps);
  }

  function completeProgressStep(idx /*, totalSteps ignored */) {
    markProgressStep(idx);
  }

  function hideProgress() {
    hideProgressOverlay();
  }

  // Initialize the popup
  loadSavedData();
  checkInitialState();

  // Auto-scroll Advanced section into view when expanded
  const advancedSection = document.getElementById('advancedSection');
  if (advancedSection) {
    advancedSection.addEventListener('toggle', () => {
      if (advancedSection.open) {
        // give layout a moment then scroll
        setTimeout(() => {
          advancedSection.scrollIntoView({behavior: 'smooth', block: 'start'});
        }, 50);
      }
    });
  }
});
  