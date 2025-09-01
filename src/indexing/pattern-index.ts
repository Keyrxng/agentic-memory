/**
 * Pattern Matching Index Implementation
 *
 * Provides graph pattern matching capabilities for subgraph isomorphism
 * and structural queries. Supports complex pattern queries with
 * variable binding and constraint satisfaction.
 *
 * Example: Find all instances of a specific subgraph pattern
 */

import type { GraphIndex, IndexEntry, QueryOptions, IndexStats } from './types.js';

export interface PatternNode {
  /** Node type/label */
  type?: string;
  /** Node properties (exact match) */
  properties?: Record<string, any>;
  /** Variable name for binding */
  variable?: string;
}

export interface PatternEdge {
  /** Edge type/label */
  type?: string;
  /** Edge properties (exact match) */
  properties?: Record<string, any>;
  /** Source node variable */
  from: string;
  /** Target node variable */
  to: string;
  /** Direction (outgoing, incoming, undirected) */
  direction: 'out' | 'in' | 'undirected';
}

export interface GraphPattern {
  /** Pattern nodes */
  nodes: Record<string, PatternNode>;
  /** Pattern edges */
  edges: PatternEdge[];
  /** Additional constraints */
  constraints?: PatternConstraint[];
}

export interface PatternConstraint {
  /** Constraint type */
  type: 'property' | 'count' | 'path' | 'custom';
  /** Target variable(s) */
  variables: string[];
  /** Constraint parameters */
  params: Record<string, any>;
}

export interface PatternMatch {
  /** Variable bindings */
  bindings: Record<string, string>;
  /** Match score/confidence */
  score: number;
  /** Matched subgraph */
  subgraph: {
    nodes: Set<string>;
    edges: Set<string>;
  };
}

export class PatternIndex implements GraphIndex {
  public readonly name = 'pattern_index';
  public readonly type = 'structure' as const;

  private patterns: Map<string, GraphPattern> = new Map();
  private nodePatterns: Map<string, Set<string>> = new Map(); // nodeId -> patternIds
  private edgePatterns: Map<string, Set<string>> = new Map(); // edgeId -> patternIds
  private queryCount = 0;
  private hitCount = 0;

  add(pattern: GraphPattern, patternId: string, metadata?: any): void {
    this.patterns.set(patternId, pattern);

    // Index nodes by their properties for faster lookup
    for (const [varName, node] of Object.entries(pattern.nodes)) {
      if (node.type) {
        const key = `type:${node.type}`;
        if (!this.nodePatterns.has(key)) {
          this.nodePatterns.set(key, new Set());
        }
        this.nodePatterns.get(key)!.add(patternId);
      }

      // Index by properties
      if (node.properties) {
        for (const [propKey, propValue] of Object.entries(node.properties)) {
          const key = `prop:${propKey}:${String(propValue)}`;
          if (!this.nodePatterns.has(key)) {
            this.nodePatterns.set(key, new Set());
          }
          this.nodePatterns.get(key)!.add(patternId);
        }
      }
    }

    // Index edges by their properties
    for (const edge of pattern.edges) {
      if (edge.type) {
        const key = `edge_type:${edge.type}`;
        if (!this.edgePatterns.has(key)) {
          this.edgePatterns.set(key, new Set());
        }
        this.edgePatterns.get(key)!.add(patternId);
      }

      if (edge.properties) {
        for (const [propKey, propValue] of Object.entries(edge.properties)) {
          const key = `edge_prop:${propKey}:${String(propValue)}`;
          if (!this.edgePatterns.has(key)) {
            this.edgePatterns.set(key, new Set());
          }
          this.edgePatterns.get(key)!.add(patternId);
        }
      }
    }
  }

  remove(pattern: GraphPattern, patternId: string): void {
    this.patterns.delete(patternId);

    // Remove from node patterns
    for (const patterns of this.nodePatterns.values()) {
      patterns.delete(patternId);
    }

    // Remove from edge patterns
    for (const patterns of this.edgePatterns.values()) {
      patterns.delete(patternId);
    }
  }

  query(pattern: GraphPattern, options: QueryOptions = {}): Set<string> {
    this.queryCount++;

    // For pattern matching, we return pattern IDs that match
    // In a real implementation, this would perform subgraph isomorphism
    const matches = this.findMatchingPatterns(pattern);

    if (matches.size > 0) {
      this.hitCount++;
    }

    return matches;
  }

  getStats(): IndexStats {
    return {
      totalEntries: this.patterns.size,
      totalItems: this.patterns.size,
      memoryUsage: this.estimateMemoryUsage(),
      averageItemsPerEntry: 1,
      hitRate: this.queryCount > 0 ? this.hitCount / this.queryCount : 0
    };
  }

  clear(): void {
    this.patterns.clear();
    this.nodePatterns.clear();
    this.edgePatterns.clear();
    this.queryCount = 0;
    this.hitCount = 0;
  }

