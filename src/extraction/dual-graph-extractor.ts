/**
 * Dual Graph Extractor
 * 
 * Main orchestrator for building dual graphs that combines:
 * - Lexical graph for textual content and retrieval
 * - Domain graph for semantic relationships and entities
 * - Cross-graph links for bridging both structures
 * 
 * This is the core component that implements the dual graph architecture.
 */

import type {
  DualGraphResult,
  GraphContext,
  CrossGraphLink
} from '../core/types.js';
import { LexicalGraphExtractor } from './lexical-extractor.js';
import { DomainGraphExtractor } from './domain-extractor.js';
import { CrossGraphLinker } from './cross-graph-linker.js';
import { MultimodalEmbeddingProcessor, type ContentInput } from '../utils/multimodal-processor.js';

/**
 * Configuration for dual graph extraction
 */
export interface DualGraphExtractionConfig {
  /** Lexical extraction configuration */
  lexical: {
    minChunkSize: number;
    maxChunkSize: number;
    enableSentenceChunking: boolean;
    enableParagraphChunking: boolean;
    enableEmbeddings: boolean;
    enableLexicalRelations: boolean;
  };
  /** Domain extraction configuration */
  domain: {
    enableHierarchies: boolean;
    enableTaxonomies: boolean;
    enableOrganizationalStructures: boolean;
    enableConceptClustering: boolean;
    minHierarchyConfidence: number;
  };
  /** Cross-graph linking configuration */
  linking: {
    enableEntityMentions: boolean;
    enableEvidenceSupport: boolean;
    enableSemanticGrounding: boolean;
    enableTemporalAlignment: boolean;
    minLinkConfidence: number;
    maxLinksPerEntity: number;
  };
  /** Processing options */
  processing: {
    enableParallelProcessing: boolean;
    enableProgressTracking: boolean;
    enableDetailedLogging: boolean;
    enableMultimodalProcessing: boolean;
  };
}

/**
 * Progress tracking for dual graph extraction
 */
export interface ExtractionProgress {
  stage: 'lexical' | 'domain' | 'linking' | 'complete';
  progress: number; // 0-100
  currentOperation: string;
  estimatedTimeRemaining?: number;
}

/**
 * Dual graph extractor for building comprehensive knowledge structures
 */
export class DualGraphExtractor {
  private config: DualGraphExtractionConfig;
  private lexicalExtractor: LexicalGraphExtractor;
  private domainExtractor: DomainGraphExtractor;
  private crossGraphLinker: CrossGraphLinker;
  private multimodalProcessor: MultimodalEmbeddingProcessor;

  constructor(config: Partial<DualGraphExtractionConfig> = {}) {
    this.config = {
      lexical: {
        minChunkSize: config.lexical?.minChunkSize ?? 50,
        maxChunkSize: config.lexical?.maxChunkSize ?? 1000,
        enableSentenceChunking: config.lexical?.enableSentenceChunking ?? true,
        enableParagraphChunking: config.lexical?.enableParagraphChunking ?? true,
        enableEmbeddings: config.lexical?.enableEmbeddings ?? true,
        enableLexicalRelations: config.lexical?.enableLexicalRelations ?? true,
        ...config.lexical
      },
      domain: {
        enableHierarchies: config.domain?.enableHierarchies ?? true,
        enableTaxonomies: config.domain?.enableTaxonomies ?? true,
        enableOrganizationalStructures: config.domain?.enableOrganizationalStructures ?? true,
        enableConceptClustering: config.domain?.enableConceptClustering ?? true,
        minHierarchyConfidence: config.domain?.minHierarchyConfidence ?? 0.7,
        ...config.domain
      },
      linking: {
        enableEntityMentions: config.linking?.enableEntityMentions ?? true,
        enableEvidenceSupport: config.linking?.enableEvidenceSupport ?? true,
        enableSemanticGrounding: config.linking?.enableSemanticGrounding ?? true,
        enableTemporalAlignment: config.linking?.enableTemporalAlignment ?? true,
        minLinkConfidence: config.linking?.minLinkConfidence ?? 0.6,
        maxLinksPerEntity: config.linking?.maxLinksPerEntity ?? 10,
        ...config.linking
      },
      processing: {
        enableParallelProcessing: config.processing?.enableParallelProcessing ?? false,
        enableProgressTracking: config.processing?.enableProgressTracking ?? true,
        enableDetailedLogging: config.processing?.enableDetailedLogging ?? false,
        enableMultimodalProcessing: config.processing?.enableMultimodalProcessing ?? false,
        ...config.processing
      }
    };

    // Initialize extractors
    this.lexicalExtractor = new LexicalGraphExtractor(this.config.lexical);
    this.domainExtractor = new DomainGraphExtractor(this.config.domain);
    this.crossGraphLinker = new CrossGraphLinker(this.config.linking);
    
    // Initialize multimodal processor if enabled
    if (this.config.processing.enableMultimodalProcessing) {
      this.multimodalProcessor = new MultimodalEmbeddingProcessor();
    }
  }

