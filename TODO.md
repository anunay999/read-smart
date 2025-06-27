# Future Tasks

- [ ] Allow configurable max memories and relevance threshold when searching user memories.

## Real-time progress & memory status

- [ ] Define message schema for progress updates (`extract_topics`, `search_memories`, `rephrase`)
- [ ] Emit progress messages from `content.js`
- [ ] Build vertical stepper UI in `panel.js`
- [ ] Stream memory snippets to the panel as they are generated

## Advanced configuration UI

- [ ] Expose system prompt, `relevanceThreshold`, `maxMemories`, Gemini model, debug toggle
- [ ] Persist config in `chrome.storage.sync`
- [ ] Broadcast `configUpdated` messages to all tabs and apply dynamically
