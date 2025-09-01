/**
 * Unified Query Interface for Dual Graph Architecture
 *
 * Provides a single entry point for querying across lexical and domain graphs
 * with integrated memory management, clustering, entity resolution, and indexing.
 */

import type {
  DualGraphQuery,
  DualGraphQueryResult,
  LexicalGraph,
  DomainGraph,
  CrossGraphLink,
  GraphContext,
  TextChunk,
  EntityRecord,
  RelationshipRecord
} from '../core/types.js';
import { DualGraphIndexManager } from './dual-graph-index-manager.js';
import { QueryProcessor } from '../utils/query-processor.js';
import { EntityResolver } from '../utils/entity-resolver.js';
import { generateEmbeddings } from "local-stt-tts";

/**
 * Enhanced dual graph query with additional processing options
 */
export interface EnhancedDualGraphQuery extends DualGraphQuery {
  /** Memory management options */
  memory?: {
    prioritizeRecent?: boolean;
    includeClusters?: boolean;
  };
  /** Entity resolution options */
  resolution?: {
    enableFuzzyMatching?: boolean;
    confidenceThreshold?: number;
  };
  /** Processing options */
  processing?: {
    enableParallel?: boolean;
    maxResults?: number;
    sortBy?: 'relevance' | 'confidence' | 'timestamp' | 'cluster';
  };
}

/**
 * Unified Query Processor for Dual Graph Architecture
 *
 * Integrates all query capabilities across lexical and domain graphs
 * with memory management, clustering, and entity resolution.
 */
export class UnifiedQueryProcessor {
  private indexManager: DualGraphIndexManager;
  private queryProcessor: QueryProcessor;
  private entityResolver: EntityResolver;

  // Graph storage references
  private lexicalGraphs: Map<string, LexicalGraph> = new Map();
  private domainGraphs: Map<string, DomainGraph> = new Map();
  private crossGraphLinks: Map<string, CrossGraphLink> = new Map();

  constructor(indexManager: DualGraphIndexManager) {
    this.indexManager = indexManager;
    this.queryProcessor = new QueryProcessor();
    this.entityResolver = new EntityResolver();
  }

  /**
   * Execute an enhanced dual graph query
   */
  async executeQuery(
    query: EnhancedDualGraphQuery,
    context: GraphContext
  ): Promise<DualGraphQueryResult> {
    const startTime = Date.now();

    // Generate embeddings for text queries if needed
    let queryEmbedding: Float32Array | undefined;
    if (query.lexicalQuery?.textSearch && !query.lexicalQuery.vectorSearch) {
      try {
        const embeddings = await generateEmbeddings({
          provider: "ollama", // Default provider
          model: "mxbai-embed-large:latest", // Default embedding model
          input: query.lexicalQuery.textSearch
        });
        queryEmbedding = new Float32Array(embeddings.embedding);
        query.lexicalQuery.vectorSearch = queryEmbedding;
      } catch (error) {
        console.warn('Failed to generate embeddings for query:', error);
      }
    }

    // Execute lexical query
    const lexicalResults = await this.executeLexicalQuery(query.lexicalQuery, queryEmbedding);

    // Execute domain query - if no domain query but we have lexical text search, create a domain query
    let domainQuery = query.domainQuery;
    if (!domainQuery && query.lexicalQuery?.textSearch) {
      // Extract potential entity names from the text search
      const entityNames = this.extractEntityNamesFromQuery(query.lexicalQuery.textSearch);
      if (entityNames.length > 0) {
        domainQuery = { entityNames };
      }
    }

    const domainResults = await this.executeDomainQuery(domainQuery, queryEmbedding, query.lexicalQuery?.textSearch);

    // Execute cross-graph query
    const crossGraphResults = await this.executeCrossGraphQuery(query.crossGraphQuery);

    // Apply entity resolution if enabled
    if (query.resolution?.enableFuzzyMatching) {
      await this.applyEntityResolution(domainResults, query.resolution.confidenceThreshold || 0.8);
    }

    // Apply memory management prioritization
    if (query.memory?.prioritizeRecent) {
      this.prioritizeRecentResults(lexicalResults, domainResults);
    }

    // Include cluster information if requested
    if (query.memory?.includeClusters) {
      this.enhanceWithClusters(domainResults);
    }

    // Combine and rank results
    const combinedResults = this.combineAndRankResults(
      lexicalResults,
      domainResults,
      crossGraphResults,
      query.processing?.sortBy || 'relevance'
    );

    // Apply result limits
    const maxResults = query.processing?.maxResults || 50;
    if (combinedResults.length > maxResults) {
      combinedResults.splice(maxResults);
    }

    const processingTime = Date.now() - startTime;

    return {
      lexicalResults,
      domainResults,
      crossGraphResults,
      combinedResults,
      metadata: {
        queryTime: processingTime,
        totalResults: combinedResults.length,
        processingDetails: {
          lexicalProcessed: lexicalResults.chunks.length,
          domainProcessed: domainResults.entities.length,
          crossLinksProcessed: crossGraphResults.links.length,
          entityResolutionApplied: query.resolution?.enableFuzzyMatching || false,
          clusteringEnhanced: query.memory?.includeClusters || false
        }
      }
    };
  }

