// Prevent duplicate loading
if (typeof window !== 'undefined' && window.MemoryEnhancedReading) {
  // Already loaded, skip
} else {

/**
 * Memory-Enhanced Reading Library
 * A JavaScript library for Chrome extensions that personalizes web content
 * based on user's reading history and memories.
 */

class MemoryEnhancedReading {
    constructor(config = {}) {
        // Static / constant parts
        this.baseUrl = 'https://api.mem0.ai/v1';

        // 1. Apply internal sensible defaults
        this.applyConfig({
            maxMemories: 6,
            relevanceThreshold: 0.3,
            geminiModel: 'gemini-2.5-flash'
        });

        // 2. Overlay with values provided by ConfigManager (if any)
        //    Using a second call ensures that undefined / null values
        //    do NOT clobber the defaults set above.
        if (config && Object.keys(config).length > 0) {
            this.applyConfig(config);
        }
    }

    /**
     * Apply (or re-apply) configuration values. Can be called at runtime to
     * refresh API keys, model choice, thresholds, etc.
     */
    applyConfig(cfg = {}) {
        if (typeof cfg.mem0ApiKey !== 'undefined') this.mem0ApiKey = cfg.mem0ApiKey;
        if (typeof cfg.geminiApiKey !== 'undefined') this.geminiApiKey = cfg.geminiApiKey;
        if (typeof cfg.userId !== 'undefined') this.userId = cfg.userId;

        if (typeof cfg.geminiModel !== 'undefined') {
            this.geminiModel = cfg.geminiModel;
            this.geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`;
        }

        if (typeof cfg.maxMemories !== 'undefined') this.maxMemories = cfg.maxMemories;
        if (typeof cfg.relevanceThreshold !== 'undefined') this.relevanceThreshold = cfg.relevanceThreshold;
    }

    /**
     * Make API calls with error handling
     */
    async makeApiCall(url, options) {
        try {
            console.log(`Making API call to: ${url}`);
            console.log('Request options:', {
                method: options.method,
                headers: options.headers,
                body: options.body ? JSON.parse(options.body) : null
            });

            const response = await fetch(url, options);
            console.log(`Response status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.log('Error response body:', errorText);
                throw new Error(`API call failed: ${response.status} - ${errorText.substring(0, 200)}`);
            }

            const responseData = await response.json();
            console.log('Response data:', responseData);
            return responseData;
        } catch (error) {
            console.log('API call error:', error);
            throw error;
        }
    }

    /**
     * Generate content using Gemini API
     */
    async generateWithGemini(prompt) {
        console.log('Generating with Gemini');
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        console.log('Request body:', requestBody);

        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.geminiApiKey
            },
            body: JSON.stringify(requestBody)
        };

        const response = await this.makeApiCall(this.geminiUrl, options);
        return response.candidates[0].content.parts[0].text;
    }

    async generateWithGeminiFallback(userPrompt, text) {
        const systemPrompt = `
            You are ReadSmart Rephraser.

            TASK
            Rephrase the SOURCE text so it is:
            1. Clear, concise and engaging.
            2. Easy to scan (short paragraphs, active voice).
            3. Faithful to the original meaning and all key facts.

            GUIDELINES
            • Preserve headings, lists, links and code blocks where present.
            • Do NOT add commentary, personal opinions or new information.
            • Do NOT mention these instructions.

            OUTPUT FORMAT
            Return ONLY the rephrased text as valid Markdown (no code fences or extra text).
        `;

        const promptBase = userPrompt && userPrompt.trim().length > 0 ? userPrompt : systemPrompt;
     
        const prompt = `
            ${promptBase}

            SOURCE
            """
            ${text}
            """
        `;

        const fallbackPrompt = prompt;

        const response = await this.generateWithGemini(fallbackPrompt);
        return response;
    }

    /**
     * Extract key topics from content for memory search
     */
    async extractContentTopics(content) {
        const prompt = `
            You are "ReadSmart Topic Extractor", an AI that distills any document into concise, search-friendly topics.

            INSTRUCTIONS
            1. Read the SOURCE below.
            2. Output 3–5 *distinct* topics as a raw JSON array (no markdown fence, no commentary).

            TOPIC RULES
            • 1–4 words, Title Case nouns/noun phrases only.  
            • No verbs, sentences, or punctuation other than hyphens.  
            • Prefer specific over generic (“Interval Training” > “Exercise”).  
            • No duplicates or near-duplicates.

            WHAT TO LOOK FOR
            1. Core subject areas – e.g., "Quantum Computing", "Sustainable Agriculture".  
            2. Named frameworks, models, or architectures – e.g., "Transformer Models", "Design Thinking".  
            3. Skills, techniques, or procedures – e.g., "Cold Emailing", "Mindful Breathing".  
            4. Laws, regulations, or standards – e.g., "GDPR Compliance", "ISO 27001".  
            5. Domain-specific entities:  
               • Health – "Type 2 Diabetes", "mRNA Vaccines"  
               • Finance – "Index Funds", "Compound Interest"  
               • Tech – "React Hooks", "HTTP/3"  
               • Science – "Gravitational Waves", "p-Value"  
               • Culture – "Afrofuturism", "Slow Fashion".

            MULTI-DOMAIN FORMAT EXAMPLES
            Tech    → ["Edge Computing", "Serverless Functions", "Latency Optimization"]  
            Health  → ["Intermittent Fasting", "Ketogenic Diet", "Insulin Sensitivity"]  
            Finance → ["Value Investing", "Market Volatility", "Dollar-Cost Averaging"]  
            Education → ["Project-Based Learning", "Growth Mindset", "Flipped Classroom"]  
            History   → ["Industrial Revolution", "Cold War", "Silk Road"]  
            Sports    → ["Triangle Offense", "High-Intensity Interval Training", "Zone Defense"]  
            Environment → ["Carbon Footprint", "Circular Economy", "Renewable Energy"]  
            Politics   → ["Electoral College", "Populist Movements", "Campaign Finance"]  
            Art & Culture → ["Impressionist Painting", "Street Photography", "Contemporary Sculpture"]  
            Literature → ["Magical Realism", "Stream of Consciousness", "Bildungsroman"]  
            Mathematics → ["Graph Theory", "Linear Regression", "Fourier Transform"]  
            Psychology  → ["Cognitive Dissonance", "Positive Reinforcement", "Flow State"]

            SOURCE
            ${content}
            
            Return only the JSON array, no additional text not even a code block specifying json.
            Example response:
            
            [
            "<list-item-1>",
            "<list-item-2>",
            "<list-item-3>",
            "<list-item-4>",
            "<list-item-5>"
            ]
            `;

        try {
            const response = await this.generateWithGemini(prompt);
            const topics = JSON.parse(response.trim());
            return topics;
        } catch (error) {
            return [];
        }
    }

    /**
     * Search memories using Mem0 API
     */
    async searchMemories(query, limit = 50) {
        const url = `${this.baseUrl}/memories/search/`;
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Token ${this.mem0ApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                user_id: this.userId,
                limit: limit
            })
        };

        const response = await this.makeApiCall(url, options);
        return response || [];
    }

    /**
     * Get all memories for a user
     */
    async getAllMemories() {
        const url = `${this.baseUrl}/memories/?user_id=${this.userId}`;
        const options = {
            method: 'GET',
            headers: {
                'Authorization': `Token ${this.mem0ApiKey}`,
                'Content-Type': 'application/json'
            }
        };

        const response = await this.makeApiCall(url, options);
        return response || [];
    }

    /**
     * Add memory using Mem0 API
     */
    async addMemory(content, metadata = {}) {
        const url = `${this.baseUrl}/memories/`;

        // Format the request body to match the working curl example
        const requestBody = {
            messages: [
                { role: 'user', content: content }
            ],
            user_id: this.userId
        };

        if (Object.keys(metadata).length > 0) {
            requestBody.metadata = metadata;
        }

        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Token ${this.mem0ApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        };

        console.log('Adding memory with body:', requestBody);
        return await this.makeApiCall(url, options);
    }

    /**
     * Search for memories relevant to the current page content
     *
     * TODO: support per-call overrides for `maxMemories` and
     * `relevanceThreshold` once requirements are defined.
     */
    async searchRelevantMemories(content) {
        try {
            // Extract key topics from the content
            const topics = await this.extractContentTopics(content);

            if (topics.length === 0) {
                console.log('No topics extracted, returning empty results');
                return [];
            }

            const allRelevantMemories = [];
            const seenMemoryIds = new Set();

            console.log('Searching for memories with relevance threshold:', this.relevanceThreshold);

            // Search for memories related to each topic
            for (const topic of topics) {
                try {
                    const memories = await this.searchMemories(topic);

                    // Add unique memories with sufficient relevance
                    for (const mem of memories) {
                        if (!seenMemoryIds.has(mem.id) && (mem.score > this.relevanceThreshold)) {
                            allRelevantMemories.push(mem);
                            seenMemoryIds.add(mem.id);
                        }
                    }
                } catch (error) {
                    console.log(`Error searching for topic '${topic}':`, error);
                    continue;
                }
            }

            console.log('Max memories:', this.maxMemories);

            // Sort by relevance score and limit results
            console.log('All relevant memories:', allRelevantMemories);
            allRelevantMemories.sort((a, b) => b.score - a.score);
            const relevantMemories = allRelevantMemories.slice(0, this.maxMemories);

            console.log(`Found ${relevantMemories.length} relevant memories from ${allRelevantMemories.length} total matches`);
            return relevantMemories;

        } catch (error) {
            return [];
        }
    }

    /**
     * Generate memory snippets from page content
     */
    async generateMemorySnippets(content) {
        const prompt = `
            You are "ReadSmart Memory Extractor", an AI that converts a web page into future-useful personal memories.

            INSTRUCTIONS
            1. Read the SOURCE below.
            2. Produce exactly 3-5 memory snippets as a *raw JSON array* (no markdown fence, no prose).
               • Each ≤ 25 words, 1-2 sentences.
               • Each must capture a *distinct* idea (no overlap).
               • Be specific, avoid generic phrasing.
               • Use third-person framing when helpful (e.g., "The reader learned that …").

            WHAT TO CAPTURE
            • Core insight, fact, or argument.
            • Methods, frameworks, or step-by-step processes.
            • Memorable statistics, definitions, or examples.
            • Stated user preferences or intentions (if present).

            FORMAT
            Return ONLY the JSON array, e.g.: ["Snippet 1","Snippet 2","Snippet 3"].

            EXAMPLE OUTPUT FOR A TECH ARTICLE
            [
              "The reader learned that Rust guarantees memory safety without garbage collection.",
              "Async/await in JavaScript simplifies promise-based concurrency.",
              "WebAssembly enables near-native speed for browser applications."
            ]

            EXAMPLE OUTPUT FOR A HEALTH ARTICLE
            [
              "High-intensity interval training improves cardiovascular fitness with short workouts.",
              "Mediterranean diet emphasizes whole grains, olive oil, and lean proteins.",
              "Mindfulness practice can reduce stress-related cortisol levels."
            ]

            EXAMPLE OUTPUT FOR A FINANCE ARTICLE
            [
              "Dollar-cost averaging reduces the impact of market volatility on investments.",
              "Index funds often outperform actively managed funds over long periods.",
              "Compound interest accelerates growth when earnings are reinvested."
            ]

            SOURCE
            ${content}
            
            Return only the JSON array, no additional text not even a code block specifying json.
            Example response:
            [
            "<list-item-1>",
            "<list-item-2>",
            "<list-item-3>",
            "<list-item-4>",
            "<list-item-5>"
            ]
            `;
        try {
            const response = await this.generateWithGemini(prompt);
            console.log('Response gemini memory snippets:', response);
            const snippets = JSON.parse(response.trim());
            console.log(`Generated ${snippets.length} memory snippets:`, snippets);
            return snippets;
        } catch (error) {
            console.log('Error generating memory snippets:', error);
            return [];
        }
    }

    /**
     * Rephrase content based on existing user memories, matching author's writing style
     */
    async rephraseContentWithMemory(content, existingMemories) {
        console.log('Rephrasing content with memory');
        const memoryText = existingMemories
            .map(mem => {
                const urlPart = mem.metadata && mem.metadata.url ? ` (source: ${mem.metadata.url})` : '';
                return `• ${mem.memory}${urlPart}`;
            })
            .join('\n');

        const prompt = `
        You are an elite content-personaliser.

        GOAL  
        Rewrite the article in the author's voice, only covering NEW information for the reader, and tightly link back to their stored memories.

        HARD RULES  ❗
        1. Output **exactly** two top-level headings, in this order (no pre-amble, no epilogue):  
        ## SECTION 1 – Recap & References  
        ## SECTION 2 – Fresh Content in Author's Voice  
        2. Stop writing immediately after SECTION 2.  
        3. Max **900 words** total; max **3 sentences** per paragraph.  
        4. Insert a sub-heading or bullet block at least every **120 words** within SECTION 2.  
        5. In SECTION 1:  
        • **Context Bridge** – 1-2 sentences.  
        • **What You Already Know** – 3-7 bullets, ≤ 8 words each.  
        • **References** – bullet list of \`[Title](URL)\` links.  
        6. No other headings, no metadata ("8 min read"), no HTML; output must be valid Markdown.  
        7. If any rule is broken, RESTART and fix before finalising.

        STYLE HINTS  
        • Match the author's vocabulary and cadence (semi-formal tech-blog).  
        • Bold key take-aways, italicise pivotal terms, use \`> block-quotes\` sparingly.  
        • Replace filler like "Let's be real" unless in the original.

        INPUTS  
        READER_MEMORIES  
        ${memoryText}

        ORIGINAL_ARTICLE  
        ${content}

        REMEMBER  
        – Do NOT repeat memory passages verbatim.  
        – The reader scans in a small popup; keep visuals punchy.  
        – Comply with all HARD RULES.    
        You will be eliminated if you do not follow these rules.

        FILTERING MEMORY  
        • Ignore any memory that is not obviously related to the article's subject – better to omit than force relevance.  
        • Paraphrase memory ideas; never quote them verbatim.
        `;
        
        try {
    
            const rephrasedContent = await this.generateWithGemini(prompt);
            return rephrasedContent;
        } catch (error) {
            console.log('Error rephrasing content:', error);
            return content; // Return original content if rephrasing fails
        }
    }

    /**
     * Add page content to memory (generate snippets and store them)
     */
    async addPageToMemory(content, pageUrl = '') {
        try {
            // Generate memory snippets
            const snippets = await this.generateMemorySnippets(content);

            if (snippets.length === 0) {
                return {
                    success: false,
                    processed: false,
                    snippetsCount: 0,
                    error: 'No memory snippets could be generated from content'
                };
            }

            // Add snippets to memory
            const addPromises = snippets.map(snippet => this.addMemory(snippet, { url: pageUrl }));
            await Promise.all(addPromises);

            console.log('Snippets added to memory:', snippets);

            return {
                success: true,
                processed: true,
                snippetsCount: snippets.length,
                snippets: snippets
            };

        } catch (error) {
            return {
                success: false,
                processed: false,
                snippetsCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Rephrase content based on user's existing memories
     */
    async rephraseWithUserMemories(content) {
        try {
            // Search for relevant existing memories
            const relevantMemories = await this.searchRelevantMemories(content);

            if (relevantMemories.length === 0) {
                return {
                    success: false,
                    processed: false,
                    rephrasedContent: content,
                    originalContent: content,
                    relevantMemoriesCount: 0,
                    message: 'No relevant memories found to personalize content'
                };
            }

            // Rephrase content based on memories
            const rephrasedContent = await this.rephraseContentWithMemory(content, relevantMemories);

            return {
                success: true,
                processed: true,
                rephrasedContent: rephrasedContent,
                originalContent: content,
                relevantMemoriesCount: relevantMemories.length,
                relevantMemories: relevantMemories
            };

        } catch (error) {
            return {
                success: false,
                processed: false,
                rephrasedContent: content,
                originalContent: content,
                relevantMemoriesCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Get memory statistics for the user
     */
    async getMemoryStats() {
        try {
            const memories = await this.getAllMemories();
            return {
                totalMemories: memories.length,
                recentMemories: memories.slice(0, 5),
                oldestMemory: memories[memories.length - 1],
                newestMemory: memories[0]
            };
        } catch (error) {
            return {
                totalMemories: 0,
                recentMemories: [],
                oldestMemory: null,
                newestMemory: null,
                error: error.message
            };
        }
    }

    /**
     * Delete all memories for the user (use with caution)
     */
    async clearAllMemories() {
        const url = `${this.baseUrl}/memories/`;
        const options = {
            method: 'DELETE',
            headers: {
                'Authorization': `Token ${this.mem0ApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: this.userId
            })
        };

        try {
            await this.makeApiCall(url, options);
            console.log('All memories cleared successfully');
            return { success: true };
        } catch (error) {
            console.log('Error clearing memories:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export for use in Chrome extension
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MemoryEnhancedReading;
} else if (typeof window !== 'undefined') {
    window.MemoryEnhancedReading = MemoryEnhancedReading;
}

} // End of duplicate loading guard 