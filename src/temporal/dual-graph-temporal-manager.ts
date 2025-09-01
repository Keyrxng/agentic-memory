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
 * Event sequence for tracking ordered events
 */
export interface EventSequence {
  id: string;
  name: string;
  description?: string;
  events: TemporalEvent[];
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'completed' | 'abandoned';
  metadata: Record<string, any>;
  contextId?: string;
}

/**
 * Individual temporal event in a sequence
 */
export interface TemporalEvent {
  id: string;
  sequenceId: string;
  type: string;
  description: string;
  timestamp: Date;
  duration?: number; // in milliseconds
  data: Record<string, any>;
  causedBy?: string[]; // IDs of events that caused this event
  causes?: string[]; // IDs of events caused by this event
  relatedNodeIds: string[];
  relatedEdgeIds: string[];
  confidence: number;
}

/**
 * Event sequence statistics for monitoring
 */
export interface SequenceStats {
  totalSequences: number;
  activeSequences: number;
  completedSequences: number;
  abandonedSequences: number;
  totalEvents: number;
  averageSequenceLength: number;
  averageSequenceDuration: number;
  mostCommonEventTypes: Array<{ type: string; count: number }>;
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
  sequences: SequenceStats;
}

/**
 * Manages temporal tracking for dual graph architecture
 */
export class DualGraphTemporalManager {
  private config: DualGraphTemporalConfig;
  private temporalIndex: Map<string, TemporalRelationshipTracker> = new Map();
  private invalidationQueue: Map<string, InvalidationEvent> = new Map();
  private cleanupTimer?: NodeJS.Timeout;
  
  // Event sequence tracking
  private eventSequences = new Map<string, EventSequence>();
  private temporalEvents = new Map<string, TemporalEvent>();
  private eventTypeCounter = new Map<string, number>();
  private sequencePatterns = new Map<string, { count: number; avgDuration: number }>();

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
      recentInvalidations: 0,
      sequences: this.getSequenceStats()
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

  // ========================================
  // Event Sequence Tracking Methods
  // ========================================