  /**
   * Execute lexical graph query
   */
  private async executeLexicalQuery(
    lexicalQuery?: DualGraphQuery['lexicalQuery'],
    queryEmbedding?: Float32Array
  ): Promise<DualGraphQueryResult['lexicalResults']> {
    if (!lexicalQuery) {
      return { chunks: [], relations: [], relevanceScores: new Map() };
    }

    const chunks: TextChunk[] = [];
    const relations: any[] = [];
    const relevanceScores = new Map<string, number>();

    // Search across all lexical graphs
    for (const [graphId, lexicalGraph] of this.lexicalGraphs) {
      // Text search
      if (lexicalQuery.textSearch) {
        const matchingChunks = Array.from(lexicalGraph.textChunks.values()).filter(chunk =>
          chunk.content.toLowerCase().includes(lexicalQuery.textSearch!.toLowerCase())
        );

        for (const chunk of matchingChunks) {
          if (!chunks.find(c => c.id === chunk.id)) {
            chunks.push(chunk);
            relevanceScores.set(chunk.id, 0.8);
          }
        }
      }

      // Vector search
      if (lexicalQuery.vectorSearch && queryEmbedding) {
        const vectorResults = this.indexManager['vectorIndex'].findSimilar(queryEmbedding, 20);

        for (const result of vectorResults) {
          const chunk = lexicalGraph.textChunks.get(result.itemId);
          if (chunk && !chunks.find(c => c.id === chunk.id)) {
            chunks.push(chunk);
            relevanceScores.set(chunk.id, result.similarity);
          }
        }
      }

      // Chunk type filtering
      if (lexicalQuery.chunkType) {
        const typeChunks = Array.from(lexicalGraph.textChunks.values()).filter(chunk =>
          chunk.metadata.chunkType === lexicalQuery.chunkType
        );

        for (const chunk of typeChunks) {
          if (!chunks.find(c => c.id === chunk.id)) {
            chunks.push(chunk);
            relevanceScores.set(chunk.id, 0.9);
          }
        }
      }
    }

    return { chunks, relations, relevanceScores };
  }

