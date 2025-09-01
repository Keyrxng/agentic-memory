/**
 * Multimodal Embedding Processor
 *
 * Handles embedding generation for different modalities:
 * - Text embeddings (via local-stt-tts)
 * - Vision embeddings (prepared for future image processing)
 * - Multimodal fusion (combining multiple modalities)
 *
 * This processor provides the foundation for fully featured vision capabilities
 * in the agentic memory stack.
 */

import { generateEmbeddings, generateVisionEmbeddings } from 'local-stt-tts';
import { VectorUtils, type EmbeddingConfig } from './vector-utils.js';
import { EmbeddingService, type EmbeddingDocument } from './embedding-service.js';
import { createHash } from 'crypto';
import { preprocessImageBuffer, preprocessImagePath, pickTargetForDimensions, TARGETS } from './image-preprocessor.js';

export interface TextContent {
  type: 'text';
  content: string;
  metadata?: {
    language?: string;
    encoding?: string;
    length?: number;
  };
}

export interface VisionContent {
  type: 'vision';
  imageData: string; // Base64 encoded image or image path
  metadata?: {
  format?: string;
  width?: number;
  height?: number;
  size?: number;
  [key: string]: any;
  };
}

export interface MultimodalContent {
  type: 'multimodal';
  components: Array<TextContent | VisionContent>;
  metadata?: {
    primaryModality?: 'text' | 'vision';
    fusionStrategy?: 'concat' | 'attention' | 'cross_modal' | 'weighted_average';
  };
}

export type ContentInput = TextContent | VisionContent | MultimodalContent;

export interface ProcessingResult {
  embedding: Float32Array;
  modalityEmbeddings: Map<string, Float32Array>;
  confidence: number;
  processingTime: number;
  metadata: Record<string, any>;
}

export interface MultimodalConfig {
  /** Text embedding configuration */
  text: EmbeddingConfig;
  /** Vision embedding configuration (for future use) */
  vision: EmbeddingConfig;
  /** Multimodal fusion configuration */
  fusion: {
    strategy: 'concat' | 'attention' | 'cross_modal' | 'weighted_average';
    weights?: { text?: number; vision?: number };
    projectionDim?: number;
  };
  /** Processing options */
  processing: {
    enableCaching: boolean;
    maxConcurrency: number;
    timeout: number;
  };
}

export class MultimodalEmbeddingProcessor {
  private config: MultimodalConfig;
  private embeddingService: EmbeddingService;
  private processingCache = new Map<string, ProcessingResult>();

  constructor(config: Partial<MultimodalConfig> = {}) {
    this.config = {
      text: {
        provider: 'ollama',
        model: 'mxbai-embed-large:latest',
        dimensions: 1024
      },
      vision: {
        provider: 'ollama', 
        model: 'llava:7b', 
      },
      fusion: {
        strategy: 'weighted_average',
        weights: { text: 0.7, vision: 0.3 },
        projectionDim: 768
      },
      processing: {
        enableCaching: true,
        maxConcurrency: 4,
        timeout: 30000
      },
      ...config
    };

    this.embeddingService = new EmbeddingService({
      defaultConfig: this.config.text,
      cache: {
        enabled: this.config.processing.enableCaching,
        maxSize: 1000
      }
    });
  }

  /**
   * Process content and generate multimodal embedding
   */
  async processContent(content: ContentInput): Promise<ProcessingResult> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(content);