  async rebuild(items: Array<{id: string, data: any}>): Promise<void> {
    this.clear();

    // Rebuild from graph data
    // This would typically involve extracting common patterns
    for (const item of items) {
      if (item.data.pattern && typeof item.data.pattern === 'object') {
        this.add(item.data.pattern, item.id);
      }
    }
  }

  /**
   * Find patterns that could match the given query pattern
   */
  private findMatchingPatterns(queryPattern: GraphPattern): Set<string> {
    const candidates = new Set<string>();

    // Find patterns that have compatible node types
    for (const [varName, node] of Object.entries(queryPattern.nodes)) {
      if (node.type) {
        const key = `type:${node.type}`;
        const matchingPatterns = this.nodePatterns.get(key);
        if (matchingPatterns) {
          for (const patternId of matchingPatterns) {
            candidates.add(patternId);
          }
        }
      }

      // Check property matches
      if (node.properties) {
        for (const [propKey, propValue] of Object.entries(node.properties)) {
          const key = `prop:${propKey}:${String(propValue)}`;
          const matchingPatterns = this.nodePatterns.get(key);
          if (matchingPatterns) {
            for (const patternId of matchingPatterns) {
              candidates.add(patternId);
            }
          }
        }
      }
    }

    // Filter by edge compatibility
    for (const edge of queryPattern.edges) {
      if (edge.type) {
        const key = `edge_type:${edge.type}`;
        const matchingPatterns = this.edgePatterns.get(key);
        if (matchingPatterns) {
          // Keep only patterns that have this edge type
          const filtered = new Set<string>();
          for (const patternId of candidates) {
            if (matchingPatterns.has(patternId)) {
              filtered.add(patternId);
            }
          }
          candidates.clear();
          filtered.forEach(id => candidates.add(id));
        }
      }
    }

    return candidates;
  }

  /**
   * Perform subgraph isomorphism matching
   * This is a simplified implementation - real subgraph isomorphism is NP-complete
   */
  matchPattern(queryPattern: GraphPattern, graphNodes: Map<string, any>, graphEdges: Map<string, any>): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Get candidate patterns
    const candidatePatternIds = this.findMatchingPatterns(queryPattern);

    for (const patternId of candidatePatternIds) {
      const pattern = this.patterns.get(patternId);
      if (!pattern) continue;

      // Try to find matches for this pattern in the graph
      const patternMatches = this.findPatternInstances(pattern, graphNodes, graphEdges);
      matches.push(...patternMatches);
    }

