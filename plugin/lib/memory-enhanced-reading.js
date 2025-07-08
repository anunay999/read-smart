// Prevent duplicate loading
if (typeof window !== 'undefined' && window.MemoryEnhancedReading) {
  // Already loaded, skip
} else {

/**
 * Memory-Enhanced Reading Library
 * A JavaScript library for Chrome extensions that personalizes web content
 * based on user's reading history and memories.
 */

// =============================================================================
// PROMPT TEMPLATES
// =============================================================================

const PROMPTS = {
  TOPIC_EXTRACTOR: (content) => `
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
    
    OUTPUT FORMAT
    • Return only the JSON array, no additional text not even a code block specifying json.
    • Format strings with approriate delimiters.

    Example response:
    
    [
    "<list-item-1>",
    "<list-item-2>",
    "<list-item-3>",
    "<list-item-4>",
    "<list-item-5>"
    ]
  `,

  RELEVANCE_VALIDATOR: (articleTopics, memories) => `
    You are "ReadSmart Relevance Validator", an AI that determines if memories are truly relevant to an article's core topics.

    TASK
    Analyze the ARTICLE_TOPICS and MEMORIES below. Return a JSON object indicating whether the memories are sufficiently relevant to generate personalized content.

    RELEVANCE CRITERIA
    • Memory must directly relate to at least one article topic
    • Memory must provide meaningful context or background knowledge
    • Memory must be more than just tangentially related
    • General knowledge or broad concepts don't count as relevant

    VALIDATION RULES
    • Need at least 2 highly relevant memories for valid result
    • Each memory gets relevance score: 0 (not relevant), 1 (somewhat relevant), 2 (highly relevant)
    • Overall validation passes only if total score ≥ 4 and at least 2 memories score ≥ 1

    ARTICLE_TOPICS
    ${JSON.stringify(articleTopics)}

    MEMORIES
    ${memories.map((mem, idx) => `${idx + 1}. ${mem.memory}`).join('\n')}

    OUTPUT FORMAT
    • Return only the JSON object nothing else, no additional text not even a code block specifying json.
    • Format strings with approriate delimiters.

    EXAMPLE OUTPUT FORMAT:
    {
        "isValid": boolean,
        "reason": "string explaining validation result",
        "memoryScores": [array of scores 0-2 for each memory],
        "totalScore": number,
        "validMemoryCount": number
    }
  `,

  MEMORY_EXTRACTOR: (content) => `
    You are "ReadSmart Memory Extractor", an AI that converts a web page into future-useful personal memories.

    INSTRUCTIONS
    1. Read the SOURCE below.
    2. Produce exactly 3-5 memory snippets as a *raw JSON array* (no markdown fence, no prose).
       • Each ≤ 25 words, 1-2 sentences.
       • Each must capture a *distinct* idea (no overlap).
       • Be specific, avoid generic phrasing.
       • Use third-person framing when helpful (e.g., "The reader learned that …").
       • Format as a JSON array of strings with approriate delimiters.

    WHAT TO CAPTURE
    • Core insight, fact, or argument.
    • Methods, frameworks, or step-by-step processes.
    • Memorable statistics, definitions, or examples.
    • Stated user preferences or intentions (if present).

    FORMAT
    • Format strictly as a JSON array with approriate delimiters.
    • Return ONLY the JSON array, e.g.: ["Snippet 1","Snippet 2","Snippet 3"].

    Example response:
    
    [
    "<list-item-1>",
    "<list-item-2>",
    "<list-item-3>",
    "<list-item-4>",
    "<list-item-5>"
    ]

    SOURCE
    ${content}
    
    Return only the JSON array, no additional text.
  `,

  CONTENT_PERSONALIZER: (memoryText, content) => `
    You are an elite content-personaliser.
    
    CRITICAL VALIDATION CHECKPOINT ❗
    Before proceeding with content generation, you MUST verify that the provided memories are genuinely relevant to this article's core topics. If fewer than 2 memories are directly relevant, or if the memories only provide tangential connections, you MUST respond with exactly: "INSUFFICIENT_RELEVANT_MEMORIES" and stop immediately.
    
    GOAL  
    Rewrite the article in the author's voice, only covering **NEW information for the reader**, and tightly linking back to their stored memories.
    
    🚫 ZERO HALLUCINATIONS RULE ❗  
    You may not introduce, infer, or fabricate **any** information that does not appear **explicitly** in the original article. All insights, conclusions, and facts must be grounded in the provided article content. If it's not in the article, do not mention it — even if it seems logical or helpful.
    
    MEMORY SCOPE LIMIT  
    In "What You Already Know", only include bullets that are *clearly relevant* to the main topic of the current article. General knowledge, off-topic AI ideas, or tangential memories must be excluded. Err on the side of omission.
    
    HARD RULES  ❗  
    1. Output **exactly** two top-level headings, in this order (no pre-amble, no epilogue):  
    ## SECTION 1 – Recap & References  
    ## SECTION 2 – Fresh Content in Author's Voice  
    
    2. Stop writing immediately after SECTION 2.  
    
    3. Adjust total length to fit the article:  
       • For long articles, summarise to a concise version (max **1500 words**).  
       • For short articles, do NOT expand unnecessarily—keep it close to the original length.  
       • Always preserve key details and nuance; avoid excessive shortening or lengthening.  
       • Max **4 sentences** per paragraph.  
    
    4. Insert a sub-heading or bullet block at least every **120 words** within SECTION 2.  
    
    5. In SECTION 1:  
    • **Context Bridge** – 1–2 sentences.  
    • **What You Already Know** – 3–5 bullets, ⚠️ CRITICAL: Only include snippets that are **DIRECTLY RELEVANT** to the article's core topic. No tangents. When in doubt, leave it out.
    • **References** – bullet list of \`[Title](URL)\` links. ⚠️ CRITICAL: Only include references that are **DIRECTLY RELEVANT** to the article's core topic. No tangents. When in doubt, leave it out.
    
    6. **Do NOT** include any other headings, metadata, HTML, or markdown not specified above. Output must be clean, valid Markdown only.  
    
    7. **RESTART AND FIX** if any rule is broken. No partial compliance.  
    
    8. **REFERENCE & MEMORY RELEVANCE CHECK**:  
    • References must **directly support or relate** to the main subject of the article.  
    • Memories must be **topically aligned** with the article — no general knowledge or unrelated concepts.  
    • If the match is even slightly unclear, exclude it.
    
    STYLE HINTS  
    • Match the author's vocabulary and cadence (semi-formal tech-blog).  
    • Bold key takeaways, *italicise pivotal terms*, use \`> block quotes\` sparingly.  
    • Avoid filler or over-explaining; respect the reader's time and intelligence.
    
    INPUTS  
    READER_MEMORIES  
    ${memoryText}
    
    ORIGINAL_ARTICLE  
    ${content}
    
    REMEMBER  
    – You may NOT repeat memory passages verbatim.  
    – Never invent or imply content beyond the article.  
    – The reader scans in a small popup; visuals must be concise and punchy.  
    – Obey all HARD RULES with zero tolerance for error.
  `
};

class MemoryEnhancedReading {
    constructor(config = {}) {
        // Static / constant parts
        this.baseUrl = 'https://api.mem0.ai/v1';

        // 1. Apply internal sensible defaults
        this.applyConfig({
            maxMemories: 6,
            relevanceThreshold: 0.3,
            geminiModel: 'gemini-2.5-flash',
            debug: false
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
        if (typeof cfg.debug !== 'undefined') this.debug = cfg.debug;
    }

    /**
     * Debug logging helper
     */
    debugLog(message, data = null) {
        if (this.debug || true) {
            if (data) {
                console.log(message, data);
            } else {
                console.log(message);
            }
        }
    }

    /**
     * Make API calls with error handling
     */
    async makeApiCall(url, options) {
        try {
            this.debugLog(`Making API call to: ${url}`);
            this.debugLog('Request options:', {
                method: options.method,
                headers: options.headers,
                body: options.body ? JSON.parse(options.body) : null
            });

            const response = await fetch(url, options);
            this.debugLog(`Response status: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                this.debugLog('Error response body:', errorText);
                throw new Error(`API call failed: ${response.status} - ${errorText.substring(0, 200)}`);
            }

            const responseData = await response.json();
            this.debugLog('Response data:', responseData);
            return responseData;
        } catch (error) {
            console.error('API call error:', error);
            throw error;
        }
    }

    /**
     * Generate content using Gemini API
     */
    async generateWithGemini(prompt) {
        this.debugLog('Generating with Gemini');
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

        this.debugLog('Request body:', requestBody);

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


    /**
     * Extract key topics from content for memory search
     */
    async extractContentTopics(content) {
        
        const prompt = PROMPTS.TOPIC_EXTRACTOR(content);
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

        this.debugLog('Adding memory with body:', requestBody);
        return await this.makeApiCall(url, options);
    }

    /**
     * Validate semantic relevance between article topics and memories
     */
    async validateMemoryRelevance(articleTopics, memories) {
        if (!memories || memories.length === 0) {
            return { 
                isValid: false, 
                reason: 'No memories to validate',
                validMemories: [],
                validationScore: 0
            };
        }

        const relevancePrompt = PROMPTS.RELEVANCE_VALIDATOR(articleTopics, memories);

        try {
            const response = await this.generateWithGemini(relevancePrompt);
            const validation = JSON.parse(response.trim());
            
            // Filter memories based on validation scores
            const validMemories = memories.filter((_, idx) => 
                validation.memoryScores && validation.memoryScores[idx] >= 1
            );

            return {
                isValid: validation.isValid,
                reason: validation.reason,
                validMemories: validMemories,
                validationScore: validation.totalScore || 0,
                originalMemoriesCount: memories.length,
                validMemoriesCount: validMemories.length
            };
        } catch (error) {
            this.debugLog('Error validating memory relevance:', error);
            return { 
                isValid: false, 
                reason: 'Failed to validate memory relevance',
                validMemories: [],
                validationScore: 0
            };
        }
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
                this.debugLog('No topics extracted, returning empty results');
                return [];
            }

            const allRelevantMemories = [];
            const seenMemoryIds = new Set();

            this.debugLog('Searching for memories with relevance threshold:', this.relevanceThreshold);

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
                    this.debugLog(`Error searching for topic '${topic}':`, error);
                    continue;
                }
            }

            this.debugLog('Max memories:', this.maxMemories);

            // Sort by relevance score and limit results
            this.debugLog('All relevant memories:', allRelevantMemories);
            allRelevantMemories.sort((a, b) => b.score - a.score);
            const topMemories = allRelevantMemories.slice(0, this.maxMemories);

            // Validate semantic relevance of the top memories
            const validation = await this.validateMemoryRelevance(topics, topMemories);
            
            this.debugLog('Memory relevance validation:', validation);
            
            if (!validation.isValid) {
                this.debugLog(`Memory validation failed: ${validation.reason}`);
                return [];
            }

            this.debugLog(`Found ${validation.validMemoriesCount} valid memories from ${allRelevantMemories.length} total matches`);
            return validation.validMemories;

        } catch (error) {
            return [];
        }
    }

    /**
     * Generate memory snippets from page content
     */
    async generateMemorySnippets(content) {
        const prompt = PROMPTS.MEMORY_EXTRACTOR(content);
        try {
            const response = await this.generateWithGemini(prompt);
            this.debugLog('Response gemini memory snippets:', response);
            const snippets = JSON.parse(response.trim());
            this.debugLog(`Generated ${snippets.length} memory snippets:`, snippets);
            return snippets;
        } catch (error) {
            this.debugLog('Error generating memory snippets:', error);
            return [];
        }
    }

    /**
     * Rephrase content based on existing user memories, matching author's writing style
     */
    async rephraseContentWithMemory(content, existingMemories) {
        this.debugLog('Rephrasing content with memory');
        const memoryText = existingMemories
            .map(mem => {
                const urlPart = mem.metadata && mem.metadata.url ? ` (source: ${mem.metadata.url})` : '';
                return `• ${mem.memory}${urlPart}`;
            })
            .join('\n');

        const prompt = PROMPTS.CONTENT_PERSONALIZER(memoryText, content);
        
        try {
            const rephrasedContent = await this.generateWithGemini(prompt);
            
            // Check if AI determined memories are insufficient
            if (rephrasedContent.trim() === 'INSUFFICIENT_RELEVANT_MEMORIES') {
                throw new Error('Memories are not sufficiently relevant to the article content');
            }
            
            return rephrasedContent;
        } catch (error) {
            this.debugLog('Error rephrasing content:', error);
            throw error; // Re-throw to let caller handle the error
        }
    }

    /**
     * Add page content to memory (generate snippets and store them)
     */
    async addPageToMemory(content, pageUrl = '', progressCallback = null) {
        try {
            // Step 1: Generate memory snippets
            const snippets = await this.generateMemorySnippets(content);
            if (progressCallback) progressCallback(1);

            if (snippets.length === 0) {
                return {
                    success: false,
                    processed: false,
                    snippetsCount: 0,
                    error: 'No memory snippets could be generated from content'
                };
            }

            // Step 2: Add snippets to memory
            const addPromises = snippets.map(snippet => this.addMemory(snippet, { url: pageUrl }));
            await Promise.all(addPromises);
            if (progressCallback) progressCallback(2);

            this.debugLog('Snippets added to memory:', snippets);

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
    async rephraseWithUserMemories(content, progressCallback = null) {
        try {
            // Step 1: Extract topics from content
            const topics = await this.extractContentTopics(content);
            if (progressCallback) progressCallback(1);
            
            if (topics.length === 0) {
                throw new Error('Unable to extract topics from content for memory search');
            }

            // Step 2: Search for relevant existing memories
            const relevantMemories = await this.searchRelevantMemories(content);
            if (progressCallback) progressCallback(2);

            if (relevantMemories.length === 0) {
                // Provide more specific error message
                throw new Error(`No memories found that are sufficiently relevant to the article content`);
            }

            // Additional validation check - ensure minimum quality threshold
            if (relevantMemories.length < 2) {
                throw new Error(`Only ${relevantMemories.length} relevant memory found, but need at least 2 for quality personalization`);
            }

            // Step 3: Generate personalized content
            const rephrasedContent = await this.rephraseContentWithMemory(content, relevantMemories);
            if (progressCallback) progressCallback(3);

            // Basic validation of generated content
            if (!rephrasedContent || rephrasedContent.length < 100) {
                throw new Error('Generated content is too short or empty');
            }

            return {
                success: true,
                processed: true,
                rephrasedContent: rephrasedContent,
                originalContent: content,
                relevantMemoriesCount: relevantMemories.length,
                relevantMemories: relevantMemories,
                extractedTopics: topics
            };

        } catch (error) {
            // Determine error type for better user feedback
            let errorType = 'unknown';
            if (error.message.includes('No memories found')) {
                errorType = 'no_relevant_memories';
            } else if (error.message.includes('Unable to extract topics')) {
                errorType = 'topic_extraction_failed';
            } else if (error.message.includes('need at least 2')) {
                errorType = 'insufficient_memories';
            } else if (error.message.includes('Generated content is too short')) {
                errorType = 'generation_failed';
            } else if (error.message.includes('AI determined that memories are not sufficiently relevant')) {
                errorType = 'ai_relevance_check_failed';
            }

            return {
                success: false,
                processed: false,
                rephrasedContent: content,
                originalContent: content,
                relevantMemoriesCount: 0,
                error: error.message,
                errorType: errorType
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
            this.debugLog('All memories cleared successfully');
            return { success: true };
        } catch (error) {
            this.debugLog('Error clearing memories:', error);
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

}