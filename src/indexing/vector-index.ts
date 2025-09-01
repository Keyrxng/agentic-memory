/**
 * Vector Index Implementation
 *
 * Provides similarity search capabilities for vector embeddings using
 * approximate nearest neighbor algorithms. Supports cosine similarity
 * and other distance metrics for semantic search.
 *
 * Example: Find nodes with similar embeddings to a query vector
 */

import type { GraphIndex, IndexEntry, QueryOptions, IndexStats } from './types.js';

export interface VectorQuery {
  /** Query embedding vector */
  embedding: Float32Array;
  /** Similarity threshold (0-1) */
  threshold: number;
  /** Maximum results to return */
  topK: number;
  /** Distance metric to use */
  metric: 'cosine' | 'euclidean' | 'dot';
}

export class VectorIndex implements GraphIndex {
  public readonly name = 'vector_index';
  public readonly type = 'vector' as const;

  private vectors: Map<string, Float32Array> = new Map();
  private itemToVector: Map<string, Float32Array> = new Map();
  private queryCount = 0;
  private hitCount = 0;

  // ANN algorithm configuration
  private dimension = 0;
  private useANN = true; // Enable ANN by default
  private annConfig = {
    maxConnections: 16, // Maximum connections per node in HNSW
    efConstruction: 200, // Construction parameter for HNSW
    efSearch: 50, // Search parameter for HNSW
    minElements: 100 // Minimum elements before using ANN
  };

  // HNSW graph structure
  private hnswGraph: Map<string, Set<string>> = new Map();
  private entryPoint?: string;

  add(vector: Float32Array, itemId: string, metadata?: any): void {
    if (!vector || vector.length === 0) {
      return;
    }

    // Set dimension on first vector
    if (this.dimension === 0) {
      this.dimension = vector.length;
    } else if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }

    // Store vector
    this.vectors.set(itemId, new Float32Array(vector));
    this.itemToVector.set(itemId, new Float32Array(vector));

