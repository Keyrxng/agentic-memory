/**
 * Utility functions and classes for the agentic memory system
 */

export { VectorUtils } from './vector-utils.js';
export { EntityResolver } from './entity-resolver.js';
export { MemoryManager } from './memory-manager.js';
export { ClusteringEngine, type MemoryCluster, type ClusteringConfig } from './clustering-engine.js';
export { QueryProcessor } from './query-processor.js';
export { 
  ErrorHandler, 
  ErrorRecovery, 
  ErrorCategory, 
  ErrorSeverity,
  type ErrorInfo,
  type ErrorResult,
  type SuccessResult,
  type OperationResult
} from './error-handler.js';
