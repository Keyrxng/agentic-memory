/**
 * Entity resolution and duplicate detection using multi-algorithm approach
 * 
 * Combines deterministic exact matching with probabilistic fuzzy matching
 * for robust entity resolution. Implements the Fellegi-Sunter model for
 * probabilistic record linkage and various string similarity algorithms.
 * 
 * Multi-Algorithm Approach:
 * 1. Deterministic exact matching on normalized identifiers
 * 2. Token-based matching using Jaccard similarity
 * 3. Fuzzy string matching using Levenshtein/Jaro-Winkler distance
 * 4. Embedding-based similarity using cosine distance (when available)
 * 
 * References:
 * - Multi-algorithm entity resolution: https://www.growthloop.com/university/article/entity-resolution
 * - Probabilistic record linkage: https://www.rudderstack.com/blog/what-is-entity-resolution/
 * - String similarity algorithms: https://spotintelligence.com/2024/01/22/entity-resolution/
 */

import type { EntityRecord, GraphContext } from '../core/types.js';

/**
 * Configuration for entity resolution
 */
export interface ResolutionConfig {
  /** Minimum similarity threshold for fuzzy matching */
  fuzzyThreshold: number;
  /** Weight for exact match scoring */
  exactMatchWeight: number;
  /** Weight for fuzzy string similarity */
  fuzzyWeight: number;
  /** Weight for embedding similarity */
  embeddingWeight: number;
  /** Enable phonetic matching (Soundex/Metaphone) */
  enablePhonetic: boolean;
  /** Enable token-based Jaccard similarity */
  enableJaccard: boolean;
  /** Maximum candidates to consider for fuzzy matching */
  maxCandidates: number;
}

/**
 * Detailed entity resolution result
 */
export interface DetailedResolutionResult {
  /** Matched existing entity (null if no match) */
  matched: EntityRecord | null;
  /** Overall confidence score for the match */
  confidence: number;
  /** Resolution method used */
  method: 'exact' | 'fuzzy' | 'embedding' | 'composite' | 'none';
  /** Detailed scoring breakdown */
  scores: {
    exact: number;
    fuzzy: number;
    jaccard: number;
    phonetic: number;
    embedding: number;
  };
  /** Candidates considered during resolution */
  candidates: Array<{
    entity: EntityRecord;
    score: number;
    method: string;
  }>;
}

/**
 * String similarity algorithms for fuzzy matching
 */
class StringSimilarity {
  /**
   * Calculate Levenshtein distance between two strings
   * Returns normalized similarity score (0-1)
   */
  static levenshtein(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0) return 0;
    if (b.length === 0) return 0;

    const matrix: number[][] = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
    const aLen = a.length;
    const bLen = b.length;

    // Initialize matrix
    for (let i = 0; i <= aLen; i++) {
      matrix[i][0] = i;
    }
    for (let j = 0; j <= bLen; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= aLen; i++) {
      for (let j = 1; j <= bLen; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,     // deletion
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j - 1] + 1  // substitution
          );
        }
      }
    }

    const distance = matrix[aLen][bLen];
    const maxLen = Math.max(aLen, bLen);
    return 1 - (distance / maxLen);
  }

  /**
   * Calculate Jaro-Winkler similarity
   * Better for names and short strings
   */
  static jaroWinkler(a: string, b: string): number {
    if (a === b) return 1;

    const aLen = a.length;
    const bLen = b.length;
    const matchDistance = Math.floor(Math.max(aLen, bLen) / 2) - 1;

    if (matchDistance < 0) return 0;

    const aMatches = new Array(aLen).fill(false);
    const bMatches = new Array(bLen).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < aLen; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, bLen);

      for (let j = start; j < end; j++) {
        if (bMatches[j] || a[i] !== b[j]) continue;
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < aLen; i++) {
      if (!aMatches[i]) continue;
      while (!bMatches[k]) k++;
      if (a[i] !== b[k]) transpositions++;
      k++;
    }

    const jaro = (matches / aLen + matches / bLen + (matches - transpositions / 2) / matches) / 3;

    // Calculate Winkler prefix bonus
    let prefix = 0;
    for (let i = 0; i < Math.min(aLen, bLen, 4); i++) {
      if (a[i] === b[i]) prefix++;
      else break;
    }

    return jaro + (0.1 * prefix * (1 - jaro));
  }

  /**
   * Calculate Jaccard similarity for token-based matching
   */
  static jaccard(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }

  /**
   * Simple Soundex implementation for phonetic matching
   */
  static soundex(word: string): string {
    if (!word) return '';

    const code = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length === 0) return '';

    let soundexCode = code[0];
    const mapping: Record<string, string> = {
      'B': '1', 'F': '1', 'P': '1', 'V': '1',
      'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
      'D': '3', 'T': '3',
      'L': '4',
      'M': '5', 'N': '5',
      'R': '6'
    };

    for (let i = 1; i < code.length; i++) {
      const char = code[i];
      const digit = mapping[char] || '0';
      
      if (digit !== '0' && digit !== soundexCode[soundexCode.length - 1]) {
        soundexCode += digit;
      }
      
      if (soundexCode.length === 4) break;
    }

    return soundexCode.padEnd(4, '0');
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Advanced entity resolver implementing multi-algorithm approach
 * 
 * Follows the Fellegi-Sunter model for probabilistic record linkage,
 * combining multiple similarity algorithms with configurable weights
 * to achieve robust entity resolution.
 */