  /**
   * Execute domain graph query
   */
  private async executeDomainQuery(
    domainQuery?: DualGraphQuery['domainQuery'],
    queryEmbedding?: Float32Array,
    lexicalTextSearch?: string
  ): Promise<DualGraphQueryResult['domainResults']> {
    const entities: EntityRecord[] = [];
    const relationships: RelationshipRecord[] = [];
    const hierarchies: any[] = [];
    const relevanceScores = new Map<string, number>();

    // If no specific domain query, search all domain graphs
    if (!domainQuery) {
      // Search across all domain graphs for any content
      for (const [graphId, domainGraph] of this.domainGraphs) {
        entities.push(...Array.from(domainGraph.entities.values()));
        relationships.push(...Array.from(domainGraph.semanticRelations.values()));
        hierarchies.push(...Array.from(domainGraph.entityHierarchies.values()));
      }
      return { entities, relationships, hierarchies, relevanceScores };
    }

    // If we have a lexical text search but no specific domain filters, search all entities
    const hasLexicalTextSearch = queryEmbedding !== undefined || lexicalTextSearch !== undefined;
    const hasDomainFilters = domainQuery.entityTypes || domainQuery.entityNames || domainQuery.relationshipTypes;

    if (hasLexicalTextSearch && !hasDomainFilters) {
      // Search all entities for potential matches
      for (const [graphId, domainGraph] of this.domainGraphs) {
        // If we have lexical text search, also search entity properties
        if (lexicalTextSearch) {
          const searchTerm = lexicalTextSearch.toLowerCase();
          const matchingEntities = Array.from(domainGraph.entities.values()).filter(entity =>
            entity.name.toLowerCase().includes(searchTerm) ||
            Object.values(entity.properties).some(value =>
              typeof value === 'string' && value.toLowerCase().includes(searchTerm)
            )
          );
          entities.push(...matchingEntities);
        } else {
          entities.push(...Array.from(domainGraph.entities.values()));
        }
        relationships.push(...Array.from(domainGraph.semanticRelations.values()));
      }
      return { entities, relationships, hierarchies, relevanceScores };
    }

    // Search across all domain graphs
    for (const [graphId, domainGraph] of this.domainGraphs) {
      // Entity type filtering
      if (domainQuery.entityTypes) {
        const matchingEntities = Array.from(domainGraph.entities.values()).filter(entity =>
          domainQuery.entityTypes!.includes(entity.type)
        );

        for (const entity of matchingEntities) {
          if (!entities.find(e => e.id === entity.id)) {
            entities.push(entity);
            relevanceScores.set(entity.id, 0.9);
          }
        }
      }

      // Entity name search
      if (domainQuery.entityNames) {
        for (const entityName of domainQuery.entityNames) {
          const matchingEntities = Array.from(domainGraph.entities.values()).filter(entity =>
            entity.name.toLowerCase().includes(entityName.toLowerCase()) ||
            entityName.toLowerCase().includes(entity.name.toLowerCase())
          );

          for (const entity of matchingEntities) {
            if (!entities.find(e => e.id === entity.id)) {
              entities.push(entity);
              relevanceScores.set(entity.id, 0.8);
            }
          }
        }
      }

      // Vector search for entities
      if (queryEmbedding) {
        const vectorResults = this.indexManager['vectorIndex'].findSimilar(queryEmbedding, 20);

        for (const result of vectorResults) {
          const entity = domainGraph.entities.get(result.itemId);
          if (entity && !entities.find(e => e.id === entity.id)) {
            entities.push(entity);
            relevanceScores.set(entity.id, result.similarity);
          }
        }
      }

      // Relationship type filtering
      if (domainQuery.relationshipTypes) {
        const matchingRelationships = Array.from(domainGraph.semanticRelations.values()).filter(rel =>
          domainQuery.relationshipTypes!.includes(rel.type)
        );

        for (const relationship of matchingRelationships) {
          if (!relationships.find(r => r.id === relationship.id)) {
            relationships.push(relationship);
            relevanceScores.set(relationship.id, 0.7);
          }
        }
      }

      // Include all if no specific filters
      if (!domainQuery.entityTypes && !domainQuery.entityNames && !domainQuery.relationshipTypes && !queryEmbedding) {
        entities.push(...Array.from(domainGraph.entities.values()));
        relationships.push(...Array.from(domainGraph.semanticRelations.values()));
        hierarchies.push(...Array.from(domainGraph.entityHierarchies.values()));
      }
    }

    return { entities, relationships, hierarchies, relevanceScores };
  }

