/**
 * JSONL-based storage implementation for the GraphRAG agentic memory system
 *
 * Implements persistent storage using JSON Lines format for efficient streaming
 * and incremental processing. Supports compression, chunking, and memory-bounded
 * loading for large knowledge graphs.
 *
 * Features:
 * - JSONL format for line-by-line processing
 * - Configurable file chunking and compression
 * - Progressive loading with memory bounds
 * - Backup and recovery capabilities
 * - WAL (Write-Ahead Logging) for crash recovery
 *
 * References:
 * - JSONL specification: https://jsonlines.org/
 * - Streaming processing: https://blog.tomsawyer.com/json-graph-visualization-techniques
 */

import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import { join, dirname, basename } from 'path';
import { createGzip, createBrotliCompress, createGunzip, createBrotliDecompress } from 'zlib';
import { pipeline } from 'stream/promises';
import type {
  GraphNode,
  GraphEdge
} from '../core/types.js';
import type {
  StorageConfig,
  StorageResult,
  StorageStats,
  GraphStorage
} from './types.js';
import type { LexicalGraph, DomainGraph, CrossGraphLink } from '../core/types.js';

/**
 * JSONL-based storage implementation
 *
 * Uses JSON Lines format for efficient storage and streaming of graph data.
 * Each line contains a single JSON object representing either a node or edge.
 * Supports compression and automatic file chunking for large datasets.
 */
export class JSONLGraphStorage implements GraphStorage {
  private config!: StorageConfig;
  private initialized = false;
  private nodeFiles: string[] = [];
  private edgeFiles: string[] = [];
  private walFile?: string;
  private writeQueue: Array<{ type: 'node' | 'edge'; data: any }> = [];

  /**
   * Initialize the storage system
   */
  async initialize(config: StorageConfig): Promise<StorageResult> {
    const startTime = Date.now();

    try {
      this.config = config;

      // Create storage directory if it doesn't exist
      await fs.mkdir(config.directory, { recursive: true });

      // Create backup directory
      if (config.enableBackups) {
        await fs.mkdir(join(config.directory, 'backups'), { recursive: true });
      }

      // Initialize WAL if enabled
      if (config.enableWAL) {
        this.walFile = join(config.directory, 'wal.log');
      }

      // Scan existing files
      await this.scanExistingFiles();

      this.initialized = true;

      return {
        success: true,
        count: 0,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown initialization error']
      };
    }
  }

  /**
   * Store nodes to persistent storage
   */
  async storeNodes(nodes: GraphNode[]): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();

