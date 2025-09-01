/**
 * Temporal tracking manager for dual graph architecture
 * 
 * Implements edge invalidation patterns and temporal reasoning specifically
 * designed for lexical and domain graphs. Tracks when relationships become
 * invalid and manages temporal consistency across graph boundaries.
 * 
 * Key Features:
 * - Cross-graph temporal consistency
 * - Automatic relationship invalidation based on content changes
 * - Temporal conflict resolution
 * - Time-aware query filtering
 * - Edge expiration and cleanup
 * 
 * Based on Zep's temporal architecture research for knowledge graphs.
 */

import type {
  LexicalGraph,
  DomainGraph,
  CrossGraphLink,
  RelationshipRecord,
  GraphContext,
  TemporalEdge
} from '../core/types.js';

/**
 * Configuration for dual graph temporal tracking
 */
export interface DualGraphTemporalConfig {
  /** Enable automatic invalidation of superseded relationships */
  autoInvalidation: boolean;
  /** Default validity period for facts in milliseconds */
  defaultValidityPeriod: number;
  /** Default validity period for events in milliseconds */
  eventValidityPeriod: number;
  /** Default validity period for states in milliseconds */
  stateValidityPeriod: number;
  /** Enable cross-graph temporal consistency checks */
  enableCrossGraphConsistency: boolean;
  /** Maximum age for keeping invalidated relationships */
  maxInvalidatedAge: number;
  /** Cleanup interval in milliseconds */
  cleanupInterval: number;
}

/**
 * Temporal invalidation reason
 */
export type InvalidationReason = 
  | 'superseded'      // Replaced by newer information
  | 'contradicted'    // Contradicted by new evidence
  | 'expired'         // Natural expiration
  | 'context_changed' // Context or source changed
  | 'manual'          // Manually invalidated
  | 'cross_graph_conflict'; // Conflict with other graph

/**
 * Temporal query options for dual graphs
 */
export interface DualGraphTemporalQuery {
  /** Query timestamp (defaults to current time) */
  timestamp?: Date;
  /** Include invalidated relationships */
  includeInvalidated?: boolean;
  /** Time range for temporal queries */
  timeRange?: {
    start: Date;
    end: Date;
  };
  /** Filter by temporal type */
  temporalTypes?: Array<'fact' | 'event' | 'state'>;
  /** Filter by graph type */
  graphTypes?: Array<'lexical' | 'domain' | 'cross_graph'>;
}

/**
 * Temporal statistics for monitoring
 */
export interface TemporalStats {
  totalTrackedRelationships: number;
  activeRelationships: number;
  invalidatedRelationships: number;
  relationshipsByType: {
    facts: number;
    events: number;
    states: number;
  };
  relationshipsByGraph: {
    lexical: number;
    domain: number;
    crossGraph: number;
  };
  averageRelationshipAge: number;
  recentInvalidations: number;
}

/**
 * Manages temporal tracking for dual graph architecture
 */
