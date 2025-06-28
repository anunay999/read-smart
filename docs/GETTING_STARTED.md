# 🚀 Getting Started with Read Smart

Welcome to **Read Smart**! This guide walks you from zero to personalised reading bliss in just a few minutes.

---

## 1. What Is Read Smart?

Read Smart is a browser extension that:

1. Extracts the main text of any article.
2. Looks at what you've already read (your private "memory").
3. Asks Google's Gemini model to rewrite the article so it focuses on *new* information for you.
4. Displays the personalised version in a beautiful reader view.

Everything happens on your machine or with services you directly control. No hidden servers, no surprise data sales.

---

## 2. Prerequisites

| Service | Why We Need It | How It's Used |
|---------|---------------|---------------|
| **Gemini API Key** | Large-language-model that performs the rewriting. | We send a prompt + article text and receive the rephrased Markdown. |
| **Mem0 API Key** | Secure, personal memory vault. | Stores short memory snippets (3-4 lines each) and lets the extension search them for relevance. |

Both keys are *optional*—but without them you'll miss out on the personalised magic. Reader Mode will still work.

---

## 3. Installing the Extension

1. **Clone the repo**
   ```bash
   git clone https://github.com/anunay999/read-smart.git
   cd read-smart/plugin
   ```
2. **Load as unpacked extension**
   1. Navigate to `chrome://extensions` in Chrome.
   2. Enable *Developer mode* (top-right toggle).
   3. Click *Load unpacked* → Select the `plugin` folder.
3. The Read Smart icon should now appear in the toolbar.

---

## 4. Obtaining Your API Keys

### 4.1 Gemini

1. Head to [Google AI Studio](https://makersuite.google.com/app/apikey).
2. Sign in with a Google account and click *Create API key*.
3. Copy the key—keep it secret!

### 4.2 Mem0

1. Sign up at [mem0.ai](https://mem0.ai) (free tier available).
2. In *Settings → API*, click *Generate Key*.
3. Copy the key.

---

## 5. Adding Keys to Read Smart

1. Click the Read Smart icon to open the popup.
2. Press the *Settings* button.
3. Paste your Gemini key and Mem0 key into their respective fields.
4. Save. Keys are stored with `chrome.storage.sync`, encrypted by Chrome and synced only to *your* logged-in browser profile.

---

## 6. Using Read Smart

1. Open any long-form article.
2. Toggle **Smart Rephrase Mode** in the popup.
3. Wait a couple of seconds while Read Smart personalises the content.
4. Enjoy a streamlined, knowledge-aware reading experience!

You can switch back to **Reader Mode** for a clean, ad-free view without personalisation.

---

## 7. Privacy & Security

• **Local-first** – The extension has *no* backend. Text extraction, caching, and rendering all happen in your browser.

• **You control external calls** – The only outbound requests are:
  - To Gemini: your article text + prompt → rephrased article.
  - To Mem0: memory snippets you *explicitly* choose to store.

• **Delete at any time** – Clear the extension's storage via *Chrome → Settings → Privacy → Clear browsing data → Hosted app data*.


---

## 8. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "Gemini API key not set" error | Key missing or wrong | Double-check in Settings; make sure it has *generation* permission. |
| Article says "Could not extract content" | Highly dynamic or pay-walled site | Use the *Reader Mode* first, or copy-paste text into a new tab. |
| Personalisation feels off | Few or no memories stored | Click *Add to Memory* on background articles you already understand. |

---

Happy reading! ✨ 
