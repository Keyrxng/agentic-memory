/**
 * Dual Graph Index Manager
 *
 * Coordinates multi-modal indexing across lexical and domain graphs
 * in the dual graph architecture. Integrates all indexing types with
 * memory management and provides unified query capabilities.
 */

import type {
  GraphNode,
  GraphEdge,
  GraphQuery,
  QueryResult,
  LexicalGraph,
  DomainGraph,
  CrossGraphLink,
  TextChunk,
  EntityRecord,
  RelationshipRecord,
  DualGraphQuery,
  DualGraphQueryResult
} from '../core/types.js';
import type { GraphStorage } from '../storage/types.js';
import type { GraphPattern } from './pattern-index.js';
import type { IndexingConfig, IndexManager, IndexingStats } from '../indexing/types.js';

import { LabelIndex } from '../indexing/label-index.js';
import { PropertyIndex } from '../indexing/property-index.js';
import { TextIndex } from '../indexing/text-index.js';
import { VectorIndex } from '../indexing/vector-index.js';
import { PatternIndex } from '../indexing/pattern-index.js';

import { MemoryManager } from '../utils/memory-manager.js';
import { ClusteringEngine, type MemoryCluster } from '../utils/clustering-engine.js';
import { QueryProcessor } from '../utils/query-processor.js';
import { EntityResolver } from '../utils/entity-resolver.js';
import { DualGraphTemporalManager } from '../temporal/dual-graph-temporal-manager.js';

/**
 * Configuration for dual graph indexing
 */
export interface DualGraphIndexingConfig extends IndexingConfig {
  /** Memory management settings */
  memory: {
    maxMemoryNodes: number;
    evictionStrategy: 'lru' | 'lfu' | 'temporal';
  };
  /** Clustering settings */
  clustering: {
    enabled: boolean;
    similarityThreshold: number;
    maxClusters: number;
    minClusterSize: number;
  };
  /** Entity resolution settings */
  resolution: {
    fuzzyThreshold: number;
    enableEmbeddings: boolean;
  };
}

/**
 * Dual Graph Index Manager
 *
 * Manages indexing across both lexical and domain graphs with integrated
 * memory management, clustering, and entity resolution capabilities.
 */
export class DualGraphIndexManager implements IndexManager {
  // Core indices
  private labelIndex: LabelIndex;
  private propertyIndex: PropertyIndex;
  private textIndex: TextIndex;
  private vectorIndex: VectorIndex;
  private patternIndex: PatternIndex;

  // Utility integrations
  private memoryManager: MemoryManager;
  private clusteringEngine: ClusteringEngine;
  private queryProcessor: QueryProcessor;
  private entityResolver: EntityResolver;
  
  // Storage access for node retrieval
  private storage?: GraphStorage;

  // Dual graph storage references
  private lexicalGraphs: Map<string, LexicalGraph> = new Map();
  private domainGraphs: Map<string, DomainGraph> = new Map();
  private crossGraphLinks: Map<string, CrossGraphLink> = new Map();

  // Clustering results
  private clusters: Map<string, MemoryCluster> = new Map();

  // Temporal tracking manager
  private temporalManager: DualGraphTemporalManager;

  private config: DualGraphIndexingConfig;