    // Check cache
    if (this.config.processing.enableCaching) {
      const cached = this.processingCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let result: ProcessingResult;

    switch (content.type) {
      case 'text':
        result = await this.processTextContent(content);
        break;
      case 'vision':
        result = await this.processVisionContent(content);
        break;
      case 'multimodal':
        result = await this.processMultimodalContent(content);
        break;
      default:
        throw new Error(`Unsupported content type: ${(content as any).type}`);
    }

    result.processingTime = Date.now() - startTime;

    // Cache result
    if (this.config.processing.enableCaching) {
      this.processingCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Process text content
   */
  private async processTextContent(content: TextContent): Promise<ProcessingResult> {
    const embedding = await VectorUtils.generateEmbedding(content.content, this.config.text);

    return {
      embedding,
      modalityEmbeddings: new Map([['text', embedding]]),
      confidence: 0.95, // High confidence for text embeddings
      processingTime: 0, // Will be set by caller
      metadata: {
        modality: 'text',
        contentLength: content.content.length,
        language: content.metadata?.language || 'unknown',
        ...content.metadata
      }
    };
  }

  /**
   * Process vision content using LLaVA 1.6
   */
  private async processVisionContent(content: VisionContent): Promise<ProcessingResult> {
    try {
      // Prepare image data for LLaVA 1.6: preprocess to supported targets (resize + pad)
      const prompt = "Describe this image in detail for embedding generation";

      let imageInput = content.imageData;

      try {
        if (typeof imageInput === 'string') {
          if (imageInput.startsWith('data:')) {
            // base64 data URI -> extract and preprocess buffer
            const parts = imageInput.split(',');
            const b64 = parts[1] || '';
            const buf = Buffer.from(b64, 'base64');
            const pre = await preprocessImageBuffer(buf);
            const newB64 = pre.buffer.toString('base64');
            imageInput = `data:image/jpeg;base64,${newB64}`;
            // attach metadata
            content.metadata = { ...(content.metadata || {}), preprocessedTarget: pre.target.name, preprocessedDimensions: `${pre.width}x${pre.height}` };
          } else {
            // treat as file path
            try {
              const pre = await preprocessImagePath(imageInput);
              const newB64 = pre.buffer.toString('base64');
              imageInput = `data:image/jpeg;base64,${newB64}`;
              content.metadata = { ...(content.metadata || {}), preprocessedTarget: pre.target.name, preprocessedDimensions: `${pre.width}x${pre.height}` };
            } catch (err) {
              // If file path preprocessing fails, leave original and continue
              console.warn('Image preprocessing from path failed, continuing with original image:', err);
            }
          }
        }

        const images = [imageInput];

        // Generate vision embedding using LLaVA 1.6 (LLM -> canonical text -> text embedding)
        const visionResult = await generateVisionEmbeddings({
          provider: this.config.vision.provider,
          model: this.config.vision.model,
          input: imageInput,
          images: images,
          prompt: prompt
        });

        // Compute image hash (sha256) for provenance/caching
        const imageHash = createHash('sha256').update(imageInput).digest('hex');
        content.metadata = { ...(content.metadata || {}), imageHash };

        // Convert returned embedding to Float32Array safely
        const embedding = visionResult.embedding instanceof Float32Array
          ? visionResult.embedding
          : new Float32Array(visionResult.embedding || []);

        return {
          embedding,
          modalityEmbeddings: new Map([['vision', embedding]]),
          confidence: 0.85, // Higher confidence with actual vision model
          processingTime: 0,
          metadata: {
            modality: 'vision',
            isPlaceholder: false,
            model: visionResult.model,
            provider: visionResult.provider,
            imageCount: visionResult.imageCount,
            imageHash,
            imageFormat: content.metadata?.format,
            dimensions: content.metadata?.preprocessedDimensions || `${content.metadata?.width}x${content.metadata?.height}`,
            // Include the parsed LLM output and the canonical text that was embedded
            llmOutput: (visionResult as any).llmOutput,
            textToEmbed: (visionResult as any).textToEmbed,
            ...content.metadata
          }
        };

      } catch (error) {
        console.warn('Vision processing failed, falling back to text description:', error);

        // Fallback to text-based description if vision processing fails
        const textDescription = `[IMAGE: ${content.metadata?.format || 'unknown'} format, ` +
          `${content.metadata?.width || 0}x${content.metadata?.height || 0}]`;

        const embedding = await VectorUtils.generateEmbedding(textDescription, this.config.text);

        return {
          embedding,
          modalityEmbeddings: new Map([['vision', embedding]]),
          confidence: 0.3, // Low confidence for fallback
          processingTime: 0,
          metadata: {
            modality: 'vision',
            isPlaceholder: true,
            fallback: true,
            error: error instanceof Error ? error.message : 'Unknown error',
            imageFormat: content.metadata?.format,
            dimensions: `${content.metadata?.width}x${content.metadata?.height}`,
            ...content.metadata
          }
        };
      }
    } catch (error) {
      console.warn('Vision processing failed, falling back to text description:', error);

      // Fallback to text-based description if vision processing fails
      const textDescription = `[IMAGE: ${content.metadata?.format || 'unknown'} format, ` +
        `${content.metadata?.width || 0}x${content.metadata?.height || 0}]`;

      const embedding = await VectorUtils.generateEmbedding(textDescription, this.config.text);

      return {
        embedding,
        modalityEmbeddings: new Map([['vision', embedding]]),
        confidence: 0.3, // Low confidence for fallback
        processingTime: 0,
        metadata: {
          modality: 'vision',
          isPlaceholder: true,
          fallback: true,
          error: error instanceof Error ? error.message : 'Unknown error',
          imageFormat: content.metadata?.format,
          dimensions: `${content.metadata?.width}x${content.metadata?.height}`,
          ...content.metadata
        }
      };
    }
  }

  /**
   * Process multimodal content with fusion
   */
  private async processMultimodalContent(content: MultimodalContent): Promise<ProcessingResult> {
    const modalityEmbeddings = new Map<string, Float32Array>();
    const componentResults: ProcessingResult[] = [];

    // Process each component
    for (let i = 0; i < content.components.length; i++) {
      const component = content.components[i];
      const result = await this.processContent(component);
      componentResults.push(result);

      // Store by modality type
      const modalityKey = `${component.type}_${i}`;
      modalityEmbeddings.set(modalityKey, result.embedding);
    }

    // Fuse embeddings based on strategy
    const fusedEmbedding = await this.fuseEmbeddings(componentResults, content);

    // Calculate overall confidence
    const avgConfidence = componentResults.reduce((sum, r) => sum + r.confidence, 0) / componentResults.length;

    return {
      embedding: fusedEmbedding,
      modalityEmbeddings,
      confidence: avgConfidence,
      processingTime: 0,
      metadata: {
        modality: 'multimodal',
        componentCount: content.components.length,
        fusionStrategy: this.config.fusion.strategy,
        modalities: content.components.map(c => c.type),
        ...content.metadata
      }
    };
  }

  /**
   * Fuse multiple embeddings using configured strategy
   */
  private async fuseEmbeddings(
    componentResults: ProcessingResult[],
    content: MultimodalContent
  ): Promise<Float32Array> {
    const embeddings = componentResults.map(r => r.embedding);

    switch (this.config.fusion.strategy) {
      case 'weighted_average':
        const weights = componentResults.map((_, i) => {
          const component = content.components[i];
          if (component.type === 'text') return this.config.fusion.weights?.text || 0.5;
          if (component.type === 'vision') return this.config.fusion.weights?.vision || 0.5;
          return 0.5;
        });
        return VectorUtils.combineEmbeddings(embeddings, weights);

      case 'concat':
        // Concatenate all embeddings
        const totalLength = embeddings.reduce((sum, emb) => sum + emb.length, 0);
        const concatenated = new Float32Array(totalLength);
        let offset = 0;
        for (const embedding of embeddings) {
          concatenated.set(embedding, offset);
          offset += embedding.length;
        }
        return concatenated;

      case 'attention':
        // Simple attention mechanism (placeholder)
        // In practice, this would use a trained attention model
        return VectorUtils.combineEmbeddings(embeddings);

      case 'cross_modal':
        // Cross-modal fusion (placeholder for future implementation)
        return VectorUtils.combineEmbeddings(embeddings);

      default:
        return VectorUtils.combineEmbeddings(embeddings);
    }
  }

  /**
   * Process multiple contents in batch
   */
  async processBatch(contents: ContentInput[]): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    // Process in parallel with concurrency limit
    const concurrencyLimit = this.config.processing.maxConcurrency;
    for (let i = 0; i < contents.length; i += concurrencyLimit) {
      const batch = contents.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(content => this.processContent(content));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Add processed content to embedding service
   */
  async addToEmbeddingService(
    content: ContentInput,
    documentId: string,
    additionalMetadata?: Record<string, any>
  ): Promise<void> {
    const result = await this.processContent(content);

    const document: EmbeddingDocument = {
      id: documentId,
      content: this.extractContentString(content),
      type: content.type,
      metadata: {
        ...result.metadata,
        ...additionalMetadata,
        processingTime: result.processingTime,
        confidence: result.confidence
      },
      embedding: result.embedding
    };

    await this.embeddingService.addDocument(document);
  }

  /**
   * Search for similar content
   */
  async searchSimilar(
    query: ContentInput,
    options: {
      topK?: number;
      threshold?: number;
    } = {}
  ): Promise<Array<{
    document: EmbeddingDocument;
    score: number;
    rank: number;
  }>> {
    const queryResult = await this.processContent(query);
    return this.embeddingService.searchSimilar(queryResult.embedding, options);
  }

  /**
   * Get embedding service instance
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }

  /**
   * Clear processing cache
   */
  clearCache(): void {
    this.processingCache.clear();
    this.embeddingService.clear();
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    cacheSize: number;
    processedItems: number;
    embeddingServiceStats: any;
  } {
    return {
      cacheSize: this.processingCache.size,
      processedItems: this.processingCache.size,
      embeddingServiceStats: this.embeddingService.getStats()
    };
  }

  /**
   * Generate cache key for content
   */
  private generateCacheKey(content: ContentInput): string {
    const contentString = this.extractContentString(content);
    let hash = 0;
    for (let i = 0; i < contentString.length; i++) {
      const char = contentString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${content.type}_${hash}`;
  }

  /**
   * Extract string representation from content for hashing
   */
  private extractContentString(content: ContentInput): string {
    switch (content.type) {
      case 'text':
        return content.content;
      case 'vision':
        return content.imageData;
      case 'multimodal':
        return content.components.map(c => this.extractContentString(c)).join('|');
      default:
        return JSON.stringify(content);
    }
  }
}

/**
 * Factory function to create multimodal processor with vision capabilities
 */
export function createVisionEnabledProcessor(config?: Partial<MultimodalConfig>): MultimodalEmbeddingProcessor {
  return new MultimodalEmbeddingProcessor({
    vision: {
      provider: 'ollama',
      model: 'llava:7b', // Using LLaVA 1.6 for vision processing
    },
    fusion: {
      strategy: 'attention',
      weights: { text: 0.6, vision: 0.4 }
    },
    ...config
  });
}

/**
 * Utility function to prepare image content for processing
 */
export function prepareImageContent(
  imagePathOrData: string,
  metadata?: VisionContent['metadata']
): VisionContent {
  return {
    type: 'vision',
    imageData: imagePathOrData,
    metadata: {
      format: imagePathOrData.startsWith('data:') ? 'base64' : 'path',
      ...metadata
    }
  };
}

/**
 * Utility function to create multimodal content
 */
export function createMultimodalContent(
  components: Array<TextContent | VisionContent>,
  primaryModality: 'text' | 'vision' = 'text'
): MultimodalContent {
  return {
    type: 'multimodal',
    components,
    metadata: {
      primaryModality,
      fusionStrategy: 'weighted_average'
    }
  };
}
