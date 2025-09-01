/**
 * Temporal knowledge management with edge invalidation
 * 
 * Implements Zep's temporal architecture approach for tracking when relationships
 * become invalid rather than just when they were created. This significantly
 * improves memory system performance by maintaining temporal context.
 * 
 * Key Features:
 * - Temporal edge validity tracking
 * - Automatic relationship invalidation
 * - Temporal indices for efficient querying
 * - Conflict resolution for competing facts
 * 
 * Reference: https://arxiv.org/html/2501.13956v1
 */

import type {
  TemporalEdge,
  GraphNode,
  GraphEdge,
  GraphContext,
  GraphConfig
} from '../core/types.js';
import { InMemoryGraph } from '../core/graph.js';

/**
 * Configuration for temporal graph operations
 */
export interface TemporalConfig extends GraphConfig {
  /** Enable automatic relationship invalidation */
  autoInvalidation: boolean;
  /** Default validity period for facts (in milliseconds) */
  defaultValidityPeriod: number;
  /** Enable temporal conflict resolution */
  enableConflictResolution: boolean;
  /** Maximum age for keeping invalidated edges (cleanup threshold) */
  maxInvalidatedAge: number;
}

/**
 * Temporal query options
 */
export interface TemporalQuery {
  /** Query timestamp (defaults to current time) */
  timestamp?: Date;
  /** Include invalidated edges in results */
  includeInvalidated?: boolean;
  /** Time range for temporal queries */
  timeRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Temporal graph extending the base in-memory graph with time-aware operations
 * 
 * Manages temporal relationships with automatic invalidation and conflict resolution.
 * Maintains temporal indices for efficient time-based querying.
 */
export class TemporalGraph extends InMemoryGraph {
  private temporalEdges: Map<string, TemporalEdge> = new Map();
  private temporalIndices: {
    byValidFrom: Map<string, Set<string>>; // date string -> edge IDs
    byValidUntil: Map<string, Set<string>>; // date string -> edge IDs
    byTemporalType: Map<string, Set<string>>; // temporal type -> edge IDs
  } = {
    byValidFrom: new Map(),
    byValidUntil: new Map(),
    byTemporalType: new Map()
  };
  
  private temporalConfig: {
    autoInvalidation: boolean;
    defaultValidityPeriod: number;
    enableConflictResolution: boolean;
    maxInvalidatedAge: number;
  };

  constructor(config: Partial<TemporalConfig> = {}) {
    super(config);
    
    // Note: config is handled by parent class, we just store temporal-specific settings
    this.temporalConfig = {
      autoInvalidation: config.autoInvalidation ?? true,
      defaultValidityPeriod: config.defaultValidityPeriod ?? (365 * 24 * 60 * 60 * 1000), // 1 year
      enableConflictResolution: config.enableConflictResolution ?? true,
      maxInvalidatedAge: config.maxInvalidatedAge ?? (30 * 24 * 60 * 60 * 1000) // 30 days
    };
  }

  /**
   * Add a temporal relationship to the graph
   * 
   * Handles conflict detection and automatic invalidation of superseded relationships.
   * Updates temporal indices for efficient querying.
   */
  async addTemporalRelationship(
    edge: Omit<TemporalEdge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
    context: GraphContext
  ): Promise<string> {
    const now = context.timestamp;
    const edgeId = edge.id || this.generateTemporalEdgeId(edge.source, edge.target, edge.type, now);

    // Create full temporal edge
    const temporalEdge: TemporalEdge = {
      id: edgeId,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      weight: edge.weight,
      properties: { ...edge.properties },
      createdAt: now,
      updatedAt: now,
      validFrom: edge.validFrom || now,
      validUntil: edge.validUntil,
      temporalType: edge.temporalType
    };

    // Check for conflicting relationships if enabled
    if (this.temporalConfig.enableConflictResolution) {
      const conflicts = await this.findConflictingEdges(temporalEdge);
      
      // Invalidate conflicting edges
      for (const conflict of conflicts) {
        await this.invalidateEdge(conflict.id, now, `Superseded by ${edgeId}`);
      }
    }

    // Add to temporal storage
    this.temporalEdges.set(edgeId, temporalEdge);

    // Add to base graph (if currently valid)
    if (this.isEdgeValidAt(temporalEdge, now)) {
      await super.addEdge(temporalEdge);
    }

    // Update temporal indices
    await this.updateTemporalIndices(temporalEdge);

    return edgeId;
  }

