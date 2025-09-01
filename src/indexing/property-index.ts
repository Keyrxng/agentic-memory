/**
 * Property Index Implementation
 *
 * Provides fast attribute-based queries by indexing node/edge properties.
 * Supports exact matching, range queries, and complex property filters.
 *
 * Example: Find all nodes where age > 30 or name contains "John"
 */

import type { GraphIndex, IndexEntry, QueryOptions, IndexStats } from './types.js';

export interface PropertyQuery {
  property: string;
  operator: 'eq' | 'ne' | 'lt' | 'gt' | 'lte' | 'gte' | 'contains' | 'matches';
  value: any;
}

export class PropertyIndex implements GraphIndex {
  public readonly name = 'property_index';
  public readonly type = 'property' as const;

  private index: Map<string, Map<any, IndexEntry>> = new Map();
  private itemToProperties: Map<string, Map<string, any>> = new Map();
  private queryCount = 0;
  private hitCount = 0;

  add(propertyKey: string, itemId: string, metadata?: any): void {
    // metadata should contain the property value
    if (!metadata || !metadata.hasOwnProperty('value')) {
      return;
    }

    const value = metadata.value;

    // Initialize property map if it doesn't exist
    if (!this.index.has(propertyKey)) {
      this.index.set(propertyKey, new Map());
    }

    const propertyMap = this.index.get(propertyKey)!;

    // Initialize value entry if it doesn't exist
    if (!propertyMap.has(value)) {
      propertyMap.set(value, {
        key: value,
        nodeIds: new Set(),
        metadata: { property: propertyKey }
      });
    }

    // Add item to value entry
    const entry = propertyMap.get(value)!;
    entry.nodeIds.add(itemId);

    // Track reverse mapping
    if (!this.itemToProperties.has(itemId)) {
      this.itemToProperties.set(itemId, new Map());
    }
    this.itemToProperties.get(itemId)!.set(propertyKey, value);
  }

  remove(propertyKey: string, itemId: string): void {
    const propertyMap = this.index.get(propertyKey);
    if (!propertyMap) return;

    // Find and remove from all value entries
    for (const [value, entry] of propertyMap) {
      entry.nodeIds.delete(itemId);

      // Clean up empty entries
      if (entry.nodeIds.size === 0) {
        propertyMap.delete(value);
      }
    }

    // Clean up empty property maps
    if (propertyMap.size === 0) {
      this.index.delete(propertyKey);
    }

    // Update reverse mapping
    const itemProperties = this.itemToProperties.get(itemId);
    if (itemProperties) {
      itemProperties.delete(propertyKey);
      if (itemProperties.size === 0) {
        this.itemToProperties.delete(itemId);
      }
    }
  }

  query(query: PropertyQuery | string, options: QueryOptions = {}): Set<string> {
    this.queryCount++;

    if (typeof query === 'string') {
      // Simple property existence query
      return this.queryByProperty(query, options);
    }

    // Complex property query
    return this.queryByCondition(query, options);
  }

  getStats(): IndexStats {
    const totalEntries = Array.from(this.index.values())
      .reduce((sum, propertyMap) => sum + propertyMap.size, 0);
    const totalItems = Array.from(this.index.values())
      .reduce((sum, propertyMap) =>
        sum + Array.from(propertyMap.values())
          .reduce((entrySum, entry) => entrySum + entry.nodeIds.size, 0), 0);

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
    this.itemToProperties.clear();
    this.queryCount = 0;
    this.hitCount = 0;
  }

  async rebuild(items: Array<{id: string, data: any}>): Promise<void> {
    this.clear();

    for (const item of items) {
      if (item.data.properties) {
        for (const [key, value] of Object.entries(item.data.properties)) {
          this.add(key, item.id, { value });
        }
      }
    }
  }

  /**
   * Query by property existence
   */
  private queryByProperty(propertyKey: string, options: QueryOptions): Set<string> {
    const propertyMap = this.index.get(propertyKey);
    if (!propertyMap) {
      return new Set();
    }

    this.hitCount++;

    let allNodeIds = new Set<string>();
    for (const entry of propertyMap.values()) {
      for (const nodeId of entry.nodeIds) {
        allNodeIds.add(nodeId);
      }
    }

    // Apply limit if specified
    if (options.limit && allNodeIds.size > options.limit) {
      allNodeIds = new Set(Array.from(allNodeIds).slice(0, options.limit));
    }

    return allNodeIds;
  }

  /**
   * Query by property condition
   */
  private queryByCondition(query: PropertyQuery, options: QueryOptions): Set<string> {
    const propertyMap = this.index.get(query.property);
    if (!propertyMap) {
      return new Set();
    }

    this.hitCount++;

    let results = new Set<string>();

    for (const [value, entry] of propertyMap) {
      if (this.matchesCondition(value, query)) {
        for (const nodeId of entry.nodeIds) {
          results.add(nodeId);
        }
      }
    }

    // Apply limit if specified
    if (options.limit && results.size > options.limit) {
      results = new Set(Array.from(results).slice(0, options.limit));
    }

    return results;
  }

  /**
   * Check if a value matches a query condition
   */
  private matchesCondition(value: any, query: PropertyQuery): boolean {
    const { operator, value: queryValue } = query;

    switch (operator) {
      case 'eq':
        return value === queryValue;
      case 'ne':
        return value !== queryValue;
      case 'lt':
        return typeof value === 'number' && typeof queryValue === 'number' && value < queryValue;
      case 'gt':
        return typeof value === 'number' && typeof queryValue === 'number' && value > queryValue;
      case 'lte':
        return typeof value === 'number' && typeof queryValue === 'number' && value <= queryValue;
      case 'gte':
        return typeof value === 'number' && typeof queryValue === 'number' && value >= queryValue;
      case 'contains':
        return typeof value === 'string' && typeof queryValue === 'string' &&
               value.toLowerCase().includes(queryValue.toLowerCase());
      case 'matches':
        if (typeof queryValue === 'string') {
          try {
            const regex = new RegExp(queryValue, 'i');
            return regex.test(String(value));
          } catch {
            return false;
          }
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * Get all properties for an item
   */
  getItemProperties(itemId: string): Map<string, any> {
    return this.itemToProperties.get(itemId) || new Map();
  }

  /**
   * Get all indexed properties
   */
  getAllProperties(): string[] {
    return Array.from(this.index.keys());
  }

  /**
   * Get property value distribution
   */
  getPropertyStats(property: string): Array<{value: any, count: number}> {
    const propertyMap = this.index.get(property);
    if (!propertyMap) return [];

    return Array.from(propertyMap.entries())
      .map(([value, entry]) => ({
        value,
        count: entry.nodeIds.size
      }))
      .sort((a, b) => b.count - a.count);
  }

  private estimateMemoryUsage(): number {
    // Rough estimation
    let usage = 0;

    // Map overhead
    usage += 100;

    // Property maps
    for (const [property, valueMap] of this.index) {
      usage += property.length * 2;
      usage += 50; // property map overhead

      for (const [value, entry] of valueMap) {
        usage += JSON.stringify(value).length * 2;
        usage += 50; // entry overhead
        usage += entry.nodeIds.size * 8;
      }
    }

    // Reverse mapping
    for (const [itemId, properties] of this.itemToProperties) {
      usage += itemId.length * 2;
      usage += properties.size * 20; // rough property storage
    }

    return usage;
  }
}
