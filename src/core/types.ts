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

/**
 * Dual Graph Architecture Types
 * 
 * Implements separation of concerns between lexical (textual) and domain (semantic) graphs
 */

/**
 * Text chunk for lexical graph processing
 */
export interface TextChunk {
  /** Unique identifier for the chunk */
  id: string;
  /** Text content of the chunk */
  content: string;
  /** Metadata about the chunk */
  metadata: {
    /** Source of the text */
    source: string;
    /** When the chunk was created */
    timestamp: Date;
    /** Type of text chunk */
    chunkType: 'sentence' | 'paragraph' | 'section' | 'document';
    /** Position in the source text */
    position: number;
    /** Confidence in chunk quality */
    confidence: number;
  };
  /** Vector embeddings for similarity search */
  embeddings?: Float32Array;
}

/**
 * Lexical relationship between text chunks
 */
export interface LexicalRelation {
  /** Unique identifier for the relationship */
  id: string;
  /** Source text chunk ID */
  source: string;
  /** Target text chunk ID */
  target: string;
  /** Type of lexical relationship */
  type: 'co_occurrence' | 'n_gram' | 'semantic_similarity' | 'sequential' | 'hierarchical';
  /** Weight/strength of the relationship */
  weight: number;
  /** Additional metadata */
  metadata: Record<string, any>;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Lexical graph for textual content and retrieval
 */
export interface LexicalGraph {
  /** Unique identifier for the lexical graph */
  id: string;
  /** Graph type identifier */
  type: 'lexical';
  /** Text chunks in the graph */
  textChunks: Map<string, TextChunk>;
  /** Lexical relationships between chunks */
  lexicalRelations: Map<string, LexicalRelation>;
  /** Embeddings for similarity search */
  embeddings: Map<string, Float32Array>;
  /** Retrieval indices for efficient querying */
  retrievalIndices: {
    textIndex: Map<string, Set<string>>;
    vectorIndex: Map<string, Float32Array>;
    chunkTypeIndex: Map<string, Set<string>>;
  };
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Entity hierarchy for domain organization
 */
export interface EntityHierarchy {
  /** Unique identifier for the hierarchy */
  id: string;
  /** Root entity ID */
  rootEntityId: string;
  /** Parent-child relationships */
  parentChild: Map<string, string[]>;
  /** Sibling relationships */
  siblings: Map<string, string[]>;
  /** Hierarchy type */
  type: 'taxonomy' | 'organization' | 'concept' | 'temporal';
  /** Confidence in hierarchy structure */
  confidence: number;
}

/**
 * Domain graph for semantic relationships and entities
 */
export interface DomainGraph {
  /** Unique identifier for the domain graph */
  id: string;
  /** Graph type identifier */
  type: 'domain';
  /** Entities in the domain */
  entities: Map<string, EntityRecord>;
  /** Semantic relationships between entities */
  semanticRelations: Map<string, RelationshipRecord>;
  /** Entity hierarchies and taxonomies */
  entityHierarchies: Map<string, EntityHierarchy>;
  /** Domain-specific indices */
  domainIndices: {
    entityTypeIndex: Map<string, Set<string>>;
    relationshipTypeIndex: Map<string, Set<string>>;
    confidenceIndex: Map<number, Set<string>>;
  };
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Cross-graph link connecting lexical and domain elements
 */
export interface CrossGraphLink {
  /** Unique identifier for the link */
  id: string;
  /** Source graph identifier */
  sourceGraph: 'lexical' | 'domain';
  /** Source element ID */
  sourceId: string;
  /** Target graph identifier */
  targetGraph: 'lexical' | 'domain';
  /** Target element ID */
  targetId: string;
  /** Type of cross-graph relationship */
  type: 'entity_mention' | 'evidence_support' | 'semantic_grounding' | 'temporal_alignment';
  /** Confidence in the link */
  confidence: number;
  /** Additional metadata */
  metadata: Record<string, any>;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * Dual graph result from extraction
 */
export interface DualGraphResult {
  /** Lexical graph for textual content */
  lexicalGraph: LexicalGraph;
  /** Domain graph for semantic relationships */
  domainGraph: DomainGraph;
  /** Cross-graph links */
  crossLinks: CrossGraphLink[];
  /** Extraction metadata */
  metadata: {
    processingTime: number;
    textLength: number;
    chunksCreated: number;
    entitiesExtracted: number;
    relationshipsExtracted: number;
    crossLinksCreated: number;
  };
}

/**
 * Query for dual graph system
 */
export interface DualGraphQuery {
  /** Lexical query for text retrieval */
  lexicalQuery?: {
    textSearch?: string;
    vectorSearch?: Float32Array;
    chunkType?: string;
    source?: string;
  };
  /** Domain query for semantic search */
  domainQuery?: {
    entityTypes?: string[];
    relationshipTypes?: string[];
    entityNames?: string[];
    confidenceThreshold?: number;
  };
  /** Cross-graph query for bridging both graphs */
  crossGraphQuery?: {
    linkTypes?: string[];
    sourceGraph?: 'lexical' | 'domain';
    targetGraph?: 'lexical' | 'domain';
  };
  /** Query options */
  options?: {
    limit?: number;
    includeMetadata?: boolean;
    sortBy?: 'relevance' | 'confidence' | 'timestamp';
  };
}

/**
 * Result of dual graph query
 */
export interface DualGraphQueryResult {
  /** Lexical results */
  lexicalResults: {
    chunks: TextChunk[];
    relations: LexicalRelation[];
    relevanceScores: Map<string, number>;
  };
  /** Domain results */
  domainResults: {
    entities: EntityRecord[];
    relationships: RelationshipRecord[];
    hierarchies: EntityHierarchy[];
    relevanceScores: Map<string, number>;
  };
  /** Cross-graph results */
  crossGraphResults: {
    links: CrossGraphLink[];
    relevanceScores: Map<string, number>;
  };
  /** Combined relevance ranking */
  combinedResults: Array<{
    id: string;
    type: 'lexical' | 'domain' | 'cross';
    relevance: number;
    metadata: any;
  }>;
  /** Query metadata */
  metadata: {
    queryTime: number;
    totalResults: number;
    processingDetails: Record<string, any>;
  };
}
