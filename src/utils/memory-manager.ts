import type { GraphNode } from '../core/types.js';

/**
 * Memory management utilities for LRU tracking and eviction
 */
export class MemoryManager {
  private accessOrder: string[] = [];
  private entityNameIndex: Map<string, string> = new Map();
  private lastCleanup: Date = new Date();

  /**
   * Configuration for memory management
   */
  constructor(
    private config: {
      maxMemoryNodes: number;
      evictionStrategy: 'lru' | 'lfu' | 'temporal';
    }
  ) {}

  /**
   * Mark a node as recently accessed
   */
  markAccessed(nodeId: string): void {
    // Remove from current position
    const index = this.accessOrder.indexOf(nodeId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    // Add to end (most recently used)
    this.accessOrder.push(nodeId);
  }

  /**
   * Update name index when nodes are added/removed
   */
  updateNameIndex(nodes: GraphNode[]): void {
    this.entityNameIndex.clear();
    for (const node of nodes) {
      if (node.properties.name) {
        this.entityNameIndex.set(node.properties.name.toLowerCase().trim(), node.id);
      }
    }
  }

  /**
   * Remove node from tracking
   */
  removeNode(nodeId: string, nodeName?: string): void {
    const index = this.accessOrder.indexOf(nodeId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    if (nodeName) {
      this.entityNameIndex.delete(nodeName.toLowerCase().trim());
    }
  }

  /**
   * Get nodes to evict based on current memory usage
   */
  getNodesToEvict(currentNodeCount: number): string[] {
    if (currentNodeCount <= this.config.maxMemoryNodes) {
      return [];
    }

    const nodesToEvict = currentNodeCount - this.config.maxMemoryNodes + 100; // Extra buffer
    return this.accessOrder.slice(0, nodesToEvict);
  }

  /**
   * Perform memory cleanup after eviction
   */
  finalizeEviction(evictedCount: number): void {
    this.accessOrder = this.accessOrder.slice(evictedCount);
    this.lastCleanup = new Date();
  }

  /**
   * Get memory metrics
   */
  getMetrics(): {
    accessOrderSize: number;
    nameIndexSize: number;
    lastCleanup: Date;
  } {
    return {
      accessOrderSize: this.accessOrder.length,
      nameIndexSize: this.entityNameIndex.size,
      lastCleanup: this.lastCleanup
    };
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.accessOrder = [];
    this.entityNameIndex.clear();
    this.lastCleanup = new Date();
  }

  /**
   * Get name index for lookups
   */
  getNameIndex(): Map<string, string> {
    return this.entityNameIndex;
  }
}
