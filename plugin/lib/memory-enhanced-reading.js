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
        this.debug = config.debug || false;
    }

    /**
     * Log debug messages
     */
    log(message, data = null) {
        if (this.debug) {
            console.log(`[MemoryReading] ${message}`, data || '');
        }
    }

    /**
     * Make API calls with error handling
     */
    async makeApiCall(url, options) {
        try {
            this.log(`Making API call to: ${url}`);
            this.log('Request options:', {
                method: options.method,
                headers: options.headers,
                body: options.body ? JSON.parse(options.body) : null
            });
            
            const response = await fetch(url, options);
            this.log(`Response status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                this.log('Error response body:', errorText);
                throw new Error(`API call failed: ${response.status} - ${errorText.substring(0, 200)}`);
            }
            
            const responseData = await response.json();
            this.log('Response data:', responseData);
            return responseData;
        } catch (error) {
            this.log('API call error:', error);
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
            this.log('Extracted topics:', topics);
            return topics;
        } catch (error) {
            this.log('Error extracting topics:', error);
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
        return response.results || [];
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
        return response.results || [];
    }

    /**
     * Add memory using Mem0 API
     */
    async addMemory(content) {
        const url = `${this.baseUrl}/memories/`;
        
        // Format the request body to match the working curl example
        const requestBody = {
            messages: [
                { role: 'user', content: content }
            ],
            user_id: this.userId
        };
        
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Token ${this.mem0ApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        };

        this.log('Adding memory with body:', requestBody);
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
                this.log('No topics extracted, returning empty results');
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
                        if (!seenMemoryIds.has(mem.id) && mem.score > this.relevanceThreshold) {
                            allRelevantMemories.push(mem);
                            seenMemoryIds.add(mem.id);
                        }
                    }
                } catch (error) {
                    this.log(`Error searching for topic '${topic}':`, error);
                    continue;
                }
            }

            // Sort by relevance score and limit results
            allRelevantMemories.sort((a, b) => b.score - a.score);
            const relevantMemories = allRelevantMemories.slice(0, this.maxMemories);

            this.log(`Found ${relevantMemories.length} relevant memories from ${allRelevantMemories.length} total matches`);
            return relevantMemories;

        } catch (error) {
            this.log('Error searching relevant memories:', error);
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
            this.log(`Generated ${snippets.length} memory snippets:`, snippets);
            return snippets;
        } catch (error) {
            this.log('Error generating memory snippets:', error);
            return [];
        }
    }

        /**
     * Rephrase content based on existing user memories, matching author's writing style
     */
    async rephraseContentWithMemory(content, existingMemories) {
        const memoryText = existingMemories
            .map(mem => `• ${mem.memory}`)
            .join('\n');

        const prompt = `
You are an expert content personalizer that adapts articles to match the reader's existing knowledge while preserving the author's unique writing style.

TASK: Rewrite the article below in two sections, maintaining the original author's tone, style, and personality.

READER'S EXISTING KNOWLEDGE:
${memoryText}

ORIGINAL CONTENT:
${content}

INSTRUCTIONS:
1. **Analyze the author's writing style**: Note their tone (formal/casual), personality (humorous/serious), vocabulary level, sentence structure, and any unique expressions or patterns.

2. **Create exactly TWO sections**:

**SECTION 1: PERSONALIZED MAIN CONTENT**
- Rewrite the main content in the author's exact style and voice
- Reference the reader's existing knowledge naturally (e.g., "Building on your understanding of...", "As you already know from...")
- Emphasize NEW information that complements what they already know
- Skip or briefly mention concepts they're already familiar with
- Keep the author's personality and unique expressions intact

**SECTION 2: KNOWLEDGE CONNECTION RECAP**
- Create a brief "What You Already Know" or "Connecting the Dots" section
- Summarize how this content relates to their existing knowledge
- Written in the same author's style but more conversational
- Help the reader see patterns and connections

CRITICAL REQUIREMENTS:
- Maintain the author's exact writing style, tone, and personality
- Keep all the author's unique phrases, humor, or distinctive voice
- The content should feel like the original author wrote it specifically for this reader
- Both sections should feel cohesive and natural

Return the rephrased content with clear section headers:`;

        try {
            const rephrasedContent = await this.generateWithGemini(prompt);
            this.log('Content successfully rephrased with author style matching');
            return rephrasedContent;
        } catch (error) {
            this.log('Error rephrasing content with memory:', error);
            return content; // Return original content if rephrasing fails
        }
    }

    /**
     * Add page content to memory (generate snippets and store them)
     */
    async addPageToMemory(content) {
        this.log('Starting memory addition process...');

        try {
            // Generate memory snippets
            this.log('Generating memory snippets...');
            const snippets = await this.generateMemorySnippets(content);

            if (snippets.length === 0) {
                this.log('No memory snippets generated');
                return {
                    success: false,
                    processed: false,
                    snippetsCount: 0,
                    error: 'No memory snippets could be generated from content'
                };
            }

            // Add snippets to memory
            this.log('Adding snippets to memory...');
            const addPromises = snippets.map(snippet => this.addMemory(snippet));
            await Promise.all(addPromises);
            this.log(`Successfully added ${snippets.length} snippets to memory`);

            return {
                success: true,
                processed: true,
                snippetsCount: snippets.length,
                snippets: snippets
            };

        } catch (error) {
            this.log('Error adding page to memory:', error);
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
        this.log('Starting content rephrasing process...');

        try {
            // Search for relevant existing memories
            this.log('Searching for relevant memories...');
            const relevantMemories = await this.searchRelevantMemories(content);

            if (relevantMemories.length === 0) {
                this.log('No relevant memories found for rephrasing');
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
            this.log(`Rephrasing content using ${relevantMemories.length} relevant memories...`);
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
            this.log('Error rephrasing content:', error);
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
            this.log('Error getting memory stats:', error);
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
            this.log('All memories cleared successfully');
            return { success: true };
        } catch (error) {
            this.log('Error clearing memories:', error);
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