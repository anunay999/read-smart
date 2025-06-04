// content.js - Modular reader mode implementation
console.log('Content script loaded');

// --- State ---

let readerModeActive = false;
let overlay = null;
let geminiApiKey = null;
let originalArticle = null;
let rephrasedContent = null;
const mem0ApiKey = '';
const userId = 'read-smart';

// --- Initialization ---
chrome.storage.sync.get(['geminiApiKey'], function (result) {
  geminiApiKey = result.geminiApiKey;
});

// Notify that content script is ready
chrome.runtime.sendMessage({ action: "contentScriptReady" });

// --- Message Handling ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);

  if (request.action === "toggleReaderMode") {
    if (!readerModeActive) {
      enableReaderMode(request.rephrase).then(() => {
        sendResponse({ readerModeActive: true });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
    } else {
      disableReaderMode();
      sendResponse({ readerModeActive: false });
    }
  } else if (request.action === "getState") {
    sendResponse({ readerModeActive });
  } else if (request.action === "updateApiKey") {
    geminiApiKey = request.apiKey;
    sendResponse({ success: true });
  } else if (request.action === "rephraseInReaderMode") {
    if (readerModeActive && originalArticle) {
      showSkeletonOverlay();
      // TODO: Use custom API if enabled
      knowledgeAnalyseAndRephrase(originalArticle.textContent.slice(0, 500)).then(markdown => {
        rephrasedContent = markdown;
        renderReaderOverlay({
          title: originalArticle.title,
          content: rephrasedContent
        }, true);
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
    } else {
      sendResponse({ error: 'Reader mode not active or no original article' });
    }
  } else if (request.action === "showOriginalInReaderMode") {
    if (readerModeActive && originalArticle) {
      renderReaderOverlay({
        title: originalArticle.title,
        content: originalArticle.content
      }, false);
      sendResponse({ success: true });
    } else {
      sendResponse({ error: 'Reader mode not active or no original article' });
    }
  }
  return true;
});

// --- Main Reader Mode Logic ---
async function enableReaderMode(rephrase = true) {
  try {
    const article = await extractMainContent();
    originalArticle = article;
    rephrasedContent = null;
    if (article) {
      if (rephrase) {
        showSkeletonOverlay();
        // TODO: Add custom rephrase API (await rephraseWithCustomAPI(article.textContent);)
        rephrasedContent = await rephraseWithGemini(article.textContent);
        renderReaderOverlay({
          title: article.title,
          content: rephrasedContent
        }, true);
      } else {
        renderReaderOverlay({
          title: article.title,
          content: article.content
        }, false);
      }
      readerModeActive = true;
    }
  } catch (error) {
    removeFloatingSkeletonLoader();
    console.error('Error in enableReaderMode:', error);
    throw error;
  }
}

function disableReaderMode() {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  // Restore original content visibility
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'read-smart-overlay') {
      child.style.display = '';
    }
  });
  readerModeActive = false;
}

// --- Content Extraction ---
async function extractMainContent() {
  // Extracts the main article content using Readability
  const documentClone = document.cloneNode(true);
  fixLazyLoadedImages(documentClone);
  const reader = new Readability(documentClone, {
    charThreshold: 20,
    classesToPreserve: ['important', 'highlight']
  });
  const article = reader.parse();
  if (!article) throw new Error('Could not extract article content');
  return {
    title: article.title,
    content: article.content,
    textContent: article.textContent,
    length: article.length,
    excerpt: article.excerpt
  };
}

function fixLazyLoadedImages(doc) {
  const imgs = doc.querySelectorAll('img');
  imgs.forEach(img => {
    if (!img.getAttribute('src')) {
      const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src');
      if (dataSrc) {
        img.setAttribute('src', dataSrc);
      }
    }
  });
}

// --- Overlay Rendering ---
function renderReaderOverlay(article, isMarkdown = false) {
  hideDOMExceptOverlay();
  removeOverlay();
  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.className = 'fixed inset-0 w-screen h-screen overflow-auto bg-[#f4ecd8] z-[2147483647]';
  overlay.innerHTML = `
    <div class="max-w-4xl mx-auto my-10 p-8 bg-transparent rounded-xl shadow-lg font-serif leading-relaxed text-[#3e2f1c]">
      <h1 class="text-3xl mb-8 text-[#5b4636] font-bold tracking-tight">${article.title}</h1>
      <div id="reader-content" class="prose prose-lg prose-neutral">
        ${isMarkdown && window.marked ? window.marked.parse(article.content) : article.content}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function showSkeletonOverlay() {
  hideDOMExceptOverlay();
  removeOverlay();
  overlay = document.createElement('div');
  overlay.id = 'read-smart-overlay';
  overlay.className = 'fixed inset-0 w-screen h-screen overflow-auto bg-[#f4ecd8] z-[2147483647] flex items-center';
  overlay.innerHTML = `
    <div class="max-w-4xl w-full mx-auto p-8 bg-transparent rounded-xl shadow-lg animate-pulse">
      <div class="h-10 w-3/5 bg-[#e0d6c3] rounded mb-6"></div>
      <div class="h-5 w-full bg-[#e0d6c3] rounded mb-4"></div>
      <div class="h-5 w-full bg-[#e0d6c3] rounded mb-4"></div>
      <div class="h-5 w-full bg-[#e0d6c3] rounded mb-4"></div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideDOMExceptOverlay() {
  Array.from(document.body.children).forEach(child => {
    if (child.id !== 'read-smart-overlay') {
      child.style.display = 'none';
    }
  });
}

function removeOverlay() {
  if (overlay) overlay.remove();
}

// --- Rephrase Functions ---
async function rephraseWithGemini(text) {
  if (!geminiApiKey) throw new Error('Gemini API key not set. Please set it in the extension settings.');
  const prompt = `Please rephrase the following text in a clear, engaging, and easy-to-read style while maintaining the original meaning and key information. Make it more conversational and user-friendly:\n\n${text}`;
  const geminiModel = 'gemini-2.0-flash-lite';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    if (!response.ok) throw new Error('Failed to get response from Gemini API');
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw error;
  }
}