  /**
   * Execute cross-graph query
   */
  private async executeCrossGraphQuery(
    crossGraphQuery?: DualGraphQuery['crossGraphQuery']
  ): Promise<DualGraphQueryResult['crossGraphResults']> {
    if (!crossGraphQuery) {
      return { links: [], relevanceScores: new Map() };
    }

    const links: CrossGraphLink[] = [];
    const relevanceScores = new Map<string, number>();

    // Filter cross-graph links based on query
    for (const [id, link] of this.crossGraphLinks) {
      let include = true;

      if (crossGraphQuery.linkTypes && !crossGraphQuery.linkTypes.includes(link.type)) {
        include = false;
      }

      if (crossGraphQuery.sourceGraph && link.sourceGraph !== crossGraphQuery.sourceGraph) {
        include = false;
      }

      if (crossGraphQuery.targetGraph && link.targetGraph !== crossGraphQuery.targetGraph) {
        include = false;
      }

      if (include) {
        links.push(link);
        relevanceScores.set(link.id, link.confidence);
      }
    }

    return { links, relevanceScores };
  }

  /**
   * Apply entity resolution to domain results
   */
  private async applyEntityResolution(
    domainResults: DualGraphQueryResult['domainResults'],
    confidenceThreshold: number
  ): Promise<void> {
    const resolvedEntities: EntityRecord[] = [];

    for (const entity of domainResults.entities) {
      const resolution = this.entityResolver.resolveEntity(
        entity,
        new Map(domainResults.entities.map(e => [e.id, {
          id: e.id,
          type: e.type,
          properties: e.properties,
          embeddings: e.embeddings ? new Float32Array(e.embeddings) : undefined,
          createdAt: new Date(),
          updatedAt: new Date()
        }])),
        {
          fuzzyThreshold: confidenceThreshold,
          enableEmbeddings: true
        }
      );

      if (resolution.matched) {
        // Merge properties if different entity
        if (resolution.matched.id !== entity.id) {
          const merged = this.entityResolver.mergeEntityProperties(
            resolution.matched,
            entity,
            {
              userId: 'system',
              timestamp: new Date()
            }
          );
          resolvedEntities.push(merged);
        } else {
          resolvedEntities.push(entity);
        }
      } else {
        resolvedEntities.push(entity);
      }
    }

    domainResults.entities = resolvedEntities;
  }

  /**
   * Prioritize recent results based on memory access patterns
   */
  private prioritizeRecentResults(
    lexicalResults: DualGraphQueryResult['lexicalResults'],
    domainResults: DualGraphQueryResult['domainResults']
  ): void {
    // Integrate with memory manager to boost recently accessed items
    const memoryStats = this.indexManager.getMemoryStats();
    const recentlyAccessed = new Set(memoryStats.recentlyAccessed || []);
    const accessFrequency = memoryStats.accessFrequency || new Map();

    // Sort lexical chunks by multiple factors: access frequency, recency, and creation time
    lexicalResults.chunks.sort((a, b) => {
      const aFreq = accessFrequency.get(a.id) || 0;
      const bFreq = accessFrequency.get(b.id) || 0;
      const aRecent = recentlyAccessed.has(a.id) ? 1 : 0;
      const bRecent = recentlyAccessed.has(b.id) ? 1 : 0;
      const aTime = new Date(a.metadata.timestamp).getTime();
      const bTime = new Date(b.metadata.timestamp).getTime();

      // Weighted scoring: 40% recent access, 30% frequency, 30% timestamp
      const aScore = (aRecent * 0.4) + (aFreq * 0.3) + (aTime * 0.3);
      const bScore = (bRecent * 0.4) + (bFreq * 0.3) + (bTime * 0.3);
      
      return bScore - aScore;
    });

    // Sort domain entities using similar logic
    domainResults.entities.sort((a, b) => {
      const aFreq = accessFrequency.get(a.id) || 0;
      const bFreq = accessFrequency.get(b.id) || 0;
      const aRecent = recentlyAccessed.has(a.id) ? 1 : 0;
      const bRecent = recentlyAccessed.has(b.id) ? 1 : 0;

      // For entities, prioritize access patterns over timestamps
      const aScore = (aRecent * 0.6) + (aFreq * 0.4);
      const bScore = (bRecent * 0.6) + (bFreq * 0.4);
      
      return bScore - aScore;
    });

    // Boost relevance scores for recently accessed items
    for (const chunk of lexicalResults.chunks.slice(0, 10)) {
      const currentScore = lexicalResults.relevanceScores.get(chunk.id) || 0;
      let boost = 1.0;
      
      if (recentlyAccessed.has(chunk.id)) {
        boost += 0.3; // 30% boost for recently accessed
      }
      
      const frequency = accessFrequency.get(chunk.id) || 0;
      if (frequency > 5) {
        boost += Math.min(0.2, frequency / 50); // Up to 20% boost for frequent access
      }
      
      lexicalResults.relevanceScores.set(chunk.id, Math.min(1.0, currentScore * boost));
    }

    // Apply similar boost to domain entities
    for (const entity of domainResults.entities.slice(0, 10)) {
      const currentScore = domainResults.relevanceScores.get(entity.id) || 0;
      let boost = 1.0;
      
      if (recentlyAccessed.has(entity.id)) {
        boost += 0.3;
      }
      
      const frequency = accessFrequency.get(entity.id) || 0;
      if (frequency > 3) {
        boost += Math.min(0.25, frequency / 40); // Up to 25% boost for entities
      }
      
      domainResults.relevanceScores.set(entity.id, Math.min(1.0, currentScore * boost));
    }

    // Mark these items as accessed for future prioritization
    for (const chunk of lexicalResults.chunks.slice(0, 5)) {
      this.indexManager.markAccessed(chunk.id);
    }
    for (const entity of domainResults.entities.slice(0, 5)) {
      this.indexManager.markAccessed(entity.id);
    }
  }