  /**
   * Find edges that conflict with the given temporal edge
   * 
   * Identifies relationships that should be invalidated when a new
   * relationship is added. Based on relationship semantics and temporal logic.
   */
  async findConflictingEdges(edge: TemporalEdge): Promise<TemporalEdge[]> {
    const conflicts: TemporalEdge[] = [];

    // Get all temporal edges between the same nodes
    for (const [edgeId, existingEdge] of this.temporalEdges) {
      // Skip if not between same nodes
      if (existingEdge.source !== edge.source || existingEdge.target !== edge.target) {
        continue;
      }

      // Skip if already invalidated
      if (existingEdge.validUntil && existingEdge.validUntil <= edge.validFrom) {
        continue;
      }

      // Check for semantic conflicts
      if (this.areEdgesConflicting(edge, existingEdge)) {
        conflicts.push(existingEdge);
      }
    }

    return conflicts;
  }

  /**
   * Invalidate a temporal edge
   */
  async invalidateEdge(edgeId: string, invalidationTime: Date, reason?: string): Promise<boolean> {
    const temporalEdge = this.temporalEdges.get(edgeId);
    if (!temporalEdge) {
      return false;
    }

    // Update temporal edge
    temporalEdge.validUntil = invalidationTime;
    temporalEdge.updatedAt = invalidationTime;
    
    if (reason) {
      temporalEdge.properties.invalidationReason = reason;
    }

    // Remove from base graph if it was active
    await super.removeEdge(edgeId);

    // Update temporal indices
    await this.updateTemporalIndices(temporalEdge);

    return true;
  }

  /**
   * Query temporal edges with time-aware filtering
   */
  async queryTemporal(
    nodeId: string,
    query: TemporalQuery = {}
  ): Promise<{
    edges: TemporalEdge[];
    validAt: TemporalEdge[];
    invalidated: TemporalEdge[];
  }> {
    const queryTime = query.timestamp || new Date();
    const allEdges: TemporalEdge[] = [];
    const validAt: TemporalEdge[] = [];
    const invalidated: TemporalEdge[] = [];

    // Get all edges involving this node
    for (const [edgeId, edge] of this.temporalEdges) {
      if (edge.source === nodeId || edge.target === nodeId) {
        allEdges.push(edge);

        // Check if valid at query time
        if (this.isEdgeValidAt(edge, queryTime)) {
          validAt.push(edge);
        } else if (edge.validUntil && edge.validUntil <= queryTime) {
          invalidated.push(edge);
        }
      }
    }

    // Apply time range filter if specified
    if (query.timeRange) {
      const filtered = allEdges.filter(edge => 
        this.edgeOverlapsTimeRange(edge, query.timeRange!)
      );
      return {
        edges: filtered,
        validAt: validAt.filter(edge => this.edgeOverlapsTimeRange(edge, query.timeRange!)),
        invalidated: invalidated.filter(edge => this.edgeOverlapsTimeRange(edge, query.timeRange!))
      };
    }

    return { edges: allEdges, validAt, invalidated };
  }

