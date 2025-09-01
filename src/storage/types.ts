/**
 * Storage module for the GraphRAG agentic memory system
 *
 * Provides persistent storage capabilities for the knowledge graph,
 * supporting JSONL format for incremental loading and streaming processing.
 * Implements disk-based persistence with configurable compression and
 * memory-bounded loading for large knowledge graphs.
 *
 * Key Features:
 * - JSONL-based storage for efficient streaming
 * - Configurable compression and chunking
 * - Memory-bounded loading with progressive processing
 * - Backup and recovery capabilities
 * - Migration support for schema evolution
 *
 * References:
 * - JSONL streaming: https://jsonlines.org/
 * - Progressive loading: https://blog.tomsawyer.com/json-graph-visualization-techniques
 */

import type { GraphNode, GraphEdge, GraphConfig } from '../core/types.js';

/**
 * Storage operation result with metadata
 */
export interface StorageResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Number of items processed */
  count: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** Any errors encountered */
  errors?: string[];
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Storage statistics for monitoring
 */
export interface StorageStats {
  /** Total nodes stored */
  totalNodes: number;
  /** Total edges stored */
  totalEdges: number;
  /** Storage size in bytes */
  storageSize: number;
  /** Last backup timestamp */
  lastBackup?: Date;
  /** Compression ratio (if enabled) */
  compressionRatio?: number;
  /** File count and sizes */
  files: Array<{
    path: string;
    size: number;
    itemCount: number;
    lastModified: Date;
  }>;
}

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /** Base directory for storage files */
  directory: string;
  /** Enable compression for storage files */
  compressionEnabled: boolean;
  /** Compression algorithm to use */
  compressionAlgorithm: 'gzip' | 'brotli';
  /** Maximum file size before creating new chunk */
  maxFileSize: number;
  /** Maximum items per file */
  maxItemsPerFile: number;
  /** Enable automatic backups */
  enableBackups: boolean;
  /** Backup retention period in days */
  backupRetentionDays: number;
  /** Enable WAL (Write-Ahead Logging) for crash recovery */
  enableWAL: boolean;
}

/**
 * Base storage interface for graph persistence
 */
export interface GraphStorage {
  /**
   * Initialize the storage system
   */
  initialize(config: StorageConfig): Promise<StorageResult>;

  /**
   * Store nodes to persistent storage
   */
  storeNodes(nodes: GraphNode[]): Promise<StorageResult>;

  /**
   * Store edges to persistent storage
   */
  storeEdges(edges: GraphEdge[]): Promise<StorageResult>;

  /**
   * Load nodes from persistent storage
   * Supports progressive loading with limits
   */
  loadNodes(options?: {
    limit?: number;
    offset?: number;
    nodeTypes?: string[];
    since?: Date;
  }): Promise<{ nodes: GraphNode[]; hasMore: boolean }>;

  /**
   * Load edges from persistent storage
   * Supports progressive loading with limits
   */
  loadEdges(options?: {
    limit?: number;
    offset?: number;
    edgeTypes?: string[];
    since?: Date;
  }): Promise<{ edges: GraphEdge[]; hasMore: boolean }>;

  /**
   * Delete nodes from storage
   */
  deleteNodes(nodeIds: string[]): Promise<StorageResult>;

  /**
   * Delete edges from storage
   */
  deleteEdges(edgeIds: string[]): Promise<StorageResult>;

  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;

  /**
   * Create a backup of current storage
   */
  createBackup(name?: string): Promise<StorageResult>;

  /**
   * Restore from a backup
   */
  restoreFromBackup(name: string): Promise<StorageResult>;

  /**
   * Clean up old backups
   */
  cleanupBackups(): Promise<StorageResult>;

  /**
   * Close storage connections and cleanup
   */
  close(): Promise<void>;
}

/**
 * Migration operation for schema evolution
 */
export interface StorageMigration {
  /** Migration version identifier */
  version: string;
  /** Human-readable description */
  description: string;
  /** Migration timestamp */
  timestamp: Date;

  /**
   * Execute the migration
   */
  up(storage: GraphStorage): Promise<StorageResult>;

  /**
   * Rollback the migration
   */
  down(storage: GraphStorage): Promise<StorageResult>;
}

/**
 * Storage factory for creating storage instances
 */
export interface StorageFactory {
  /**
   * Create a storage instance
   */
  create(config: StorageConfig): Promise<GraphStorage>;

  /**
   * Get available storage types
   */
  getAvailableTypes(): string[];

  /**
   * Validate storage configuration
   */
  validateConfig(config: StorageConfig): { valid: boolean; errors: string[] };
}
