/**
 * Embedding Service for Agentic Memory
 *
 * Provides a centralized service for generating, managing, and querying embeddings
 * across different modalities (text, vision, multimodal). Integrates with local-stt-tts
 * for embedding generation and provides caching, batch processing, and similarity search.
 */

import { generateEmbeddings } from 'local-stt-tts';
import { VectorUtils, type EmbeddingConfig, type EmbeddingBatch, type SimilarityResult } from './vector-utils.js';

export interface EmbeddingDocument {
  id: string;
  content: string;
  type: 'text' | 'vision' | 'multimodal';
  metadata?: Record<string, any>;
  embedding?: Float32Array;
}

export interface EmbeddingSearchResult {
  document: EmbeddingDocument;
  score: number;
  rank: number;
}

export interface EmbeddingServiceConfig {
  /** Default embedding configuration */
  defaultConfig: EmbeddingConfig;
  /** Cache configuration */
  cache: {
    enabled: boolean;
    maxSize: number;
    ttl?: number; // Time to live in milliseconds
  };
  /** Batch processing configuration */
  batch: {
    enabled: boolean;
    maxBatchSize: number;
    concurrency: number;
  };
  /** Similarity search configuration */
  search: {
    defaultTopK: number;
    defaultThreshold: number;
    maxResults: number;
  };
}

export class EmbeddingService {
  private config: EmbeddingServiceConfig;
  private cache: ReturnType<typeof VectorUtils.createEmbeddingCache>;
  private documents = new Map<string, EmbeddingDocument>();
  private embeddings = new Map<string, Float32Array>();
  private reverseIndex = new Map<string, Set<string>>(); // content hash -> document IDs

  constructor(config: Partial<EmbeddingServiceConfig> = {}) {
    this.config = {
      defaultConfig: {
        provider: 'ollama',
        model: 'mxbai-embed-large:latest',
        dimensions: 1024
      },
      cache: {
        enabled: true,
        maxSize: 10000,
        ttl: 24 * 60 * 60 * 1000 // 24 hours
      },
      batch: {
        enabled: true,
        maxBatchSize: 32,
        concurrency: 4
      },
      search: {
        defaultTopK: 10,
        defaultThreshold: 0.7,
        maxResults: 100
      },
      ...config
    };

    this.cache = VectorUtils.createEmbeddingCache(this.config.cache.maxSize);
  }

  /**
   * Add a document to the embedding service
   */
  async addDocument(document: EmbeddingDocument): Promise<void> {
    this.documents.set(document.id, document);

    // Generate embedding if not provided
    if (!document.embedding) {
      document.embedding = await this.generateEmbedding(document.content);
    }

    if (document.embedding) {
      this.embeddings.set(document.id, document.embedding);

      // Update reverse index for deduplication
      const contentHash = this.hashContent(document.content);
      if (!this.reverseIndex.has(contentHash)) {
        this.reverseIndex.set(contentHash, new Set());
      }
      this.reverseIndex.get(contentHash)!.add(document.id);
    }
  }

  /**
   * Add multiple documents in batch
   */
  async addDocuments(documents: EmbeddingDocument[]): Promise<void> {
    if (this.config.batch.enabled && documents.length > 1) {
      await this.addDocumentsBatch(documents);
    } else {
      for (const doc of documents) {
        await this.addDocument(doc);
      }
    }
  }

  /**
   * Batch processing for multiple documents
   */
  private async addDocumentsBatch(documents: EmbeddingDocument[]): Promise<void> {
    const docsWithoutEmbeddings = documents.filter(doc => !doc.embedding);

    if (docsWithoutEmbeddings.length > 0) {
      // Generate embeddings in batches
      const batches = this.chunkArray(docsWithoutEmbeddings, this.config.batch.maxBatchSize);

      for (const batch of batches) {
        const texts = batch.map(doc => doc.content);
        const batchResult = await VectorUtils.generateEmbeddingsBatch(texts, this.config.defaultConfig);

        // Assign embeddings back to documents
        for (let i = 0; i < batch.length; i++) {
          const doc = batch[i];
          if (i < batchResult.embeddings.length) {
            doc.embedding = batchResult.embeddings[i];
          }
        }
      }
    }

    // Add all documents
    for (const doc of documents) {
      await this.addDocument(doc);
    }
  }

  /**
   * Generate embedding for text content
   */
  async generateEmbedding(text: string, config?: Partial<EmbeddingConfig>): Promise<Float32Array> {
    const embeddingConfig = { ...this.config.defaultConfig, ...config };

    // Check cache first
    if (this.config.cache.enabled) {
      const cached = this.cache.get(text);
      if (cached) {
        return cached;
      }
    }

    // Generate new embedding
    const embedding = await VectorUtils.generateEmbedding(text, embeddingConfig);

    // Cache the result
    if (this.config.cache.enabled) {
      this.cache.set(text, embedding);
    }

    return embedding;
  }

