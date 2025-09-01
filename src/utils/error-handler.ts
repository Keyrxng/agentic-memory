/**
 * Standardized error handling utilities for the agentic memory system
 * 
 * Provides consistent error logging, categorization, and recovery patterns
 * across all components of the system.
 */

/**
 * Error categories for better classification and handling
 */
export enum ErrorCategory {
  STORAGE = 'storage',
  INDEXING = 'indexing',
  EXTRACTION = 'extraction',
  CLUSTERING = 'clustering',
  TEMPORAL = 'temporal',
  CONFIGURATION = 'configuration',
  VALIDATION = 'validation',
  NETWORK = 'network',
  PROCESSING = 'processing'
}

/**
 * Error severity levels for prioritization
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Structured error information
 */
export interface ErrorInfo {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError?: Error;
  context?: Record<string, any>;
  timestamp: Date;
  recoveryHint?: string;
}

/**
 * Error result for operations that can fail gracefully
 */
export interface ErrorResult<T = any> {
  success: false;
  error: ErrorInfo;
  partialData?: T;
}

/**
 * Success result for operations
 */
export interface SuccessResult<T = any> {
  success: true;
  data: T;
}

/**
 * Combined result type for fallible operations
 */
export type OperationResult<T = any> = SuccessResult<T> | ErrorResult<T>;

/**
 * Standard error handler with categorization and recovery hints
 */
export class ErrorHandler {
  private static errorCounts = new Map<string, number>();
  private static maxRetries = 3;

  /**
   * Handle an error with proper categorization and logging
   */
  static handle(
    category: ErrorCategory,
    severity: ErrorSeverity,
    message: string,
    originalError?: Error,
    context?: Record<string, any>,
    recoveryHint?: string
  ): ErrorInfo {
    const errorInfo: ErrorInfo = {
      category,
      severity,
      message,
      originalError,
      context,
      timestamp: new Date(),
      recoveryHint
    };

    this.logError(errorInfo);
    this.trackErrorFrequency(category, message);

    return errorInfo;
  }

  /**
   * Create a standardized error result
   */
  static createErrorResult<T>(
    category: ErrorCategory,
    severity: ErrorSeverity,
    message: string,
    originalError?: Error,
    context?: Record<string, any>,
    partialData?: T,
    recoveryHint?: string
  ): ErrorResult<T> {
    const error = this.handle(category, severity, message, originalError, context, recoveryHint);
    
    return {
      success: false,
      error,
      partialData
    };
  }

  /**
   * Create a standardized success result
   */
  static createSuccessResult<T>(data: T): SuccessResult<T> {
    return {
      success: true,
      data
    };
  }

  /**
   * Wrap an operation with error handling
   */
  static async wrapOperation<T>(
    operation: () => Promise<T>,
    category: ErrorCategory,
    operationName: string,
    context?: Record<string, any>
  ): Promise<OperationResult<T>> {
    try {
      const result = await operation();
      return this.createSuccessResult(result);
    } catch (error) {
      const message = `Failed to ${operationName}`;
      const errorInfo = this.createErrorResult(
        category,
        ErrorSeverity.MEDIUM,
        message,
        error instanceof Error ? error : new Error(String(error)),
        context,
        undefined,
        `Check ${category} configuration and retry`
      );
      
      return errorInfo;
    }
  }

  /**
   * Wrap an operation with retry logic
   */
  static async wrapOperationWithRetry<T>(
    operation: () => Promise<T>,
    category: ErrorCategory,
    operationName: string,
    context?: Record<string, any>,
    maxRetries: number = this.maxRetries
  ): Promise<OperationResult<T>> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Log successful retry if this wasn't the first attempt
        if (attempt > 1) {
          console.log(`✅ ${operationName} succeeded on attempt ${attempt}/${maxRetries}`);
        }
        
