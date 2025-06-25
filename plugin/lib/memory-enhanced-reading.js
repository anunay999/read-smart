/**
 * Memory-Enhanced Reading Library
 * A JavaScript library for Chrome extensions that personalizes web content
 * based on user's reading history and memories.
 */

class MemoryEnhancedReading {
    constructor(config) {
        this.mem0ApiKey = config.mem0ApiKey;
        this.geminiApiKey = config.geminiApiKey;
        this.geminiModel = config.geminiModel || 'gemini-2.5-flash';
        this.userId = config.userId;
        this.baseUrl = 'https://api.mem0.ai/v1';
        this.geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent`;

        // Configuration
        this.maxMemories = config.maxMemories || 10;
        this.relevanceThreshold = config.relevanceThreshold || 0.3;
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
        const requestBody = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        };

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
        const prompt = `
            You are an AI assistant that extracts key topics and themes from content for semantic search.

            Analyze the given content and extract 3-5 key topics/themes that would be useful for searching related memories. Focus on:
            1. Main subject areas (e.g., "productivity", "exercise", "habits")
            2. Specific methodologies or concepts (e.g., "deep work", "time blocking", "habit formation")
            3. Related skills or areas (e.g., "focus techniques", "behavior change", "mindfulness")

            Return the topics as a JSON array of strings, each topic should be 1-4 words.

            Content:
            ${content}

            Return only the JSON array, no additional text not even a code block specifying json.

            Example response:

            [
            <list-item-1>,
            <list-item-2>,
            <list-item-3>,
            <list-item-4>,
            <list-item-5>
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
            You are an AI assistant that creates concise, valuable memory snippets from web page content.

            Your task is to analyze the given page content and extract 3-5 key memory snippets that capture:
            1. Main concepts, facts, or insights
            2. User preferences or interests mentioned
            3. Important methodologies or approaches
            4. Key takeaways or conclusions
            5. Any personal context or examples

            Each memory snippet should be:
            - 1-2 sentences maximum
            - Specific rather than generic
            - Useful for future reference
            - Written in third person when applicable (e.g., "User read that..." or "User visited...")

            Page Content:
            ${content}

            Return the snippets as a JSON array of strings, no additional text not even a code block specifying json.

            Example response:

            [
            <list-item-1>,
            <list-item-2>,
            <list-item-3>,
            <list-item-4>,
            <list-item-5>
            ]`;
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
        const memoryText = existingMemories
            .map(mem => {
                const urlPart = mem.metadata && mem.metadata.url ? ` (source: ${mem.metadata.url})` : '';
                return `• ${mem.memory}${urlPart}`;
            })
            .join('\n');

        const prompt = `
            You are an elite content personaliser.

            🎯 GOAL  
            Rewrite the article so it feels like the original author, but shows the reader **only what’s new** and links back to their saved memories.

            🚦 HARD RULES (do NOT break)  
            1. Output **exactly** the two top-level headings shown below and nothing else.  
            2. Finish writing immediately after “## SECTION 2 – Fresh Content in Author’s Voice” content.  
            3. Max 900 words total; no paragraph longer than 3 sentences.  
            4. Use at least one sub-heading or bullet group every 120 words inside Section 2.  
            5. Add footnote markers [^n] whenever a new idea builds on a memory and map them to links in Section 1.  
            6. Produce valid Markdown; links must be `[Text](URL)`.

            📄 TEMPLATE (copy verbatim)

            ## SECTION 1 – Recap & References  
            **Context Bridge** (≤ 2 sentences): Explain how the reader’s memories relate to the article.  
            **What You Already Know**  
            - ⬩ Bullet existing ideas (≤ 8 words each).  
            **References**  
            - ⬩ \`[Title 1](URL)\`  
            - ⬩ \`[Title 2](URL)\`

            ## SECTION 2 – Fresh Content in Author’s Voice  
            *Rewrite the remaining material…*

            🔧 STYLE HINTS  
            • Mirror the author’s vocabulary and rhythm.  
            • Bold key take-aways, italicise pivotal terms, use `> block-quotes` sparingly.  
            • Keep sentences active and positive.  
            • Avoid filler like “let’s be real” unless present in the original.

            ────────────────────────────────────────
            INPUTS  
            READER MEMORIES  
            ${memoryText}

            ORIGINAL ARTICLE  
            ${content}
            ────────────────────────────────────────
            REMEMBER  
            - Don’t repeat memory snippets verbatim.  
            - No headings besides the two specified.  
            - Stop after finishing Section 2.`;

        try {
            const rephrasedContent = await this.generateWithGemini(prompt);
            return rephrasedContent;
        } catch (error) {
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