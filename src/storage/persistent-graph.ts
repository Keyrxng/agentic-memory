/**
 * Persistent graph implementation using composition
 *
 * This implementation wraps the InMemoryGraph with persistent storage capabilities,
 * providing automatic syncing and memory-bounded loading without modifying
 * the base graph implementation.
 *
 * Key Features:
 * - Automatic persistence of graph changes
 * - Memory-bounded loading from disk
 * - Configurable sync intervals
 * - Backup and recovery integration
 *
 * References:
 * - Composition over inheritance: https://en.wikipedia.org/wiki/Composition_over_inheritance
 * - Persistent data structures: https://en.wikipedia.org/wiki/Persistent_data_structure
 */

import { InMemoryGraph } from '../core/graph.js';
import type { GraphStorage } from './index.js';
import { createStorage } from './index.js';
import type {
  GraphNode,
  GraphEdge,
  GraphContext,
  GraphQuery,
  QueryResult,
  GraphMetrics,
  GraphConfig
} from '../core/types.js';

/**
 * Configuration for persistent graph
 */
export interface PersistentGraphConfig extends GraphConfig {
  /** Storage configuration */
  storage: GraphConfig['storage'] & {
    /** Enable persistence */
    enabled: boolean;
    /** Sync interval in milliseconds */
    syncInterval: number;
    /** Maximum memory usage before eviction */
    maxMemoryUsage: number;
  };
}

/**
 * Persistent graph implementation using composition
 *
 * Wraps InMemoryGraph with persistent storage capabilities for durability
 * and memory-bounded processing.
 */
export class PersistentGraph {
  private graph: InMemoryGraph;
  private storage?: GraphStorage;
  private config: PersistentGraphConfig;
  private syncTimer?: NodeJS.Timeout;
  private pendingChanges: Array<{
    type: 'node' | 'edge';
    operation: 'add' | 'remove';
    data: any;
  }> = [];
  private isInitialized = false;

  /**
   * Get the storage instance
   */
  getStorage(): GraphStorage | undefined {
    return this.storage;
  }

  constructor(config: Partial<PersistentGraphConfig> = {}) {
    // Create base graph config
    const baseConfig: Partial<GraphConfig> = {
      maxNodes: config.maxNodes ?? 100000,
      maxEdgesPerNode: config.maxEdgesPerNode ?? 1000,
      entityResolutionThreshold: config.entityResolutionThreshold ?? 0.8,
      enableTemporal: config.enableTemporal ?? true,
      indexing: {
        enableFullText: true,
        enableVector: true,
        enableProperty: true,
        ...config.indexing
      },
      storage: {
        persistToDisk: false,
        storageDirectory: './data',
        compressionEnabled: false,
        syncInterval: 30000,
      }
    };

    this.graph = new InMemoryGraph(baseConfig);

    // Initialize persistent config
    this.config = {
      ...baseConfig,
      storage: {
        ...baseConfig.storage,
        enabled: baseConfig.storage?.persistToDisk || true,
        maxMemoryUsage: 500 * 1024 * 1024, // 500MB
        ...config.storage
      }
    } as PersistentGraphConfig;
  }

  /**
   * Initialize the persistent graph
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Initialize storage if enabled
    if (this.config.storage.enabled) {
      this.storage = await createStorage(this.config.storage.storageDirectory);

      // Load existing data from storage
      await this.loadFromStorage();

      // Start sync timer
      this.startSyncTimer();
    }

    this.isInitialized = true;
  }

  /**
   * Add a node with persistence
   */
  async addNode(node: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    await this.ensureInitialized();

    const nodeId = await this.graph.addNode(node);

    // Queue for persistence
    if (this.storage) {
      const fullNode = this.graph.getNode(nodeId);
      if (fullNode) {
        this.pendingChanges.push({
          type: 'node',
          operation: 'add',
          data: fullNode
        });
      }
    }

    return nodeId;
  }

  /**
   * Add an edge with persistence
   */
  async addEdge(edge: Omit<GraphEdge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    await this.ensureInitialized();

    const edgeId = await this.graph.addEdge(edge);

    // Queue for persistence
    if (this.storage) {
      const fullEdge = this.graph.getAllEdges().find(e => e.id === edgeId);
      if (fullEdge) {
        this.pendingChanges.push({
          type: 'edge',
          operation: 'add',
          data: fullEdge
        });
      }
    }

    return edgeId;
  }

  /**
   * Remove a node with persistence
   */
  async removeNode(nodeId: string): Promise<boolean> {
    await this.ensureInitialized();

    const success = await this.graph.removeNode(nodeId);

    if (success && this.storage) {
      this.pendingChanges.push({
        type: 'node',
        operation: 'remove',
        data: { id: nodeId }
      });
    }

    return success;
  }

  /**
   * Remove an edge with persistence
   */
  async removeEdge(edgeId: string): Promise<boolean> {
    await this.ensureInitialized();

    const success = await this.graph.removeEdge(edgeId);

    if (success && this.storage) {
      this.pendingChanges.push({
        type: 'edge',
        operation: 'remove',
        data: { id: edgeId }
      });
    }

    return success;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): GraphNode | undefined {
    return this.graph.getNode(nodeId);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): GraphNode[] {
    return this.graph.getAllNodes();
  }

  /**
   * Get all edges
   */
  getAllEdges(): GraphEdge[] {
    return this.graph.getAllEdges();
  }

