# 🧠 Read Smart – Turn the Web into Your Personal Editor

**Read Smart** is a Chrome extension that instantly rewrites any long-form article in light of *your* existing knowledge. It remembers what you have read, surfaces the right background when you need it, and lets you learn twice as fast without information overload.

> "It feels like having a private editor who knows everything I've already studied." — Early beta user

---

## ✨ Why You'll Love It

• **Personalised Summaries** – Articles are rephrased to skip what you already know and focus on what's new for *you*.

• **Knowledge Connections** – Inline call-outs show *why* a section matters based on your past reading.

• **Author's Voice Preserved** – We re-write, not butcher. The tone, humour, and flow stay intact.

• **Zero-Distraction Reader Mode** – Beautiful, single-scroll page with warm typography and no ads.

• **Privacy First** – All memories live on your own machine or in your own Mem0 account; nothing is ever sent to our servers.

---

## 🏁 Quick Start

1. Clone / download the repo and load the `plugin` folder as an *unpacked extension* in Chrome.
2. Follow the [Getting Started](./GETTING_STARTED.md) guide to add your Gemini & Mem0 API keys.
3. Visit any article, open the extension, and flip **Smart Rephrase Mode**. That's it!

---

## 🔍 Under the Hood

| Layer | Tech | Role |
|-------|------|------|
| **Content Script** | JS + Readability.js | Extracts main article & injects overlay |
| **Memory Engine** | `memory-enhanced-reading.js` | Searches your personal memory vault & asks Gemini to rewrite |
| **Browser Cache** | In-memory L1 cache | Instant back/forward page loads |
| **Mem0** | Your own account | Long-term, encrypted memory storage |

---

## 🛡️ Your Data, Your Rules

• **No Cloud Backend** – The extension ships without a server. All processing happens locally or directly with Gemini/Mem0 via keys *you* own.

• **Selective Storage** – Only the minimal text needed to create memories is stored. Full articles are never uploaded.

• **Easy Opt-Out** – Pause memory capture at any time; wipe the local cache with one click.

Read the full [Privacy FAQ](./GETTING_STARTED.md#privacy--security).

---

## 🤝 Contributing

Pull requests are welcome! Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) (coming soon) for setup and coding conventions.

---

**Read Smart – Make every article count.**


