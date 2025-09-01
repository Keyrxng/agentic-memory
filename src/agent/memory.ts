/**
 * Main Agent Memory Integration
 *
 * Integrates all components of the GraphRAG agentic memory system following
 * 12-factor agent principles with stateless graph operations and explicit
 * context passing.
 *
 * Key Features:
 * - Entity extraction and relationship detection
 * - Entity resolution and duplicate detection
 * - Temporal knowledge management
 * - Graph traversal and pattern matching
 * - Memory-bounded processing with LRU eviction
 */

import type {
  GraphNode,
  GraphEdge,
  EntityRecord,
  RelationshipRecord,
  GraphContext,
  GraphConfig,
  GraphMetrics
} from '../core/types.js';
import { InMemoryGraph } from '../core/graph.js';
import { PersistentGraph } from '../storage/persistent-graph.js';
import { GraphTraversal } from '../core/traversal.js';
import { DependencyBasedExtractor } from '../extraction/extractor.js';
import { generateEmbeddings } from "local-stt-tts"

// Import utilities
import {
  VectorUtils,
  EntityResolver,
  MemoryManager,
  ClusteringEngine,
  QueryProcessor,
  type MemoryCluster,
  type ClusteringConfig
} from '../utils/index.js';

/**
 * Configuration for the agentic memory system
 */
export interface AgentMemoryConfig {
  /** Core graph configuration */
  graph: Partial<GraphConfig>;
  /** Entity extraction configuration */
  extraction: {
    entityConfidenceThreshold: number;
    relationshipConfidenceThreshold: number;
    maxEntitiesPerText: number;
  };
  /** Entity resolution configuration */
  resolution: {
    fuzzyThreshold: number;
    enablePhonetic: boolean;
  };
  /** Memory management configuration */
  memory: {
    maxMemoryNodes: number;
    evictionStrategy: 'lru' | 'lfu' | 'temporal';
    persistenceEnabled: boolean;
  };
}

/**
 * Result of adding memory to the system
 */
export interface MemoryAddResult {
  /** Entities that were added or updated */
  entities: Array<{ entity: EntityRecord; action: 'added' | 'updated' | 'merged' }>;
  /** Relationships that were added */
  relationships: RelationshipRecord[];
  /** Processing metadata */
  metadata: {
    processingTime: number;
    entitiesExtracted: number;
    relationshipsExtracted: number;
    duplicatesResolved: number;
  };
}

/**
 * Result of querying memory
 */
export interface MemoryQueryResult {
  /** Relevant entities found */
  entities: GraphNode[];
  /** Related relationships */
  relationships: GraphEdge[];
  /** Contextual subgraph */
  subgraph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    paths: Map<string, string[]>;
  };
  /** Query metadata */
  metadata: {
    queryTime: number;
    nodesTraversed: number;
    relevanceScores: Map<string, number>;
  };
}

/**
 * Main agentic memory system integrating all GraphRAG components
 *
 * Provides a high-level interface for adding memories, querying knowledge,
 * and managing the evolving knowledge graph. Implements sophisticated
 * entity resolution, temporal tracking, and memory-bounded processing.
 */
export class AgentGraphMemory {
  private graph: InMemoryGraph | PersistentGraph;
  private traversal: GraphTraversal;
  private extractor: DependencyBasedExtractor;
  private config: AgentMemoryConfig;
  private initialized = false;

  // Utility instances
  private entityResolver: EntityResolver;
  private memoryManager: MemoryManager;
  private clusteringEngine: ClusteringEngine;
  private queryProcessor: QueryProcessor;

