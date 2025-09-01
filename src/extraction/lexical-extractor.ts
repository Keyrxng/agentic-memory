/**
 * Lexical Graph Extractor
 * 
 * Focuses on textual content and retrieval by:
 * - Segmenting text into meaningful chunks
 * - Building lexical relationships between chunks
 * - Creating retrieval indices for efficient text search
 * - Generating embeddings for similarity search
 * 
 * This extractor builds the "lexical" side of the dual graph architecture.
 */

import { generateEmbeddings } from 'local-stt-tts';
import type {
  TextChunk,
  LexicalRelation,
  LexicalGraph,
  GraphContext
} from '../core/types.js';

/**
 * Configuration for lexical extraction
 */
export interface LexicalExtractionConfig {
  /** Minimum chunk size in characters */
  minChunkSize: number;
  /** Maximum chunk size in characters */
  maxChunkSize: number;
  /** Enable sentence-level chunking */
  enableSentenceChunking: boolean;
  /** Enable paragraph-level chunking */
  enableParagraphChunking: boolean;
  /** Enable semantic chunking */
  enableSemanticChunking: boolean;
  /** Minimum confidence for chunk quality */
  minChunkConfidence: number;
  /** Enable embedding generation */
  enableEmbeddings: boolean;
  /** Embedding model to use */
  embeddingModel?: string;
  /** Enable lexical relationship building */
  enableLexicalRelations: boolean;
  /** Co-occurrence window size */
  coOccurrenceWindow: number;
}

/**
 * Result of lexical extraction
 */
export interface LexicalExtractionResult {
  /** Extracted text chunks */
  chunks: TextChunk[];
  /** Lexical relationships between chunks */
  lexicalRelations: LexicalRelation[];
  /** Generated embeddings */
  embeddings: Map<string, Float32Array>;
  /** Extraction metadata */
  metadata: {
    textLength: number;
    chunksCreated: number;
    relationsCreated: number;
    processingTime: number;
    chunkingMethod: string;
  };
}

/**
 * Lexical graph extractor for textual content and retrieval
 */
export class LexicalGraphExtractor {
  private config: LexicalExtractionConfig;

  constructor(config: Partial<LexicalExtractionConfig> = {}) {
    this.config = {
      minChunkSize: config.minChunkSize ?? 50,
      maxChunkSize: config.maxChunkSize ?? 1000,
      enableSentenceChunking: config.enableSentenceChunking ?? true,
      enableParagraphChunking: config.enableParagraphChunking ?? true,
      enableSemanticChunking: config.enableSemanticChunking ?? false,
      minChunkConfidence: config.minChunkConfidence ?? 0.7,
      enableEmbeddings: config.enableEmbeddings ?? true,
      embeddingModel: config.embeddingModel ?? 'default',
      enableLexicalRelations: config.enableLexicalRelations ?? true,
      coOccurrenceWindow: config.coOccurrenceWindow ?? 5,
      ...config
    };
  }