  /**
   * Start a new event sequence
   */
  startEventSequence(
    name: string,
    description?: string,
    contextId?: string,
    metadata: Record<string, any> = {}
  ): string {
    const sequenceId = `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const sequence: EventSequence = {
      id: sequenceId,
      name,
      description,
      events: [],
      startTime: new Date(),
      status: 'active',
      metadata,
      contextId
    };

    this.eventSequences.set(sequenceId, sequence);
    console.log(`🎬 Started event sequence: ${name} (${sequenceId})`);
    
    return sequenceId;
  }

  /**
   * Add an event to a sequence
   */
  addEvent(
    sequenceId: string,
    type: string,
    description: string,
    data: Record<string, any> = {},
    relatedNodeIds: string[] = [],
    relatedEdgeIds: string[] = [],
    confidence: number = 1.0,
    causedBy?: string[]
  ): string {
    const sequence = this.eventSequences.get(sequenceId);
    if (!sequence) {
      throw new Error(`Event sequence ${sequenceId} not found`);
    }

    if (sequence.status !== 'active') {
      throw new Error(`Cannot add event to ${sequence.status} sequence ${sequenceId}`);
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const event: TemporalEvent = {
      id: eventId,
      sequenceId,
      type,
      description,
      timestamp: new Date(),
      data,
      causedBy,
      relatedNodeIds,
      relatedEdgeIds,
      confidence
    };

    // Update causal relationships
    if (causedBy) {
      for (const parentEventId of causedBy) {
        const parentEvent = this.temporalEvents.get(parentEventId);
        if (parentEvent) {
          if (!parentEvent.causes) parentEvent.causes = [];
          parentEvent.causes.push(eventId);
        }
      }
    }

    this.temporalEvents.set(eventId, event);
    sequence.events.push(event);

    // Update event type counter
    const currentCount = this.eventTypeCounter.get(type) || 0;
    this.eventTypeCounter.set(type, currentCount + 1);

    console.log(`📝 Added event: ${type} to sequence ${sequence.name}`);
    
    return eventId;
  }

  /**
   * Complete an event sequence
   */
  completeEventSequence(sequenceId: string): void {
    const sequence = this.eventSequences.get(sequenceId);
    if (!sequence) {
      throw new Error(`Event sequence ${sequenceId} not found`);
    }

    sequence.status = 'completed';
    sequence.endTime = new Date();

    // Update sequence patterns
    const duration = sequence.endTime.getTime() - sequence.startTime.getTime();
    const patternKey = `${sequence.name}_${sequence.events.length}`;
    const existing = this.sequencePatterns.get(patternKey);
    
    if (existing) {
      existing.count += 1;
      existing.avgDuration = (existing.avgDuration * (existing.count - 1) + duration) / existing.count;
    } else {
      this.sequencePatterns.set(patternKey, { count: 1, avgDuration: duration });
    }

    console.log(`✅ Completed event sequence: ${sequence.name} with ${sequence.events.length} events`);
  }

  /**
   * Get active event sequences
   */
  getActiveSequences(): EventSequence[] {
    return Array.from(this.eventSequences.values())
      .filter(seq => seq.status === 'active');
  }

  /**
   * Find sequences by pattern
   */
  findSequencesByPattern(
    eventTypes: string[],
    maxGap: number = 60000 // 1 minute max gap between events
  ): EventSequence[] {
    const matchingSequences: EventSequence[] = [];

    for (const sequence of this.eventSequences.values()) {
      if (this.sequenceMatchesPattern(sequence, eventTypes, maxGap)) {
        matchingSequences.push(sequence);
      }
    }

    return matchingSequences;
  }

  /**
   * Enhanced temporal statistics including sequence data
   */
  getEnhancedTemporalStats(): TemporalStats {
    const activeRelationships = Array.from(this.temporalIndex.values()).filter(t => t.isActive).length;
    const invalidatedRelationships = Array.from(this.temporalIndex.values()).filter(t => !t.isActive).length;

    const sequenceStats = this.getSequenceStats();

    return {
      totalTrackedRelationships: this.temporalIndex.size,
      activeRelationships,
      invalidatedRelationships,
      relationshipsByType: {
        facts: 0, // Would be calculated based on actual data
        events: 0,
        states: 0
      },
      relationshipsByGraph: {
        lexical: 0,
        domain: 0,
        crossGraph: 0
      },
      averageRelationshipAge: this.calculateAverageAge(),
      recentInvalidations: this.invalidationQueue.size,
      sequences: sequenceStats
    };
  }

  /**
   * Get sequence-specific statistics
   */
  private getSequenceStats(): SequenceStats {
    const sequences = Array.from(this.eventSequences.values());
    const totalEvents = Array.from(this.temporalEvents.values()).length;

    const activeSequences = sequences.filter(s => s.status === 'active').length;
    const completedSequences = sequences.filter(s => s.status === 'completed').length;
    const abandonedSequences = sequences.filter(s => s.status === 'abandoned').length;

    const avgSequenceLength = sequences.length > 0 
      ? sequences.reduce((sum, seq) => sum + seq.events.length, 0) / sequences.length 
      : 0;

    const completedWithDuration = sequences.filter(s => s.status === 'completed' && s.endTime);
    const avgSequenceDuration = completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum, seq) => {
          return sum + (seq.endTime!.getTime() - seq.startTime.getTime());
        }, 0) / completedWithDuration.length
      : 0;

    const mostCommonEventTypes = Array.from(this.eventTypeCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    return {
      totalSequences: sequences.length,
      activeSequences,
      completedSequences,
      abandonedSequences,
      totalEvents,
      averageSequenceLength: Math.round(avgSequenceLength * 100) / 100,
      averageSequenceDuration: Math.round(avgSequenceDuration),
      mostCommonEventTypes
    };
  }

  /**
   * Check if sequence matches a pattern
   */
  private sequenceMatchesPattern(
    sequence: EventSequence,
    eventTypes: string[],
    maxGap: number
  ): boolean {
    if (sequence.events.length < eventTypes.length) return false;

    let patternIndex = 0;
    let lastMatchTime: Date | null = null;

    for (const event of sequence.events) {
      if (event.type === eventTypes[patternIndex]) {
        if (lastMatchTime && event.timestamp.getTime() - lastMatchTime.getTime() > maxGap) {
          return false; // Gap too large
        }
        
        lastMatchTime = event.timestamp;
        patternIndex++;
        
        if (patternIndex >= eventTypes.length) {
          return true; // Found all pattern events
        }
      }
    }

    return false;
  }

  /**
   * Calculate average age of relationships
   */
  private calculateAverageAge(): number {
    const trackers = Array.from(this.temporalIndex.values());
    if (trackers.length === 0) return 0;

    const now = new Date().getTime();
    const totalAge = trackers.reduce((sum, tracker) => {
      return sum + (now - tracker.createdAt.getTime());
    }, 0);

    return Math.round(totalAge / trackers.length);
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
