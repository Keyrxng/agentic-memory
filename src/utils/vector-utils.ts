/**
 * Vector utility functions for similarity calculations and embeddings
 * Enhanced for multimodal applications including vision and text
 */

import { generateEmbeddings } from 'local-stt-tts';

export interface EmbeddingConfig {
  provider: 'ollama' | 'lmstudio';
  model: string;
  dimensions?: number;
}

export interface EmbeddingBatch {
  texts: string[];
  embeddings: Float32Array[];
  metadata?: Record<string, any>[];
}

export interface SimilarityResult {
  index: number;
  score: number;
  metadata?: any;
}

export class VectorUtils {
  private static defaultConfig: EmbeddingConfig = {
    provider: 'ollama',
    model: 'mxbai-embed-large:latest',
    dimensions: 1024
  };

  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  static euclideanDistance(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Calculate Manhattan distance between two vectors
   */
  static manhattanDistance(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.abs(a[i] - b[i]);
    }

    return sum;
  }

  /**
   * Normalize a vector to unit length
   */
  static normalize(vector: Float32Array): Float32Array {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return new Float32Array(vector.length);

    const normalized = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / norm;
    }

    return normalized;
  }

  /**
   * Calculate centroid of multiple vectors
   */
  static calculateCentroid(vectors: Float32Array[]): Float32Array {
    if (vectors.length === 0) return new Float32Array();

    const dimension = vectors[0].length;
    const centroid = new Float32Array(dimension);

    for (const vector of vectors) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += vector[i];
      }
    }

    for (let i = 0; i < dimension; i++) {
      centroid[i] /= vectors.length;
    }

    return centroid;
  }

  /**
   * Check if vector has valid values (not NaN or infinite)
   */
  static isValid(vector: Float32Array): boolean {
    for (let i = 0; i < vector.length; i++) {
      if (!isFinite(vector[i])) {
        return false;
      }
    }
    return true;
  }

  /**
   * Generate embeddings for text using local-stt-tts
   */
  static async generateEmbedding(
    text: string,
    config: Partial<EmbeddingConfig> = {}
  ): Promise<Float32Array> {
    const embeddingConfig = { ...this.defaultConfig, ...config };

    try {
      const result = await generateEmbeddings({
        provider: embeddingConfig.provider,
        model: embeddingConfig.model,
        input: text
      });

      if (!result.embedding || result.embedding.length === 0) {
        throw new Error('Empty embedding result');
      }

      return new Float32Array(result.embedding);
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  static async generateEmbeddingsBatch(
    texts: string[],
    config: Partial<EmbeddingConfig> = {}
  ): Promise<EmbeddingBatch> {
    const embeddings: Float32Array[] = [];
    const validIndices: number[] = [];

    // Generate embeddings sequentially to avoid overwhelming the service
    for (let i = 0; i < texts.length; i++) {
      try {
        const embedding = await this.generateEmbedding(texts[i], config);
        embeddings.push(embedding);
        validIndices.push(i);
      } catch (error) {
        console.warn(`Failed to generate embedding for text ${i}:`, error);
        // Add zero vector as placeholder
        embeddings.push(new Float32Array(config.dimensions || this.defaultConfig.dimensions!));
      }
    }

    return {
      texts: texts.filter((_, i) => validIndices.includes(i)),
      embeddings,
      metadata: validIndices.map(i => ({ originalIndex: i }))
    };
  }

  /**
   * Find most similar vectors using cosine similarity
   */
  static findSimilarVectors(
    query: Float32Array,
    candidates: Float32Array[],
    topK: number = 5,
    threshold: number = 0
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const similarity = this.cosineSimilarity(query, candidates[i]);
      if (similarity >= threshold) {
        results.push({ index: i, score: similarity });
      }
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Find most similar vectors with metadata
   */
  static findSimilarVectorsWithMetadata(
    query: Float32Array,
    candidates: Array<{ vector: Float32Array; metadata?: any }>,
    topK: number = 5,
    threshold: number = 0
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const similarity = this.cosineSimilarity(query, candidates[i].vector);
      if (similarity >= threshold) {
        results.push({
          index: i,
          score: similarity,
          metadata: candidates[i].metadata
        });
      }
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Calculate pairwise similarities between all vectors
   */
  static calculateSimilarityMatrix(vectors: Float32Array[]): Float32Array[] {
    const n = vectors.length;
    const matrix: Float32Array[] = [];

    for (let i = 0; i < n; i++) {
      matrix[i] = new Float32Array(n);
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = 1.0; // Self-similarity
        } else if (j > i) {
          matrix[i][j] = this.cosineSimilarity(vectors[i], vectors[j]);
          matrix[j][i] = matrix[i][j]; // Symmetric
        }
      }
    }

    return matrix;
  }

  /**
   * Perform dimensionality reduction using PCA (simplified)
   */
  static reduceDimensionality(
    vectors: Float32Array[],
    targetDimensions: number
  ): Float32Array[] {
    if (vectors.length === 0 || targetDimensions >= vectors[0].length) {
      return vectors;
    }

    // This is a simplified PCA implementation
    // For production use, consider using a proper linear algebra library
    const n = vectors.length;
    const originalDim = vectors[0].length;

    // Calculate mean
    const mean = new Float32Array(originalDim);
    for (const vector of vectors) {
      for (let i = 0; i < originalDim; i++) {
        mean[i] += vector[i];
      }
    }
    for (let i = 0; i < originalDim; i++) {
      mean[i] /= n;
    }

    // Center the data
    const centered = vectors.map(vector => {
      const centeredVec = new Float32Array(originalDim);
      for (let i = 0; i < originalDim; i++) {
        centeredVec[i] = vector[i] - mean[i];
      }
      return centeredVec;
    });

    // For simplicity, just take the first targetDimensions components
    // This is not true PCA but works for basic dimensionality reduction
    return centered.map(vector => vector.slice(0, targetDimensions));
  }

  /**
   * Combine multiple embeddings using weighted average
   */
  static combineEmbeddings(
    embeddings: Float32Array[],
    weights?: number[]
  ): Float32Array {
    if (embeddings.length === 0) return new Float32Array();

    const dimension = embeddings[0].length;
    const combined = new Float32Array(dimension);

    // Use equal weights if not provided
    const finalWeights = weights || new Array(embeddings.length).fill(1 / embeddings.length);

    for (let i = 0; i < embeddings.length; i++) {
      const weight = finalWeights[i];
      for (let j = 0; j < dimension; j++) {
        combined[j] += embeddings[i][j] * weight;
      }
    }

    return this.normalize(combined);
  }

  /**
   * Calculate embedding statistics
   */
  static calculateEmbeddingStats(embeddings: Float32Array[]): {
    mean: number;
    std: number;
    min: number;
    max: number;
    dimensions: number;
  } {
    if (embeddings.length === 0) {
      return { mean: 0, std: 0, min: 0, max: 0, dimensions: 0 };
    }

    const dimensions = embeddings[0].length;
    let totalValues = 0;
    let sum = 0;
    let sumSquares = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        const val = embedding[i];
        totalValues++;
        sum += val;
        sumSquares += val * val;
        min = Math.min(min, val);
        max = Math.max(max, val);
      }
    }

    const mean = sum / totalValues;
    const variance = (sumSquares / totalValues) - (mean * mean);
    const std = Math.sqrt(Math.max(0, variance));

    return { mean, std, min, max, dimensions };
  }

  /**
   * Validate embedding quality
   */
  static validateEmbeddings(embeddings: Float32Array[]): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (embeddings.length === 0) {
      issues.push('No embeddings provided');
      return { isValid: false, issues };
    }

    const dimensions = embeddings[0].length;

    // Check dimension consistency
    for (let i = 1; i < embeddings.length; i++) {
      if (embeddings[i].length !== dimensions) {
        issues.push(`Embedding ${i} has inconsistent dimensions (${embeddings[i].length} vs ${dimensions})`);
      }
    }

    // Check for invalid values
    for (let i = 0; i < embeddings.length; i++) {
      if (!this.isValid(embeddings[i])) {
        issues.push(`Embedding ${i} contains invalid values (NaN or infinite)`);
      }
    }

    // Check for zero vectors
    for (let i = 0; i < embeddings.length; i++) {
      const norm = Math.sqrt(embeddings[i].reduce((sum, val) => sum + val * val, 0));
      if (norm === 0) {
        issues.push(`Embedding ${i} is a zero vector`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Create a simple embedding cache for performance
   */
  static createEmbeddingCache(maxSize: number = 1000) {
    const cache = new Map<string, Float32Array>();

    return {
      get: (key: string) => cache.get(key),
      set: (key: string, embedding: Float32Array) => {
        if (cache.size >= maxSize) {
          // Remove oldest entry (simple LRU approximation)
          const firstKey = cache.keys().next().value;
          cache.delete(firstKey);
        }
        cache.set(key, embedding);
      },
      clear: () => cache.clear(),
      size: () => cache.size
    };
  }
}