  /**
   * Enhance results with cluster information
   */
  private enhanceWithClusters(
    domainResults: DualGraphQueryResult['domainResults']
  ): void {
    // Integrate cluster information from the index manager
    const clusteringStats = this.indexManager.getClusteringStats();
    const clusters = this.indexManager.getClusters();

    if (clusters.length === 0) {
      return; // No clusters to process
    }

    // Create cluster lookup maps for efficient searching
    const entityToCluster = new Map<string, string>();
    const clusterDetails = new Map<string, any>();

    for (const cluster of clusters) {
      clusterDetails.set(cluster.id, {
        id: cluster.id,
        centroid: cluster.centroid,
        size: cluster.entityIds.length,
        confidence: cluster.confidence,
        theme: cluster.theme,
        lastUpdated: cluster.lastUpdated
      });

      // Map each entity to its cluster
      for (const entityId of cluster.entityIds) {
        entityToCluster.set(entityId, cluster.id);
      }
    }

    // Enhance entities with their cluster information
    for (const entity of domainResults.entities) {
      const clusterId = entityToCluster.get(entity.id);
      
      if (clusterId) {
        const cluster = clusterDetails.get(clusterId);
        if (cluster) {
          // Add detailed cluster information to entity
          entity.properties.cluster = {
            id: clusterId,
            theme: cluster.theme,
            size: cluster.size,
            confidence: cluster.confidence,
            isRepresentative: this.isEntityRepresentativeOfCluster(entity, cluster),
            relatedEntities: this.findRelatedEntitiesInCluster(entity.id, clusterId, clusters),
            centrality: this.calculateEntityCentrality(entity.id, cluster)
          };

          // Boost relevance score for entities in well-formed clusters
          const currentScore = domainResults.relevanceScores.get(entity.id) || 0;
          const clusterBoost = this.calculateClusterBoost(cluster);
          domainResults.relevanceScores.set(entity.id, Math.min(1.0, currentScore * clusterBoost));
        }
      } else {
        // Entity is not in any cluster - mark as isolated
        entity.properties.cluster = {
          id: null,
          theme: 'isolated',
          size: 1,
          confidence: 0,
          isRepresentative: true,
          relatedEntities: [],
          centrality: 0
        };
      }
    }

    // Add cluster-wide statistics to domain results
    (domainResults as any).clusterInfo = {
      totalClusters: clusteringStats.totalClusters,
      averageClusterSize: clusteringStats.averageClusterSize,
      largestCluster: clusteringStats.largestCluster,
      clusterDistribution: this.getClusterDistribution(clusters),
      queryClusterCoverage: this.calculateQueryClusterCoverage(domainResults.entities, entityToCluster)
    };

    // Sort entities to prioritize those in high-quality clusters
    domainResults.entities.sort((a, b) => {
      const aClusterConf = a.properties.cluster?.confidence || 0;
      const bClusterConf = b.properties.cluster?.confidence || 0;
      const aScore = domainResults.relevanceScores.get(a.id) || 0;
      const bScore = domainResults.relevanceScores.get(b.id) || 0;
      
      // Primary sort by relevance, secondary by cluster confidence
      const aTotalScore = aScore + (aClusterConf * 0.1);
      const bTotalScore = bScore + (bClusterConf * 0.1);
      
      return bTotalScore - aTotalScore;
    });
  }