    return matches;
  }

  /**
   * Find instances of a pattern in the graph
   */
  private findPatternInstances(
    pattern: GraphPattern,
    graphNodes: Map<string, any>,
    graphEdges: Map<string, any>
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // This is a simplified backtracking approach
    // In practice, you'd want more sophisticated algorithms like VF2

    const variables = Object.keys(pattern.nodes);
    if (variables.length === 0) return matches;

    // Start with the first variable
    const startVar = variables[0];
    if (!startVar) return matches;

    const startNodePattern = pattern.nodes[startVar];
    if (!startNodePattern) return matches;

    // Find candidate nodes for the start variable
    const candidateNodes = this.findCandidateNodes(startNodePattern, graphNodes);

    for (const candidateNodeId of candidateNodes) {
      const bindings = new Map<string, string>();
      bindings.set(startVar, candidateNodeId);

      // Try to extend the match
      const match = this.extendMatch(pattern, bindings, graphNodes, graphEdges);
      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }

  /**
   * Find nodes that match a pattern node
   */
  private findCandidateNodes(patternNode: PatternNode, graphNodes: Map<string, any>): string[] {
    const candidates: string[] = [];

    for (const [nodeId, nodeData] of graphNodes) {
      if (this.nodeMatchesPattern(nodeData, patternNode)) {
        candidates.push(nodeId);
      }
    }

    return candidates;
  }

  /**
   * Check if a graph node matches a pattern node
   */
  private nodeMatchesPattern(nodeData: any, pattern: PatternNode): boolean {
    // Check type
    if (pattern.type && nodeData.type !== pattern.type) {
      return false;
    }

    // Check properties
    if (pattern.properties) {
      for (const [key, value] of Object.entries(pattern.properties)) {
        if (nodeData.properties?.[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Try to extend a partial match to cover all pattern variables
   */
  private extendMatch(
    pattern: GraphPattern,
    bindings: Map<string, string>,
    graphNodes: Map<string, any>,
    graphEdges: Map<string, any>
  ): PatternMatch | null {
    const variables = Object.keys(pattern.nodes);

    // Check if all variables are bound
    if (bindings.size === variables.length) {
      // Verify all edges are satisfied
      if (this.verifyEdges(pattern, bindings, graphEdges)) {
        return {
          bindings: Object.fromEntries(bindings),
          score: 1.0, // Simplified scoring
          subgraph: {
            nodes: new Set(bindings.values()),
            edges: this.findMatchingEdges(pattern, bindings, graphEdges)
          }
        };
      }
      return null;
    }

    // Find next unbound variable
    const nextVar = variables.find(v => !bindings.has(v));
    if (!nextVar) return null;

    const nextPattern = pattern.nodes[nextVar];
    if (!nextPattern) return null;
    const candidates = this.findCandidateNodes(nextPattern, graphNodes);

    // Try each candidate
    for (const candidate of candidates) {
      // Check if this candidate is already bound to another variable
      if (Array.from(bindings.values()).includes(candidate)) {
        continue;
      }

      // Create new bindings
      const newBindings = new Map(bindings);
      newBindings.set(nextVar, candidate);

      // Recursively try to extend
      const match = this.extendMatch(pattern, newBindings, graphNodes, graphEdges);
      if (match) {
        return match;
      }
    }

    return null;
  }

  /**
   * Verify that all pattern edges are satisfied by the bindings
   */
  private verifyEdges(
    pattern: GraphPattern,
    bindings: Map<string, string>,
    graphEdges: Map<string, any>
  ): boolean {
    for (const edge of pattern.edges) {
      const fromNodeId = bindings.get(edge.from);
      const toNodeId = bindings.get(edge.to);

      if (!fromNodeId || !toNodeId) {
        return false;
      }

      // Find edge between these nodes
      const edgeExists = this.findEdgeBetween(fromNodeId, toNodeId, edge, graphEdges);
      if (!edgeExists) {
        return false;
      }
    }

    return true;
  }

  /**
   * Find an edge that matches the pattern edge between two nodes
   */
  private findEdgeBetween(
    fromId: string,
    toId: string,
    patternEdge: PatternEdge,
    graphEdges: Map<string, any>
  ): boolean {
    for (const [edgeId, edgeData] of graphEdges) {
      const matches = (
        edgeData.from === fromId &&
        edgeData.to === toId &&
        (patternEdge.direction === 'out' || patternEdge.direction === 'undirected') &&
        (!patternEdge.type || edgeData.type === patternEdge.type) &&
        this.propertiesMatch(edgeData.properties, patternEdge.properties)
      );

      if (matches) {
        return true;
      }

      // Check reverse direction for undirected or incoming
      if (patternEdge.direction === 'in' || patternEdge.direction === 'undirected') {
        const reverseMatches = (
          edgeData.from === toId &&
          edgeData.to === fromId &&
          (!patternEdge.type || edgeData.type === patternEdge.type) &&
          this.propertiesMatch(edgeData.properties, patternEdge.properties)
        );

        if (reverseMatches) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Find all edges that match the pattern in the bindings
   */
  private findMatchingEdges(
    pattern: GraphPattern,
    bindings: Map<string, string>,
    graphEdges: Map<string, any>
  ): Set<string> {
    const matchingEdges = new Set<string>();

    for (const edge of pattern.edges) {
      const fromNodeId = bindings.get(edge.from);
      const toNodeId = bindings.get(edge.to);

      if (!fromNodeId || !toNodeId) continue;

      for (const [edgeId, edgeData] of graphEdges) {
        if (this.edgeMatchesPattern(edgeData, fromNodeId, toNodeId, edge)) {
          matchingEdges.add(edgeId);
        }
      }
    }

    return matchingEdges;
  }

  /**
   * Check if an edge matches the pattern
   */
  private edgeMatchesPattern(
    edgeData: any,
    fromId: string,
    toId: string,
    patternEdge: PatternEdge
  ): boolean {
    return (
      edgeData.from === fromId &&
      edgeData.to === toId &&
      (!patternEdge.type || edgeData.type === patternEdge.type) &&
      this.propertiesMatch(edgeData.properties, patternEdge.properties)
    );
  }

  /**
   * Check if properties match (exact match)
   */
  private propertiesMatch(actual: any, expected: any): boolean {
    if (!expected) return true;
    if (!actual) return false;

    for (const [key, value] of Object.entries(expected)) {
      if (actual[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get all stored patterns
   */
  getAllPatterns(): Map<string, GraphPattern> {
    return new Map(this.patterns);
  }

  /**
   * Get patterns that match a specific node type
   */
  getPatternsByNodeType(nodeType: string): Set<string> {
    const key = `type:${nodeType}`;
    return new Set(this.nodePatterns.get(key) || []);
  }

  /**
   * Get patterns that match a specific edge type
   */
  getPatternsByEdgeType(edgeType: string): Set<string> {
    const key = `edge_type:${edgeType}`;
    return new Set(this.edgePatterns.get(key) || []);
  }

  private estimateMemoryUsage(): number {
    let memory = 0;

    // Patterns
    for (const pattern of this.patterns.values()) {
      memory += JSON.stringify(pattern).length * 2; // Rough estimate
    }

    // Index structures
    for (const patterns of this.nodePatterns.values()) {
      memory += patterns.size * 8; // Pointer overhead
    }

    for (const patterns of this.edgePatterns.values()) {
      memory += patterns.size * 8;
    }

    return memory;
  }
}