        return this.createSuccessResult(result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          console.warn(`⚠️ ${operationName} failed (attempt ${attempt}/${maxRetries}), retrying...`);
          await this.sleep(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
        }
      }
    }

    const message = `Failed to ${operationName} after ${maxRetries} attempts`;
    return this.createErrorResult(
      category,
      ErrorSeverity.HIGH,
      message,
      lastError,
      { ...context, attempts: maxRetries },
      undefined,
      `Check ${category} configuration, network connectivity, and system resources`
    );
  }

  /**
   * Log error with appropriate formatting
   */
  private static logError(errorInfo: ErrorInfo): void {
    const emoji = this.getSeverityEmoji(errorInfo.severity);
    const timestamp = errorInfo.timestamp.toISOString();
    
    const logMessage = [
      `${emoji} [${errorInfo.category.toUpperCase()}] ${errorInfo.message}`,
      `   Severity: ${errorInfo.severity}`,
      `   Time: ${timestamp}`,
      errorInfo.context ? `   Context: ${JSON.stringify(errorInfo.context)}` : '',
      errorInfo.recoveryHint ? `   💡 Hint: ${errorInfo.recoveryHint}` : '',
      errorInfo.originalError ? `   Original: ${errorInfo.originalError.message}` : ''
    ].filter(Boolean).join('\n');

    if (errorInfo.severity === ErrorSeverity.CRITICAL) {
      console.error(logMessage);
    } else if (errorInfo.severity === ErrorSeverity.HIGH) {
      console.warn(logMessage);
    } else {
      console.log(logMessage);
    }
  }

  /**
   * Track error frequency for monitoring
   */
  private static trackErrorFrequency(category: ErrorCategory, message: string): void {
    const key = `${category}:${message}`;
    const currentCount = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, currentCount + 1);

    // Alert on frequent errors
    if (currentCount > 5) {
      console.warn(`🔔 Frequent error detected: ${key} (${currentCount + 1} times)`);
    }
  }

  /**
   * Get emoji for error severity
   */
  private static getSeverityEmoji(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return '🚨';
      case ErrorSeverity.HIGH: return '⚠️';
      case ErrorSeverity.MEDIUM: return '⚡';
      case ErrorSeverity.LOW: return 'ℹ️';
      default: return '❓';
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics for monitoring
   */
  static getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts.entries());
  }

  /**
   * Reset error statistics
   */
  static resetErrorStats(): void {
    this.errorCounts.clear();
  }
}

/**
 * Common error recovery strategies
 */
export class ErrorRecovery {
  /**
   * Try to recover from storage errors
   */
  static async recoverFromStorageError<T>(
    operation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>
  ): Promise<OperationResult<T>> {
    const result = await ErrorHandler.wrapOperationWithRetry(
      operation,
      ErrorCategory.STORAGE,
      'storage operation'
    );

    if (!result.success && fallbackOperation) {
      console.log('🔄 Attempting fallback operation...');
      return ErrorHandler.wrapOperation(
        fallbackOperation,
        ErrorCategory.STORAGE,
        'fallback storage operation'
      );
    }

    return result;
  }

  /**
   * Try to recover from indexing errors
   */
  static async recoverFromIndexingError<T>(
    operation: () => Promise<T>,
    rebuildIndex?: () => Promise<void>
  ): Promise<OperationResult<T>> {
    const result = await ErrorHandler.wrapOperation(
      operation,
      ErrorCategory.INDEXING,
      'indexing operation'
    );

    if (!result.success && rebuildIndex) {
      console.log('🔄 Attempting index rebuild...');
      const rebuildResult = await ErrorHandler.wrapOperation(
        rebuildIndex,
        ErrorCategory.INDEXING,
        'index rebuild'
      );

      if (rebuildResult.success) {
        return ErrorHandler.wrapOperation(
          operation,
          ErrorCategory.INDEXING,
          'indexing operation (after rebuild)'
        );
      }
    }

    return result;
  }
}
