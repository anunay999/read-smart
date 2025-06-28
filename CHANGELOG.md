# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]
- _Nothing yet._

---

## [0.3.0] - 2025-06-27
### Added
- **Advanced Configuration UI** in the popup – users can now tweak the system prompt, relevance threshold, max memories, and Gemini model on-the-fly (`popup.html`, `popup.js`, `popup.css`).
- **Progress Indicator Stepper** that visualises `Preparing → Uploading → Done` when adding pages to memory.
- **L1PageCache** (in-memory, 5-slot LRU) to serve instant back/forward loads without querying Gemini (`cache.js`).
- **`GEMINI.md`** – a comprehensive technical design & limitations document for `gemini-cli`.
- **Demo video** section embedded in the root `README.md`.
- **CI pipeline** (GitHub Actions) with build-status badge.
- Added `node_modules` to `.gitignore` to keep the repo lean.

### Changed
- Massive refactor of `content.js` for readability and modularity; split out HTML/CSS where possible.
- Enhanced popup UI with new styles and collapsible sections; externalised CSS.
- Improved skeleton loader timing and smooth cross-fade transition.
- Updated documentation (`README.md`, `GETTING_STARTED.md`, `TODO.md`) to reflect new features.

### Fixed
- `toggleReaderMode` message handler now works reliably across tabs.
- Fixed script injection order to guarantee `memory-enhanced-reading.js` loads before execution.
- Addressed multiple issues with overlay sizing and lazy-loaded images.

### Removed
- Stripped editor/IDE metadata directories (`.vscode`, `.cursor`) from the repo.

---

## [0.2.0] - 2025-06-26
### Added
- **Smart Rephrase Page Cache** prototype and documentation (`anunay/cache-smart-rephrase` branch).
- **Streaming response groundwork** merged (PR #14/#15) – foundation for upcoming SSE support.
- Refined **skeleton overlay** for a smoother UX.

### Changed
- Restructured project folders (`html/`, `css/`, `js/`) for clearer separation of concerns.
- **Content extraction** logic overhauled; better selector fall-back and length capping.

### Fixed
- Multiple UX glitches in the reader overlay (scroll jitter, image placeholders).
- Memory library injection race condition (#10).

---

## [0.1.0] - 2025-06-25
Initial public release.

- Distraction-free Reader Mode powered by `Readability.js`.
- Smart Rephrase integration with Gemini 2.5 Flash (requires API key).
- Ability to add current page to Mem0 memory vault.
- Basic popup UI for toggling features and saving API keys. 