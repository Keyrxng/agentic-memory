/**
 * Indexing Module for GraphRAG Agentic Memory
 *
 * Provides multi-modal indexing capabilities for efficient querying:
 * - Label Index: Fast node type filtering
 * - Property Index: Attribute-based queries with range/exact matching
 * - Text Index: Full-text search with tokenization and fuzzy matching
 * - Vector Index: Embedding similarity search with multiple distance metrics
 * - Pattern Index: Graph pattern matching and subgraph isomorphism
 *
 * The indexing system supports both exact and approximate matching,
 * with configurable thresholds and performance optimizations.
 */

export * from './types.js';
export * from './label-index.js';
export * from './property-index.js';
export * from './text-index.js';
export * from './vector-index.js';
export * from './pattern-index.js';

// Re-export for convenience
export type { GraphIndex, IndexEntry, QueryOptions, IndexStats } from './types.js';
export { LabelIndex } from './label-index.js';
export { PropertyIndex } from './property-index.js';
export { TextIndex } from './text-index.js';
export { VectorIndex } from './vector-index.js';
export { PatternIndex } from './pattern-index.js';