  /**
   * Determine if an entity is representative of its cluster
   */
  private isEntityRepresentativeOfCluster(entity: EntityRecord, cluster: any): boolean {
    // Check if entity type matches cluster theme
    if (cluster.theme && entity.type === cluster.theme) {
      return true;
    }

    // Check if entity has high centrality in cluster
    const centrality = this.calculateEntityCentrality(entity.id, cluster);
    return centrality > 0.7; // Threshold for being representative
  }

  /**
   * Find related entities in the same cluster
   */
  private findRelatedEntitiesInCluster(entityId: string, clusterId: string, clusters: any[]): string[] {
    const cluster = clusters.find(c => c.id === clusterId);
    if (!cluster) return [];

    return cluster.entityIds
      .filter((id: string) => id !== entityId)
      .slice(0, 5); // Return up to 5 related entities
  }

  /**
   * Calculate entity centrality within its cluster
   */
  private calculateEntityCentrality(entityId: string, cluster: any): number {
    if (!cluster.centroid || cluster.size <= 1) {
      return 1.0; // Single entity clusters have max centrality
    }

    // Simple centrality based on distance from cluster centroid
    // In a real implementation, this would use proper graph centrality measures
    const normalizedPosition = 1.0 / cluster.size;
    return Math.min(1.0, normalizedPosition * 2); // Normalize to 0-1 range
  }

  /**
   * Calculate boost factor based on cluster quality
   */
  private calculateClusterBoost(cluster: any): number {
    let boost = 1.0;

    // Boost for well-formed clusters
    if (cluster.confidence > 0.8) {
      boost += 0.2;
    } else if (cluster.confidence > 0.6) {
      boost += 0.1;
    }

    // Boost for appropriately sized clusters
    if (cluster.size >= 3 && cluster.size <= 10) {
      boost += 0.1;
    }

    // Boost for recent clusters
    if (cluster.lastUpdated && (Date.now() - new Date(cluster.lastUpdated).getTime()) < 24 * 60 * 60 * 1000) {
      boost += 0.05;
    }

    return boost;
  }

  /**
   * Get distribution of cluster sizes
   */
  private getClusterDistribution(clusters: any[]): Record<string, number> {
    const distribution: Record<string, number> = {
      small: 0,    // 2-3 entities
      medium: 0,   // 4-7 entities  
      large: 0,    // 8+ entities
      singleton: 0 // 1 entity
    };

    for (const cluster of clusters) {
      const size = cluster.entityIds.length;
      if (size === 1) distribution.singleton++;
      else if (size <= 3) distribution.small++;
      else if (size <= 7) distribution.medium++;
      else distribution.large++;
    }

    return distribution;
  }

  /**
   * Calculate what percentage of query results are covered by clusters
   */
  private calculateQueryClusterCoverage(entities: EntityRecord[], entityToCluster: Map<string, string>): number {
    if (entities.length === 0) return 0;

    const clusteredEntities = entities.filter(entity => entityToCluster.has(entity.id)).length;
    return clusteredEntities / entities.length;
  }

