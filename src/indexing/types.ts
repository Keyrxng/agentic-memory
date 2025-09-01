/**
 * Multi-Modal Indexing System for GraphRAG Agentic Memory
 *
 * Implements comprehensive indexing strategies for efficient query processing:
 * - Label indices for node type filtering
 * - Property indices for attribute-based queries
 * - Full-text indices for keyword search
 * - Vector indices for embedding similarity
 * - Graph structure indices for relationship patterns
 *
 * Based on research-backed approaches for query optimization in graph databases.
 *
 * References:
 * - Multi-modal indexing: https://hypermode.com/blog/query-optimization
 * - Query optimization: https://memgraph.com/blog/query-optimization-in-memgraph-common-mistakes
 */

import type { GraphNode, GraphEdge, GraphQuery, QueryResult } from '../core/types.js';

/**
 * Index entry for efficient lookups
 */
export interface IndexEntry {
  /** Indexed value */
  key: any;
  /** Node IDs that match this value */
  nodeIds: Set<string>;
  /** Edge IDs that match this value (for relationship indices) */
  edgeIds?: Set<string>;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Base index interface
 */
export interface GraphIndex {
  /** Index name for identification */
  name: string;
  /** Index type classification */
  type: 'label' | 'property' | 'text' | 'vector' | 'structure';

  /** Add item to index */
  add(key: any, itemId: string, metadata?: any): void;

  /** Remove item from index */
  remove(key: any, itemId: string): void;

  /** Query index for matches */
  query(key: any, options?: QueryOptions): Set<string>;

  /** Get index statistics */
  getStats(): IndexStats;

  /** Clear index */
  clear(): void;

  /** Rebuild index from scratch */
  rebuild(items: Array<{id: string, data: any}>): Promise<void>;
}

/**
 * Query options for index operations
 */
export interface QueryOptions {
  /** Maximum results to return */
  limit?: number;
  /** Similarity threshold for fuzzy matching */
  threshold?: number;
  /** Include metadata in results */
  includeMetadata?: boolean;
  /** Sorting preference */
  sortBy?: 'relevance' | 'frequency' | 'alphabetical';
}

/**
 * Index statistics for monitoring
 */
export interface IndexStats {
  /** Total entries in index */
  totalEntries: number;
  /** Total indexed items */
  totalItems: number;
  /** Memory usage estimate */
  memoryUsage: number;
  /** Average items per entry */
  averageItemsPerEntry: number;
  /** Hit rate for queries */
  hitRate?: number;
  /** Last rebuild timestamp */
  lastRebuild?: Date;
}

/**
 * Configuration for index system
 */
export interface IndexingConfig {
  /** Enable label indexing */
  enableLabelIndex: boolean;
  /** Enable property indexing */
  enablePropertyIndex: boolean;
  /** Enable full-text indexing */
  enableTextIndex: boolean;
  /** Enable vector indexing */
  enableVectorIndex: boolean;
  /** Enable structure indexing */
  enableStructureIndex: boolean;
  /** Maximum text length for indexing */
  maxTextLength: number;
  /** Vector similarity threshold */
  vectorThreshold: number;
  /** Memory limit for indices */
  memoryLimit: number;
}

/**
 * Index manager for coordinating multiple indices
 */
export interface IndexManager {
  /** Add node to all relevant indices */
  indexNode(node: GraphNode): Promise<void>;

  /** Add edge to all relevant indices */
  indexEdge(edge: GraphEdge): Promise<void>;

  /** Remove node from all indices */
  removeNode(nodeId: string): Promise<void>;

  /** Remove edge from all indices */
  removeEdge(edgeId: string): Promise<void>;

  /** Query across all indices */
  query(query: GraphQuery): Promise<QueryResult>;

  /** Get combined statistics */
  getStats(): IndexingStats;

  /** Rebuild all indices */
  rebuildAll(): Promise<void>;

  /** Clear all indices */
  clearAll(): void;
}

/**
 * Combined indexing statistics
 */
export interface IndexingStats {
  /** Statistics by index type */
  byType: Map<string, IndexStats>;
  /** Overall system statistics */
  overall: {
    totalIndices: number;
    totalEntries: number;
    totalMemoryUsage: number;
    averageQueryTime: number;
  };
  /** Performance metrics */
  performance: {
    queryCount: number;
    cacheHitRate: number;
    rebuildFrequency: number;
  };
}
