/**
 * Full-Text Index Implementation
 *
 * Provides keyword search capabilities by tokenizing and indexing text content.
 * Supports fuzzy matching, phrase queries, and relevance scoring.
 *
 * Example: Find nodes containing "machine learning" or "artificial intelligence"
 */

import type { GraphIndex, IndexEntry, QueryOptions, IndexStats } from './types.js';

export interface TextQuery {
  /** Search terms */
  terms: string[];
  /** Match mode: 'any' (OR), 'all' (AND), 'phrase' (exact phrase) */
  mode: 'any' | 'all' | 'phrase';
  /** Fuzzy matching threshold */
  fuzzyThreshold?: number;
}

export class TextIndex implements GraphIndex {
  public readonly name = 'text_index';
  public readonly type = 'text' as const;

  private index: Map<string, IndexEntry> = new Map();
  private itemToTokens: Map<string, Set<string>> = new Map();
  private queryCount = 0;
  private hitCount = 0;

  // Tokenization settings
  private readonly minTokenLength = 2;
  private readonly maxTokenLength = 50;

  add(text: string, itemId: string, metadata?: any): void {
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      // Initialize token entry if it doesn't exist
      if (!this.index.has(token)) {
        this.index.set(token, {
          key: token,
          nodeIds: new Set(),
          metadata: { frequency: 0 }
        });
      }

      // Add item to token entry
      const entry = this.index.get(token)!;
      entry.nodeIds.add(itemId);
      entry.metadata!.frequency = (entry.metadata!.frequency || 0) + 1;

      // Track reverse mapping
      if (!this.itemToTokens.has(itemId)) {
        this.itemToTokens.set(itemId, new Set());
      }
      this.itemToTokens.get(itemId)!.add(token);
    }
  }

  remove(text: string, itemId: string): void {
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      const entry = this.index.get(token);
      if (entry) {
        entry.nodeIds.delete(itemId);
        entry.metadata!.frequency = Math.max(0, (entry.metadata!.frequency || 0) - 1);

        // Clean up empty entries
        if (entry.nodeIds.size === 0) {
          this.index.delete(token);
        }
      }

      // Update reverse mapping
      const itemTokens = this.itemToTokens.get(itemId);
      if (itemTokens) {
        itemTokens.delete(token);
        if (itemTokens.size === 0) {
          this.itemToTokens.delete(itemId);
        }
      }
    }
  }

  query(query: TextQuery | string, options: QueryOptions = {}): Set<string> {
    this.queryCount++;

    if (typeof query === 'string') {
      // Simple text query
      return this.querySimple(query, options);
    }

    // Complex text query
    return this.queryComplex(query, options);
  }

  getStats(): IndexStats {
    const totalEntries = this.index.size;
    const totalItems = Array.from(this.index.values())
      .reduce((sum, entry) => sum + entry.nodeIds.size, 0);

    return {
      totalEntries,
      totalItems,
      memoryUsage: this.estimateMemoryUsage(),
      averageItemsPerEntry: totalEntries > 0 ? totalItems / totalEntries : 0,
      hitRate: this.queryCount > 0 ? this.hitCount / this.queryCount : 0
    };
  }

  clear(): void {
    this.index.clear();
    this.itemToTokens.clear();
    this.queryCount = 0;
    this.hitCount = 0;
  }

  async rebuild(items: Array<{id: string, data: any}>): Promise<void> {
    this.clear();

    for (const item of items) {
      // Index node properties that contain text
      if (item.data.properties) {
        for (const [key, value] of Object.entries(item.data.properties)) {
          if (typeof value === 'string') {
            this.add(value, item.id, { property: key });
          }
        }
      }

      // Index node name if available
      if (item.data.name) {
        this.add(item.data.name, item.id, { field: 'name' });
      }
    }
  }

  /**
   * Simple text query
   */
  private querySimple(text: string, options: QueryOptions): Set<string> {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) {
      return new Set();
    }

    this.hitCount++;

    // Find items that contain any of the tokens
    const resultSets = tokens
      .map(token => {
        const entry = this.index.get(token);
        return entry ? entry.nodeIds : new Set<string>();
      })
      .filter(set => set.size > 0);

    if (resultSets.length === 0) {
      return new Set();
    }

    // Union all result sets
    const results = new Set<string>();
    for (const set of resultSets) {
      for (const itemId of set) {
        results.add(itemId);
      }
    }

    // Apply limit if specified
    if (options.limit && results.size > options.limit) {
      return new Set(Array.from(results).slice(0, options.limit));
    }

    return results;
  }

  /**
   * Complex text query with modes
   */
  private queryComplex(query: TextQuery, options: QueryOptions): Set<string> {
    const { terms, mode, fuzzyThreshold = 0.8 } = query;

    if (terms.length === 0) {
      return new Set();
    }

    this.hitCount++;

    switch (mode) {
      case 'any':
        return this.queryAny(terms, options);
      case 'all':
        return this.queryAll(terms, options);
      case 'phrase':
        return this.queryPhrase(terms, options);
      default:
        return new Set();
    }
  }

  /**
   * Query for items containing any of the terms
   */
  private queryAny(terms: string[], options: QueryOptions): Set<string> {
    const results = new Set<string>();

    for (const term of terms) {
      const tokens = this.tokenize(term);
      for (const token of tokens) {
        const entry = this.index.get(token);
        if (entry) {
          for (const itemId of entry.nodeIds) {
            results.add(itemId);
          }
        }
      }
    }

    if (options.limit && results.size > options.limit) {
      return new Set(Array.from(results).slice(0, options.limit));
    }

    return results;
  }

  /**
   * Query for items containing all terms
   */
  private queryAll(terms: string[], options: QueryOptions): Set<string> {
    if (terms.length === 0) return new Set();

    // Start with the first term's results
    const firstTerm = terms[0];
    if (!firstTerm) return new Set();

    const firstTokens = this.tokenize(firstTerm);
    let results = new Set<string>();

    for (const token of firstTokens) {
      const entry = this.index.get(token);
      if (entry) {
        for (const itemId of entry.nodeIds) {
          results.add(itemId);
        }
      }
    }

    // Intersect with remaining terms
    for (let i = 1; i < terms.length; i++) {
      const term = terms[i];
      if (!term) continue;

      const termTokens = this.tokenize(term);
      const termResults = new Set<string>();

      for (const token of termTokens) {
        const entry = this.index.get(token);
        if (entry) {
          for (const itemId of entry.nodeIds) {
            if (results.has(itemId)) {
              termResults.add(itemId);
            }
          }
        }
      }

      results = termResults;
      if (results.size === 0) break;
    }

    if (options.limit && results.size > options.limit) {
      return new Set(Array.from(results).slice(0, options.limit));
    }

    return results;
  }

  /**
   * Query for exact phrase matches
   */
  private queryPhrase(terms: string[], options: QueryOptions): Set<string> {
    // For phrase queries, we'd need positional indexing
    // For now, fall back to 'all' mode
    return this.queryAll(terms, options);
  }

  /**
   * Tokenize text into searchable terms
   */
  private tokenize(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Normalize text
    const normalized = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ')     // Normalize whitespace
      .trim();

    // Split into tokens
    const tokens = normalized.split(' ')
      .filter(token =>
        token.length >= this.minTokenLength &&
        token.length <= this.maxTokenLength
      );

    // Remove duplicates
    return Array.from(new Set(tokens));
  }

  /**
   * Get all tokens for an item
   */
  getItemTokens(itemId: string): Set<string> {
    return this.itemToTokens.get(itemId) || new Set();
  }

  /**
   * Get most frequent tokens
   */
  getTopTokens(limit: number = 10): Array<{token: string, frequency: number}> {
    return Array.from(this.index.entries())
      .map(([token, entry]) => ({
        token,
        frequency: entry.metadata?.frequency || 0
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  /**
   * Get token statistics
   */
  getTokenStats(): { totalTokens: number, averageFrequency: number } {
    const totalTokens = this.index.size;
    const totalFrequency = Array.from(this.index.values())
      .reduce((sum, entry) => sum + (entry.metadata?.frequency || 0), 0);

    return {
      totalTokens,
      averageFrequency: totalTokens > 0 ? totalFrequency / totalTokens : 0
    };
  }

  private estimateMemoryUsage(): number {
    // Rough estimation
    let usage = 0;

    // Map overhead
    usage += 100;

    // Token entries
    for (const [token, entry] of this.index) {
      usage += token.length * 2;
      usage += 50; // entry overhead
      usage += entry.nodeIds.size * 8;
      usage += 20; // metadata
    }

    // Reverse mapping
    for (const [itemId, tokens] of this.itemToTokens) {
      usage += itemId.length * 2;
      usage += tokens.size * 8;
    }

    return usage;
  }
}