  constructor(config: Partial<AgentMemoryConfig> = {}) {
    this.config = {
      graph: config.graph || {},
      extraction: {
        entityConfidenceThreshold: 0.7,
        relationshipConfidenceThreshold: 0.6,
        maxEntitiesPerText: 50,
        ...config.extraction
      },
      resolution: {
        fuzzyThreshold: 0.8,
        enablePhonetic: true,
        ...config.resolution
      },
      memory: {
        maxMemoryNodes: 10000,
        evictionStrategy: 'lru',
        persistenceEnabled: false,
        ...config.memory
      }
    };

    if (this.config.memory.persistenceEnabled) {
      // Use persistent graph with storage configuration
      const persistentConfig = {
        ...this.config.graph,
        storage: {
          persistToDisk: true,
          storageDirectory: './data',
          compressionEnabled: false,
          syncInterval: 30000,
          enabled: true,
          maxMemoryUsage: 500 * 1024 * 1024, // 500MB
          ...this.config.graph.storage
        }
      };
      this.graph = new PersistentGraph(persistentConfig);
    } else {
      // Use in-memory graph
      this.graph = new InMemoryGraph(this.config.graph);
    }

    this.traversal = new GraphTraversal(this.graph);
    this.extractor = new DependencyBasedExtractor({
      entityConfidenceThreshold: this.config.extraction.entityConfidenceThreshold,
      relationshipConfidenceThreshold: this.config.extraction.relationshipConfidenceThreshold,
      maxEntitiesPerText: this.config.extraction.maxEntitiesPerText
    });

    // Initialize utilities
    this.entityResolver = new EntityResolver();
    this.memoryManager = new MemoryManager(this.config.memory);
    this.clusteringEngine = new ClusteringEngine();
    this.queryProcessor = new QueryProcessor();
  }

  /**
   * Initialize the memory system (required for persistent storage)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.memory.persistenceEnabled && this.graph instanceof PersistentGraph) {
      await this.graph.initialize();
    }

    // Update utility indices with current graph state
    this.entityResolver.updateIndex(this.graph.getAllNodes());

    this.initialized = true;
  }

  /**
   * Ensure the memory system is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Add memory content to the knowledge graph
   * 
   * Processes natural language content through the complete pipeline:
   * 1. Entity extraction using dependency parsing
   * 2. Entity resolution against existing knowledge
   * 3. Graph updates with new entities and relationships
   * 4. Memory management and eviction if needed
   */
  async addMemory(
    content: string,
    context: GraphContext,
    options: { embeddings?: Float32Array } = {}
  ): Promise<MemoryAddResult> {
    await this.ensureInitialized();

    const startTime = Date.now();

    // Step 1: Extract entities and relationships from content
    console.log(`🧠 Extracting entities from: "${content.substring(0, 100)}..."`);
    const extraction = await this.extractor.extractEntitiesAndRelations(content, context);

    console.log(`📊 Extracted ${extraction.entities.length} entities and ${extraction.relationships.length} relationships`);

    // Step 2: Resolve entities against existing knowledge
    const resolvedEntities: Array<{ entity: EntityRecord; action: 'added' | 'updated' | 'merged' }> = [];
    const duplicatesResolved = new Map<string, string>(); // newId -> existingId

    for (const extractedEntity of extraction.entities) {
      const resolution = await this.resolveEntity(extractedEntity);

      if (resolution.matched) {
        // Update existing entity with new information
        await this.updateExistingEntity(resolution.matched, extractedEntity, context);
        resolvedEntities.push({ entity: resolution.matched, action: 'updated' });
        duplicatesResolved.set(extractedEntity.id, resolution.matched.id);

        console.log(`🔄 Updated existing entity: ${resolution.matched.name}`);
      } else {
        // Add as new entity
        const nodeId = await this.addNewEntity(extractedEntity, context, options.embeddings);
        const newNode = this.graph.getNode(nodeId);
        if (newNode) {
          resolvedEntities.push({
            entity: this.nodeToEntityRecord(newNode),
            action: 'added'
          });
        }

        console.log(`✨ Added new entity: ${extractedEntity.name}`);
      }
    }

    // Step 3: Add relationships (with ID resolution)
    const addedRelationships: RelationshipRecord[] = [];

    for (const relationship of extraction.relationships) {
      // Resolve source and target IDs
      const sourceId = duplicatesResolved.get(relationship.source) || relationship.source;
      const targetId = duplicatesResolved.get(relationship.target) || relationship.target;

      // Check if both entities exist in graph
      if (this.graph.getNode(sourceId) && this.graph.getNode(targetId)) {
        const edgeId = await this.graph.addEdge({
          source: sourceId,
          target: targetId,
          type: relationship.type,
          weight: relationship.confidence,
          properties: {
            ...relationship.properties,
            extractedFrom: content.substring(0, 200),
            extractionContext: context.sessionId
          }
        });

        addedRelationships.push({
          ...relationship,
          id: edgeId,
          source: sourceId,
          target: targetId
        });

        console.log(`🔗 Added relationship: ${sourceId} -> ${relationship.type} -> ${targetId}`);
      }
    }

    // Step 4: Memory management
    await this.performMemoryManagement();

    const processingTime = Date.now() - startTime;

    console.log(`⚡ Memory processing completed in ${processingTime}ms`);

    return {
      entities: resolvedEntities,
      relationships: addedRelationships,
      metadata: {
        processingTime,
        entitiesExtracted: extraction.entities.length,
        relationshipsExtracted: extraction.relationships.length,
        duplicatesResolved: duplicatesResolved.size
      }
    };
  }

