/**
 * Entity and relationship extraction module
 * 
 * Provides both traditional entity extraction and the new dual graph architecture:
 * - Traditional extractors for backward compatibility
 * - Dual graph extractors for advanced knowledge representation
 */

// Traditional extractors (backward compatibility)
export { DependencyBasedExtractor } from './extractor.js';
export { LLMBasedExtractor } from './llm-extractor.js';
export { EntityResolver } from './resolver.js';

// Dual graph architecture components
export { LexicalGraphExtractor } from './lexical-extractor.js';
export { DomainGraphExtractor } from './domain-extractor.js';
export { CrossGraphLinker } from './cross-graph-linker.js';
export { DualGraphExtractor } from './dual-graph-extractor.js';

// Traditional types
export type {
  ExtractionConfig,
  ExtractionResult,
  ResolutionResult
} from './extractor.js';

export type {
  LLMExtractionConfig,
  LLMExtractionResult
} from './llm-extractor.js';

export type {
  ResolutionConfig,
  DetailedResolutionResult
} from './resolver.js';

// Dual graph types
export type {
  LexicalExtractionConfig,
  LexicalExtractionResult
} from './lexical-extractor.js';

export type {
  DomainExtractionConfig,
  DomainExtractionResult
} from './domain-extractor.js';

export type {
  CrossGraphLinkingConfig,
  CrossGraphLinkingResult
} from './cross-graph-linker.js';

export type {
  DualGraphExtractionConfig,
  ExtractionProgress
} from './dual-graph-extractor.js';