  /**
   * Get the state of the graph at a specific point in time
   */
  async getGraphStateAt(timestamp: Date): Promise<{
    nodes: GraphNode[];
    edges: TemporalEdge[];
  }> {
    const validEdges: TemporalEdge[] = [];
    const nodeIds = new Set<string>();

    // Find all edges valid at the timestamp
    for (const [edgeId, edge] of this.temporalEdges) {
      if (this.isEdgeValidAt(edge, timestamp)) {
        validEdges.push(edge);
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    }

    // Get all referenced nodes
    const nodes: GraphNode[] = [];
    for (const nodeId of nodeIds) {
      const node = this.getNode(nodeId);
      if (node) {
        nodes.push(node);
      }
    }

    return { nodes, edges: validEdges };
  }

  /**
   * Clean up old invalidated edges
   */
  async cleanupInvalidatedEdges(olderThan?: Date): Promise<number> {
    const cutoffTime = olderThan || new Date(Date.now() - this.temporalConfig.maxInvalidatedAge);
    let removedCount = 0;

    for (const [edgeId, edge] of this.temporalEdges) {
      if (edge.validUntil && edge.validUntil < cutoffTime) {
        this.temporalEdges.delete(edgeId);
        this.removeFromTemporalIndices(edgeId);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Update temporal indices for efficient querying
   */
  private async updateTemporalIndices(edge: TemporalEdge): Promise<void> {
    const edgeId = edge.id;

    // Index by validFrom date
    const validFromKey = edge.validFrom.toISOString().split('T')[0];

    if (!validFromKey) {
      throw new Error('Invalid validFrom date');
    }

    if (!this.temporalIndices.byValidFrom.has(validFromKey)) {
      this.temporalIndices.byValidFrom.set(validFromKey, new Set());
    }
    this.temporalIndices.byValidFrom.get(validFromKey)!.add(edgeId);

    // Index by validUntil date (if set)
    if (edge.validUntil) {
      const validUntilKey = edge.validUntil.toISOString().split('T')[0];
      if (!validUntilKey) {
        throw new Error('Invalid validUntil date');
      }
      if (!this.temporalIndices.byValidUntil.has(validUntilKey)) {
        this.temporalIndices.byValidUntil.set(validUntilKey, new Set());
      }
      this.temporalIndices.byValidUntil.get(validUntilKey)!.add(edgeId);
    }

    // Index by temporal type
    if (!this.temporalIndices.byTemporalType.has(edge.temporalType)) {
      this.temporalIndices.byTemporalType.set(edge.temporalType, new Set());
    }
    this.temporalIndices.byTemporalType.get(edge.temporalType)!.add(edgeId);
  }

  /**
   * Remove edge from temporal indices
   */
  private removeFromTemporalIndices(edgeId: string): void {
    // Remove from all indices
    for (const [date, edgeSet] of this.temporalIndices.byValidFrom) {
      edgeSet.delete(edgeId);
      if (edgeSet.size === 0) {
        this.temporalIndices.byValidFrom.delete(date);
      }
    }

    for (const [date, edgeSet] of this.temporalIndices.byValidUntil) {
      edgeSet.delete(edgeId);
      if (edgeSet.size === 0) {
        this.temporalIndices.byValidUntil.delete(date);
      }
    }

    for (const [type, edgeSet] of this.temporalIndices.byTemporalType) {
      edgeSet.delete(edgeId);
      if (edgeSet.size === 0) {
        this.temporalIndices.byTemporalType.delete(type);
      }
    }
  }

  /**
   * Check if an edge is valid at a specific timestamp
   */
  private isEdgeValidAt(edge: TemporalEdge, timestamp: Date): boolean {
    return edge.validFrom <= timestamp && 
           (!edge.validUntil || edge.validUntil > timestamp);
  }

  /**
   * Check if an edge overlaps with a time range
   */
  private edgeOverlapsTimeRange(
    edge: TemporalEdge, 
    timeRange: { start: Date; end: Date }
  ): boolean {
    const edgeEnd = edge.validUntil || new Date(Date.now() + this.temporalConfig.defaultValidityPeriod);
    return edge.validFrom <= timeRange.end && edgeEnd >= timeRange.start;
  }

  /**
   * Determine if two edges are conflicting based on relationship semantics
   */
  private areEdgesConflicting(edge1: TemporalEdge, edge2: TemporalEdge): boolean {
    // Same relationship type between same nodes = conflict
    if (edge1.type === edge2.type) {
      return true;
    }

    // Mutually exclusive relationship types
    const exclusivePairs = [
      ['married_to', 'divorced_from'],
      ['works_at', 'unemployed'],
      ['lives_at', 'moved_from'],
      ['owns', 'sold'],
      ['leads', 'left_position']
    ];

    for (const [type1, type2] of exclusivePairs) {
      if ((edge1.type === type1 && edge2.type === type2) ||
          (edge1.type === type2 && edge2.type === type1)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate deterministic ID for temporal edges
   */
  private generateTemporalEdgeId(
    source: string, 
    target: string, 
    type: string, 
    timestamp: Date
  ): string {
    const timeStr = timestamp.toISOString();
    return `temp_${source}_${type}_${target}_${timeStr}`;
  }

  /**
   * Get temporal statistics for monitoring
   */
  getTemporalMetrics(): {
    totalTemporalEdges: number;
    validEdges: number;
    invalidatedEdges: number;
    edgesByTemporalType: Map<string, number>;
    oldestValidEdge: Date | null;
    newestValidEdge: Date | null;
  } {
    let validCount = 0;
    let invalidatedCount = 0;
    const typeCount = new Map<string, number>();
    let oldestValid: Date | null = null;
    let newestValid: Date | null = null;
    const now = new Date();

    for (const edge of this.temporalEdges.values()) {
      // Count by temporal type
      const currentCount = typeCount.get(edge.temporalType) || 0;
      typeCount.set(edge.temporalType, currentCount + 1);

      // Count valid vs invalidated
      if (this.isEdgeValidAt(edge, now)) {
        validCount++;
        
        if (!oldestValid || edge.validFrom < oldestValid) {
          oldestValid = edge.validFrom;
        }
        if (!newestValid || edge.validFrom > newestValid) {
          newestValid = edge.validFrom;
        }
      } else {
        invalidatedCount++;
      }
    }

    return {
      totalTemporalEdges: this.temporalEdges.size,
      validEdges: validCount,
      invalidatedEdges: invalidatedCount,
      edgesByTemporalType: typeCount,
      oldestValidEdge: oldestValid,
      newestValidEdge: newestValid
    };
  }
}