async function convertRelationsToMem0FormatMessages(relations) {
  const messages = relations.map(phrase => ({
    role: 'user',
    content: phrase.relation,
  }));
  return messages;
}


/* Makes a POST request to the Mem0 API to store memories. */
async function sendMem0Memory(apiKey, messages, userId, metadata) {
  const url = 'https://api.mem0.ai/v1/memories/';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, user_id: userId, metadata: { source: 'read-smart', article_url: window.location.href, ...metadata } }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mem0 API error: ${response.status} ${errorText}`);
  }
  return response.json();
}

/* Searches memories in Mem0 using the search API. */
async function searchMem0Memories(apiKey, query, userId) {
  const url = 'https://api.mem0.ai/v2/memories/search/';
  const payload = JSON.stringify({
    query,
    filters: {
      AND: [
        { user_id: userId }
      ]
    }
  });
  console.log('Searching Mem0 memories with query:', payload);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: payload,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mem0 Search API error: ${response.status} ${errorText}`);
  }
  return response.json();
}


async function getContentContextTags(text) {
  if (!geminiApiKey) throw new Error('Gemini API key not set. Please set it in the extension settings.');
  const prompt = `Given the following text, generate UPTO 10 tags to help with the context: ["tag1", "tag2", ...].\n\nText:\n${text}`;
  const geminiModel = 'gemini-2.0-flash-lite';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'array',
            items: {
              type: 'string'
            }
          }
        }
      })
    });
    if (!response.ok) throw new Error('Failed to get response from Gemini API');
    const data = await response.json();
    let cleanedText = await extractCleanedText(data.candidates[0].content.parts[0].text);

    let parsedData = [];
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (e) {
      console.error('Failed to parse JSON:', cleanedText, e);
      throw e;
    }
    return parsedData;
  } catch (error) {
    throw error;
  }
}

async function extractCleanedText(text) {
  let cleanedText = text.trim();
  if (cleanedText.startsWith('"') && cleanedText.endsWith('"')) {
    cleanedText = cleanedText.slice(1, -1);
    cleanedText = cleanedText.replace(/\\"/g, '"');
  }
  return cleanedText;
}



// --- KnowledgeAnalyseAndRephrase ---

async function knowledgeBasedContentRephrase(text, currentKnowledgeRelations, oldKnowledgeMemories) {
  if (!geminiApiKey) throw new Error('Gemini API key not set. Please set it in the extension settings.');

  if (!currentKnowledgeRelations || !oldKnowledgeMemories) {
    console.log('No knowledge relations provided, skipping rephrase');
    return text;
  }
  if (!Array.isArray(currentKnowledgeRelations) || !Array.isArray(oldKnowledgeMemories)) {
    console.log('Knowledge relations must be arrays');
    return text;
  }
  if (currentKnowledgeRelations.length === 0 && oldKnowledgeMemories.length === 0) {
    console.log('No knowledge relations provided, skipping rephrase');
    return text;
  }

  let currentKnowledgeRelationsReformatted = currentKnowledgeRelations.map(rel => {
    if (typeof rel === 'string') {
      return rel;
    } else if (typeof rel === 'object' && rel.relation) {
      return rel.relation;
    } else {
      throw new Error('Invalid current knowledge relation format');
    }
  }).join('\n');
  console.log('Current knowledge relations reformatted:', currentKnowledgeRelationsReformatted);

  let formattedOldKnowledgeMemories = [];
  for (const rel of oldKnowledgeMemories) {
    formattedOldKnowledgeMemories.push(rel.memory + ' \n ' + `ref: ${rel.metadata.article_url}`);
  }
  console.log('Formatted old knowledge memories:', formattedOldKnowledgeMemories);

  const prompt = `Given the knowledge relations of current text, historical knowledge relations (with refs), rephrase the provided text with info which is only new to this text and referencing historical links provided where duplicates.
  \nText Knowledge relations:\n${currentKnowledgeRelationsReformatted}.
  \nHistorical Knowledge relations:\n${formattedOldKnowledgeMemories.join('\n')}.
  \nText to rephrase:\n${text}\n\nRephrased text maintain original content's style. Also add links to historical knowledge relations where applicable and end of the output.
  \nRephrased text:`;

  console.log('Knowledge Analyse and Rephrase called with prompt:', prompt);
  const responseText = await callGeminiAPI(prompt, {});

  // TODO: maybe add refs links towards the end.
  // TODO: figure out formatting.

  return await extractCleanedText(responseText);
}


async function callGeminiAPI(prompt, additionalBody = {}) {
  if (!geminiApiKey) throw new Error('Gemini API key not set. Please set it in the extension settings.');
  const geminiModel = 'gemini-2.0-flash-lite';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        ...additionalBody
      })
    });
    if (!response.ok) throw new Error('Failed to get response from Gemini API');
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    throw error;
  }
}

