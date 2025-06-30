# <img src="plugin/assets/icons/icon128.png" alt="Read Smart" height="58" style="vertical-align: middle;">   read smart – Turn the web into your Personal AI Editor
[![CI](https://github.com/anunay999/read-smart/actions/workflows/ci.yml/badge.svg)](https://github.com/anunay999/read-smart/actions/workflows/ci.yml)

**read smart** is a Chrome extension that transforms every article into a personalised, clutter‑free learning session. It automatically rewrites each page to skip concepts you already understand, highlights what's genuinely new, and brings in just‑in‑time context from your reading history—so you finish pieces faster, retain more, and avoid information overload.

## 🏗️ What It Does

- **Personalised Rewrites** – Removes what you already know and emphasises what’s new.  
- **On‑Demand Context** – Surfaces background snippets from your prior reading at precisely the right moment.  
- **Distraction‑Free Reader** – Reformats pages into a clean, single‑scroll view without ads or pop‑ups.

> "It feels like having a private editor who knows everything I've already studied." — Early beta user

---

## ✨ Why You'll Love It

• **Personalised Summaries** – Articles are rephrased to skip what you already know and focus on what's new for *you*.

• **Knowledge Connections** – Inline call-outs show *why* a section matters based on your past reading.

• **Author's Voice Preserved** – We re-write, not butcher. The tone, humour, and flow stay intact.

• **Zero-Distraction Reader Mode** – Beautiful, single-scroll page with warm typography and no ads.

• **Privacy First** – All memories live on your own machine or in your own Mem0 account; nothing is ever sent to our servers.

• **Blazing-Fast Performance** – In-memory caching and smart duplicate detection skip redundant AI calls, so pages open and rephrase almost instantly.

---

## Demo

[![Read Smart Demo](https://img.youtube.com/vi/0EXEtuq2dZA/hqdefault.jpg)](https://youtu.be/0EXEtuq2dZA "Watch the full demo on YouTube")
---


## 🏁 Quick Start

1. Clone / download the repo and load the `plugin` folder as an *unpacked extension* in Chrome.
2. Follow the [Getting Started](./docs/GETTING_STARTED.md) guide to add your Gemini & Mem0 API keys.
3. Visit any article, open the extension, and flip **Smart Rephrase Mode**. That's it!

---

## 🔍 Under the Hood

| Layer | Tech | Role |
|-------|------|------|
| **Content Script** | JS + Readability.js | Extracts main article & injects overlay |
| **Memory Engine** | `memory-enhanced-reading.js` | Searches your personal memory vault & asks Gemini to rewrite |
| **Browser Cache** | In-memory L1 cache | Instant back/forward page loads & duplicate-detection speed-ups |
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