  /**
   * Combine and rank results from all graphs
   */
  private combineAndRankResults(
    lexicalResults: DualGraphQueryResult['lexicalResults'],
    domainResults: DualGraphQueryResult['domainResults'],
    crossGraphResults: DualGraphQueryResult['crossGraphResults'],
    sortBy: string
  ): Array<{
    id: string;
    type: 'lexical' | 'domain' | 'cross';
    relevance: number;
    metadata: any;
  }> {
    const combined: Array<{
      id: string;
      type: 'lexical' | 'domain' | 'cross';
      relevance: number;
      metadata: any;
    }> = [];

    // Add lexical results
    for (const chunk of lexicalResults.chunks) {
      combined.push({
        id: chunk.id,
        type: 'lexical',
        relevance: lexicalResults.relevanceScores.get(chunk.id) || 0.5,
        metadata: {
          content: chunk.content.substring(0, 100) + '...',
          chunkType: chunk.metadata.chunkType,
          timestamp: chunk.metadata.timestamp
        }
      });
    }

    // Add domain results
    for (const entity of domainResults.entities) {
      combined.push({
        id: entity.id,
        type: 'domain',
        relevance: domainResults.relevanceScores.get(entity.id) || 0.6,
        metadata: {
          name: entity.name,
          type: entity.type,
          properties: entity.properties
        }
      });
    }

    for (const relationship of domainResults.relationships) {
      combined.push({
        id: relationship.id,
        type: 'domain',
        relevance: domainResults.relevanceScores.get(relationship.id) || 0.4,
        metadata: {
          type: relationship.type,
          source: relationship.source,
          target: relationship.target,
          confidence: relationship.confidence
        }
      });
    }

    // Add cross-graph results
    for (const link of crossGraphResults.links) {
      combined.push({
        id: link.id,
        type: 'cross',
        relevance: crossGraphResults.relevanceScores.get(link.id) || 0.3,
        metadata: {
          type: link.type,
          sourceGraph: link.sourceGraph,
          targetGraph: link.targetGraph,
          confidence: link.confidence
        }
      });
    }

    // Sort by relevance or other criteria
    switch (sortBy) {
      case 'relevance':
        combined.sort((a, b) => b.relevance - a.relevance);
        break;
      case 'confidence':
        combined.sort((a, b) => {
          const aConfidence = b.metadata.confidence || b.relevance;
          const bConfidence = a.metadata.confidence || a.relevance;
          return aConfidence - bConfidence;
        });
        break;
      case 'timestamp':
        combined.sort((a, b) => {
          const aTime = new Date(b.metadata.timestamp || 0).getTime();
          const bTime = new Date(a.metadata.timestamp || 0).getTime();
          return aTime - bTime;
        });
        break;
      default:
        combined.sort((a, b) => b.relevance - a.relevance);
    }

    return combined;
  }

  /**
   * Extract potential entity names from a text query
   */
  private extractEntityNamesFromQuery(query: string): string[] {
    const entityNames: string[] = [];

    // Simple heuristics to extract potential entity names
    // Look for capitalized words that might be names
    const words = query.split(/\s+/);
    for (const word of words) {
      // Check if word starts with capital letter and is not a common word
      if (word.length > 1 &&
          word[0] === word[0].toUpperCase() &&
          !['Who', 'What', 'Where', 'When', 'Why', 'How', 'The', 'A', 'An', 'Is', 'Are', 'Do', 'Does'].includes(word)) {
        entityNames.push(word);
      }
    }

    // Also add the full query as a fallback
    if (entityNames.length === 0) {
      entityNames.push(query);
    }

    return entityNames;
  }

  /**
   * Update graph references from external source
   */
  updateGraphReferences(
    lexicalGraphs: Map<string, LexicalGraph>,
    domainGraphs: Map<string, DomainGraph>,
    crossGraphLinks: Map<string, CrossGraphLink>
  ): void {
    this.lexicalGraphs = lexicalGraphs;
    this.domainGraphs = domainGraphs;
    this.crossGraphLinks = crossGraphLinks;
  }

  /**
   * Get query statistics
   */
  getQueryStats(): {
    lexicalGraphs: number;
    domainGraphs: number;
    crossGraphLinks: number;
    indexStats: any;
  } {
    return {
      lexicalGraphs: this.lexicalGraphs.size,
      domainGraphs: this.domainGraphs.size,
      crossGraphLinks: this.crossGraphLinks.size,
      indexStats: this.indexManager.getStats()
    };
  }
}