  /**
   * Search for similar documents
   */
  async searchSimilar(
    query: string | Float32Array,
    options: {
      topK?: number;
      threshold?: number;
      type?: 'text' | 'vision' | 'multimodal';
      metadata?: Record<string, any>;
    } = {}
  ): Promise<EmbeddingSearchResult[]> {
    const {
      topK = this.config.search.defaultTopK,
      threshold = this.config.search.defaultThreshold,
      type,
      metadata
    } = options;

    // Get query embedding
    let queryEmbedding: Float32Array;
    if (typeof query === 'string') {
      queryEmbedding = await this.generateEmbedding(query);
    } else {
      queryEmbedding = query;
    }

    // Filter candidate documents
    let candidateIds = Array.from(this.embeddings.keys());

    if (type) {
      candidateIds = candidateIds.filter(id => {
        const doc = this.documents.get(id);
        return doc?.type === type;
      });
    }

    if (metadata) {
      candidateIds = candidateIds.filter(id => {
        const doc = this.documents.get(id);
        if (!doc?.metadata) return false;

        return Object.entries(metadata).every(([key, value]) =>
          doc.metadata![key] === value
        );
      });
    }

    // Get candidate embeddings
    const candidates = candidateIds
      .map(id => ({
        vector: this.embeddings.get(id)!,
        metadata: { documentId: id }
      }))
      .filter(candidate => candidate.vector);

    // Find similar vectors
    const similarResults = VectorUtils.findSimilarVectorsWithMetadata(
      queryEmbedding,
      candidates,
      Math.min(topK, this.config.search.maxResults),
      threshold
    );

    // Convert to search results
    const searchResults: EmbeddingSearchResult[] = [];
    for (let i = 0; i < similarResults.length; i++) {
      const result = similarResults[i];
      const documentId = result.metadata.documentId;
      const document = this.documents.get(documentId);

      if (document) {
        searchResults.push({
          document,
          score: result.score,
          rank: i + 1
        });
      }
    }

    return searchResults;
  }

  /**
   * Find documents by semantic similarity to multiple queries
   */
  async searchMultiModal(
    queries: Array<{ content: string; weight?: number; type?: string }>,
    options: {
      topK?: number;
      threshold?: number;
      combination?: 'weighted_average' | 'max' | 'concat';
    } = {}
  ): Promise<EmbeddingSearchResult[]> {
    const { combination = 'weighted_average' } = options;

    // Generate embeddings for all queries
    const queryEmbeddings: Float32Array[] = [];
    const weights: number[] = [];

    for (const query of queries) {
      const embedding = await this.generateEmbedding(query.content);
      queryEmbeddings.push(embedding);
      weights.push(query.weight || 1.0);
    }

    // Combine query embeddings
    let combinedQuery: Float32Array;
    switch (combination) {
      case 'weighted_average':
        combinedQuery = VectorUtils.combineEmbeddings(queryEmbeddings, weights);
        break;
      case 'max':
        // Take element-wise maximum
        combinedQuery = new Float32Array(queryEmbeddings[0].length);
        for (const embedding of queryEmbeddings) {
          for (let i = 0; i < embedding.length; i++) {
            combinedQuery[i] = Math.max(combinedQuery[i], embedding[i]);
          }
        }
        break;
      case 'concat':
        // Concatenate all embeddings
        const totalLength = queryEmbeddings.reduce((sum, emb) => sum + emb.length, 0);
        combinedQuery = new Float32Array(totalLength);
        let offset = 0;
        for (const embedding of queryEmbeddings) {
          combinedQuery.set(embedding, offset);
          offset += embedding.length;
        }
        break;
      default:
        combinedQuery = VectorUtils.combineEmbeddings(queryEmbeddings, weights);
    }

    // Search with combined query
    return this.searchSimilar(combinedQuery, options);
  }

  /**
   * Get document by ID
   */
  getDocument(id: string): EmbeddingDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Get all documents
   */
  getAllDocuments(): EmbeddingDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Get documents by type
   */
  getDocumentsByType(type: 'text' | 'vision' | 'multimodal'): EmbeddingDocument[] {
    return Array.from(this.documents.values()).filter(doc => doc.type === type);
  }

  /**
   * Remove document
   */
  removeDocument(id: string): boolean {
    const document = this.documents.get(id);
    if (!document) return false;

    this.documents.delete(id);
    this.embeddings.delete(id);

    // Update reverse index
    const contentHash = this.hashContent(document.content);
    const docSet = this.reverseIndex.get(contentHash);
    if (docSet) {
      docSet.delete(id);
      if (docSet.size === 0) {
        this.reverseIndex.delete(contentHash);
      }
    }

    return true;
  }

  /**
   * Clear all documents and cache
   */
  clear(): void {
    this.documents.clear();
    this.embeddings.clear();
    this.reverseIndex.clear();
    this.cache.clear();
  }

  /**
   * Get service statistics
   */
  getStats(): {
    documents: number;
    embeddings: number;
    cacheSize: number;
    cacheHitRate?: number;
    averageEmbeddingDimensions: number;
  } {
    const embeddingDimensions = Array.from(this.embeddings.values())
      .map(emb => emb.length);

    const averageDimensions = embeddingDimensions.length > 0
      ? embeddingDimensions.reduce((sum, dim) => sum + dim, 0) / embeddingDimensions.length
      : 0;

    return {
      documents: this.documents.size,
      embeddings: this.embeddings.size,
      cacheSize: this.cache.size(),
      averageEmbeddingDimensions: averageDimensions
    };
  }

  /**
   * Validate embedding quality across all documents
   */
  validateEmbeddings(): { isValid: boolean; issues: string[] } {
    const allEmbeddings = Array.from(this.embeddings.values());
    return VectorUtils.validateEmbeddings(allEmbeddings);
  }

  /**
   * Export embeddings for backup or transfer
   */
  exportEmbeddings(): {
    documents: EmbeddingDocument[];
    config: EmbeddingServiceConfig;
    timestamp: Date;
  } {
    return {
      documents: Array.from(this.documents.values()),
      config: this.config,
      timestamp: new Date()
    };
  }

  /**
   * Import embeddings from backup
   */
  async importEmbeddings(data: {
    documents: EmbeddingDocument[];
    config?: Partial<EmbeddingServiceConfig>;
  }): Promise<void> {
    // Update config if provided
    if (data.config) {
      this.config = { ...this.config, ...data.config };
    }

    // Clear existing data
    this.clear();

    // Import documents
    await this.addDocuments(data.documents);
  }

  /**
   * Create content hash for deduplication
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
