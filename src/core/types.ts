/**
 * Core type definitions for the GraphRAG agentic memory system
 * 
 * This module defines the fundamental data structures used throughout the system
 * for graph representation and storage optimization.
 * 
 * References:
 * - Adjacency List optimization: https://codevisionz.com/lessons/adjacency-matrix-vs-adjacency-list/
 * - Graph representation strategies: https://stackoverflow.com/questions/2218322/what-is-better-adjacency-lists-or-adjacency-matrices-for-graph-problems-in-c
 */

/**
 * Represents a node in the knowledge graph
 * Contains both the semantic information and optional vector embeddings
 * for similarity-based retrieval operations
 */
export interface GraphNode {
  /** Unique identifier for the node */
  id: string;
  /** Type classification (e.g., 'person', 'concept', 'event') */
  type: string;
  /** Flexible property storage for entity attributes */
  properties: Record<string, any>;
  /** Optional vector embeddings for semantic similarity */
  embeddings?: Float32Array;
  /** Creation timestamp for temporal tracking */
  createdAt: Date;
  /** Last modification timestamp */
  updatedAt: Date;
}

/**
 * Represents a directed edge between two nodes
 * Includes weight for relationship strength and properties for metadata
 */
export interface GraphEdge {
  /** Unique identifier for the edge */
  id: string;
  /** Source node identifier */
  source: string;
  /** Target node identifier */
  target: string;
  /** Relationship type (e.g., 'knows', 'works_at', 'contains') */
  type: string;
  /** Numeric weight representing relationship strength or confidence */
  weight: number;
  /** Additional metadata about the relationship */
  properties: Record<string, any>;
  /** Creation timestamp for temporal tracking */
  createdAt: Date;
  /** Last modification timestamp */
  updatedAt: Date;
}

/**
 * Enhanced edge with temporal validity periods
 * Implements Zep's temporal architecture approach for tracking
 * when relationships become invalid rather than just creation time
 * 
 * Reference: https://arxiv.org/html/2501.13956v1
 */
export interface TemporalEdge extends GraphEdge {
  /** When this relationship became valid */
  validFrom: Date;
  /** When this relationship becomes/became invalid (null = still valid) */
  validUntil?: Date;
  /** Classification of temporal relationship type */
  temporalType: 'fact' | 'event' | 'state';
}

/**
 * Optimized storage format for entities in JSONL files
 * Minimizes metadata overhead while enabling fast parsing
 * 
 * Reference: https://blog.tomsawyer.com/json-graph-visualization-techniques
 */
export interface EntityRecord {
  id: string;
  type: string;
  name: string;
  properties: Record<string, any>;
  embeddings?: number[];
}

/**
 * Optimized storage format for relationships in JSONL files
 */
export interface RelationshipRecord {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  properties: Record<string, any>;
}

/**
 * Context information for graph operations
 * Follows 12-factor agent principles with explicit context passing
 * 
 * Reference: https://dzone.com/articles/understanding-twelve-factor-agents
 */
export interface GraphContext {
  /** User identifier for multi-tenant scenarios */
  userId: string;
  /** Session identifier for conversation tracking */
  sessionId: string;
  /** Operation timestamp */
  timestamp: Date;
  /** Currently relevant entities for context-aware operations */
  relevantEntities: string[];
  /** Source of the information (e.g., 'conversation', 'document', 'inference') */
  source: string;
}

/**
 * Dependency relation structure for entity extraction
 * Used in dependency-based extraction that achieves 94% of LLM performance
 * with significantly better scalability
 * 
 * Reference: https://arxiv.org/html/2507.03226v2
 */
export interface DependencyRelation {
  /** Head word in the dependency relation */
  head: string;
  /** Dependent word in the relation */
  dependent: string;
  /** Type of syntactic relation */
  relation: string;
  /** Confidence score for the extracted relation */
  confidence: number;
}

/**
 * Query specification for graph operations
 * Supports complex multi-modal queries with filtering and expansion
 */
export interface GraphQuery {
  /** Node type filters */
  nodeTypes?: string[];
  /** Edge type filters */
  edgeTypes?: string[];
  /** Property-based filters */
  propertyFilters?: Array<{
    property: string;
    operator: 'eq' | 'ne' | 'lt' | 'gt' | 'contains' | 'matches';
    value: any;
  }>;
  /** Text search terms */
  textSearch?: string;
  /** Vector similarity search */
  vectorSearch?: {
    embedding: Float32Array;
    threshold: number;
    topK: number;
  };
  /** Subgraph expansion specification */
  expand?: {
    maxDepth: number;
    relationTypes?: string[];
    direction: 'out' | 'in' | 'both';
  };
  /** Maximum results to return */
  limit?: number;
}

/**
 * Result of a graph query operation
 */
export interface QueryResult {
  /** Matching nodes */
  nodes: GraphNode[];
  /** Related edges (if expansion was requested) */
  edges?: GraphEdge[];
  /** Query execution metadata */
  metadata: {
    executionTime: number;
    totalMatches: number;
    indexesUsed: string[];
  };
}

/**
 * Pattern for subgraph matching queries
 * Used in constraint-based algorithms for structural pattern matching
 * 
 * Reference: https://arxiv.org/pdf/2312.02988.pdf
 */
export interface QueryPattern {
  nodes: Array<{
    id: string;
    type?: string;
    properties?: Record<string, any>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type?: string;
  }>;
}

/**
 * Graph-specific performance metrics
 * Tracks graph health and query performance for monitoring
 */
export interface GraphMetrics {
  /** Total number of nodes in the graph */
  nodeCount: number;
  /** Total number of edges in the graph */
  edgeCount: number;
  /** Graph density (edges / possible edges) */
  density: number;
  /** Query latency by query type */
  queryLatency: Map<string, number>;
  /** Index hit rates by index type */
  indexHitRate: Map<string, number>;
  /** Entity resolution accuracy rate */
  entityResolutionAccuracy: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Cache hit rate percentage */
  cacheHitRate: number;
}

/**
 * Configuration for the graph system
 */
export type GraphConfig = {
  /** Maximum number of nodes to keep in memory */
  maxNodes: number;
  /** Maximum edges per node for traversal limits */
  maxEdgesPerNode: number;
  /** Entity resolution similarity threshold */
  entityResolutionThreshold: number;
  /** Enable temporal edge management */
  enableTemporal: boolean;
  /** Index configuration */
  indexing: {
    enableFullText: boolean;
    enableVector: boolean;
    enableProperty: boolean;
  };
  /** Storage configuration */
  storage: {
    persistToDisk: boolean;
    storageDirectory: string;
    compressionEnabled: boolean;
    syncInterval: number;
  };
}