    try {
      const filePath = await this.getNextFilePath('nodes');
      const lines = nodes.map(node => JSON.stringify({
        type: 'node',
        data: node,
        timestamp: new Date().toISOString()
      }));

      await this.writeLinesToFile(filePath, lines);
      this.nodeFiles.push(filePath);

      // Write to WAL if enabled
      if (this.walFile) {
        await this.writeToWAL('nodes', nodes);
      }

      return {
        success: true,
        count: nodes.length,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown storage error']
      };
    }
  }

  /**
   * Store edges to persistent storage
   */
  async storeEdges(edges: GraphEdge[]): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();

    try {
      const filePath = await this.getNextFilePath('edges');
      const lines = edges.map(edge => JSON.stringify({
        type: 'edge',
        data: edge,
        timestamp: new Date().toISOString()
      }));

      await this.writeLinesToFile(filePath, lines);
      this.edgeFiles.push(filePath);

      // Write to WAL if enabled
      if (this.walFile) {
        await this.writeToWAL('edges', edges);
      }

      return {
        success: true,
        count: edges.length,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown storage error']
      };
    }
  }

  /**
   * Load nodes from persistent storage
   */
  async loadNodes(options: {
    limit?: number;
    offset?: number;
    nodeTypes?: string[];
    since?: Date;
  } = {}): Promise<{ nodes: GraphNode[]; hasMore: boolean }> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const nodes: GraphNode[] = [];
    let loaded = 0;
    let skipped = 0;
    const limit = options.limit || Infinity;
    const offset = options.offset || 0;

    for (const filePath of this.nodeFiles) {
      if (nodes.length >= limit) break;

      try {
        const fileNodes = await this.readNodesFromFile(filePath, options);

        for (const node of fileNodes) {
          if (skipped < offset) {
            skipped++;
            continue;
          }

          if (nodes.length >= limit) break;

          // Apply filters
          if (options.nodeTypes && !options.nodeTypes.includes(node.type)) {
            continue;
          }

          if (options.since && node.updatedAt < options.since) {
            continue;
          }

          nodes.push(node);
          loaded++;
        }
      } catch (error) {
        console.warn(`Failed to read nodes from ${filePath}:`, error);
      }
    }

    return {
      nodes,
      hasMore: loaded + skipped < await this.getTotalNodeCount()
    };
  }

  /**
   * Load edges from persistent storage
   */
  async loadEdges(options: {
    limit?: number;
    offset?: number;
    edgeTypes?: string[];
    since?: Date;
  } = {}): Promise<{ edges: GraphEdge[]; hasMore: boolean }> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const edges: GraphEdge[] = [];
    let loaded = 0;
    let skipped = 0;
    const limit = options.limit || Infinity;
    const offset = options.offset || 0;

    for (const filePath of this.edgeFiles) {
      if (edges.length >= limit) break;

      try {
        const fileEdges = await this.readEdgesFromFile(filePath, options);

        for (const edge of fileEdges) {
          if (skipped < offset) {
            skipped++;
            continue;
          }

          if (edges.length >= limit) break;

          // Apply filters
          if (options.edgeTypes && !options.edgeTypes.includes(edge.type)) {
            continue;
          }

          if (options.since && edge.updatedAt < options.since) {
            continue;
          }

          edges.push(edge);
          loaded++;
        }
      } catch (error) {
        console.warn(`Failed to read edges from ${filePath}:`, error);
      }
    }

    return {
      edges,
      hasMore: loaded + skipped < await this.getTotalEdgeCount()
    };
  }

  /**
   * Delete nodes from storage (soft delete by marking as deleted)
   */
  async deleteNodes(nodeIds: string[]): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();

    try {
      // For JSONL, we implement soft deletes by writing tombstone records
      const tombstones = nodeIds.map(id => ({
        type: 'node_delete',
        nodeId: id,
        timestamp: new Date().toISOString()
      }));

      const lines = tombstones.map(tombstone => JSON.stringify(tombstone));
      const filePath = await this.getNextFilePath('deletions');
      await this.writeLinesToFile(filePath, lines);

      return {
        success: true,
        count: nodeIds.length,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown deletion error']
      };
    }
  }

  /**
   * Delete edges from storage (soft delete by marking as deleted)
   */
  async deleteEdges(edgeIds: string[]): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();

    try {
      // For JSONL, we implement soft deletes by writing tombstone records
      const tombstones = edgeIds.map(id => ({
        type: 'edge_delete',
        edgeId: id,
        timestamp: new Date().toISOString()
      }));

      const lines = tombstones.map(tombstone => JSON.stringify(tombstone));
      const filePath = await this.getNextFilePath('deletions');
      await this.writeLinesToFile(filePath, lines);

      return {
        success: true,
        count: edgeIds.length,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown deletion error']
      };
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const files: StorageStats['files'] = [];
    let totalSize = 0;
    let totalNodes = 0;
    let totalEdges = 0;

    // Analyze node files
    for (const filePath of this.nodeFiles) {
      try {
        const stats = await fs.stat(filePath);
        const itemCount = await this.countItemsInFile(filePath);
        files.push({
          path: filePath,
          size: stats.size,
          itemCount,
          lastModified: stats.mtime
        });
        totalSize += stats.size;
        totalNodes += itemCount;
      } catch (error) {
        console.warn(`Failed to analyze file ${filePath}:`, error);
      }
    }

    // Analyze edge files
    for (const filePath of this.edgeFiles) {
      try {
        const stats = await fs.stat(filePath);
        const itemCount = await this.countItemsInFile(filePath);
        files.push({
          path: filePath,
          size: stats.size,
          itemCount,
          lastModified: stats.mtime
        });
        totalSize += stats.size;
        totalEdges += itemCount;
      } catch (error) {
        console.warn(`Failed to analyze file ${filePath}:`, error);
      }
    }

    return {
      totalNodes,
      totalEdges,
      storageSize: totalSize,
      files
    };
  }

  /**
   * Create a backup of current storage
   */
  async createBackup(name?: string): Promise<StorageResult> {
    if (!this.initialized || !this.config.enableBackups) {
      throw new Error('Backups not enabled or storage not initialized');
    }

    const startTime = Date.now();
    const backupName = name || `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const backupDir = join(this.config.directory, 'backups', backupName);

    try {
      await fs.mkdir(backupDir, { recursive: true });

      // Copy all storage files
      const allFiles = [...this.nodeFiles, ...this.edgeFiles];
      for (const filePath of allFiles) {
        const fileName = basename(filePath);
        const backupPath = join(backupDir, fileName);
        await fs.copyFile(filePath, backupPath);
      }

      // Copy WAL if exists
      if (this.walFile) {
        const walBackupPath = join(backupDir, 'wal.log');
        await fs.copyFile(this.walFile, walBackupPath);
      }

      return {
        success: true,
        count: allFiles.length,
        processingTime: Date.now() - startTime,
        metadata: { backupName, backupPath: backupDir }
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown backup error']
      };
    }
  }

  /**
   * Restore from a backup
   */
  async restoreFromBackup(name: string): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();
    const backupDir = join(this.config.directory, 'backups', name);

    try {
      // Check if backup exists
      await fs.access(backupDir);

      // Clear current files
      await this.clearStorage();

      // Copy backup files
      const backupFiles = await fs.readdir(backupDir);
      let restoredCount = 0;

      for (const fileName of backupFiles) {
        if (fileName === 'wal.log') continue; // Skip WAL file

        const backupPath = join(backupDir, fileName);
        const targetPath = join(this.config.directory, fileName);
        await fs.copyFile(backupPath, targetPath);
        restoredCount++;
      }

      // Re-scan files
      await this.scanExistingFiles();

      return {
        success: true,
        count: restoredCount,
        processingTime: Date.now() - startTime,
        metadata: { backupName: name }
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown restore error']
      };
    }
  }

  /**
   * Clean up old backups
   */
  async cleanupBackups(): Promise<StorageResult> {
    if (!this.initialized || !this.config.enableBackups) {
      return { success: true, count: 0, processingTime: 0 };
    }

    const startTime = Date.now();
    const backupsDir = join(this.config.directory, 'backups');

    try {
      const backupDirs = await fs.readdir(backupsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.backupRetentionDays);

      let cleanedCount = 0;
      for (const backupName of backupDirs) {
        const backupPath = join(backupsDir, backupName);
        const stats = await fs.stat(backupPath);

        if (stats.mtime < cutoffDate) {
          await fs.rm(backupPath, { recursive: true, force: true });
          cleanedCount++;
        }
      }

      return {
        success: true,
        count: cleanedCount,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown cleanup error']
      };
    }
  }

  /**
   * Close storage connections and cleanup
   */
  async close(): Promise<void> {
    // Flush any pending writes
    await this.flushWriteQueue();

    // Clear file lists
    this.nodeFiles = [];
    this.edgeFiles = [];
    this.initialized = false;
  }

  // Private helper methods

  private async scanExistingFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.directory);
      this.nodeFiles = [];
      this.edgeFiles = [];

      for (const file of files) {
        if (file.startsWith('nodes_') && file.endsWith('.jsonl')) {
          this.nodeFiles.push(join(this.config.directory, file));
        } else if (file.startsWith('edges_') && file.endsWith('.jsonl')) {
          this.edgeFiles.push(join(this.config.directory, file));
        }
      }

      // Sort files by creation time for proper loading order
      this.nodeFiles.sort();
      this.edgeFiles.sort();
    } catch (error) {
      // Directory doesn't exist or can't be read
      this.nodeFiles = [];
      this.edgeFiles = [];
    }
  }

  private async getNextFilePath(type: 'nodes' | 'edges' | 'deletions'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${type}_${timestamp}.jsonl`;
    return join(this.config.directory, fileName);
  }

  private async writeLinesToFile(filePath: string, lines: string[]): Promise<void> {
    const content = lines.join('\n') + '\n';

    if (this.config.compressionEnabled) {
      // Write compressed
      const compressedPath = filePath + (this.config.compressionAlgorithm === 'gzip' ? '.gz' : '.br');
      const compressStream = this.config.compressionAlgorithm === 'gzip' ? createGzip() : createBrotliCompress();

      await pipeline(
        Buffer.from(content),
        compressStream,
        createWriteStream(compressedPath)
      );
    } else {
      // Write uncompressed
      await fs.writeFile(filePath, content, 'utf-8');
    }
  }

  private async readNodesFromFile(filePath: string, options: any): Promise<GraphNode[]> {
    const lines = await this.readLinesFromFile(filePath);
    const nodes: GraphNode[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.type === 'node') {
          const node = record.data;
          // Convert date strings back to Date objects
          node.createdAt = new Date(node.createdAt);
          node.updatedAt = new Date(node.updatedAt);
          nodes.push(node);
        }
      } catch (error) {
        console.warn(`Failed to parse node record: ${line}`);
      }
    }

    return nodes;
  }

  private async readEdgesFromFile(filePath: string, options: any): Promise<GraphEdge[]> {
    const lines = await this.readLinesFromFile(filePath);
    const edges: GraphEdge[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.type === 'edge') {
          const edge = record.data;
          // Convert date strings back to Date objects
          edge.createdAt = new Date(edge.createdAt);
          edge.updatedAt = new Date(edge.updatedAt);
          edges.push(edge);
        }
      } catch (error) {
        console.warn(`Failed to parse edge record: ${line}`);
      }
    }

    return edges;
  }

  private async readLinesFromFile(filePath: string): Promise<string[]> {
    let content: string;

    if (this.config.compressionEnabled) {
      // Try compressed versions first
      const gzPath = filePath + '.gz';
      const brPath = filePath + '.br';

      try {
        // Use proper stream decompression for gzip
        const decompressStream = createGunzip();
        const compressedContent = await fs.readFile(gzPath);
        const decompressed = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          const bufferStream = require('stream').Readable.from(compressedContent);

          bufferStream
            .pipe(decompressStream)
            .on('data', (chunk: Buffer) => chunks.push(chunk))
            .on('end', () => resolve(Buffer.concat(chunks)))
            .on('error', reject);
        });
        content = decompressed.toString('utf-8');
      } catch {
        try {
          // Use proper stream decompression for brotli
          const decompressStream = createBrotliDecompress();
          const compressedContent = await fs.readFile(brPath);
          const decompressed = await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            const bufferStream = require('stream').Readable.from(compressedContent);

            bufferStream
              .pipe(decompressStream)
              .on('data', (chunk: Buffer) => chunks.push(chunk))
              .on('end', () => resolve(Buffer.concat(chunks)))
              .on('error', reject);
          });
          content = decompressed.toString('utf-8');
        } catch {
          // Fall back to uncompressed
          content = await fs.readFile(filePath, 'utf-8');
        }
      }
    } else {
      content = await fs.readFile(filePath, 'utf-8');
    }

    return content.trim().split('\n').filter(line => line.length > 0);
  }

  private async countItemsInFile(filePath: string): Promise<number> {
    try {
      const lines = await this.readLinesFromFile(filePath);
      return lines.length;
    } catch {
      return 0;
    }
  }

  private async getTotalNodeCount(): Promise<number> {
    // Count actual items from files
    let totalCount = 0;
    for (const filePath of this.nodeFiles) {
      try {
        const lines = await this.readLinesFromFile(filePath);
        totalCount += lines.length;
      } catch (error) {
        console.warn(`Failed to count nodes in ${filePath}:`, error);
      }
    }
    return totalCount;
  }

  private async getTotalEdgeCount(): Promise<number> {
    // Count actual items from files
    let totalCount = 0;
    for (const filePath of this.edgeFiles) {
      try {
        const lines = await this.readLinesFromFile(filePath);
        totalCount += lines.length;
      } catch (error) {
        console.warn(`Failed to count edges in ${filePath}:`, error);
      }
    }
    return totalCount;
  }

  private async writeToWAL(type: 'nodes' | 'edges', items: any[]): Promise<void> {
    if (!this.walFile) return;

    const walEntry = {
      type,
      items,
      timestamp: new Date().toISOString()
    };

    const line = JSON.stringify(walEntry) + '\n';
    await fs.appendFile(this.walFile, line, 'utf-8');
  }

  private async flushWriteQueue(): Promise<void> {
    // Implementation for flushing queued writes
    // This would be used in a more sophisticated implementation
  }

  private async clearStorage(): Promise<void> {
    const allFiles = [...this.nodeFiles, ...this.edgeFiles];
    for (const filePath of allFiles) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(`Failed to delete ${filePath}:`, error);
      }
    }
    this.nodeFiles = [];
    this.edgeFiles = [];
  }

  /**
   * Store lexical graphs to persistent storage
   */
  async storeLexicalGraphs(graphs: LexicalGraph[]): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();
    let stored = 0;

    try {
      for (const graph of graphs) {
        const fileName = `lexical_graphs_${Date.now()}.jsonl`;
        const filePath = join(this.config.directory, fileName);
        
        const graphData = {
          type: 'lexical_graph',
          id: graph.id,
          data: {
            ...graph,
            textChunks: Array.from(graph.textChunks.entries()),
            lexicalRelations: Array.from(graph.lexicalRelations.entries())
          },
          timestamp: new Date().toISOString()
        };

        await fs.writeFile(filePath, JSON.stringify(graphData) + '\n', 'utf-8');
        stored++;
      }

      return {
        success: true,
        count: stored,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: stored,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error storing lexical graphs']
      };
    }
  }

  /**
   * Store domain graphs to persistent storage
   */
  async storeDomainGraphs(graphs: DomainGraph[]): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();
    let stored = 0;

    try {
      for (const graph of graphs) {
        const fileName = `domain_graphs_${Date.now()}.jsonl`;
        const filePath = join(this.config.directory, fileName);
        
        const graphData = {
          type: 'domain_graph',
          id: graph.id,
          data: {
            ...graph,
            entities: Array.from(graph.entities.entries()),
            semanticRelations: Array.from(graph.semanticRelations.entries()),
            entityHierarchies: Array.from(graph.entityHierarchies.entries())
          },
          timestamp: new Date().toISOString()
        };

        await fs.writeFile(filePath, JSON.stringify(graphData) + '\n', 'utf-8');
        stored++;
      }

      return {
        success: true,
        count: stored,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: stored,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error storing domain graphs']
      };
    }
  }

  /**
   * Store cross-graph links to persistent storage
   */
  async storeCrossGraphLinks(links: CrossGraphLink[]): Promise<StorageResult> {
    if (!this.initialized) {
      throw new Error('Storage not initialized');
    }

    const startTime = Date.now();

    try {
      const fileName = `cross_graph_links_${Date.now()}.jsonl`;
      const filePath = join(this.config.directory, fileName);
      
      const linkData = links.map(link => ({
        type: 'cross_graph_link',
        id: link.id,
        data: link,
        timestamp: new Date().toISOString()
      }));

      const content = linkData.map(data => JSON.stringify(data)).join('\n') + '\n';
      await fs.writeFile(filePath, content, 'utf-8');

      return {
        success: true,
        count: links.length,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        count: 0,
        processingTime: Date.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error storing cross-graph links']
      };
    }
  }

  /**
   * Load lexical graphs from persistent storage
   */
  async loadLexicalGraphs(options: {
    limit?: number;
    offset?: number;
    since?: Date;
  } = {}): Promise<{ graphs: LexicalGraph[]; hasMore: boolean }> {
    try {
      const lexicalGraphsPath = join(this.config.directory, 'lexical_graphs');
      
      // Check if directory exists
      try {
        await fs.access(lexicalGraphsPath);
      } catch {
        // Directory doesn't exist, return empty result
        return { graphs: [], hasMore: false };
      }

      // Read all lexical graph files
      const files = await fs.readdir(lexicalGraphsPath);
      const jsonlFiles = files.filter(file => file.endsWith('.jsonl') || file.endsWith('.jsonl.gz') || file.endsWith('.jsonl.br'));
      
      if (jsonlFiles.length === 0) {
        return { graphs: [], hasMore: false };
      }

      const graphs: LexicalGraph[] = [];
      let processedCount = 0;
      const limit = options.limit || 1000;
      const offset = options.offset || 0;

      // Sort files by modification time (newest first)
      const fileStats = await Promise.all(
        jsonlFiles.map(async file => {
          const filePath = join(lexicalGraphsPath, file);
          const stats = await fs.stat(filePath);
          return { file, stats, path: filePath };
        })
      );
      
      fileStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Process files
      for (const { file, stats, path } of fileStats) {
        // Apply date filter if specified
        if (options.since && stats.mtime < options.since) {
          continue;
        }

        // Skip files until we reach the offset
        if (processedCount < offset) {
          processedCount++;
          continue;
        }

        // Stop if we've reached the limit
        if (graphs.length >= limit) {
          return { graphs, hasMore: true };
        }

        try {
          const content = await fs.readFile(path, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const lexicalGraph = JSON.parse(line) as LexicalGraph;
              
              // Reconstruct Map objects from serialized format
              lexicalGraph.textChunks = new Map(Object.entries(lexicalGraph.textChunks || {}));
              lexicalGraph.lexicalRelations = new Map(Object.entries(lexicalGraph.lexicalRelations || {}));
              lexicalGraph.embeddings = new Map();
              
              // Reconstruct embeddings
              if ((lexicalGraph as any).embeddingsData) {
                for (const [key, value] of Object.entries((lexicalGraph as any).embeddingsData)) {
                  lexicalGraph.embeddings.set(key, new Float32Array(value as number[]));
                }
              }

              // Reconstruct retrieval indices
              if (lexicalGraph.retrievalIndices) {
                lexicalGraph.retrievalIndices.textIndex = new Map(Object.entries(lexicalGraph.retrievalIndices.textIndex || {}));
                lexicalGraph.retrievalIndices.vectorIndex = new Map();
                lexicalGraph.retrievalIndices.chunkTypeIndex = new Map(Object.entries(lexicalGraph.retrievalIndices.chunkTypeIndex || {}));
                
                // Reconstruct vector index
                if ((lexicalGraph.retrievalIndices as any).vectorIndexData) {
                  for (const [key, value] of Object.entries((lexicalGraph.retrievalIndices as any).vectorIndexData)) {
                    lexicalGraph.retrievalIndices.vectorIndex.set(key, new Float32Array(value as number[]));
                  }
                }
                
                // Convert Set data back to Sets
                for (const [key, value] of lexicalGraph.retrievalIndices.textIndex) {
                  lexicalGraph.retrievalIndices.textIndex.set(key, new Set(Array.isArray(value) ? value : []));
                }
                
                for (const [key, value] of lexicalGraph.retrievalIndices.chunkTypeIndex) {
                  lexicalGraph.retrievalIndices.chunkTypeIndex.set(key, new Set(Array.isArray(value) ? value : []));
                }
              }

              // Convert date strings back to Date objects
              lexicalGraph.createdAt = new Date(lexicalGraph.createdAt);
              lexicalGraph.updatedAt = new Date(lexicalGraph.updatedAt);

              graphs.push(lexicalGraph);

              if (graphs.length >= limit) {
                return { graphs, hasMore: true };
              }
            } catch (parseError) {
              console.warn(`Failed to parse lexical graph line in ${file}:`, parseError);
              continue;
            }
          }
        } catch (fileError) {
          console.warn(`Failed to read lexical graph file ${file}:`, fileError);
          continue;
        }

        processedCount++;
      }

      // Check if there are more files to process
      const hasMore = processedCount < fileStats.length;

      return { graphs, hasMore };

    } catch (error) {
      console.error('Failed to load lexical graphs:', error);
      return { graphs: [], hasMore: false };
    }
  }

  /**
   * Load domain graphs from persistent storage
   */
  async loadDomainGraphs(options: {
    limit?: number;
    offset?: number;
    since?: Date;
  } = {}): Promise<{ graphs: DomainGraph[]; hasMore: boolean }> {
    try {
      const domainGraphsPath = join(this.config.directory, 'domain_graphs');
      
      // Check if directory exists
      try {
        await fs.access(domainGraphsPath);
      } catch {
        // Directory doesn't exist, return empty result
        return { graphs: [], hasMore: false };
      }

      // Read all domain graph files
      const files = await fs.readdir(domainGraphsPath);
      const jsonlFiles = files.filter(file => file.endsWith('.jsonl') || file.endsWith('.jsonl.gz') || file.endsWith('.jsonl.br'));
      
      if (jsonlFiles.length === 0) {
        return { graphs: [], hasMore: false };
      }

      const graphs: DomainGraph[] = [];
      let processedCount = 0;
      const limit = options.limit || 1000;
      const offset = options.offset || 0;

      // Sort files by modification time (newest first)
      const fileStats = await Promise.all(
        jsonlFiles.map(async file => {
          const filePath = join(domainGraphsPath, file);
          const stats = await fs.stat(filePath);
          return { file, stats, path: filePath };
        })
      );
      
      fileStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Process files
      for (const { file, stats, path } of fileStats) {
        // Apply date filter if specified
        if (options.since && stats.mtime < options.since) {
          continue;
        }

        // Skip files until we reach the offset
        if (processedCount < offset) {
          processedCount++;
          continue;
        }

        // Stop if we've reached the limit
        if (graphs.length >= limit) {
          return { graphs, hasMore: true };
        }

        try {
          const content = await fs.readFile(path, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const domainGraph = JSON.parse(line) as DomainGraph;
              
              // Reconstruct Map objects from serialized format
              domainGraph.entities = new Map(Object.entries(domainGraph.entities || {}));
              domainGraph.semanticRelations = new Map(Object.entries(domainGraph.semanticRelations || {}));
              domainGraph.entityHierarchies = new Map(Object.entries(domainGraph.entityHierarchies || {}));

              // Reconstruct domain indices
              if (domainGraph.domainIndices) {
                domainGraph.domainIndices.entityTypeIndex = new Map(Object.entries(domainGraph.domainIndices.entityTypeIndex || {}));
                domainGraph.domainIndices.relationshipTypeIndex = new Map(Object.entries(domainGraph.domainIndices.relationshipTypeIndex || {}));
                
                // Handle confidence index separately since it uses number keys
                const confidenceIndexData = domainGraph.domainIndices.confidenceIndex || {};
                domainGraph.domainIndices.confidenceIndex = new Map();
                for (const [key, value] of Object.entries(confidenceIndexData)) {
                  const numKey = parseFloat(key);
                  if (!isNaN(numKey)) {
                    domainGraph.domainIndices.confidenceIndex.set(numKey, new Set(Array.isArray(value) ? value : []));
                  }
                }
                
                // Convert Set data back to Sets
                for (const [key, value] of domainGraph.domainIndices.entityTypeIndex) {
                  domainGraph.domainIndices.entityTypeIndex.set(key, new Set(Array.isArray(value) ? value : []));
                }
                
                for (const [key, value] of domainGraph.domainIndices.relationshipTypeIndex) {
                  domainGraph.domainIndices.relationshipTypeIndex.set(key, new Set(Array.isArray(value) ? value : []));
                }
              }

              // Reconstruct entity hierarchy Maps
              for (const [hierarchyId, hierarchy] of domainGraph.entityHierarchies) {
                hierarchy.parentChild = new Map(Object.entries(hierarchy.parentChild || {}));
                hierarchy.siblings = new Map(Object.entries(hierarchy.siblings || {}));
                
                // Convert arrays back to arrays (they should already be arrays)
                for (const [key, value] of hierarchy.parentChild) {
                  hierarchy.parentChild.set(key, Array.isArray(value) ? value : []);
                }
                
                for (const [key, value] of hierarchy.siblings) {
                  hierarchy.siblings.set(key, Array.isArray(value) ? value : []);
                }
              }

              // Convert date strings back to Date objects
              domainGraph.createdAt = new Date(domainGraph.createdAt);
              domainGraph.updatedAt = new Date(domainGraph.updatedAt);

              // Convert temporal fields in relationships if they exist
              for (const [relationId, relation] of domainGraph.semanticRelations) {
                if (relation.validFrom) {
                  relation.validFrom = new Date(relation.validFrom);
                }
                if (relation.validUntil) {
                  relation.validUntil = new Date(relation.validUntil);
                }
              }

              graphs.push(domainGraph);

              if (graphs.length >= limit) {
                return { graphs, hasMore: true };
              }
            } catch (parseError) {
              console.warn(`Failed to parse domain graph line in ${file}:`, parseError);
              continue;
            }
          }
        } catch (fileError) {
          console.warn(`Failed to read domain graph file ${file}:`, fileError);
          continue;
        }

        processedCount++;
      }

      // Check if there are more files to process
      const hasMore = processedCount < fileStats.length;

      return { graphs, hasMore };

    } catch (error) {
      console.error('Failed to load domain graphs:', error);
      return { graphs: [], hasMore: false };
    }
  }

  /**
   * Load cross-graph links from persistent storage
   */
  async loadCrossGraphLinks(options: {
    limit?: number;
    offset?: number;
    since?: Date;
  } = {}): Promise<{ links: CrossGraphLink[]; hasMore: boolean }> {
    try {
      const crossGraphLinksPath = join(this.config.directory, 'cross_graph_links');
      
      // Check if directory exists
      try {
        await fs.access(crossGraphLinksPath);
      } catch {
        // Directory doesn't exist, return empty result
        return { links: [], hasMore: false };
      }

      // Read all cross-graph link files
      const files = await fs.readdir(crossGraphLinksPath);
      const jsonlFiles = files.filter(file => file.endsWith('.jsonl') || file.endsWith('.jsonl.gz') || file.endsWith('.jsonl.br'));
      
      if (jsonlFiles.length === 0) {
        return { links: [], hasMore: false };
      }

      const links: CrossGraphLink[] = [];
      let processedCount = 0;
      const limit = options.limit || 1000;
      const offset = options.offset || 0;

      // Sort files by modification time (newest first)
      const fileStats = await Promise.all(
        jsonlFiles.map(async file => {
          const filePath = join(crossGraphLinksPath, file);
          const stats = await fs.stat(filePath);
          return { file, stats, path: filePath };
        })
      );
      
      fileStats.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // Process files
      for (const { file, stats, path } of fileStats) {
        // Apply date filter if specified
        if (options.since && stats.mtime < options.since) {
          continue;
        }

        // Skip files until we reach the offset
        if (processedCount < offset) {
          processedCount++;
          continue;
        }

        // Stop if we've reached the limit
        if (links.length >= limit) {
          return { links, hasMore: true };
        }

        try {
          const content = await fs.readFile(path, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const crossGraphLink = JSON.parse(line) as CrossGraphLink;
              
              // Convert date strings back to Date objects
              crossGraphLink.createdAt = new Date(crossGraphLink.createdAt);

              // Convert temporal fields if they exist
              if (crossGraphLink.validFrom) {
                crossGraphLink.validFrom = new Date(crossGraphLink.validFrom);
              }
              if (crossGraphLink.validUntil) {
                crossGraphLink.validUntil = new Date(crossGraphLink.validUntil);
              }

              // Ensure metadata is properly structured
              if (!crossGraphLink.metadata) {
                crossGraphLink.metadata = {};
              }

              links.push(crossGraphLink);

              if (links.length >= limit) {
                return { links, hasMore: true };
              }
            } catch (parseError) {
              console.warn(`Failed to parse cross-graph link line in ${file}:`, parseError);
              continue;
            }
          }
        } catch (fileError) {
          console.warn(`Failed to read cross-graph link file ${file}:`, fileError);
          continue;
        }

        processedCount++;
      }

      // Check if there are more files to process
      const hasMore = processedCount < fileStats.length;

      return { links, hasMore };

    } catch (error) {
      console.error('Failed to load cross-graph links:', error);
      return { links: [], hasMore: false };
    }
  }
}