  constructor(config: Partial<DualGraphIndexingConfig> = {}) {
    this.config = {
      enableLabelIndex: true,
      enablePropertyIndex: true,
      enableTextIndex: true,
      enableVectorIndex: true,
      enableStructureIndex: true,
      maxTextLength: 1000,
      vectorThreshold: 0.7,
      memoryLimit: 500 * 1024 * 1024, // 500MB
      memory: {
        maxMemoryNodes: 10000,
        evictionStrategy: 'lru',
        ...config.memory
      },
      clustering: {
        enabled: true,
        similarityThreshold: 0.7,
        maxClusters: 50,
        minClusterSize: 3,
        ...config.clustering
      },
      resolution: {
        fuzzyThreshold: 0.8,
        enableEmbeddings: true,
        ...config.resolution
      },
      ...config
    };

    // Initialize indices
    this.labelIndex = new LabelIndex();
    this.propertyIndex = new PropertyIndex();
    this.textIndex = new TextIndex();
    this.vectorIndex = new VectorIndex();
    this.patternIndex = new PatternIndex();

    // Initialize utilities
    this.memoryManager = new MemoryManager(this.config.memory);
    this.clusteringEngine = new ClusteringEngine();
    this.queryProcessor = new QueryProcessor();
    this.entityResolver = new EntityResolver();
    
    // Initialize temporal tracking
    this.temporalManager = new DualGraphTemporalManager({
      autoInvalidation: true,
      enableCrossGraphConsistency: true,
      defaultValidityPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
      eventValidityPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      stateValidityPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
    });
  }

  /**
   * Set storage instance for node retrieval
   */
  setStorage(storage: GraphStorage): void {
    this.storage = storage;
  }

  /**
   * Index a lexical graph
   */
  async indexLexicalGraph(graph: LexicalGraph): Promise<void> {
    this.lexicalGraphs.set(graph.id, graph);

    // Index text chunks
    for (const [chunkId, chunk] of graph.textChunks) {
      await this.indexTextChunk(chunk);
    }

    // Index lexical relations
    for (const [relationId, relation] of graph.lexicalRelations) {
      await this.indexLexicalRelation(relation);
    }
  }

