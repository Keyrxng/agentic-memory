/**
 * Label Index Implementation
 *
 * Provides fast node type filtering by maintaining mappings from node types
 * to sets of node IDs. Essential for queries that filter by entity types.
 *
 * Example: Find all nodes of type "person" or "company"
 */

import type { GraphIndex, IndexEntry, QueryOptions, IndexStats } from './types.js';

export class LabelIndex implements GraphIndex {
  public readonly name = 'label_index';
  public readonly type = 'label' as const;

  private index: Map<string, IndexEntry> = new Map();
  private nodeToLabels: Map<string, Set<string>> = new Map();
  private queryCount = 0;
  private hitCount = 0;

  add(label: string, nodeId: string, metadata?: any): void {
    // Initialize entry if it doesn't exist
    if (!this.index.has(label)) {
      this.index.set(label, {
        key: label,
        nodeIds: new Set(),
        metadata: metadata || {}
      });
    }

    // Add node to label entry
    const entry = this.index.get(label)!;
    entry.nodeIds.add(nodeId);

    // Track reverse mapping
    if (!this.nodeToLabels.has(nodeId)) {
      this.nodeToLabels.set(nodeId, new Set());
    }
    this.nodeToLabels.get(nodeId)!.add(label);
  }

  remove(label: string, nodeId: string): void {
    const entry = this.index.get(label);
    if (entry) {
      entry.nodeIds.delete(nodeId);

      // Clean up empty entries
      if (entry.nodeIds.size === 0) {
        this.index.delete(label);
      }
    }

    // Update reverse mapping
    const nodeLabels = this.nodeToLabels.get(nodeId);
    if (nodeLabels) {
      nodeLabels.delete(label);
      if (nodeLabels.size === 0) {
        this.nodeToLabels.delete(nodeId);
      }
    }
  }

  query(label: string, options: QueryOptions = {}): Set<string> {
    this.queryCount++;

    const entry = this.index.get(label);
    if (!entry) {
      return new Set();
    }

    this.hitCount++;

    let results = new Set(entry.nodeIds);

    // Apply limit if specified
    if (options.limit && results.size > options.limit) {
      results = new Set(Array.from(results).slice(0, options.limit));
    }

    return results;
  }

  getStats(): IndexStats {
    const totalEntries = this.index.size;
    const totalItems = Array.from(this.index.values())
      .reduce((sum, entry) => sum + entry.nodeIds.size, 0);

    return {
      totalEntries,
      totalItems,
      memoryUsage: this.estimateMemoryUsage(),
      averageItemsPerEntry: totalEntries > 0 ? totalItems / totalEntries : 0,
      hitRate: this.queryCount > 0 ? this.hitCount / this.queryCount : 0
    };
  }

  clear(): void {
    this.index.clear();
    this.nodeToLabels.clear();
    this.queryCount = 0;
    this.hitCount = 0;
  }

  async rebuild(items: Array<{id: string, data: any}>): Promise<void> {
    this.clear();

    for (const item of items) {
      if (item.data.type) {
        this.add(item.data.type, item.id);
      }
    }
  }

  /**
   * Get all labels for a node
   */
  getNodeLabels(nodeId: string): Set<string> {
    return this.nodeToLabels.get(nodeId) || new Set();
  }

  /**
   * Get all available labels
   */
  getAllLabels(): string[] {
    return Array.from(this.index.keys());
  }

  /**
   * Get label frequency statistics
   */
  getLabelStats(): Array<{label: string, count: number}> {
    return Array.from(this.index.entries())
      .map(([label, entry]) => ({
        label,
        count: entry.nodeIds.size
      }))
      .sort((a, b) => b.count - a.count);
  }

  private estimateMemoryUsage(): number {
    // Rough estimation: each entry has overhead + string keys + sets
    let usage = 0;

    // Map overhead
    usage += 100;

    // Entries
    for (const [label, entry] of this.index) {
      usage += label.length * 2; // string storage
      usage += 50; // entry overhead
      usage += entry.nodeIds.size * 8; // pointer storage
    }

    // Reverse mapping
    for (const [nodeId, labels] of this.nodeToLabels) {
      usage += nodeId.length * 2;
      usage += labels.size * 8;
    }

    return usage;
  }
}
