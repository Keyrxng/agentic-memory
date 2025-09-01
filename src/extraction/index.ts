/**
 * Extraction module exports
 * 
 * This module provides both programmatic and LLM-based approaches
 * for entity and relationship extraction from text.
 * 
 * Choose the approach that best fits your needs:
 * - Programmatic: Fast, deterministic, scalable (94% of LLM performance)
 * - LLM-based: More accurate, context-aware, handles complex structures
 */

// Export the original programmatic extractor
export { DependencyBasedExtractor, type ExtractionConfig, type ExtractionResult } from './extractor.js';

// Export the new LLM-based extractor
export { LLMBasedExtractor, type LLMExtractionConfig, type LLMExtractionResult } from './llm-extractor.js';

// Export example usage
export { runExamples } from './llm-extractor-example.js';

// Re-export common types
export type { EntityRecord, RelationshipRecord, DependencyRelation, GraphContext } from '../core/types.js';