  /**
   * Index a domain graph
   */
  async indexDomainGraph(graph: DomainGraph): Promise<void> {
    this.domainGraphs.set(graph.id, graph);

    // Index entities
    for (const [entityId, entity] of graph.entities) {
      await this.indexEntity(entity);
    }

    // Index relationships with temporal tracking
    for (const [relationId, relation] of graph.semanticRelations) {
      await this.indexRelationship(relation);
      
      // Track relationship temporally
      this.temporalManager.trackRelationship(
        relationId,
        relation,
        'domain',
        {
          userId: 'system',
          sessionId: graph.id,
          timestamp: new Date(),
          relevantEntities: [],
          source: 'domain_graph'
        }
      );
    }

    // Index hierarchies
    for (const [hierarchyId, hierarchy] of graph.entityHierarchies) {
      await this.indexHierarchy(hierarchy);
    }

    // Update entity resolver with current entities
    const graphNodes: GraphNode[] = Array.from(graph.entities.values()).map(entity => ({
      id: entity.id,
      type: entity.type,
      properties: entity.properties,
      embeddings: entity.embeddings ? new Float32Array(entity.embeddings) : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    this.entityResolver.updateIndex(graphNodes);

    // Perform clustering if enabled
    if (this.config.clustering.enabled) {
      await this.performClustering(graph);
    }
  }

  /**
   * Index cross-graph links
   */
  async indexCrossGraphLinks(links: CrossGraphLink[]): Promise<void> {
    for (const link of links) {
      this.crossGraphLinks.set(link.id, link);
      await this.indexCrossGraphLink(link);
      
      // Track cross-graph link temporally
      this.temporalManager.trackRelationship(
        link.id,
        link,
        'cross_graph',
        {
          userId: 'system',
          sessionId: `${link.sourceGraph}_${link.targetGraph}`,
          timestamp: new Date(),
          relevantEntities: [link.sourceId, link.targetId],
          source: 'cross_graph_link'
        }
      );
    }
  }

  /**
   * Index a text chunk from lexical graph
   */
  private async indexTextChunk(chunk: TextChunk): Promise<void> {
    // Label index for chunk types
    this.labelIndex.add('text_chunk', chunk.id);
    this.labelIndex.add(chunk.metadata.chunkType, chunk.id);

    // Property index for metadata
    for (const [key, value] of Object.entries(chunk.metadata)) {
      if (typeof value === 'string') {
        this.propertyIndex.add(`${key}:${value}`, chunk.id);
      }
    }

    // Text index for content
    this.textIndex.add(chunk.content, chunk.id);

    // Vector index for embeddings
    if (chunk.embeddings) {
      this.vectorIndex.add(chunk.embeddings, chunk.id);
    }

    // Memory tracking
    this.memoryManager.markAccessed(chunk.id);
  }

  /**
   * Index an entity from domain graph
   */
  private async indexEntity(entity: EntityRecord): Promise<void> {
    // Label index for entity types
    this.labelIndex.add('entity', entity.id);
    this.labelIndex.add(entity.type, entity.id);

    // Property index for entity properties
    for (const [key, value] of Object.entries(entity.properties)) {
      if (typeof value === 'string') {
        this.propertyIndex.add(`${key}:${value}`, entity.id);
      }
    }

    // Text index for name
    this.textIndex.add(entity.name, entity.id);

    // Vector index for embeddings
    if (entity.embeddings) {
      this.vectorIndex.add(new Float32Array(entity.embeddings), entity.id);
    }

    // Memory tracking
    this.memoryManager.markAccessed(entity.id);
  }

  /**
   * Index a relationship from domain graph
   */
  private async indexRelationship(relation: RelationshipRecord): Promise<void> {
    // Label index for relationship types
    this.labelIndex.add('relationship', relation.id);
    this.labelIndex.add(relation.type, relation.id);

    // Property index for relationship properties
    for (const [key, value] of Object.entries(relation.properties)) {
      if (typeof value === 'string') {
        this.propertyIndex.add(`${key}:${value}`, relation.id);
      }
    }

    // Pattern index for relationship patterns
    this.patternIndex.add({
      nodes: {
        source: { type: 'entity', variable: 'source' },
        target: { type: 'entity', variable: 'target' }
      },
      edges: [{
        type: relation.type,
        from: 'source',
        to: 'target',
        direction: 'out' as const
      }]
    }, relation.id);

    // Memory tracking
    this.memoryManager.markAccessed(relation.id);
  }

  /**
   * Index a lexical relation
   */
  private async indexLexicalRelation(relation: any): Promise<void> {
    // Label index for relation types
    this.labelIndex.add('lexical_relation', relation.id);
    this.labelIndex.add(relation.type, relation.id);

    // Pattern index for lexical patterns
    this.patternIndex.add({
      nodes: {
        source: { type: 'text_chunk', variable: 'source' },
        target: { type: 'text_chunk', variable: 'target' }
      },
      edges: [{
        type: relation.type,
        from: 'source',
        to: 'target',
        direction: 'out' as const,
      }]
    }, relation.id);

    // Memory tracking
    this.memoryManager.markAccessed(relation.id);
  }

  /**
   * Index a cross-graph link
   */
  private async indexCrossGraphLink(link: CrossGraphLink): Promise<void> {
    // Label index for link types
    this.labelIndex.add('cross_link', link.id);
    this.labelIndex.add(link.type, link.id);

    // Property index for link metadata
    for (const [key, value] of Object.entries(link.metadata)) {
      if (typeof value === 'string') {
        this.propertyIndex.add(`${key}:${value}`, link.id);
      }
    }

    // Memory tracking
    this.memoryManager.markAccessed(link.id);
  }

  /**
   * Index an entity hierarchy
   */
  private async indexHierarchy(hierarchy: any): Promise<void> {
    // Label index for hierarchy types
    this.labelIndex.add('hierarchy', hierarchy.id);
    this.labelIndex.add(hierarchy.type, hierarchy.id);

    // Pattern index for hierarchical patterns
    // This would index the parent-child relationships
    for (const [parentId, children] of hierarchy.parentChild) {
      for (const childId of children) {
        this.patternIndex.add({
          nodes: {
            parent: { type: 'entity', variable: 'parent' },
            child: { type: 'entity', variable: 'child' }
          },
          edges: [{
            type: 'parent_of',
            from: 'parent',
            to: 'child',
            direction: 'out' as const
          }]
        }, `${hierarchy.id}_${parentId}_${childId}`);
      }
    }

    // Memory tracking
    this.memoryManager.markAccessed(hierarchy.id);
  }

  /**
   * Perform clustering on domain graph entities
   */
  private async performClustering(graph: DomainGraph): Promise<void> {
    const entitiesWithEmbeddings = Array.from(graph.entities.values())
      .filter(entity => entity.embeddings)
      .map(entity => ({
        id: entity.id,
        type: entity.type,
        properties: entity.properties,
        embeddings: entity.embeddings ? new Float32Array(entity.embeddings) : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

    if (entitiesWithEmbeddings.length < this.config.clustering.minClusterSize) {
      return;
    }

    const newClusters = await this.clusteringEngine.createClusters(
      entitiesWithEmbeddings,
      {
        enabled: true,
        similarityThreshold: this.config.clustering.similarityThreshold,
        maxClusters: this.config.clustering.maxClusters,
        minClusterSize: this.config.clustering.minClusterSize,
        clusteringAlgorithm: 'kmeans'
      }
    );

    // Store clusters
    for (const cluster of newClusters) {
      this.clusters.set(cluster.id, cluster);
    }
  }

  /**
   * Query across all indices
   */
  async query(query: GraphQuery): Promise<QueryResult> {
    const startTime = Date.now();
    const indexesUsed: string[] = [];
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    // Query label index for node types
    if (query.nodeTypes && query.nodeTypes.length > 0) {
      for (const nodeType of query.nodeTypes) {
        const labelResults = this.labelIndex.query(nodeType);
        labelResults.forEach(id => nodeIds.add(id));
      }
      indexesUsed.push('label');
    }

    // Query property index for property filters
    if (query.propertyFilters && query.propertyFilters.length > 0) {
      for (const filter of query.propertyFilters) {
        const propertyKey = `${filter.property}:${filter.value}`;
        const propertyResults = this.propertyIndex.query(propertyKey);
        propertyResults.forEach(id => nodeIds.add(id));
      }
      indexesUsed.push('property');
    }

    // Query text index for text search
    if (query.textSearch) {
      const textResults = this.textIndex.query(query.textSearch);
      textResults.forEach(id => nodeIds.add(id));
      indexesUsed.push('text');
    }

    // Query vector index for similarity search
    if (query.vectorSearch) {
      const vectorResults = this.vectorIndex.query(query.vectorSearch.embedding, {
        threshold: query.vectorSearch.threshold,
        limit: query.vectorSearch.topK
      });
      vectorResults.forEach(id => nodeIds.add(id));
      indexesUsed.push('vector');
    }

    // Query pattern index for structural patterns
    if (query.expand) {
      // For now, we'll use pattern matching for expansion
      // This could be enhanced with more sophisticated graph traversal
      const pattern: GraphPattern = {
        nodes: {
          start: { type: query.nodeTypes?.[0], variable: 'start' }
        },
        edges: []
      };
      const patternResults = this.patternIndex.query(pattern);
      patternResults.forEach(id => nodeIds.add(id));
      indexesUsed.push('pattern');
    }

    // Retrieve actual nodes and edges from storage
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Get nodes from storage
    if (this.storage) {
      try {
        // Load nodes from storage using the node IDs we found
        const nodeIdArray = Array.from(nodeIds);
        const { nodes: storageNodes } = await this.storage.loadNodes({
          limit: nodeIdArray.length,
          nodeTypes: query.nodeTypes
        });

        // Filter to only include the nodes we're looking for
        const nodeMap = new Map(storageNodes.map(node => [node.id, node]));
        for (const nodeId of nodeIdArray) {
          const node = nodeMap.get(nodeId);
          if (node) {
            nodes.push(node);
          }
        }
      } catch (error) {
        console.warn('Failed to load nodes from storage:', error);
        // Fallback to placeholder nodes if storage fails
        for (const nodeId of nodeIds) {
          nodes.push({
            id: nodeId,
            type: 'unknown',
            properties: {},
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    } else {
      // No storage available, create placeholder nodes
      for (const nodeId of nodeIds) {
        nodes.push({
          id: nodeId,
          type: 'unknown',
          properties: {},
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    // Apply limit if specified
    if (query.limit && nodes.length > query.limit) {
      nodes.splice(query.limit);
    }

    const executionTime = Date.now() - startTime;

    return {
      nodes,
      edges,
      metadata: {
        executionTime,
        totalMatches: nodes.length,
        indexesUsed
      }
    };
  }

  /**
   * Get combined indexing statistics
   */
  getStats(): IndexingStats {
    const byType = new Map<string, any>();

    // Collect stats from all indices
    byType.set('label', this.labelIndex.getStats());
    byType.set('property', this.propertyIndex.getStats());
    byType.set('text', this.textIndex.getStats());
    byType.set('vector', this.vectorIndex.getStats());
    byType.set('pattern', this.patternIndex.getStats());

    // Calculate overall stats
    const totalEntries = Array.from(byType.values())
      .reduce((sum, stats) => sum + stats.totalEntries, 0);
    const totalMemoryUsage = Array.from(byType.values())
      .reduce((sum, stats) => sum + stats.memoryUsage, 0);

    return {
      byType,
      overall: {
        totalIndices: byType.size,
        totalEntries,
        totalMemoryUsage,
        averageQueryTime: 0 // Will be tracked separately
      },
      performance: {
        queryCount: 0,
        cacheHitRate: 0,
        rebuildFrequency: 0
      }
    };
  }

  /**
   * Rebuild all indices
   */
  async rebuildAll(): Promise<void> {
    // Clear all indices
    this.labelIndex.clear();
    this.propertyIndex.clear();
    this.textIndex.clear();
    this.vectorIndex.clear();
    this.patternIndex.clear();

    // Rebuild from lexical graphs
    for (const graph of this.lexicalGraphs.values()) {
      await this.indexLexicalGraph(graph);
    }

    // Rebuild from domain graphs
    for (const graph of this.domainGraphs.values()) {
      await this.indexDomainGraph(graph);
    }

    // Rebuild cross-graph links
    await this.indexCrossGraphLinks(Array.from(this.crossGraphLinks.values()));
  }

  /**
   * Clear all indices
   */
  clearAll(): void {
    this.labelIndex.clear();
    this.propertyIndex.clear();
    this.textIndex.clear();
    this.vectorIndex.clear();
    this.patternIndex.clear();
    this.clusters.clear();
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): any {
    return this.memoryManager.getMetrics();
  }

  /**
   * Get clustering statistics
   */
  getClusteringStats(): {
    totalClusters: number;
    averageClusterSize: number;
    largestCluster: number;
  } {
    if (this.clusters.size === 0) {
      return { totalClusters: 0, averageClusterSize: 0, largestCluster: 0 };
    }

    const clusterSizes = Array.from(this.clusters.values()).map(c => c.members.length);
    const averageSize = clusterSizes.reduce((sum, size) => sum + size, 0) / clusterSizes.length;
    const largestSize = Math.max(...clusterSizes);

    return {
      totalClusters: this.clusters.size,
      averageClusterSize: averageSize,
      largestCluster: largestSize
    };
  }

  /**
   * Get dual graph statistics
   */
  getDualGraphStats(): {
    lexicalGraphs: number;
    domainGraphs: number;
    crossGraphLinks: number;
    totalTextChunks: number;
    totalEntities: number;
    totalRelationships: number;
  } {
    let totalTextChunks = 0;
    let totalEntities = 0;
    let totalRelationships = 0;

    for (const graph of this.lexicalGraphs.values()) {
      totalTextChunks += graph.textChunks.size;
    }

    for (const graph of this.domainGraphs.values()) {
      totalEntities += graph.entities.size;
      totalRelationships += graph.semanticRelations.size;
    }

    return {
      lexicalGraphs: this.lexicalGraphs.size,
      domainGraphs: this.domainGraphs.size,
      crossGraphLinks: this.crossGraphLinks.size,
      totalTextChunks,
      totalEntities,
      totalRelationships
    };
  }

  // IndexManager interface implementations
  async indexNode(node: GraphNode): Promise<void> {
    // Index in all relevant indices
    this.labelIndex.add(node.type, node.id);
    this.propertyIndex.add(`id:${node.id}`, node.id);

    // Index properties
    for (const [key, value] of Object.entries(node.properties)) {
      if (typeof value === 'string') {
        this.propertyIndex.add(`${key}:${value}`, node.id);
      }
    }

    // Index embeddings if available
    if (node.embeddings) {
      this.vectorIndex.add(node.embeddings, node.id);
    }

    // Mark as accessed for memory management
    this.memoryManager.markAccessed(node.id);
  }

  async indexEdge(edge: GraphEdge): Promise<void> {
    // Index in all relevant indices
    this.labelIndex.add(edge.type, edge.id);
    this.propertyIndex.add(`source:${edge.source}`, edge.id);
    this.propertyIndex.add(`target:${edge.target}`, edge.id);

    // Index properties
    for (const [key, value] of Object.entries(edge.properties)) {
      if (typeof value === 'string') {
        this.propertyIndex.add(`${key}:${value}`, edge.id);
      }
    }

    // Index as pattern
    const pattern: GraphPattern = {
      nodes: {
        source: { type: 'entity', variable: 'source' },
        target: { type: 'entity', variable: 'target' }
      },
      edges: [{
        type: edge.type,
        from: 'source',
        to: 'target',
        direction: 'out' as const
      }]
    };
    this.patternIndex.add(pattern, edge.id);

    // Mark as accessed for memory management
    this.memoryManager.markAccessed(edge.id);
  }

  async removeNode(nodeId: string): Promise<void> {
    // Remove from all indices
    this.labelIndex.remove('', nodeId); // Remove from all labels
    this.propertyIndex.remove('', nodeId); // Remove from all properties
    this.vectorIndex.remove(new Float32Array(), nodeId); // Remove from vector index
    this.textIndex.remove('', nodeId); // Remove from text index

    // Remove from memory management
    this.memoryManager.markAccessed(nodeId);
  }

  async removeEdge(edgeId: string): Promise<void> {
    // Remove from all indices
    this.labelIndex.remove('', edgeId);
    this.propertyIndex.remove('', edgeId);
    this.patternIndex.remove({} as GraphPattern, edgeId); // Remove pattern

    // Remove from memory management
    this.memoryManager.markAccessed(edgeId);
  }

  /**
   * Query relationships with temporal filtering
   */
  queryTemporalRelationships(query: any = {}): any[] {
    return this.temporalManager.queryRelationships(query);
  }

  /**
   * Invalidate a relationship
   */
  invalidateRelationship(relationshipId: string, reason: any, timestamp?: Date): boolean {
    return this.temporalManager.invalidateRelationship(relationshipId, reason, timestamp);
  }

  /**
   * Get temporal statistics
   */
  getTemporalStats(): any {
    return this.temporalManager.getStats();
  }

  /**
   * Clean up old invalidated relationships
   */
  cleanupTemporalData(olderThan?: Date): number {
    return this.temporalManager.cleanup(olderThan);
  }

  /**
   * Stop temporal tracking
   */
  stopTemporalTracking(): void {
    this.temporalManager.stop();
  }

  /**
   * Mark an item as accessed for memory management
   */
  markAccessed(id: string): void {
    this.memoryManager.markAccessed(id);
  }

  /**
   * Get all clusters
   */
  getClusters(): any[] {
    return Array.from(this.clusters.values());
  }

}
