/**
 * Storage module for the GraphRAG agentic memory system
 *
 * This module provides persistent storage capabilities for the knowledge graph,
 * enabling disk-based persistence with configurable compression and memory-bounded
 * loading for large knowledge graphs.
 */

// Export types
export type {
  StorageConfig,
  StorageResult,
  StorageStats,
  GraphStorage,
  StorageMigration,
  StorageFactory
} from './types.js';
export type { PersistentGraphConfig } from './persistent-graph.js';

// Export implementations
export { JSONLGraphStorage } from './jsonl-storage.js';
export {
  DefaultStorageFactory,
  createDefaultStorageConfig,
  createStorage
} from './factory.js';
export { PersistentGraph } from './persistent-graph.js';

// Re-export core types for convenience
export type {
  GraphNode,
  GraphEdge,
  GraphConfig
} from '../core/types.js';