  /**
   * Query memory using natural language
   * 
   * Processes queries through graph traversal and pattern matching:
   * 1. Parse query intent and extract key entities
   * 2. Find relevant starting nodes
   * 3. Expand context through graph traversal
   * 4. Rank results by relevance
   */
  async queryMemory(
    query: string,
    context: GraphContext,
    options: {
      maxResults?: number;
      maxDepth?: number;
      includeRelated?: boolean;
      queryEmbedding?: Float32Array;
    } = {}
  ): Promise<MemoryQueryResult> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const maxResults = options.maxResults || 10;
    const maxDepth = options.maxDepth || 2;

    console.log(`🔍 Querying memory: "${query}"`);

    // Step 1: Extract entities from query
    const queryExtraction = await this.extractor.extractEntitiesAndRelations(query, context);

    // Step 2: Find starting nodes for traversal (text-based)
    const textBasedNodes = await this.findRelevantNodes(query, queryExtraction.entities, options.queryEmbedding);

    // Step 2.5: Find additional nodes using vector similarity (if embedding provided)
    let vectorBasedNodes: GraphNode[] = [];
    if (options.queryEmbedding) {
      vectorBasedNodes = await this.findSimilarNodesByEmbedding(options.queryEmbedding, maxResults);
      console.log(`🔍 Found ${vectorBasedNodes.length} nodes via vector similarity`);
    }

    // Combine and deduplicate starting nodes
    const startingNodes = [...textBasedNodes];
    for (const node of vectorBasedNodes) {
      if (!startingNodes.find(n => n.id === node.id)) {
        startingNodes.push(node);
      }
    }

    console.log(`🎯 Found ${startingNodes.length} total starting points for traversal (${textBasedNodes.length} text, ${vectorBasedNodes.length} vector)`);

    // Step 3: Expand context through graph traversal
    const subgraphNodes = new Map<string, GraphNode>();
    const subgraphEdges = new Map<string, GraphEdge>();
    const allPaths = new Map<string, string[]>();

    for (const startNode of startingNodes) {
      // Use BFS for relationship expansion 
      const traversalResult = await this.traversal.bfsTraversal(startNode.id, {
        maxDepth,
        maxNodes: maxResults * 2,
        direction: 'both',
        includeStartNode: true,
        nodeFilter: (node) => this.queryProcessor.isRelevantToQuery(node, query, options.queryEmbedding)
      });

      // Collect results
      for (const node of traversalResult.nodes) {
        subgraphNodes.set(node.id, node);
        this.markAccessed(node.id); // Update LRU
      }

      for (const edge of traversalResult.edges) {
        subgraphEdges.set(edge.id, edge);
      }

      // Merge paths
      for (const [nodeId, path] of traversalResult.paths) {
        allPaths.set(nodeId, path);
      }
    }

    // Step 4: Calculate relevance scores and rank results
    const relevanceScores = new Map<string, number>();
    const rankedEntities: GraphNode[] = [];