  /**
   * Get outgoing edges from a node
   */
  getOutgoingEdges(nodeId: string, relationTypes?: string[]): GraphEdge[] {
    return this.graph.getOutgoingEdges(nodeId, relationTypes);
  }

  /**
   * Get incoming edges to a node
   */
  getIncomingEdges(nodeId: string, relationTypes?: string[]): GraphEdge[] {
    return this.graph.getIncomingEdges(nodeId, relationTypes);
  }

  /**
   * Get neighbor nodes
   */
  getNeighbors(nodeId: string, relationTypes?: string[]): Array<{ node: GraphNode; edge: GraphEdge; direction: 'out' | 'in' }> {
    return this.graph.getNeighbors(nodeId, relationTypes);
  }

  /**
   * Get metrics including storage information
   */
  getMetrics(): GraphMetrics & {
    storageMetrics: {
      pendingChanges: number;
      storageEnabled: boolean;
    };
  } {
    const baseMetrics = this.graph.getMetrics();

    return {
      ...baseMetrics,
      storageMetrics: {
        pendingChanges: this.pendingChanges.length,
        storageEnabled: !!this.storage
      }
    };
  }

  /**
   * Force sync pending changes to storage
   */
  async syncToStorage(): Promise<void> {
    if (!this.storage || this.pendingChanges.length === 0) {
      return;
    }

    const nodesToStore: GraphNode[] = [];
    const edgesToStore: GraphEdge[] = [];
    const nodesToDelete: string[] = [];
    const edgesToDelete: string[] = [];

    // Process pending changes
    for (const change of this.pendingChanges) {
      if (change.operation === 'add') {
        if (change.type === 'node') {
          nodesToStore.push(change.data);
        } else {
          edgesToStore.push(change.data);
        }
      } else if (change.operation === 'remove') {
        if (change.type === 'node') {
          nodesToDelete.push(change.data.id);
        } else {
          edgesToDelete.push(change.data.id);
        }
      }
    }

    // Execute storage operations
    const promises: any[] = [];

    if (nodesToStore.length > 0) {
      promises.push(this.storage.storeNodes(nodesToStore));
    }

    if (edgesToStore.length > 0) {
      promises.push(this.storage.storeEdges(edgesToStore));
    }

    if (nodesToDelete.length > 0) {
      promises.push(this.storage.deleteNodes(nodesToDelete));
    }

    if (edgesToDelete.length > 0) {
      promises.push(this.storage.deleteEdges(edgesToDelete));
    }

    await Promise.all(promises);

    // Clear pending changes
    this.pendingChanges = [];

    console.log(`🔄 Synced ${nodesToStore.length} nodes, ${edgesToStore.length} edges, ${nodesToDelete.length + edgesToDelete.length} deletions to storage`);
  }

  /**
   * Load data from storage into memory
   */
  async loadFromStorage(options: {
    maxNodes?: number;
    maxEdges?: number;
    since?: Date;
  } = {}): Promise<void> {
    if (!this.storage) return;

    const maxNodes = options.maxNodes || this.config.maxNodes;
    const maxEdges = options.maxEdges || (this.config.maxNodes * this.config.maxEdgesPerNode);

    console.log(`📥 Loading data from storage (max ${maxNodes} nodes, ${maxEdges} edges)...`);

    // Load nodes
    let offset = 0;
    const batchSize = 1000;
    let loadedNodes = 0;

    while (loadedNodes < maxNodes) {
      const { nodes, hasMore } = await this.storage.loadNodes({
        limit: Math.min(batchSize, maxNodes - loadedNodes),
        offset,
        since: options.since
      });

      for (const node of nodes) {
        // Add to in-memory graph without triggering persistence
        await this.graph.addNode(node);
        loadedNodes++;
      }

      if (!hasMore) break;
      offset += batchSize;
    }

    // Load edges
    offset = 0;
    let loadedEdges = 0;

    while (loadedEdges < maxEdges) {
      const { edges, hasMore } = await this.storage.loadEdges({
        limit: Math.min(batchSize, maxEdges - loadedEdges),
        offset,
        since: options.since
      });

      for (const edge of edges) {
        // Add to in-memory graph without triggering persistence
        await this.graph.addEdge(edge);
        loadedEdges++;
      }

      if (!hasMore) break;
      offset += batchSize;
    }

    console.log(`✅ Loaded ${loadedNodes} nodes and ${loadedEdges} edges from storage`);
  }

  /**
   * Create a backup of the current graph state
   */
  async createBackup(name?: string): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not enabled');
    }

    await this.syncToStorage(); // Ensure all changes are persisted

    const result = await this.storage.createBackup(name);
    if (!result.success) {
      throw new Error(`Backup failed: ${result.errors?.join(', ')}`);
    }

    console.log(`💾 Created backup: ${result.metadata?.backupName}`);
  }

  /**
   * Close the persistent graph and cleanup resources
   */
  async close(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    // Final sync
    await this.syncToStorage();

    if (this.storage) {
      await this.storage.close();
    }

    this.isInitialized = false;
  }

  /**
   * Clear all data from the graph
   * Useful for testing and cleanup
   */
  clear(): void {
    this.graph.clear();
    this.pendingChanges = [];
    
    console.log(`🧹 Persistent graph cleared`);
  }

  // Private helper methods

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private startSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncToStorage();
      } catch (error) {
        console.error('Failed to sync to storage:', error);
      }
    }, this.config.storage.syncInterval);
  }
}
