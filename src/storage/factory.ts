/**
 * Storage factory for creating and managing storage instances
 *
 * Provides a centralized way to create different types of storage backends
 * with proper configuration validation and error handling.
 */

import type { StorageConfig, StorageFactory, GraphStorage } from './types.js';
import { JSONLGraphStorage } from './jsonl-storage.js';

/**
 * Default storage factory implementation
 */
export class DefaultStorageFactory implements StorageFactory {
  /**
   * Create a storage instance based on configuration
   */
  async create(config: StorageConfig): Promise<GraphStorage> {
    // Validate configuration
    const validation = this.validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid storage configuration: ${validation.errors.join(', ')}`);
    }

    // For now, we only support JSONL storage
    // In the future, this could support different storage backends
    const storage = new JSONLGraphStorage();

    // Initialize the storage
    const result = await storage.initialize(config);
    if (!result.success) {
      throw new Error(`Failed to initialize storage: ${result.errors?.join(', ')}`);
    }

    return storage;
  }

  /**
   * Get available storage types
   */
  getAvailableTypes(): string[] {
    return ['jsonl'];
  }

  /**
   * Validate storage configuration
   */
  validateConfig(config: StorageConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.directory || config.directory.trim().length === 0) {
      errors.push('Directory is required');
    }

    if (config.maxFileSize <= 0) {
      errors.push('Max file size must be positive');
    }

    if (config.maxItemsPerFile <= 0) {
      errors.push('Max items per file must be positive');
    }

    if (config.backupRetentionDays < 0) {
      errors.push('Backup retention days cannot be negative');
    }

    if (config.compressionEnabled && !['gzip', 'brotli'].includes(config.compressionAlgorithm)) {
      errors.push('Invalid compression algorithm');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Create a default storage configuration
 */
export function createDefaultStorageConfig(directory: string): StorageConfig {
  return {
    directory,
    compressionEnabled: false,
    compressionAlgorithm: 'gzip',
    maxFileSize: 100 * 1024 * 1024, // 100MB
    maxItemsPerFile: 10000,
    enableBackups: true,
    backupRetentionDays: 30,
    enableWAL: true
  };
}

/**
 * Create a storage instance with default configuration
 */
export async function createStorage(directory: string): Promise<GraphStorage> {
  const factory = new DefaultStorageFactory();
  const config = createDefaultStorageConfig(directory);
  return factory.create(config);
}