    for (const node of subgraphNodes.values()) {
      const relevance = this.queryProcessor.calculateRelevanceScore(node, query, queryExtraction.entities, options.queryEmbedding);
      relevanceScores.set(node.id, relevance);

      if (relevance > 0.05) { // Lower relevance threshold for semantic search
        rankedEntities.push(node);
      }
    }

    // Sort by relevance
    rankedEntities.sort((a, b) => {
      const scoreA = relevanceScores.get(a.id) || 0;
      const scoreB = relevanceScores.get(b.id) || 0;
      return scoreB - scoreA;
    });

    const queryTime = Date.now() - startTime;

    console.log(`📈 Query completed in ${queryTime}ms, found ${rankedEntities.length} relevant entities`);

    return {
      entities: rankedEntities.slice(0, maxResults),
      relationships: Array.from(subgraphEdges.values()),
      subgraph: {
        nodes: Array.from(subgraphNodes.values()),
        edges: Array.from(subgraphEdges.values()),
        paths: allPaths
      },
      metadata: {
        queryTime,
        nodesTraversed: subgraphNodes.size,
        relevanceScores
      }
    };
  }

  /**
   * Get current memory system metrics
   */
  getMetrics(): GraphMetrics & {
    memoryMetrics: {
      totalNodes: number;
      totalEdges: number;
      memoryBound: number;
      lastCleanup: Date;
    };
  } {
    const graphMetrics = this.graph.getMetrics();
    const memoryMetrics = this.memoryManager.getMetrics();

    return {
      ...graphMetrics,
      memoryMetrics: {
        totalNodes: this.graph.getAllNodes().length,
        totalEdges: this.graph.getAllEdges().length,
        memoryBound: this.config.memory.maxMemoryNodes,
        lastCleanup: memoryMetrics.lastCleanup
      }
    };
  }

  /**
   * Clear all memory (useful for testing)
   */
  clear(): void {
    this.graph.clear();
    this.memoryManager.clear();
    this.entityResolver.updateIndex([]);

    console.log(`🧹 Memory cleared`);
  }

  // Private helper methods

  private async resolveEntity(entity: EntityRecord): Promise<{ matched: EntityRecord | null; confidence: number }> {
    const allNodes = new Map(this.graph.getAllNodes().map(node => [node.id, node]));
    return this.entityResolver.resolveEntity(entity, allNodes, {
      fuzzyThreshold: this.config.resolution.fuzzyThreshold,
      enableEmbeddings: true
    });
  }

  private async addNewEntity(entity: EntityRecord, context: GraphContext, embeddings?: Float32Array): Promise<string> {
    // Use the extractor's deterministic entity id as the graph node id so relationships align
    const nodeId = await this.graph.addNode({
      id: entity.id,
      type: entity.type,
      properties: {
        name: entity.name,
        ...entity.properties,
        addedBy: context.userId,
        addedAt: context.timestamp.toISOString()
      },
      embeddings: embeddings
    });

    // Update indices
    this.memoryManager.updateNameIndex(this.graph.getAllNodes());
    this.memoryManager.markAccessed(nodeId);

    return nodeId;
  }

  private async updateExistingEntity(
    existingEntity: EntityRecord,
    newEntity: EntityRecord,
    context: GraphContext
  ): Promise<void> {
    const node = this.graph.getNode(existingEntity.id) || this.graph.getNode(newEntity.id);
    if (!node) return;

    // Merge properties using entity resolver
    const mergedEntity = this.entityResolver.mergeEntityProperties(existingEntity, newEntity, {
      userId: context.userId,
      timestamp: context.timestamp
    });

    // Update node properties
    node.properties = mergedEntity.properties;
    node.updatedAt = context.timestamp;

    // Mark as accessed
    this.markAccessed(node.id);
  }

  private async findRelevantNodes(query: string, queryEntities: Array<EntityRecord & { confidence: number }>, queryEmbedding?: Float32Array): Promise<GraphNode[]> {
    const allNodes = this.graph.getAllNodes();
    const nameIndex = this.memoryManager.getNameIndex();
    return this.queryProcessor.findRelevantNodes(query, queryEntities, allNodes, nameIndex, queryEmbedding);
  }

  private markAccessed(nodeId: string): void {
    this.memoryManager.markAccessed(nodeId);
  }

  private async performMemoryManagement(): Promise<void> {
    const currentNodes = this.graph.getAllNodes().length;
    const nodesToEvict = this.memoryManager.getNodesToEvict(currentNodes);

    if (nodesToEvict.length === 0) {
      return;
    }

    console.log(`🔄 Memory limit exceeded (${currentNodes}/${this.config.memory.maxMemoryNodes}), performing eviction`);

    let evictedCount = 0;
    for (const nodeId of nodesToEvict) {
      if (await this.graph.removeNode(nodeId)) {
        this.memoryManager.removeNode(nodeId);
        evictedCount++;
      }
    }

    this.memoryManager.finalizeEviction(evictedCount);

    console.log(`🗑️ Evicted ${evictedCount} nodes from memory`);
  }

  private async findSimilarNodesByEmbedding(queryEmbedding: Float32Array, maxResults: number): Promise<GraphNode[]> {
    return this.queryProcessor.findSimilarNodesByEmbedding(queryEmbedding, this.graph.getAllNodes(), maxResults);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    return VectorUtils.cosineSimilarity(a, b);
  }

  private nodeToEntityRecord(node: GraphNode): EntityRecord {
    return {
      id: node.id,
      type: node.type,
      name: node.properties.name || node.id,
      properties: node.properties,
      embeddings: node.embeddings ? Array.from(node.embeddings) : undefined
    };
  }

  /**
   * Create semantic clusters from memory nodes
   */
  async createClusters(config: ClusteringConfig = {
    enabled: true,
    similarityThreshold: 0.7,
    maxClusters: 10,
    minClusterSize: 2,
    clusteringAlgorithm: 'kmeans'
  }): Promise<MemoryCluster[]> {
    await this.ensureInitialized();
    return this.clusteringEngine.createClusters(this.graph.getAllNodes(), config);
  }

  /**
   * Find clusters related to a query
   */
  async findRelatedClusters(
    queryEmbedding: Float32Array,
    clusters: MemoryCluster[],
    maxResults: number = 5
  ): Promise<MemoryCluster[]> {
    return this.clusteringEngine.findRelatedClusters(queryEmbedding, clusters, maxResults);
  }

  /**
   * Get contextual memories based on conversation history
   */
  async getContextualMemories(
    conversationHistory: Array<{ role: string; content: string }>,
    maxMemories: number = 5
  ): Promise<GraphNode[]> {
    await this.ensureInitialized();

    if (conversationHistory.length === 0) {
      return [];
    }

    console.log(`🎯 Finding contextual memories for conversation...`);

    // Generate embedding for recent conversation context
    const recentMessages = conversationHistory.slice(-3); // Last 3 messages
    const contextText = recentMessages.map(msg => msg.content).join(' ');

    const contextEmbedding = await generateEmbeddings({
      input: contextText,
      provider: "ollama",
      model: "mxbai-embed-large:latest"
    });

    const similarNodes = await this.findSimilarNodesByEmbedding(
      new Float32Array(contextEmbedding.embedding),
      maxMemories
    );

    return similarNodes;
  }

  /**
   * Enhanced entity resolution using embeddings
   */
  async resolveEntityWithEmbeddings(
    entity: EntityRecord,
    candidateEntities: GraphNode[]
  ): Promise<{ bestMatch: GraphNode | null; confidence: number }> {
    const candidatesMap = new Map(candidateEntities.map(node => [node.id, node]));
    const result = this.entityResolver.resolveEntity(entity, candidatesMap, {
      fuzzyThreshold: this.config.resolution.fuzzyThreshold,
      enableEmbeddings: true
    });

    return {
      bestMatch: result.matched ? candidateEntities.find(n => n.id === result.matched!.id) || null : null,
      confidence: result.confidence
    };
  }

}