  /**
   * Extract lexical graph from text
   */
  async extractLexicalGraph(
    text: string,
    context: GraphContext
  ): Promise<LexicalGraph> {
    const startTime = Date.now();
    
    // 1. Segment text into chunks
    const chunks = this.segmentText(text, context);
    
    // 2. Generate embeddings for chunks
    const embeddings = this.config.enableEmbeddings 
      ? await this.generateChunkEmbeddings(chunks)
      : new Map<string, Float32Array>();
    
    // 3. Build lexical relationships
    const lexicalRelations = this.config.enableLexicalRelations
      ? this.buildLexicalRelations(chunks)
      : [];
    
    // 4. Create retrieval indices
    const retrievalIndices = this.buildRetrievalIndices(chunks, embeddings);
    
    const processingTime = Date.now() - startTime;
    
    return {
      id: `lexical_${context.sessionId}_${Date.now()}`,
      type: 'lexical',
      textChunks: new Map(chunks.map(c => [c.id, c])),
      lexicalRelations: new Map(lexicalRelations.map(r => [r.id, r])),
      embeddings,
      retrievalIndices,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Segment text into meaningful chunks
   */
  private segmentText(text: string, context: GraphContext): TextChunk[] {
    const chunks: TextChunk[] = [];
    let chunkId = 0;
    
    if (this.config.enableSentenceChunking) {
      // Sentence-level chunking
      const sentences = this.extractSentences(text);
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        if (sentence.length >= this.config.minChunkSize && 
            sentence.length <= this.config.maxChunkSize) {
          
          const confidence = this.calculateChunkConfidence(sentence);
          if (confidence >= this.config.minChunkConfidence) {
            chunks.push({
              id: `chunk_${chunkId++}`,
              content: sentence,
              metadata: {
                source: context.source,
                timestamp: context.timestamp,
                chunkType: 'sentence',
                position: i,
                confidence
              }
            });
          }
        }
      }
    }
    
    if (this.config.enableParagraphChunking && chunks.length === 0) {
      // Fallback to paragraph-level chunking
      const paragraphs = text.split(/\n\s*\n/);
      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();
        if (paragraph.length >= this.config.minChunkSize && 
            paragraph.length <= this.config.maxChunkSize) {
          
          const confidence = this.calculateChunkConfidence(paragraph);
          if (confidence >= this.config.minChunkConfidence) {
            chunks.push({
              id: `chunk_${chunkId++}`,
              content: paragraph,
              metadata: {
                source: context.source,
                timestamp: context.timestamp,
                chunkType: 'paragraph',
                position: i,
                confidence
              }
            });
          }
        }
      }
    }
    
    // If still no chunks, create document-level chunk
    if (chunks.length === 0) {
      chunks.push({
        id: `chunk_${chunkId++}`,
        content: text,
        metadata: {
          source: context.source,
          timestamp: context.timestamp,
          chunkType: 'document',
          position: 0,
          confidence: 1.0
        }
      });
    }
    
    return chunks;
  }