  /**
   * Extract dual graphs from text
   */
  async extractDualGraphs(
    text: string,
    context: GraphContext,
    progressCallback?: (progress: ExtractionProgress) => void
  ): Promise<DualGraphResult> {
    const startTime = Date.now();
    
    if (this.config.processing.enableDetailedLogging) {
      console.log('🚀 Starting dual graph extraction...');
      console.log(`📝 Text length: ${text.length} characters`);
      console.log(`🔧 Context: ${context.source} (${context.sessionId})`);
    }

    // Update progress
    if (progressCallback) {
      progressCallback({
        stage: 'lexical',
        progress: 0,
        currentOperation: 'Initializing lexical extraction...'
      });
    }

    // 1. Extract lexical graph (textual content and retrieval)
    if (this.config.processing.enableDetailedLogging) {
      console.log('📚 Extracting lexical graph...');
    }

    const lexicalGraph = await this.lexicalExtractor.extractLexicalGraph(text, context);
    
    if (progressCallback) {
      progressCallback({
        stage: 'lexical',
        progress: 50,
        currentOperation: 'Lexical graph extracted, starting domain extraction...'
      });
    }

    // 2. Extract domain graph (semantic relationships and entities)
    if (this.config.processing.enableDetailedLogging) {
      console.log('🏗️ Extracting domain graph...');
    }

    const domainGraph = await this.domainExtractor.extractDomainGraph(text, context);
    
    if (progressCallback) {
      progressCallback({
        stage: 'domain',
        progress: 75,
        currentOperation: 'Domain graph extracted, creating cross-graph links...'
      });
    }

    // 3. Create cross-graph links
    if (this.config.processing.enableDetailedLogging) {
      console.log('🔗 Creating cross-graph links...');
    }

    const crossLinks = await this.crossGraphLinker.createCrossGraphLinks(
      lexicalGraph,
      domainGraph,
      context
    );
    
    if (progressCallback) {
      progressCallback({
        stage: 'linking',
        progress: 90,
        currentOperation: 'Cross-graph links created, finalizing...'
      });
    }

    // 4. Calculate final statistics
    const processingTime = Date.now() - startTime;
    const chunksCreated = lexicalGraph.textChunks.size;
    const entitiesExtracted = domainGraph.entities.size;
    const relationshipsExtracted = domainGraph.semanticRelations.size;
    const crossLinksCreated = crossLinks.length;

    if (this.config.processing.enableDetailedLogging) {
      console.log('✅ Dual graph extraction completed!');
      console.log(`📊 Results:`);
      console.log(`   - Text chunks: ${chunksCreated}`);
      console.log(`   - Entities: ${entitiesExtracted}`);
      console.log(`   - Relationships: ${relationshipsExtracted}`);
      console.log(`   - Cross-graph links: ${crossLinksCreated}`);
      console.log(`   - Processing time: ${processingTime}ms`);
    }

    // Update progress
    if (progressCallback) {
      progressCallback({
        stage: 'complete',
        progress: 100,
        currentOperation: 'Dual graph extraction completed'
      });
    }

    return {
      lexicalGraph,
      domainGraph,
      crossLinks,
      metadata: {
        processingTime,
        textLength: text.length,
        chunksCreated,
        entitiesExtracted,
        relationshipsExtracted,
        crossLinksCreated
      }
    };
  }