export class EntityResolver {
  private config: ResolutionConfig;

  constructor(config: Partial<ResolutionConfig> = {}) {
    this.config = {
      fuzzyThreshold: config.fuzzyThreshold ?? 0.8,
      exactMatchWeight: config.exactMatchWeight ?? 0.4,
      fuzzyWeight: config.fuzzyWeight ?? 0.3,
      embeddingWeight: config.embeddingWeight ?? 0.3,
      enablePhonetic: config.enablePhonetic ?? true,
      enableJaccard: config.enableJaccard ?? true,
      maxCandidates: config.maxCandidates ?? 20
    };
  }

  /**
   * Resolve entity against existing entities using multi-algorithm approach
   * 
   * Implements comprehensive entity resolution pipeline:
   * 1. Exact matching on normalized identifiers
   * 2. Fuzzy string matching using multiple algorithms
   * 3. Token-based Jaccard similarity
   * 4. Phonetic matching using Soundex
   * 5. Embedding-based similarity (if available)
   */
  async resolveEntity(
    newEntity: EntityRecord,
    existingEntities: EntityRecord[],
    context?: GraphContext
  ): Promise<DetailedResolutionResult> {
    
    // Initialize scoring
    const scores = {
      exact: 0,
      fuzzy: 0,
      jaccard: 0,
      phonetic: 0,
      embedding: 0
    };

    const candidates: Array<{ entity: EntityRecord; score: number; method: string }> = [];

    // Phase 1: Exact matching
    const exactMatch = this.findExactMatch(newEntity, existingEntities);
    if (exactMatch) {
      return {
        matched: exactMatch,
        confidence: 1.0,
        method: 'exact',
        scores: { ...scores, exact: 1.0 },
        candidates: [{ entity: exactMatch, score: 1.0, method: 'exact' }]
      };
    }

    // Phase 2: Filter candidates by type and basic criteria
    const typeCandidates = existingEntities.filter(entity => 
      entity.type === newEntity.type
    ).slice(0, this.config.maxCandidates);

    // Phase 3: Multi-algorithm similarity scoring
    for (const candidate of typeCandidates) {
      const similarity = this.calculateCompositeSimilarity(newEntity, candidate);
      
      if (similarity.total > this.config.fuzzyThreshold) {
        candidates.push({
          entity: candidate,
          score: similarity.total,
          method: 'composite'
        });

        // Update max scores for final result
        scores.fuzzy = Math.max(scores.fuzzy, similarity.fuzzy);
        scores.jaccard = Math.max(scores.jaccard, similarity.jaccard);
        scores.phonetic = Math.max(scores.phonetic, similarity.phonetic);
        scores.embedding = Math.max(scores.embedding, similarity.embedding);
      }
    }

    // Sort candidates by score
    candidates.sort((a, b) => b.score - a.score);

    // Return best match if above threshold
    if (candidates.length > 0) {
      const bestMatch = candidates[0];
      return {
        matched: bestMatch.entity,
        confidence: bestMatch.score,
        method: 'composite',
        scores,
        candidates
      };
    }

    // No match found
    return {
      matched: null,
      confidence: 0,
      method: 'none',
      scores,
      candidates: []
    };
  }

