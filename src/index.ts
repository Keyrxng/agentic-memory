/**
 * Core exports for the GraphRAG Agentic Memory System
 * 
 * This module exports all the main components and types for external usage.
 * Provides a clean API for integrating the agentic memory system into
 * other applications and services.
 */

// Core graph components
export { InMemoryGraph } from './core/graph.js';
export { GraphTraversal } from './core/traversal.js';

// Entity extraction and resolution
export { DependencyBasedExtractor } from './extraction/extractor.js';
export { EntityResolver } from './extraction/resolver.js';

// LLM-based extraction
export { LLMBasedExtractor } from './extraction/llm-extractor.js';

// Dual graph architecture components
export { LexicalGraphExtractor } from './extraction/lexical-extractor.js';
export { DomainGraphExtractor } from './extraction/domain-extractor.js';
export { CrossGraphLinker } from './extraction/cross-graph-linker.js';
export { DualGraphExtractor } from './extraction/dual-graph-extractor.js';

// Temporal management
export { TemporalGraph } from './temporal/temporal-graph.js';

// Main agent memory integration
export { AgentGraphMemory } from './agent/memory.js';

// Type definitions
export type {
  GraphNode,
  GraphEdge,
  TemporalEdge,
  EntityRecord,
  RelationshipRecord,
  DependencyRelation,
  GraphContext,
  GraphQuery,
  QueryResult,
  GraphMetrics,
  GraphConfig,
  // Dual graph types
  TextChunk,
  LexicalRelation,
  LexicalGraph,
  EntityHierarchy,
  DomainGraph,
  CrossGraphLink,
  DualGraphResult,
  DualGraphQuery,
  DualGraphQueryResult
} from './core/types.js';

// Extraction types
export type {
  ExtractionConfig,
  ExtractionResult,
  ResolutionResult
} from './extraction/extractor.js';

// Resolver types
export type {
  ResolutionConfig,
  DetailedResolutionResult
} from './extraction/resolver.js';

// LLM extraction types
export type {
  LLMExtractionConfig,
  LLMExtractionResult
} from './extraction/llm-extractor.js';

// Dual graph extraction types
export type {
  LexicalExtractionConfig,
  LexicalExtractionResult
} from './extraction/lexical-extractor.js';

export type {
  DomainExtractionConfig,
  DomainExtractionResult
} from './extraction/domain-extractor.js';

export type {
  CrossGraphLinkingConfig,
  CrossGraphLinkingResult
} from './extraction/cross-graph-linker.js';

export type {
  DualGraphExtractionConfig,
  ExtractionProgress
} from './extraction/dual-graph-extractor.js';

// Temporal types
export type {
  TemporalConfig,
  TemporalQuery
} from './temporal/temporal-graph.js';

// Storage components
export { JSONLGraphStorage, PersistentGraph } from './storage/index.js';
export {
  createStorage,
  createDefaultStorageConfig,
  DefaultStorageFactory
} from './storage/index.js';

// Storage types
export type {
  StorageConfig,
  StorageResult,
  StorageStats,
  GraphStorage,
  StorageMigration,
  StorageFactory,
  PersistentGraphConfig
} from './storage/index.js';

// Indexing components
export {
  LabelIndex,
  PropertyIndex,
  TextIndex,
  VectorIndex,
  PatternIndex
} from './indexing/index.js';

// Indexing types
export type {
  GraphIndex,
  IndexEntry,
  QueryOptions,
  IndexStats,
  IndexingConfig,
  IndexManager,
  IndexingStats
} from './indexing/index.js';