  /**
   * Extract dual graphs from multimodal content
   */
  async extractDualGraphsFromMultimodal(
    content: ContentInput,
    context: GraphContext,
    progressCallback?: (progress: ExtractionProgress) => void
  ): Promise<DualGraphResult> {
    if (!this.config.processing.enableMultimodalProcessing || !this.multimodalProcessor) {
      throw new Error('Multimodal processing is not enabled');
    }

    const startTime = Date.now();
    
    if (this.config.processing.enableDetailedLogging) {
      console.log('🚀 Starting multimodal dual graph extraction...');
      console.log(`🎯 Content type: ${content.type}`);
    }

    // Update progress
    if (progressCallback) {
      progressCallback({
        stage: 'lexical',
        progress: 0,
        currentOperation: 'Processing multimodal content...'
      });
    }

    // Process multimodal content to extract enriched text
    const processedResult = await this.multimodalProcessor.processContent(content);
    
    // Use the enriched text content for standard dual graph extraction
    const enrichedText = this.combineMultimodalResults(processedResult);
    
    if (progressCallback) {
      progressCallback({
        stage: 'lexical',
        progress: 25,
        currentOperation: 'Extracting from processed content...'
      });
    }

    // Extract dual graphs from the enriched text
    const result = await this.extractDualGraphs(enrichedText, context, progressCallback);
    
    // Enhance the result metadata with multimodal information
    result.metadata = {
      ...result.metadata,
      multimodalProcessing: {
        contentType: content.type,
        processedComponents: content.type === 'multimodal' ? content.components.length : 1,
        enrichedTextLength: enrichedText.length
      }
    };

    const processingTime = Date.now() - startTime;
    
    if (this.config.processing.enableDetailedLogging) {
      console.log(`✅ Multimodal dual graph extraction completed in ${processingTime}ms`);
    }

    return result;
  }

  /**
   * Combine multimodal processing results into enriched text
   */
  private combineMultimodalResults(processedResult: any): string {
    let enrichedText = '';
    
    // Extract text content
    if (processedResult.textEmbedding && processedResult.textContent) {
      enrichedText += processedResult.textContent;
    }
    
    // Add vision-derived information if available
    if (processedResult.visionEmbedding && processedResult.visionMetadata) {
      enrichedText += `\n\nImage analysis: `;
      if (processedResult.visionMetadata.description) {
        enrichedText += processedResult.visionMetadata.description;
      }
      if (processedResult.visionMetadata.detectedObjects) {
        enrichedText += `\nDetected objects: ${processedResult.visionMetadata.detectedObjects.join(', ')}`;
      }
    }
    
    // Add multimodal fusion insights
    if (processedResult.fusedEmbedding && processedResult.insights) {
      enrichedText += `\n\nMultimodal insights: ${processedResult.insights}`;
    }
    
    return enrichedText;
  }

  /**
   * Extract dual graphs with parallel processing
   */
  async extractDualGraphsParallel(
    text: string,
    context: GraphContext,
    progressCallback?: (progress: ExtractionProgress) => void
  ): Promise<DualGraphResult> {
    if (!this.config.processing.enableParallelProcessing) {
      return this.extractDualGraphs(text, context, progressCallback);
    }

    const startTime = Date.now();
    
    if (this.config.processing.enableDetailedLogging) {
      console.log('🚀 Starting parallel dual graph extraction...');
    }

    // Update progress
    if (progressCallback) {
      progressCallback({
        stage: 'lexical',
        progress: 0,
        currentOperation: 'Starting parallel extraction...'
      });
    }

    // Extract lexical and domain graphs in parallel
    const [lexicalGraph, domainGraph] = await Promise.all([
      this.lexicalExtractor.extractLexicalGraph(text, context),
      this.domainExtractor.extractDomainGraph(text, context)
    ]);

    if (progressCallback) {
      progressCallback({
        stage: 'linking',
        progress: 75,
        currentOperation: 'Parallel extraction completed, creating cross-graph links...'
      });
    }

    // Create cross-graph links
    const crossLinks = await this.crossGraphLinker.createCrossGraphLinks(
      lexicalGraph,
      domainGraph,
      context
    );

    // Calculate final statistics
    const processingTime = Date.now() - startTime;
    const chunksCreated = lexicalGraph.textChunks.size;
    const entitiesExtracted = domainGraph.entities.size;
    const relationshipsExtracted = domainGraph.semanticRelations.size;
    const crossLinksCreated = crossLinks.length;

    if (this.config.processing.enableDetailedLogging) {
      console.log('✅ Parallel dual graph extraction completed!');
      console.log(`📊 Results:`);
      console.log(`   - Text chunks: ${chunksCreated}`);
      console.log(`   - Entities: ${entitiesExtracted}`);
      console.log(`   - Relationships: ${relationshipsExtracted}`);
      console.log(`   - Cross-graph links: ${crossLinksCreated}`);
      console.log(`   - Processing time: ${processingTime}ms`);
    }

    // Update progress
    if (progressCallback) {
      progressCallback({
        stage: 'complete',
        progress: 100,
        currentOperation: 'Parallel dual graph extraction completed'
      });
    }

    return {
      lexicalGraph,
      domainGraph,
      crossLinks,
      metadata: {
        processingTime,
        textLength: text.length,
        chunksCreated,
        entitiesExtracted,
        relationshipsExtracted,
        crossLinksCreated
      }
    };
  }