  /**
   * Batch resolve multiple entities efficiently
   */
  async resolveEntities(
    newEntities: EntityRecord[],
    existingEntities: EntityRecord[],
    context?: GraphContext
  ): Promise<Map<string, DetailedResolutionResult>> {
    const results = new Map<string, DetailedResolutionResult>();

    // Create index for efficient lookup
    const typeIndex = new Map<string, EntityRecord[]>();
    for (const entity of existingEntities) {
      if (!typeIndex.has(entity.type)) {
        typeIndex.set(entity.type, []);
      }
      typeIndex.get(entity.type)!.push(entity);
    }

    // Resolve each entity
    for (const newEntity of newEntities) {
      const candidatesForType = typeIndex.get(newEntity.type) || [];
      const result = await this.resolveEntity(newEntity, candidatesForType, context);
      results.set(newEntity.id, result);
    }

    return results;
  }

  /**
   * Find exact matches using normalized identifiers
   */
  private findExactMatch(
    newEntity: EntityRecord,
    existingEntities: EntityRecord[]
  ): EntityRecord | null {
    const normalizedNewName = this.normalizeForExactMatch(newEntity.name);
    const normalizedNewId = this.normalizeForExactMatch(newEntity.id);

    for (const existing of existingEntities) {
      // Check name match
      if (this.normalizeForExactMatch(existing.name) === normalizedNewName) {
        return existing;
      }

      // Check ID match (for deterministic IDs based on content)
      if (this.normalizeForExactMatch(existing.id) === normalizedNewId) {
        return existing;
      }

      // Check for exact property matches
      if (this.hasExactPropertyMatch(newEntity, existing)) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Calculate composite similarity using multiple algorithms
   */
  private calculateCompositeSimilarity(
    entity1: EntityRecord,
    entity2: EntityRecord
  ): {
    total: number;
    fuzzy: number;
    jaccard: number;
    phonetic: number;
    embedding: number;
  } {
    const name1 = entity1.name.toLowerCase();
    const name2 = entity2.name.toLowerCase();

    // Fuzzy string similarity (average of Levenshtein and Jaro-Winkler)
    const levenshtein = StringSimilarity.levenshtein(name1, name2);
    const jaroWinkler = StringSimilarity.jaroWinkler(name1, name2);
    const fuzzy = (levenshtein + jaroWinkler) / 2;

    // Token-based Jaccard similarity
    const jaccard = this.config.enableJaccard ? 
      StringSimilarity.jaccard(name1, name2) : 0;

    // Phonetic similarity
    const phonetic = this.config.enablePhonetic ? 
      (StringSimilarity.soundex(name1) === StringSimilarity.soundex(name2) ? 1 : 0) : 0;

    // Embedding similarity (if embeddings are available)
    let embedding = 0;
    if (entity1.embeddings && entity2.embeddings) {
      embedding = StringSimilarity.cosineSimilarity(
        new Float32Array(entity1.embeddings),
        new Float32Array(entity2.embeddings)
      );
    }

    // Weighted composite score
    const total = (
      fuzzy * this.config.fuzzyWeight +
      jaccard * this.config.fuzzyWeight * 0.5 +
      phonetic * this.config.fuzzyWeight * 0.3 +
      embedding * this.config.embeddingWeight
    ) / (this.config.fuzzyWeight + this.config.embeddingWeight);

    return { total, fuzzy, jaccard, phonetic, embedding };
  }

  /**
   * Normalize string for exact matching
   */
  private normalizeForExactMatch(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  /**
   * Check for exact property matches
   */
  private hasExactPropertyMatch(entity1: EntityRecord, entity2: EntityRecord): boolean {
    // Check for unique identifier properties
    const uniqueProps = ['email', 'ssn', 'id_number', 'phone', 'url'];
    
    for (const prop of uniqueProps) {
      const val1 = entity1.properties[prop];
      const val2 = entity2.properties[prop];
      
      if (val1 && val2 && val1 === val2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ResolutionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ResolutionConfig {
    return { ...this.config };
  }
}
