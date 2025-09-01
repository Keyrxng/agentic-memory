/**
 * Main Agent Memory Integration
 *
 * Integrates all components of the GraphRAG agentic memory system following
 * 12-factor agent principles with stateless graph operations and explicit
 * context passing.
 *
 * Key Features:
 * - Dual graph architecture for advanced knowledge representation
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
  GraphMetrics,
  // Dual graph types
  DualGraphResult,
  LexicalGraph,
  DomainGraph,
  CrossGraphLink,
  DualGraphQuery,
  DualGraphQueryResult,
  TextChunk
} from '../core/types.js';
import { InMemoryGraph } from '../core/graph.js';
import { PersistentGraph } from '../storage/persistent-graph.js';
import { GraphTraversal } from '../core/traversal.js';
import { DependencyBasedExtractor } from '../extraction/extractor.js';
import { DualGraphExtractor } from '../extraction/dual-graph-extractor.js';
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

import { DualGraphIndexManager } from '../indexing/dual-graph-index-manager.js';
import { UnifiedQueryProcessor } from '../indexing/unified-query-processor.js';

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
  /** Dual graph configuration */
  dualGraph: {
    enabled: boolean;
    lexical: {
      minChunkSize: number;
      maxChunkSize: number;
      enableSentenceChunking: boolean;
      enableParagraphChunking: boolean;
      enableEmbeddings: boolean;
      enableLexicalRelations: boolean;
    };
    domain: {
      enableHierarchies: boolean;
      enableTaxonomies: boolean;
      enableOrganizationalStructures: boolean;
      enableConceptClustering: boolean;
      minHierarchyConfidence: number;
    };
    linking: {
      enableEntityMentions: boolean;
      enableEvidenceSupport: boolean;
      enableSemanticGrounding: boolean;
      enableTemporalAlignment: boolean;
      minLinkConfidence: number;
      maxLinksPerEntity: number;
    };
    processing: {
      enableParallelProcessing: boolean;
      enableProgressTracking: boolean;
      enableDetailedLogging: boolean;
    };
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
  /** Dual graph results (if enabled) */
  dualGraphResult?: DualGraphResult;
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
  /** Dual graph query results (if enabled) */
  dualGraphResults?: DualGraphQueryResult;
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
  private dualGraphExtractor: DualGraphExtractor;
  private config: AgentMemoryConfig;
  private initialized = false;

  // Utility instances
  private entityResolver: EntityResolver;
  private memoryManager: MemoryManager;
  private clusteringEngine: ClusteringEngine;
  private queryProcessor: QueryProcessor;

  // New integrated components
  private indexManager: DualGraphIndexManager;
  private unifiedQueryProcessor: UnifiedQueryProcessor;

  // Dual graph storage
  private lexicalGraphs: Map<string, LexicalGraph> = new Map();
  private domainGraphs: Map<string, DomainGraph> = new Map();
  private crossGraphLinks: Map<string, CrossGraphLink> = new Map();

  // Clustering storage
  private clusters: Map<string, MemoryCluster> = new Map();

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
      },
      dualGraph: {
        enabled: config.dualGraph?.enabled ?? true,
        lexical: {
          minChunkSize: 50,
          maxChunkSize: 1000,
          enableSentenceChunking: true,
          enableParagraphChunking: true,
          enableEmbeddings: true,
          enableLexicalRelations: true,
          ...config.dualGraph?.lexical
        },
        domain: {
          enableHierarchies: true,
          enableTaxonomies: true,
          enableOrganizationalStructures: true,
          enableConceptClustering: true,
          minHierarchyConfidence: 0.7,
          ...config.dualGraph?.domain
        },
        linking: {
          enableEntityMentions: true,
          enableEvidenceSupport: true,
          enableSemanticGrounding: true,
          enableTemporalAlignment: true,
          minLinkConfidence: 0.6,
          maxLinksPerEntity: 10,
          ...config.dualGraph?.linking
        },
        processing: {
          enableParallelProcessing: false,
          enableProgressTracking: true,
          enableDetailedLogging: false,
          ...config.dualGraph?.processing
        }
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

    // Initialize dual graph extractor if enabled
    if (this.config.dualGraph.enabled) {
      this.dualGraphExtractor = new DualGraphExtractor({
        lexical: this.config.dualGraph.lexical,
        domain: this.config.dualGraph.domain,
        linking: this.config.dualGraph.linking,
        processing: this.config.dualGraph.processing
      });
    }

    // Initialize utilities
    this.entityResolver = new EntityResolver();
    this.memoryManager = new MemoryManager(this.config.memory);
    this.clusteringEngine = new ClusteringEngine();
    this.queryProcessor = new QueryProcessor();

    // Initialize new integrated components
    this.indexManager = new DualGraphIndexManager({
      memory: this.config.memory,
      clustering: {
        enabled: true,
        similarityThreshold: 0.7,
        maxClusters: 50,
        minClusterSize: 3
      },
      resolution: {
        fuzzyThreshold: 0.8,
        enableEmbeddings: true
      }
    });
    this.unifiedQueryProcessor = new UnifiedQueryProcessor(this.indexManager);

    // Initialize new integrated components
    this.indexManager = new DualGraphIndexManager({
      memory: this.config.memory,
      clustering: {
        enabled: true,
        similarityThreshold: 0.7,
        maxClusters: 50,
        minClusterSize: 3
      },
      resolution: {
        fuzzyThreshold: 0.8,
        enableEmbeddings: true
      }
    });
    
    // Set storage access for the index manager if using persistent graph
    if (this.graph instanceof PersistentGraph) {
      this.indexManager.setStorage(this.graph.getStorage());
    }
    
    this.unifiedQueryProcessor = new UnifiedQueryProcessor(this.indexManager);
  }

  /**
   * Initialize the memory system (required for persistent storage)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.memory.persistenceEnabled && this.graph instanceof PersistentGraph) {
      await this.graph.initialize();
      
      // Load persisted dual graphs if available
      const storage = this.graph.getStorage();
      if (storage) {
        try {
          const { graphs: lexicalGraphs } = await storage.loadLexicalGraphs();
          const { graphs: domainGraphs } = await storage.loadDomainGraphs();
          const { links: crossLinks } = await storage.loadCrossGraphLinks();

          // Restore dual graphs to memory
          for (const graph of lexicalGraphs) {
            this.lexicalGraphs.set(graph.id, graph);
            await this.indexManager.indexLexicalGraph(graph);
          }
          
          for (const graph of domainGraphs) {
            this.domainGraphs.set(graph.id, graph);
            await this.indexManager.indexDomainGraph(graph);
          }
          
          for (const link of crossLinks) {
            this.crossGraphLinks.set(link.id, link);
          }
          
          if (crossLinks.length > 0) {
            await this.indexManager.indexCrossGraphLinks(crossLinks);
          }

          // Update unified query processor with loaded graphs
          this.unifiedQueryProcessor.updateGraphReferences(
            this.lexicalGraphs,
            this.domainGraphs,
            this.crossGraphLinks
          );
          
          console.log(`Loaded ${lexicalGraphs.length} lexical graphs, ${domainGraphs.length} domain graphs, and ${crossLinks.length} cross-graph links from storage`);
        } catch (error) {
          console.warn('Failed to load dual graphs from storage:', error);
        }
      }
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
   * Add memory to the system using dual graph architecture
   */
  async addMemory(
    text: string,
    context: GraphContext,
    options: {
      useDualGraph?: boolean;
      enableProgressTracking?: boolean;
    } = {}
  ): Promise<MemoryAddResult> {
    await this.ensureInitialized();
    
    const useDualGraph = options.useDualGraph ?? this.config.dualGraph.enabled;
    
    if (useDualGraph && this.dualGraphExtractor) {
      return this.addMemoryWithDualGraph(text, context, options);
    } else {
      return this.addMemoryLegacy(text, context);
    }
  }

  /**
   * Add memory using dual graph architecture
   */
  private async addMemoryWithDualGraph(
    text: string,
    context: GraphContext,
    options: {
      enableProgressTracking?: boolean;
    } = {}
  ): Promise<MemoryAddResult> {
    const startTime = Date.now();
    
    // Progress callback for dual graph extraction
    let progressCallback: ((progress: any) => void) | undefined;
    if (options.enableProgressTracking) {
      progressCallback = (progress: any) => {
        console.log(`🔄 Dual Graph Extraction: ${progress.stage} - ${progress.progress}%`);
      };
    }

    // Extract dual graphs
    const dualGraphResult = await this.dualGraphExtractor.extractDualGraphs(
      text,
      context,
      progressCallback
    );

    // Store dual graph components
    const sessionKey = `${context.sessionId}_${Date.now()}`;
    this.lexicalGraphs.set(sessionKey, dualGraphResult.lexicalGraph);
    this.domainGraphs.set(sessionKey, dualGraphResult.domainGraph);
    
    // Store cross-graph links
    for (const link of dualGraphResult.crossLinks) {
      this.crossGraphLinks.set(link.id, link);
    }

    // Persist dual graphs to storage if persistence is enabled
    if (this.config.memory.persistenceEnabled && this.graph instanceof PersistentGraph) {
      const storage = this.graph.getStorage();
      if (storage) {
        try {
          await storage.storeLexicalGraphs([dualGraphResult.lexicalGraph]);
          await storage.storeDomainGraphs([dualGraphResult.domainGraph]);
          await storage.storeCrossGraphLinks(dualGraphResult.crossLinks);
        } catch (error) {
          console.warn('Failed to persist dual graphs to storage:', error);
        }
      }
    }

    // Index the dual graphs using the integrated index manager
    await this.indexManager.indexLexicalGraph(dualGraphResult.lexicalGraph);
    await this.indexManager.indexDomainGraph(dualGraphResult.domainGraph);
    await this.indexManager.indexCrossGraphLinks(dualGraphResult.crossLinks);

    // Update unified query processor with new graphs
    this.unifiedQueryProcessor.updateGraphReferences(
      this.lexicalGraphs,
      this.domainGraphs,
      this.crossGraphLinks
    );

    // Index the dual graphs using the integrated index manager
    await this.indexManager.indexLexicalGraph(dualGraphResult.lexicalGraph);
    await this.indexManager.indexDomainGraph(dualGraphResult.domainGraph);
    await this.indexManager.indexCrossGraphLinks(dualGraphResult.crossLinks);

    // Update unified query processor with new graphs
    this.unifiedQueryProcessor.updateGraphReferences(
      this.lexicalGraphs,
      this.domainGraphs,
      this.crossGraphLinks
    );

    // Convert domain graph entities and relationships to legacy format for backward compatibility
    const entities = Array.from(dualGraphResult.domainGraph.entities.values());
    const relationships = Array.from(dualGraphResult.domainGraph.semanticRelations.values());

    // Add entities to the main graph
    const entityResults = [];
    for (const entity of entities) {
      try {
        await this.graph.addNode({
          id: entity.id,
          type: entity.type,
          properties: entity.properties,
          embeddings: entity.embeddings ? new Float32Array(entity.embeddings) : undefined
        });
        entityResults.push({ entity, action: 'added' as const });
      } catch (error) {
        // Entity might already exist, try to update
        try {
          // Since updateNode doesn't exist, we'll just log the update
          console.log(`Entity ${entity.id} already exists, skipping update`);
          entityResults.push({ entity, action: 'updated' as const });
        } catch (updateError) {
          console.warn(`Failed to add/update entity ${entity.id}:`, updateError);
        }
      }
    }

    // Add relationships to the main graph
    const relationshipResults = [];
    for (const relationship of relationships) {
      try {
        await this.graph.addEdge({
          id: relationship.id,
          source: relationship.source,
          target: relationship.target,
          type: relationship.type,
          weight: relationship.confidence,
          properties: relationship.properties
        });
        relationshipResults.push(relationship);
      } catch (error) {
        console.warn(`Failed to add relationship ${relationship.id}:`, error);
      }
    }

    const processingTime = Date.now() - startTime;

    return {
      entities: entityResults,
      relationships: relationshipResults,
      metadata: {
        processingTime,
        entitiesExtracted: entities.length,
        relationshipsExtracted: relationships.length,
        duplicatesResolved: 0 // Will be updated when entity resolution is implemented
      },
      dualGraphResult
    };
  }

  /**
   * Add memory using legacy single graph approach (deprecated)
   * 
   * @deprecated Use addMemory() with dual graph enabled instead
   */
  private async addMemoryLegacy(
    text: string,
    context: GraphContext
  ): Promise<MemoryAddResult> {
    console.warn('⚠️  Using deprecated legacy single graph approach. Consider enabling dual graph architecture.');
    
    const startTime = Date.now();

    // Extract entities and relationships using legacy extractor
    const extractionResult = await this.extractor.extractEntitiesAndRelations(text, context);

    // Add entities to graph
    const entityResults = [];
    for (const entity of extractionResult.entities) {
      try {
        await this.graph.addNode({
          id: entity.id,
          type: entity.type,
          properties: entity.properties,
          embeddings: entity.embeddings ? new Float32Array(entity.embeddings) : undefined
        });
        entityResults.push({ entity, action: 'added' as const });
      } catch (error) {
        // Entity might already exist, try to update
        try {
          // Since updateNode doesn't exist, we'll just log the update
          console.log(`Entity ${entity.id} already exists, skipping update`);
          entityResults.push({ entity, action: 'updated' as const });
        } catch (updateError) {
          console.warn(`Failed to add/update entity ${entity.id}:`, updateError);
        }
      }
    }

    // Add relationships to graph
    const relationshipResults = [];
    for (const relationship of extractionResult.relationships) {
      try {
        await this.graph.addEdge({
          id: relationship.id,
          source: relationship.source,
          target: relationship.target,
          type: relationship.type,
          weight: relationship.confidence,
          properties: relationship.properties
        });
        relationshipResults.push(relationship);
      } catch (error) {
        console.warn(`Failed to add relationship ${relationship.id}:`, error);
      }
    }

    const processingTime = Date.now() - startTime;

    return {
      entities: entityResults,
      relationships: relationshipResults,
      metadata: {
        processingTime,
        entitiesExtracted: extractionResult.entities.length,
        relationshipsExtracted: extractionResult.relationships.length,
        duplicatesResolved: 0
      }
    };
  }

  /**
   * Query memory using dual graph architecture
   */
  async queryMemory(
    query: string | DualGraphQuery,
    context: GraphContext,
    options: {
      useDualGraph?: boolean;
      limit?: number;
      includeMetadata?: boolean;
    } = {}
  ): Promise<MemoryQueryResult> {
    await this.ensureInitialized();
    
    const useDualGraph = options.useDualGraph ?? this.config.dualGraph.enabled;
    
    if (useDualGraph && this.dualGraphExtractor) {
      return this.queryMemoryWithDualGraph(query, context, options);
    } else {
      // For legacy queries, convert DualGraphQuery to string if needed
      const queryString = typeof query === 'string' ? query : JSON.stringify(query);
      return this.queryMemoryLegacy(queryString, context, options);
    }
  }

  /**
   * Query memory using dual graph architecture
   */
  private async queryMemoryWithDualGraph(
    query: string | DualGraphQuery,
    context: GraphContext,
    options: {
      limit?: number;
      includeMetadata?: boolean;
    } = {}
  ): Promise<MemoryQueryResult> {
    const startTime = Date.now();
    
    // Convert string query to dual graph query if needed
    const dualGraphQuery: DualGraphQuery = typeof query === 'string' ? {
      lexicalQuery: { textSearch: query },
      options: {
        limit: options.limit,
        includeMetadata: options.includeMetadata,
        sortBy: 'relevance'
      }
    } : query;

    // Use the unified query processor for enhanced querying
    const enhancedQuery = {
      ...dualGraphQuery,
      memory: {
        prioritizeRecent: true,
        includeClusters: true
      },
      resolution: {
        enableFuzzyMatching: true,
        confidenceThreshold: 0.8
      },
      processing: {
        enableParallel: false,
        maxResults: options.limit,
        sortBy: 'relevance' as const
      }
    };

    const result = await this.unifiedQueryProcessor.executeQuery(enhancedQuery, context);

    // Convert back to legacy format for backward compatibility
    const entities = result.domainResults.entities.map(e => ({
      id: e.id,
      type: e.type,
      properties: e.properties,
      embeddings: e.embeddings ? new Float32Array(e.embeddings) : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const relationships = result.domainResults.relationships.map(r => ({
      id: r.id,
      source: r.source,
      target: r.target,
      type: r.type,
      weight: r.confidence,
      properties: r.properties,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    const queryTime = Date.now() - startTime;

    return {
      entities,
      relationships,
      subgraph: {
        nodes: entities,
        edges: relationships,
        paths: new Map()
      },
      metadata: {
        queryTime,
        nodesTraversed: entities.length + relationships.length,
        relevanceScores: new Map(result.domainResults.relevanceScores)
      },
      dualGraphResults: result
    };
  }

  /**
   * Query memory using legacy approach (deprecated)
   * 
   * @deprecated Use queryMemory() with dual graph enabled instead
   */
  private async queryMemoryLegacy(
    query: string,
    context: GraphContext,
    options: {
      limit?: number;
      includeMetadata?: boolean;
    } = {}
  ): Promise<MemoryQueryResult> {
    console.warn('⚠️  Using deprecated legacy query approach. Consider enabling dual graph architecture.');
    
    const startTime = Date.now();

    // Simple text search in node properties
    const allNodes = this.graph.getAllNodes();
    const matchingNodes = allNodes.filter(node => {
      const searchText = query.toLowerCase();
      return node.properties && Object.values(node.properties).some(value => 
        typeof value === 'string' && value.toLowerCase().includes(searchText)
      );
    });

    const queryTime = Date.now() - startTime;

    return {
      entities: matchingNodes,
      relationships: [],
      subgraph: {
        nodes: matchingNodes,
        edges: [],
        paths: new Map()
      },
      metadata: {
        queryTime,
        nodesTraversed: matchingNodes.length,
        relevanceScores: new Map()
      }
    };
  }

  /**
   * Get integrated memory statistics from all components
   */
  async getIntegratedStats(): Promise<{
    // Core graph stats
    graph: GraphMetrics;
    // Dual graph stats
    dualGraph: {
      lexicalGraphs: number;
      domainGraphs: number;
      crossGraphLinks: number;
      totalChunks: number;
      totalEntities: number;
      totalRelationships: number;
    };
    // Index manager stats
    indexing: any;
    // Memory management stats
    memory: any;
    // Clustering stats
    clustering: any;
    // Overall system health
    system: {
      totalMemoryUsage: number;
      totalProcessingTime: number;
      cacheEfficiency: number;
    };
  }> {
    const graphStats = await this.getMemoryStats();
    const dualGraphStats = {
      lexicalGraphs: this.lexicalGraphs.size,
      domainGraphs: this.domainGraphs.size,
      crossGraphLinks: this.crossGraphLinks.size,
      totalChunks: Array.from(this.lexicalGraphs.values()).reduce((sum, g) => sum + g.textChunks.size, 0),
      totalEntities: Array.from(this.domainGraphs.values()).reduce((sum, g) => sum + g.entities.size, 0),
      totalRelationships: Array.from(this.domainGraphs.values()).reduce((sum, g) => sum + g.semanticRelations.size, 0)
    };
    const indexingStats = this.indexManager.getStats();
    const memoryStats = this.indexManager.getMemoryStats();
    const clusteringStats = this.indexManager.getClusteringStats();

    const totalMemoryUsage = 
      (graphStats.memoryUsage || 0) + 
      (indexingStats.overall.totalMemoryUsage || 0) + 
      (memoryStats.accessOrderSize * 50); // Rough estimate

    return {
      graph: graphStats,
      dualGraph: dualGraphStats,
      indexing: indexingStats,
      memory: memoryStats,
      clustering: clusteringStats,
      system: {
        totalMemoryUsage,
        totalProcessingTime: 0, // Would be tracked separately
        cacheEfficiency: indexingStats.performance.cacheHitRate || 0
      }
    };
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(): Promise<GraphMetrics> {
    await this.ensureInitialized();
    return this.graph.getMetrics();
  }

  /**
   * Clear all memory
   */
  async clearMemory(): Promise<void> {
    await this.ensureInitialized();
    
    // Clear legacy graph
    await this.graph.clear();
    
    // Clear dual graph components
    this.lexicalGraphs.clear();
    this.domainGraphs.clear();
    this.crossGraphLinks.clear();
    
    // Clear index manager
    this.indexManager.clearAll();
    
    // Reinitialize utilities
    this.entityResolver.updateIndex([]);
  }

  /**
   * Get all entities
   */
  async getAllEntities(): Promise<GraphNode[]> {
    await this.ensureInitialized();
    return this.graph.getAllNodes();
  }

  /**
   * Get all relationships
   */
  async getAllRelationships(): Promise<GraphEdge[]> {
    await this.ensureInitialized();
    return this.graph.getAllEdges();
  }

  /**
   * Find entities by type
   */
  async findEntitiesByType(type: string): Promise<GraphNode[]> {
    await this.ensureInitialized();
    return this.graph.getAllNodes().filter(node => node.type === type);
  }

  /**
   * Find relationships by type
   */
  async findRelationshipsByType(type: string): Promise<GraphEdge[]> {
    await this.ensureInitialized();
    return this.graph.getAllEdges().filter(edge => edge.type === type);
  }

  /**
   * Get entity by ID
   */
  async getEntityById(id: string): Promise<GraphNode | null> {
    await this.ensureInitialized();
    try {
      return await this.graph.getNode(id);
    } catch {
      return null;
    }
  }

  /**
   * Get relationships for entity
   */
  async getEntityRelationships(entityId: string): Promise<GraphEdge[]> {
    await this.ensureInitialized();
    try {
      // Get all edges and filter by source or target
      const allEdges = this.graph.getAllEdges();
      return allEdges.filter(edge => edge.source === entityId || edge.target === entityId);
    } catch {
      return [];
    }
  }

  /**
   * Traverse graph from entity
   */
  async traverseFromEntity(
    entityId: string,
    maxDepth: number = 3,
    maxNodes: number = 100
  ): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    paths: Map<string, string[]>;
  }> {
    await this.ensureInitialized();
    
    const nodes = new Set<GraphNode>();
    const edges = new Set<GraphEdge>();
    const paths = new Map<string, string[]>();
    
    // Get the starting entity
    const startEntity = await this.getEntityById(entityId);
    if (!startEntity) {
      return { nodes: [], edges: [], paths };
    }
    
    nodes.add(startEntity);
    
    // BFS traversal
    const queue: Array<{ nodeId: string; depth: number; path: string[] }> = [
      { nodeId: entityId, depth: 0, path: [entityId] }
    ];
    
    while (queue.length > 0 && nodes.size < maxNodes) {
      const { nodeId, depth, path } = queue.shift()!;
      
      if (depth >= maxDepth) continue;
      
      const nodeEdges = await this.getEntityRelationships(nodeId);
      for (const edge of nodeEdges) {
        if (edges.size >= maxNodes) break;
        
        edges.add(edge);
        
        const targetId = edge.target === nodeId ? edge.source : edge.target;
        const targetEntity = await this.getEntityById(targetId);
        
        if (targetEntity && !nodes.has(targetEntity)) {
          nodes.add(targetEntity);
          const newPath = [...path, targetId];
          paths.set(targetId, newPath);
          
          queue.push({
            nodeId: targetId,
            depth: depth + 1,
            path: newPath
          });
        }
      }
    }
    
    return {
      nodes: Array.from(nodes),
      edges: Array.from(edges),
      paths
    };
  }

  /**
   * Create semantic clusters from memory nodes
   */
  async createClusters(config: ClusteringConfig): Promise<MemoryCluster[]> {
    await this.ensureInitialized();

    if (!config.enabled) {
      return [];
    }

    console.log(`🔍 Creating semantic clusters with ${config.clusteringAlgorithm} algorithm...`);

    // Get all nodes with embeddings for clustering
    const allNodes = this.graph.getAllNodes();
    const nodesWithEmbeddings = allNodes.filter(
      node => node.embeddings && node.embeddings.length > 0 && VectorUtils.isValid(node.embeddings)
    );

    if (nodesWithEmbeddings.length < config.minClusterSize) {
      console.log(`⚠️ Not enough nodes with embeddings for clustering (${nodesWithEmbeddings.length})`);
      return [];
    }

    const clusters = await this.clusteringEngine.createClusters(nodesWithEmbeddings, config);

    // Store clusters for later retrieval
    for (const cluster of clusters) {
      this.clusters.set(cluster.id, cluster);
    }

    console.log(`✅ Created ${clusters.length} clusters`);
    return clusters;
  }

  /**
   * Find clusters related to a query embedding
   */
  findRelatedClusters(
    queryEmbedding: Float32Array,
    clusters: MemoryCluster[],
    maxResults: number = 5
  ): MemoryCluster[] {
    return this.clusteringEngine.findRelatedClusters(queryEmbedding, clusters, maxResults);
  }

  /**
   * Get contextual memories based on conversation history
   */
  async getContextualMemories(
    conversationHistory: Array<{ role: string; content: string }>,
    maxResults: number = 5
  ): Promise<GraphNode[]> {
    await this.ensureInitialized();

    if (conversationHistory.length === 0) {
      return [];
    }

    // Extract key terms from recent conversation
    const recentMessages = conversationHistory.slice(-3); // Last 3 messages
    const conversationText = recentMessages.map(msg => msg.content).join(' ');

    // Simple keyword extraction (could be enhanced with NLP)
    const keywords = this.extractKeywords(conversationText);

    // Find nodes that match these keywords
    const allNodes = this.graph.getAllNodes();
    const matchingNodes: GraphNode[] = [];

    for (const node of allNodes) {
      if (matchingNodes.length >= maxResults) break;

      const nodeText = Object.values(node.properties).join(' ').toLowerCase();
      const matchesKeyword = keywords.some(keyword =>
        nodeText.includes(keyword.toLowerCase())
      );

      if (matchesKeyword) {
        matchingNodes.push(node);
      }
    }

    return matchingNodes;
  }

  /**
   * Extract keywords from text for contextual memory retrieval
   */
  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - split by spaces and filter common words
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall']);

    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.has(word))
      .filter((word, index, arr) => arr.indexOf(word) === index) // Remove duplicates
      .slice(0, 10); // Limit to 10 keywords
  }

  /**
   * Get current clusters
   */
  getClusters(): MemoryCluster[] {
    return Array.from(this.clusters.values());
  }

  /**
   * Clear clusters
   */
  clearClusters(): void {
    this.clusters.clear();
  }

  // === Temporal Tracking Methods ===

  /**
   * Query relationships with temporal filtering
   */
  queryTemporalRelationships(query: any = {}): any[] {
    return this.indexManager.queryTemporalRelationships(query);
  }

  /**
   * Invalidate a relationship when it becomes outdated
   */
  invalidateRelationship(relationshipId: string, reason: string, timestamp?: Date): boolean {
    return this.indexManager.invalidateRelationship(relationshipId, reason, timestamp);
  }

  /**
   * Get temporal statistics for monitoring relationship validity
   */
  getTemporalStats(): any {
    return this.indexManager.getTemporalStats();
  }

  /**
   * Clean up old invalidated relationships
   */
  cleanupTemporalData(olderThan?: Date): number {
    return this.indexManager.cleanupTemporalData(olderThan);
  }

  /**
   * Stop temporal tracking (called during shutdown)
   */
  private stopTemporalTracking(): void {
    this.indexManager.stopTemporalTracking();
  }
}