  /**
   * Extract sentences from text
   */
  private extractSentences(text: string): string[] {
    // Simple sentence boundary detection
    // This could be enhanced with more sophisticated NLP
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  /**
   * Calculate confidence in chunk quality
   */
  private calculateChunkConfidence(chunk: string): number {
    let confidence = 1.0;
    
    // Penalize very short chunks
    if (chunk.length < this.config.minChunkSize) {
      confidence *= 0.5;
    }
    
    // Penalize very long chunks
    if (chunk.length > this.config.maxChunkSize) {
      confidence *= 0.7;
    }
    
    // Reward chunks with good sentence structure
    if (/[.!?]$/.test(chunk)) {
      confidence *= 1.1;
    }
    
    // Penalize chunks with excessive whitespace
    const whitespaceRatio = (chunk.match(/\s/g) || []).length / chunk.length;
    if (whitespaceRatio > 0.3) {
      confidence *= 0.8;
    }
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Generate embeddings for text chunks
   */
  private async generateChunkEmbeddings(chunks: TextChunk[]): Promise<Map<string, Float32Array>> {
    const embeddings = new Map<string, Float32Array>();
    
    try {
      for (const chunk of chunks) {
        const embedding = await generateEmbeddings({
          provider: 'ollama',
          model: this.config.embeddingModel || 'qwen3:1.7b',
          input: chunk.content
        });
        
        if (embedding && embedding.embedding.length > 0) {
          embeddings.set(chunk.id, new Float32Array(embedding.embedding));
        }
      }
    } catch (error) {
      console.warn('Failed to generate embeddings for some chunks:', error);
    }
    
    return embeddings;
  }

  /**
   * Build lexical relationships between chunks
   */
  private buildLexicalRelations(chunks: TextChunk[]): LexicalRelation[] {
    const relations: LexicalRelation[] = [];
    let relationId = 0;
    
    // Build sequential relationships
    for (let i = 0; i < chunks.length - 1; i++) {
      relations.push({
        id: `lex_rel_${relationId++}`,
        source: chunks[i].id,
        target: chunks[i + 1].id,
        type: 'sequential',
        weight: 1.0,
        metadata: {
          sourcePosition: chunks[i].metadata.position,
          targetPosition: chunks[i + 1].metadata.position
        },
        createdAt: new Date()
      });
    }
    
    // Build co-occurrence relationships
    if (this.config.coOccurrenceWindow > 0) {
      for (let i = 0; i < chunks.length; i++) {
        const windowStart = Math.max(0, i - this.config.coOccurrenceWindow);
        const windowEnd = Math.min(chunks.length, i + this.config.coOccurrenceWindow + 1);
        
        for (let j = windowStart; j < windowEnd; j++) {
          if (i !== j) {
            const weight = this.calculateCoOccurrenceWeight(i, j, this.config.coOccurrenceWindow);
            relations.push({
              id: `lex_rel_${relationId++}`,
              source: chunks[i].id,
              target: chunks[j].id,
              type: 'co_occurrence',
              weight,
              metadata: {
                windowSize: this.config.coOccurrenceWindow,
                sourcePosition: chunks[i].metadata.position,
                targetPosition: chunks[j].metadata.position
              },
              createdAt: new Date()
            });
          }
        }
      }
    }
    
    return relations;
  }

  /**
   * Calculate co-occurrence weight based on distance
   */
  private calculateCoOccurrenceWeight(pos1: number, pos2: number, windowSize: number): number {
    const distance = Math.abs(pos1 - pos2);
    if (distance === 0) return 0;
    
    // Inverse distance weighting
    return Math.max(0.1, 1.0 - (distance / windowSize));
  }

  /**
   * Build retrieval indices for efficient querying
   */
  private buildRetrievalIndices(
    chunks: TextChunk[],
    embeddings: Map<string, Float32Array>
  ): LexicalGraph['retrievalIndices'] {
    const textIndex = new Map<string, Set<string>>();
    const vectorIndex = new Map<string, Float32Array>();
    const chunkTypeIndex = new Map<string, Set<string>>();
    
    // Build text index (word -> chunk IDs)
    for (const chunk of chunks) {
      const words = chunk.content.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length >= 2) { // Minimum word length
          if (!textIndex.has(word)) {
            textIndex.set(word, new Set());
          }
          textIndex.get(word)!.add(chunk.id);
        }
      }
    }
    
    // Build vector index
    for (const [chunkId, embedding] of embeddings) {
      vectorIndex.set(chunkId, embedding);
    }
    
    // Build chunk type index
    for (const chunk of chunks) {
      const chunkType = chunk.metadata.chunkType;
      if (!chunkTypeIndex.has(chunkType)) {
        chunkTypeIndex.set(chunkType, new Set());
      }
      chunkTypeIndex.get(chunkType)!.add(chunk.id);
    }
    
    return {
      textIndex,
      vectorIndex,
      chunkTypeIndex
    };
  }

  /**
   * Query the lexical graph
   */
  queryLexicalGraph(
    graph: LexicalGraph,
    query: {
      textSearch?: string;
      chunkType?: string;
      source?: string;
      limit?: number;
    }
  ): TextChunk[] {
    let results = Array.from(graph.textChunks.values());
    
    // Filter by text search
    if (query.textSearch) {
      const searchTerms = query.textSearch.toLowerCase().split(/\s+/);
      results = results.filter(chunk => 
        searchTerms.some(term => 
          chunk.content.toLowerCase().includes(term)
        )
      );
    }
    
    // Filter by chunk type
    if (query.chunkType) {
      results = results.filter(chunk => 
        chunk.metadata.chunkType === query.chunkType
      );
    }
    
    // Filter by source
    if (query.source) {
      results = results.filter(chunk => 
        chunk.metadata.source === query.source
      );
    }
    
    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }
    
    return results;
  }
}