  /**
   * Get extraction statistics
   */
  getExtractionStats(): {
    lexical: {
      chunkingEnabled: boolean;
      embeddingEnabled: boolean;
      relationsEnabled: boolean;
    };
    domain: {
      hierarchiesEnabled: boolean;
      taxonomiesEnabled: boolean;
      organizationalEnabled: boolean;
    };
    linking: {
      entityMentionsEnabled: boolean;
      evidenceSupportEnabled: boolean;
      semanticGroundingEnabled: boolean;
      temporalAlignmentEnabled: boolean;
    };
    processing: {
      parallelEnabled: boolean;
      progressTrackingEnabled: boolean;
      detailedLoggingEnabled: boolean;
      multimodalEnabled: boolean;
    };
  } {
    return {
      lexical: {
        chunkingEnabled: this.config.lexical.enableSentenceChunking || this.config.lexical.enableParagraphChunking,
        embeddingEnabled: this.config.lexical.enableEmbeddings,
        relationsEnabled: this.config.lexical.enableLexicalRelations
      },
      domain: {
        hierarchiesEnabled: this.config.domain.enableHierarchies,
        taxonomiesEnabled: this.config.domain.enableTaxonomies,
        organizationalEnabled: this.config.domain.enableOrganizationalStructures
      },
      linking: {
        entityMentionsEnabled: this.config.linking.enableEntityMentions,
        evidenceSupportEnabled: this.config.linking.enableEvidenceSupport,
        semanticGroundingEnabled: this.config.linking.enableSemanticGrounding,
        temporalAlignmentEnabled: this.config.linking.enableTemporalAlignment
      },
      processing: {
        parallelEnabled: this.config.processing.enableParallelProcessing,
        progressTrackingEnabled: this.config.processing.enableProgressTracking,
        detailedLoggingEnabled: this.config.processing.enableDetailedLogging,
        multimodalEnabled: this.config.processing.enableMultimodalProcessing
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DualGraphExtractionConfig>): void {
    if (updates.lexical) {
      this.config.lexical = { ...this.config.lexical, ...updates.lexical };
      this.lexicalExtractor = new LexicalGraphExtractor(this.config.lexical);
    }
    
    if (updates.domain) {
      this.config.domain = { ...this.config.domain, ...updates.domain };
      this.domainExtractor = new DomainGraphExtractor(this.config.domain);
    }
    
    if (updates.linking) {
      this.config.linking = { ...this.config.linking, ...updates.linking };
      this.crossGraphLinker = new CrossGraphLinker(this.config.linking);
    }
    
    if (updates.processing) {
      this.config.processing = { ...this.config.processing, ...updates.processing };
      
      // Reinitialize multimodal processor if the setting changed
      if (updates.processing.enableMultimodalProcessing !== undefined) {
        if (this.config.processing.enableMultimodalProcessing && !this.multimodalProcessor) {
          this.multimodalProcessor = new MultimodalEmbeddingProcessor();
        } else if (!this.config.processing.enableMultimodalProcessing) {
          this.multimodalProcessor = undefined as any;
        }
      }
    }
  }

  /**
   * Validate extraction configuration
   */
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate lexical configuration
    if (this.config.lexical.minChunkSize >= this.config.lexical.maxChunkSize) {
      errors.push('Lexical minChunkSize must be less than maxChunkSize');
    }

    if (this.config.lexical.minChunkSize < 10) {
      errors.push('Lexical minChunkSize must be at least 10 characters');
    }

    if (this.config.lexical.maxChunkSize > 10000) {
      errors.push('Lexical maxChunkSize must be at most 10000 characters');
    }

    // Validate domain configuration
    if (this.config.domain.minHierarchyConfidence < 0 || this.config.domain.minHierarchyConfidence > 1) {
      errors.push('Domain minHierarchyConfidence must be between 0 and 1');
    }

    // Validate linking configuration
    if (this.config.linking.minLinkConfidence < 0 || this.config.linking.minLinkConfidence > 1) {
      errors.push('Linking minLinkConfidence must be between 0 and 1');
    }

    if (this.config.linking.maxLinksPerEntity < 1) {
      errors.push('Linking maxLinksPerEntity must be at least 1');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