export class DualGraphTemporalManager {
  private config: DualGraphTemporalConfig;
  private temporalIndex: Map<string, TemporalRelationshipTracker> = new Map();
  private invalidationQueue: Map<string, InvalidationEvent> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<DualGraphTemporalConfig> = {}) {
    this.config = {
      autoInvalidation: config.autoInvalidation ?? true,
      defaultValidityPeriod: config.defaultValidityPeriod ?? (365 * 24 * 60 * 60 * 1000), // 1 year
      eventValidityPeriod: config.eventValidityPeriod ?? (30 * 24 * 60 * 60 * 1000), // 30 days
      stateValidityPeriod: config.stateValidityPeriod ?? (90 * 24 * 60 * 60 * 1000), // 90 days
      enableCrossGraphConsistency: config.enableCrossGraphConsistency ?? true,
      maxInvalidatedAge: config.maxInvalidatedAge ?? (30 * 24 * 60 * 60 * 1000), // 30 days
      cleanupInterval: config.cleanupInterval ?? (24 * 60 * 60 * 1000) // Daily cleanup
    };

    // Start cleanup timer
    if (this.config.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }

  /**
   * Track a new relationship in the temporal system
   */
  trackRelationship(
    relationshipId: string,
    relationship: RelationshipRecord | CrossGraphLink,
    graphType: 'lexical' | 'domain' | 'cross_graph',
    context: GraphContext
  ): void {
    const now = new Date();
    const temporalType = relationship.temporalType || this.inferTemporalType(relationship);
    const validityPeriod = this.getValidityPeriod(temporalType);

    const tracker: TemporalRelationshipTracker = {
      id: relationshipId,
      relationship,
      graphType,
      temporalType,
      validFrom: relationship.validFrom || now,
      validUntil: relationship.validUntil || new Date(now.getTime() + validityPeriod),
      createdAt: now,
      updatedAt: now,
      isActive: true,
      invalidationReason: undefined,
      context: {
        userId: context.userId,
        sessionId: context.sessionId,
        source: context.source
      }
    };

    this.temporalIndex.set(relationshipId, tracker);

    // Check for conflicts if auto-invalidation is enabled
    if (this.config.autoInvalidation) {
      this.checkForConflicts(tracker);
    }
  }

  /**
   * Invalidate a relationship
   */
  invalidateRelationship(
    relationshipId: string,
    reason: InvalidationReason,
    timestamp: Date = new Date()
  ): boolean {
    const tracker = this.temporalIndex.get(relationshipId);
    if (!tracker || !tracker.isActive) {
      return false;
    }

    tracker.validUntil = timestamp;
    tracker.isActive = false;
    tracker.invalidationReason = reason;
    tracker.updatedAt = timestamp;

    // Add to invalidation queue for processing
    this.invalidationQueue.set(relationshipId, {
      relationshipId,
      timestamp,
      reason
    });

    return true;
  }

  /**
   * Query relationships with temporal filtering
   */
  queryRelationships(query: DualGraphTemporalQuery = {}): TemporalRelationshipTracker[] {
    const queryTime = query.timestamp || new Date();
    const results: TemporalRelationshipTracker[] = [];

    for (const tracker of this.temporalIndex.values()) {
      // Check if relationship is valid at query time
      if (!query.includeInvalidated && !this.isValidAt(tracker, queryTime)) {
        continue;
      }

      // Apply temporal type filter
      if (query.temporalTypes && !query.temporalTypes.includes(tracker.temporalType)) {
        continue;
      }

      // Apply graph type filter
      if (query.graphTypes && !query.graphTypes.includes(tracker.graphType)) {
        continue;
      }

      // Apply time range filter
      if (query.timeRange) {
        const overlapStart = new Date(Math.max(tracker.validFrom.getTime(), query.timeRange.start.getTime()));
        const overlapEnd = new Date(Math.min(
          tracker.validUntil?.getTime() || Date.now(),
          query.timeRange.end.getTime()
        ));
        
        if (overlapStart >= overlapEnd) {
          continue; // No overlap
        }
      }

      results.push(tracker);
    }

    return results;
  }

  /**
   * Update relationship validity period
   */
  updateValidityPeriod(
    relationshipId: string,
    newValidUntil: Date,
    reason?: string
  ): boolean {
    const tracker = this.temporalIndex.get(relationshipId);
    if (!tracker) {
      return false;
    }

    tracker.validUntil = newValidUntil;
    tracker.updatedAt = new Date();
    
    if (reason) {
      if ('properties' in tracker.relationship) {
        tracker.relationship.properties.validityUpdateReason = reason;
      } else {
        // For CrossGraphLink, store in metadata
        tracker.relationship.metadata.validityUpdateReason = reason;
      }
    }

    return true;
  }

  /**
   * Get temporal statistics
   */
  getStats(): TemporalStats {
    const stats: TemporalStats = {
      totalTrackedRelationships: this.temporalIndex.size,
      activeRelationships: 0,
      invalidatedRelationships: 0,
      relationshipsByType: { facts: 0, events: 0, states: 0 },
      relationshipsByGraph: { lexical: 0, domain: 0, crossGraph: 0 },
      averageRelationshipAge: 0,
      recentInvalidations: 0
    };

    const now = new Date();
    let totalAge = 0;
    let recentCutoff = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // Last 24 hours

    for (const tracker of this.temporalIndex.values()) {
      // Count active vs invalidated
      if (tracker.isActive && this.isValidAt(tracker, now)) {
        stats.activeRelationships++;
      } else {
        stats.invalidatedRelationships++;
      }

      // Count by temporal type
      stats.relationshipsByType[tracker.temporalType]++;

      // Count by graph type
      if (tracker.graphType === 'cross_graph') {
        stats.relationshipsByGraph.crossGraph++;
      } else {
        stats.relationshipsByGraph[tracker.graphType]++;
      }

      // Calculate age
      totalAge += now.getTime() - tracker.createdAt.getTime();

      // Count recent invalidations
      if (!tracker.isActive && tracker.validUntil && tracker.validUntil >= recentCutoff) {
        stats.recentInvalidations++;
      }
    }

    stats.averageRelationshipAge = this.temporalIndex.size > 0 ? 
      totalAge / this.temporalIndex.size : 0;

    return stats;
  }

  /**
   * Clean up old invalidated relationships
   */
  cleanup(olderThan?: Date): number {
    const cutoffTime = olderThan || new Date(Date.now() - this.config.maxInvalidatedAge);
    let cleanedCount = 0;

    for (const [relationshipId, tracker] of this.temporalIndex) {
      if (!tracker.isActive && 
          tracker.validUntil && 
          tracker.validUntil < cutoffTime) {
        this.temporalIndex.delete(relationshipId);
        cleanedCount++;
      }
    }

    // Also clean invalidation queue
    for (const [relationshipId, event] of this.invalidationQueue) {
      if (event.timestamp < cutoffTime) {
        this.invalidationQueue.delete(relationshipId);
      }
    }

    return cleanedCount;
  }

  /**
   * Stop the temporal manager and cleanup resources
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  // Private helper methods

  private isValidAt(tracker: TemporalRelationshipTracker, timestamp: Date): boolean {
    return tracker.validFrom <= timestamp && 
           (!tracker.validUntil || tracker.validUntil > timestamp);
  }

  private inferTemporalType(relationship: RelationshipRecord | CrossGraphLink): 'fact' | 'event' | 'state' {
    const relationshipType = 'type' in relationship ? relationship.type : 'unknown';
    
    // Event indicators
    if (/\b(happened|occurred|started|ended|began|finished|created|deleted|changed)\b/i.test(relationshipType)) {
      return 'event';
    }
    
    // State indicators
    if (/\b(is|has|contains|includes|located|based|works|lives|manages)\b/i.test(relationshipType)) {
      return 'state';
    }
    
    // Default to fact
    return 'fact';
  }

  private getValidityPeriod(temporalType: 'fact' | 'event' | 'state'): number {
    switch (temporalType) {
      case 'event':
        return this.config.eventValidityPeriod;
      case 'state':
        return this.config.stateValidityPeriod;
      case 'fact':
      default:
        return this.config.defaultValidityPeriod;
    }
  }

  private checkForConflicts(newTracker: TemporalRelationshipTracker): void {
    // Check for conflicts with existing relationships
    for (const existingTracker of this.temporalIndex.values()) {
      if (existingTracker.id === newTracker.id || !existingTracker.isActive) {
        continue;
      }

      if (this.areConflicting(newTracker, existingTracker)) {
        // Invalidate the older relationship
        if (existingTracker.createdAt < newTracker.createdAt) {
          this.invalidateRelationship(existingTracker.id, 'superseded', newTracker.createdAt);
        }
      }
    }
  }

  private areConflicting(tracker1: TemporalRelationshipTracker, tracker2: TemporalRelationshipTracker): boolean {
    // Simple conflict detection - would be enhanced based on domain logic
    const rel1 = tracker1.relationship;
    const rel2 = tracker2.relationship;

    // Same source and target with different relationship types
    if ('source' in rel1 && 'source' in rel2) {
      return rel1.source === rel2.source && 
             rel1.target === rel2.target && 
             rel1.type !== rel2.type;
    }

    return false;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }
}

/**
 * Internal tracker for temporal relationships
 */
interface TemporalRelationshipTracker {
  id: string;
  relationship: RelationshipRecord | CrossGraphLink;
  graphType: 'lexical' | 'domain' | 'cross_graph';
  temporalType: 'fact' | 'event' | 'state';
  validFrom: Date;
  validUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  invalidationReason?: InvalidationReason;
  context: {
    userId: string;
    sessionId: string;
    source: string;
  };
}

/**
 * Invalidation event for tracking
 */
interface InvalidationEvent {
  relationshipId: string;
  timestamp: Date;
  reason: InvalidationReason;
}
