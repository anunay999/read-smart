# Read Smart Chrome Extension

A Chrome extension that enables a distraction-free reader mode and can rephrase web content using Gemini Pro or your own custom API.

---

## 🚀 Setup Instructions

1. **Clone or Download the Repository**

2. **Install Dependencies**
   - No build step is required. All dependencies (like `marked.js` and `Readability.js`) are included in the `lib/` folder.

3. **Add Your Gemini API Key**
   - Open the extension popup after loading it in Chrome (see below).
   - Paste your Gemini API key in the input box and click "Save API Key".
   - [Get a Gemini API key here](https://ai.google.dev/)

4. **Load the Extension in Chrome**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `plugin/` directory

5. **Usage**
   - Click the extension icon.
   - Toggle "Read Mode" to enable distraction-free reading.
   - Toggle "Smart Rephrase" to rephrase the content using Gemini Pro.
   - You can switch between original and rephrased content instantly.

---

## 🛠️ Custom API Integration (TODO)

You can add your own custom rephrase API by editing the stub in `content.js`:

```
// content.js
async function rephraseWithCustomAPI(text) {
  // TODO: Replace this stub with your actual API call
  // Example: return await fetch('https://your-api.com/rephrase', { ... })
  return `**[Custom API Response]**\n\n${text}`;
}
```

- To use your API, replace the function body with your fetch logic.
- You can add a toggle in the popup and pass a flag to use your API instead of Gemini (see comments in `content.js`).

---

## 📝 Features
- Reader mode for distraction-free reading
- Rephrase content using Gemini Pro (with your API key)
- Toggle between original and rephrased content instantly
- Skeleton loader for a smooth experience
- Modular, readable codebase

---

## 🧩 Tech Stack
- JavaScript (ES6)
- Chrome Extensions API (Manifest v3)
- [Readability.js](https://github.com/mozilla/readability)
- [marked.js](https://github.com/markedjs/marked)
- [Tailwind CSS](https://tailwindcss.com/) (for UI styling)

---

## 📌 TODO
- [ ]  Implement your custom API in `rephraseWithCustomAPI` in `content.js`
---