    // Build HNSW graph if ANN is enabled and we have enough elements
    if (this.useANN && this.vectors.size >= this.annConfig.minElements) {
      this.addToHNSW(itemId, vector);
    }
  }

  remove(vector: Float32Array, itemId: string): void {
    this.vectors.delete(itemId);
    this.itemToVector.delete(itemId);
  }

  query(query: VectorQuery | Float32Array, options: QueryOptions = {}): Set<string> {
    this.queryCount++;

    if (query instanceof Float32Array) {
      // Use ANN if available and we have enough vectors
      if (this.useANN && this.vectors.size >= this.annConfig.minElements && this.entryPoint) {
        return this.queryHNSW(query, options);
      } else {
        // Fall back to simple linear search
        return this.querySimple(query, options);
      }
    }

    // Complex vector query
    return this.queryComplex(query);
  }

  getStats(): IndexStats {
    return {
      totalEntries: this.vectors.size,
      totalItems: this.vectors.size,
      memoryUsage: this.estimateMemoryUsage(),
      averageItemsPerEntry: 1,
      hitRate: this.queryCount > 0 ? this.hitCount / this.queryCount : 0
    };
  }

  clear(): void {
    this.vectors.clear();
    this.itemToVector.clear();
    this.queryCount = 0;
    this.hitCount = 0;
    this.dimension = 0;
    this.hnswGraph.clear();
    this.entryPoint = undefined;
  }

  async rebuild(items: Array<{id: string, data: any}>): Promise<void> {
    this.clear();

    for (const item of items) {
      if (item.data.embeddings && item.data.embeddings instanceof Float32Array) {
        this.add(item.data.embeddings, item.id);
      }
    }
  }

  /**
   * Simple vector similarity query
   */
  private querySimple(queryVector: Float32Array, options: QueryOptions): Set<string> {
    if (queryVector.length !== this.dimension) {
      throw new Error(`Query vector dimension mismatch: expected ${this.dimension}, got ${queryVector.length}`);
    }

    this.hitCount++;

    // Calculate similarities for all vectors
    const similarities: Array<{itemId: string, similarity: number}> = [];

    for (const [itemId, vector] of this.vectors) {
      const similarity = this.cosineSimilarity(queryVector, vector);
      similarities.push({ itemId, similarity });
    }

    // Sort by similarity (descending)
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Apply threshold and limit
    const threshold = options.threshold || 0.7;
    const limit = options.limit || 10;

    const results = similarities
      .filter(item => item.similarity >= threshold)
      .slice(0, limit)
      .map(item => item.itemId);

    return new Set(results);
  }

  /**
   * Complex vector query with custom parameters
   */
  private queryComplex(query: VectorQuery): Set<string> {
    const { embedding, threshold, topK, metric } = query;

    if (embedding.length !== this.dimension) {
      throw new Error(`Query vector dimension mismatch: expected ${this.dimension}, got ${embedding.length}`);
    }

    this.hitCount++;

    // Calculate similarities using specified metric
    const similarities: Array<{itemId: string, similarity: number}> = [];

    for (const [itemId, vector] of this.vectors) {
      let similarity: number;

      switch (metric) {
        case 'cosine':
          similarity = this.cosineSimilarity(embedding, vector);
          break;
        case 'euclidean':
          similarity = 1 / (1 + this.euclideanDistance(embedding, vector)); // Convert distance to similarity
          break;
        case 'dot':
          similarity = this.dotProduct(embedding, vector);
          // Normalize dot product to 0-1 range (approximate)
          similarity = Math.max(0, Math.min(1, (similarity + 1) / 2));
          break;
        default:
          similarity = this.cosineSimilarity(embedding, vector);
      }

      similarities.push({ itemId, similarity });
    }

    // Sort by similarity (descending for cosine/dot, ascending for euclidean)
    if (metric === 'euclidean') {
      similarities.sort((a, b) => a.similarity - b.similarity);
    } else {
      similarities.sort((a, b) => b.similarity - a.similarity);
    }

    // Apply threshold and limit
    const results = similarities
      .filter(item => item.similarity >= threshold)
      .slice(0, topK)
      .map(item => item.itemId);

    return new Set(results);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length && i < b.length; i++) {
      dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
      normA += (a[i] ?? 0) * (a[i] ?? 0);
      normB += (b[i] ?? 0) * (b[i] ?? 0);
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
      const diff = (a[i] ?? 0) - (b[i] ?? 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Calculate dot product of two vectors
   */
  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length && i < b.length; i++) {
      sum += (a[i] ?? 0) * (b[i] ?? 0);
    }
    return sum;
  }

  /**
   * Get vector for an item
   */
  getItemVector(itemId: string): Float32Array | undefined {
    return this.itemToVector.get(itemId);
  }

  /**
   * Get all indexed vectors (for batch operations)
   */
  getAllVectors(): Map<string, Float32Array> {
    return new Map(this.vectors);
  }

  /**
   * Get vector dimensionality
   */
  getDimension(): number {
    return this.dimension;
  }

  /**
   * Find most similar vectors to a query
   */
  findSimilar(queryVector: Float32Array, topK: number = 10): Array<{itemId: string, similarity: number}> {
    const similarities: Array<{itemId: string, similarity: number}> = [];

    for (const [itemId, vector] of this.vectors) {
      const similarity = this.cosineSimilarity(queryVector, vector);
      similarities.push({ itemId, similarity });
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Calculate vector statistics
   */
  getVectorStats(): {
    count: number;
    dimension: number;
    averageMagnitude: number;
  } {
    if (this.vectors.size === 0) {
      return { count: 0, dimension: this.dimension, averageMagnitude: 0 };
    }

    let totalMagnitude = 0;
    for (const vector of this.vectors.values()) {
      let magnitude = 0;
      for (let i = 0; i < vector.length; i++) {
        const val = vector[i] ?? 0;
        magnitude += val * val;
      }
      totalMagnitude += Math.sqrt(magnitude);
    }

    return {
      count: this.vectors.size,
      dimension: this.dimension,
      averageMagnitude: totalMagnitude / this.vectors.size
    };
  }

  private estimateMemoryUsage(): number {
    // Rough estimation: Float32Array uses 4 bytes per element
    const vectorMemory = this.vectors.size * this.dimension * 4;

    // Map overhead and pointers
    const mapOverhead = this.vectors.size * 50;

    return vectorMemory + mapOverhead;
  }

  /**
   * Add vector to HNSW graph
   */
  private addToHNSW(itemId: string, vector: Float32Array): void {
    // Initialize graph node
    this.hnswGraph.set(itemId, new Set());

    // If this is the first node, set it as entry point
    if (!this.entryPoint) {
      this.entryPoint = itemId;
      return;
    }

    // Find nearest neighbors for new node
    const candidates = this.searchLayer(vector, this.annConfig.efConstruction);
    
    // Connect to M nearest neighbors
    const connections = Math.min(this.annConfig.maxConnections, candidates.length);
    for (let i = 0; i < connections; i++) {
      const neighborId = candidates[i].itemId;
      
      // Add bidirectional connection
      this.hnswGraph.get(itemId)?.add(neighborId);
      this.hnswGraph.get(neighborId)?.add(itemId);
      
      // Prune connections if neighbor has too many
      this.pruneConnections(neighborId);
    }
  }

  /**
   * Query using HNSW graph
   */
  private queryHNSW(queryVector: Float32Array, options: QueryOptions): Set<string> {
    if (!this.entryPoint) {
      return new Set();
    }

    this.hitCount++;

    // Search the graph starting from entry point
    const candidates = this.searchLayer(queryVector, this.annConfig.efSearch);
    
    // Apply threshold and limit
    const threshold = options.threshold || 0.7;
    const limit = options.limit || 10;

    const results = candidates
      .filter(item => item.similarity >= threshold)
      .slice(0, limit)
      .map(item => item.itemId);

    return new Set(results);
  }

  /**
   * Search layer in HNSW graph
   */
  private searchLayer(queryVector: Float32Array, ef: number): Array<{itemId: string, similarity: number}> {
    const visited = new Set<string>();
    const candidates: Array<{itemId: string, similarity: number}> = [];
    const w = new Set<string>();

    if (!this.entryPoint) {
      return [];
    }

    // Start with entry point
    const entryVector = this.vectors.get(this.entryPoint);
    if (!entryVector) {
      return [];
    }

    const entrySimilarity = this.cosineSimilarity(queryVector, entryVector);
    candidates.push({ itemId: this.entryPoint, similarity: entrySimilarity });
    w.add(this.entryPoint);
    visited.add(this.entryPoint);

    while (candidates.length > 0) {
      // Get closest unvisited candidate
      candidates.sort((a, b) => b.similarity - a.similarity);
      const current = candidates.shift();
      if (!current) break;

      // Check if we should continue searching
      if (w.size >= ef && current.similarity < Math.min(...Array.from(w).map(id => {
        const vec = this.vectors.get(id);
        return vec ? this.cosineSimilarity(queryVector, vec) : 0;
      }))) {
        break;
      }

      // Explore neighbors
      const neighbors = this.hnswGraph.get(current.itemId);
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            
            const neighborVector = this.vectors.get(neighborId);
            if (neighborVector) {
              const similarity = this.cosineSimilarity(queryVector, neighborVector);
              candidates.push({ itemId: neighborId, similarity });
              w.add(neighborId);
              
              // Keep only ef best candidates
              if (w.size > ef) {
                const worstId = Array.from(w).reduce((worst, id) => {
                  const worstVec = this.vectors.get(worst);
                  const currentVec = this.vectors.get(id);
                  if (!worstVec || !currentVec) return worst;
                  
                  const worstSim = this.cosineSimilarity(queryVector, worstVec);
                  const currentSim = this.cosineSimilarity(queryVector, currentVec);
                  return currentSim < worstSim ? id : worst;
                });
                w.delete(worstId);
              }
            }
          }
        }
      }
    }

    // Return sorted results
    return Array.from(w).map(id => {
      const vector = this.vectors.get(id);
      const similarity = vector ? this.cosineSimilarity(queryVector, vector) : 0;
      return { itemId: id, similarity };
    }).sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Prune connections for a node to maintain max connections
   */
  private pruneConnections(nodeId: string): void {
    const connections = this.hnswGraph.get(nodeId);
    if (!connections || connections.size <= this.annConfig.maxConnections) {
      return;
    }

    const nodeVector = this.vectors.get(nodeId);
    if (!nodeVector) {
      return;
    }

    // Calculate similarities to all connected nodes
    const connectionSimilarities = Array.from(connections).map(connId => {
      const connVector = this.vectors.get(connId);
      const similarity = connVector ? this.cosineSimilarity(nodeVector, connVector) : 0;
      return { itemId: connId, similarity };
    });

    // Keep only the best connections
    connectionSimilarities.sort((a, b) => b.similarity - a.similarity);
    const keepConnections = connectionSimilarities
      .slice(0, this.annConfig.maxConnections)
      .map(conn => conn.itemId);

    // Remove excess connections
    for (const connId of connections) {
      if (!keepConnections.includes(connId)) {
        connections.delete(connId);
        // Remove reverse connection
        this.hnswGraph.get(connId)?.delete(nodeId);
      }
    }
  }
}