async function knowledgeAnalyseAndRephrase(text) {
  if (!geminiApiKey) throw new Error('Gemini API key not set. Please set it in the extension settings.');
  const prompt = `Given the following text, extract the knowledge graphs relationships encapsulating the information. Return the relationships as: [{"relation": "EntityA > relationship > Entity2"}, ..].\n\nText:\n${text}`;
  const geminiModel = 'gemini-2.0-flash-lite';
  try {
    const responseText = await callGeminiAPI(prompt, {
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              relation: { type: 'string' }
            },
            required: ['relation']
          }
        }
      }
    });
    console.log('Response from Gemini:', responseText);
    let cleanedText = await extractCleanedText(responseText);
    let jsonParsedCleanedText = JSON.parse(cleanedText);
    let parsedData;
    const contentContextTags = await getContentContextTags(text);
    let finalMemoriesData = [];
    try {
      parsedData = await convertRelationsToMem0FormatMessages(jsonParsedCleanedText);
      console.log('Parsed data:', parsedData);

      // For each of the phrases, search if its related exists in memory
      let mem0SearchData = {};
      let memoryMissingPhrases = [];
      for (const phrase of parsedData) {
        responseMem0Search = await searchMem0Memories(mem0ApiKey, phrase.content, userId);
        console.log('responseMem0Search for ', phrase.content, ':', responseMem0Search);
        if (responseMem0Search.length === 0) {
          memoryMissingPhrases.push(phrase);
        } else {
          for (index = 0; index < responseMem0Search.length; index++) {
            const memory = responseMem0Search[index];
            if (!mem0SearchData[memory.id]) {
              mem0SearchData[memory.id] = memory;
            }
          }
        }
      }

      finalMemoriesData = Object.values(mem0SearchData);
      if (memoryMissingPhrases.length > 0) {
        console.log('Sending missing phrases to Mem0:', memoryMissingPhrases);
        try {
          const responseMem0 = await sendMem0Memory(mem0ApiKey, memoryMissingPhrases, userId, { contentContextTags });
        } catch (e) {
          console.error('Failed to send memory to Mem0:', e);
          throw e;
        }
      }
    } catch (e) {
      console.error('Failed to parse JSON:', cleanedText, e);
      throw e;
    }

    console.log('Final rephrase using knowledge:', jsonParsedCleanedText, finalMemoriesData);
    return await knowledgeBasedContentRephrase(text, jsonParsedCleanedText, finalMemoriesData);
  } catch (error) {
    throw error;
  }
}

// TODO: Replace this stub with your actual API call
async function rephraseWithCustomAPI(text) {
  // Example: return await fetch('https://your-api.com/rephrase', { ... })
  return `**[Custom API Response]**\n\n${text}`;
}

// Show a floating skeleton loader (does not hide DOM)
function showFloatingSkeletonLoader() {
  if (document.getElementById('read-smart-skeleton')) return;
  const skeleton = document.createElement('div');
  skeleton.id = 'read-smart-skeleton';
  skeleton.style.position = 'fixed';
  skeleton.style.top = '40px';
  skeleton.style.left = '50%';
  skeleton.style.transform = 'translateX(-50%)';
  skeleton.style.zIndex = '2147483647';
  skeleton.innerHTML = `
    <div class="skeleton-loader" style="max-width: 800px; padding: 32px; background: #f4ecd8; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08);">
      <div class="skeleton-title" style="height: 2.2rem; width: 60%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
      <div class="skeleton-paragraph" style="height: 1.2rem; width: 100%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
      <div class="skeleton-paragraph" style="height: 1.2rem; width: 100%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
      <div class="skeleton-paragraph" style="height: 1.2rem; width: 100%; background: #e0d6c3; border-radius: 6px; margin-bottom: 20px; animation: pulse 1.5s infinite;"></div>
    </div>
    <style>
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    </style>
  `;
  document.body.appendChild(skeleton);
}

function removeFloatingSkeletonLoader() {
  const skeleton = document.getElementById('read-smart-skeleton');
  if (skeleton) skeleton.remove();
}
