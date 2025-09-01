/**
 * Core in-memory graph implementation using adjacency lists
 * 
 * This implementation follows modern techniques for adjacency lists
 * over adjacency matrices due to superior memory efficiency for sparse knowledge graphs.
 * 
 * Memory complexity: O(n + m) where n=nodes, m=edges
 * Adjacency matrices would require O(n²) regardless of sparsity
 * 
 * References:
 * - Memory optimization: https://codevisionz.com/lessons/adjacency-matrix-vs-adjacency-list/
 * - Sparse graph efficiency: https://stackoverflow.com/questions/2218322/what-is-better-adjacency-lists-or-adjacency-matrices-for-graph-problems-in-c
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  GraphNode,
  GraphEdge,
  TemporalEdge,
  GraphContext,
  GraphQuery,
  QueryResult,
  GraphMetrics,
  GraphConfig
} from './types.js';

/**
 * Core in-memory graph implementation optimized for GraphRAG operations
 * 
 * Uses adjacency lists for O(n + m) memory complexity and efficient traversal.
 * Maintains both forward and reverse adjacency lists for bidirectional queries.
 * 
 * The implementation prioritizes:
 * - Memory efficiency for sparse knowledge graphs (typical density < 1%)
 * - Fast traversal operations for relationship expansion
 * - Temporal relationship tracking
 * - Multi-modal indexing support
 */
export class InMemoryGraph {
  // Core graph storage using adjacency lists
  private nodes: Map<string, GraphNode> = new Map();
  private adjacencyList: Map<string, GraphEdge[]> = new Map();
  private reverseAdjacencyList: Map<string, GraphEdge[]> = new Map();
  
  // Performance tracking
  private metrics: GraphMetrics;
  private config: GraphConfig;
  
  // Operation history for debugging and rollback
  private operationHistory: Array<{
    type: 'add_node' | 'add_edge' | 'remove_node' | 'remove_edge';
    timestamp: Date;
    details: any;
  }> = [];

  constructor(config: Partial<GraphConfig> = {}) {
    // Initialize with sensible defaults
    this.config = {
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
        persistToDisk: config.storage?.persistToDisk ?? true,
        storageDirectory: config.storage?.storageDirectory ?? './data',
        compressionEnabled: config.storage?.compressionEnabled ?? false,
        syncInterval: config.storage?.syncInterval ?? 30000,
      }
    };

    this.metrics = {
      nodeCount: 0,
      edgeCount: 0,
      density: 0,
      queryLatency: new Map(),
      indexHitRate: new Map(),
      entityResolutionAccuracy: 0,
      memoryUsage: 0,
      cacheHitRate: 0
    };
  }

  /**
   * Add a node to the graph
   * 
   * Maintains adjacency list structure and updates metrics.
   * Automatically generates timestamps if not provided.
   */
  async addNode(node: Omit<GraphNode, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    const nodeId = node.id ?? uuidv4();
    const now = new Date();
    
    const fullNode: GraphNode = {
      id: nodeId,
      type: node.type,
      properties: { ...node.properties },
      embeddings: node.embeddings,
      createdAt: now,
      updatedAt: now
    };

    // Check capacity limits
    if (this.nodes.size >= this.config.maxNodes) {
      throw new Error(`Graph capacity exceeded. Maximum nodes: ${this.config.maxNodes}`);
    }

    // Store the node
    this.nodes.set(nodeId, fullNode);
    
    // Initialize adjacency lists for this node
    if (!this.adjacencyList.has(nodeId)) {
      this.adjacencyList.set(nodeId, []);
    }
    if (!this.reverseAdjacencyList.has(nodeId)) {
      this.reverseAdjacencyList.set(nodeId, []);
    }

    // Update metrics
    this.metrics.nodeCount = this.nodes.size;
    this.updateDensity();

    // Log operation for debugging
    this.operationHistory.push({
      type: 'add_node',
      timestamp: now,
      details: { nodeId, type: node.type }
    });

    return nodeId;
  }

  /**
   * Add an edge between two nodes
   * 
   * Updates both forward and reverse adjacency lists for efficient
   * bidirectional traversal. Validates node existence before adding.
   */
  async addEdge(edge: Omit<GraphEdge, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string> {
    const edgeId = edge.id ?? uuidv4();
    const now = new Date();

    // Validate that both nodes exist
    if (!this.nodes.has(edge.source)) {
      throw new Error(`Source node ${edge.source} does not exist`);
    }
    if (!this.nodes.has(edge.target)) {
      throw new Error(`Target node ${edge.target} does not exist`);
    }

    const fullEdge: GraphEdge = {
      id: edgeId,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      weight: edge.weight,
      properties: { ...edge.properties },
      createdAt: now,
      updatedAt: now
    };

    // Check edge capacity per node
    const currentOutEdges = this.adjacencyList.get(edge.source) || [];
    if (currentOutEdges.length >= this.config.maxEdgesPerNode) {
      throw new Error(`Edge capacity exceeded for node ${edge.source}. Maximum: ${this.config.maxEdgesPerNode}`);
    }

    // Add to forward adjacency list (source -> target)
    currentOutEdges.push(fullEdge);
    this.adjacencyList.set(edge.source, currentOutEdges);

    // Add to reverse adjacency list (target <- source)
    const currentInEdges = this.reverseAdjacencyList.get(edge.target) || [];
    currentInEdges.push(fullEdge);
    this.reverseAdjacencyList.set(edge.target, currentInEdges);

    // Update metrics
    this.metrics.edgeCount++;
    this.updateDensity();

    // Log operation
    this.operationHistory.push({
      type: 'add_edge',
      timestamp: now,
      details: { edgeId, source: edge.source, target: edge.target, type: edge.type }
    });

    return edgeId;
  }

  /**
   * Retrieve a node by its ID
   */
  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all outgoing edges from a node
   * Optionally filtered by relationship types
   */
  getOutgoingEdges(nodeId: string, relationTypes?: string[]): GraphEdge[] {
    const edges = this.adjacencyList.get(nodeId) || [];
    
    if (!relationTypes || relationTypes.length === 0) {
      return [...edges]; // Return copy to prevent external modification
    }

    return edges.filter(edge => relationTypes.includes(edge.type));
  }

  /**
   * Get all incoming edges to a node
   * Optionally filtered by relationship types
   */
  getIncomingEdges(nodeId: string, relationTypes?: string[]): GraphEdge[] {
    const edges = this.reverseAdjacencyList.get(nodeId) || [];
    
    if (!relationTypes || relationTypes.length === 0) {
      return [...edges];
    }

    return edges.filter(edge => relationTypes.includes(edge.type));
  }

  /**
   * Get neighbor nodes (both incoming and outgoing)
   * Essential for graph traversal operations
   */
  getNeighbors(nodeId: string, relationTypes?: string[]): Array<{ node: GraphNode; edge: GraphEdge; direction: 'out' | 'in' }> {
    const neighbors: Array<{ node: GraphNode; edge: GraphEdge; direction: 'out' | 'in' }> = [];

    // Outgoing neighbors
    const outEdges = this.getOutgoingEdges(nodeId, relationTypes);
    for (const edge of outEdges) {
      const neighborNode = this.nodes.get(edge.target);
      if (neighborNode) {
        neighbors.push({ node: neighborNode, edge, direction: 'out' });
      }
    }

    // Incoming neighbors
    const inEdges = this.getIncomingEdges(nodeId, relationTypes);
    for (const edge of inEdges) {
      const neighborNode = this.nodes.get(edge.source);
      if (neighborNode) {
        neighbors.push({ node: neighborNode, edge, direction: 'in' });
      }
    }

    return neighbors;
  }

  /**
   * Remove a node and all its associated edges
   * Maintains graph consistency by cleaning up adjacency lists
   */
  async removeNode(nodeId: string): Promise<boolean> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return false;
    }

    // Remove all outgoing edges
    const outgoingEdges = this.getOutgoingEdges(nodeId);
    for (const edge of outgoingEdges) {
      await this.removeEdge(edge.id);
    }

    // Remove all incoming edges
    const incomingEdges = this.getIncomingEdges(nodeId);
    for (const edge of incomingEdges) {
      await this.removeEdge(edge.id);
    }

    // Remove the node itself
    this.nodes.delete(nodeId);
    this.adjacencyList.delete(nodeId);
    this.reverseAdjacencyList.delete(nodeId);

    // Update metrics
    this.metrics.nodeCount = this.nodes.size;
    this.updateDensity();

    // Log operation
    this.operationHistory.push({
      type: 'remove_node',
      timestamp: new Date(),
      details: { nodeId, type: node.type }
    });

    return true;
  }

  /**
   * Remove a specific edge from the graph
   * Updates both adjacency lists to maintain consistency
   */
  async removeEdge(edgeId: string): Promise<boolean> {
    // Find the edge in the adjacency lists
    let foundEdge: GraphEdge | undefined;
    let sourceNodeId: string | undefined;
    let targetNodeId: string | undefined;

    // Search through all adjacency lists to find the edge
    for (const [nodeId, edges] of this.adjacencyList.entries()) {
      const edgeIndex = edges.findIndex(e => e.id === edgeId);
      if (edgeIndex >= 0) {
        foundEdge = edges[edgeIndex];
        sourceNodeId = nodeId;
        
        // Remove from outgoing adjacency list
        edges.splice(edgeIndex, 1);
        break;
      }
    }

    if (!foundEdge || !sourceNodeId) {
      return false;
    }

    targetNodeId = foundEdge.target;

    // Remove from incoming adjacency list
    const incomingEdges = this.reverseAdjacencyList.get(targetNodeId) || [];
    const incomingIndex = incomingEdges.findIndex(e => e.id === edgeId);
    if (incomingIndex >= 0) {
      incomingEdges.splice(incomingIndex, 1);
    }

    // Update metrics
    this.metrics.edgeCount--;
    this.updateDensity();

    // Log operation
    this.operationHistory.push({
      type: 'remove_edge',
      timestamp: new Date(),
      details: { edgeId, source: sourceNodeId, target: targetNodeId }
    });

    return true;
  }

  /**
   * Get all nodes in the graph
   * Returns a copy to prevent external modification
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges in the graph
   * Flattens the adjacency list structure
   */
  getAllEdges(): GraphEdge[] {
    const allEdges: GraphEdge[] = [];
    for (const edges of this.adjacencyList.values()) {
      allEdges.push(...edges);
    }
    return allEdges;
  }

  /**
   * Calculate and update graph density
   * Density = edges / possible_edges = m / (n * (n-1))
   * Used for performance monitoring and optimization decisions
   */
  private updateDensity(): void {
    const nodeCount = this.nodes.size;
    if (nodeCount <= 1) {
      this.metrics.density = 0;
      return;
    }

    const possibleEdges = nodeCount * (nodeCount - 1); // Directed graph
    this.metrics.density = this.metrics.edgeCount / possibleEdges;
  }

  /**
   * Get current graph metrics for monitoring
   */
  getMetrics(): GraphMetrics {
    // Update memory usage estimation
    this.updateMemoryUsage();
    return { ...this.metrics };
  }

  /**
   * Estimate current memory usage
   * Rough calculation based on node/edge counts and data structures
   */
  private updateMemoryUsage(): void {
    // Rough estimation: each node ~500 bytes, each edge ~200 bytes
    // Plus overhead for Maps and Arrays
    const nodeMemory = this.nodes.size * 500;
    const edgeMemory = this.metrics.edgeCount * 200;
    const structureOverhead = this.nodes.size * 100; // Map overhead
    
    this.metrics.memoryUsage = nodeMemory + edgeMemory + structureOverhead;
  }

  /**
   * Clear all data from the graph
   * Useful for testing and cleanup
   */
  clear(): void {
    this.nodes.clear();
    this.adjacencyList.clear();
    this.reverseAdjacencyList.clear();
    this.operationHistory = [];
    
    this.metrics = {
      nodeCount: 0,
      edgeCount: 0,
      density: 0,
      queryLatency: new Map(),
      indexHitRate: new Map(),
      entityResolutionAccuracy: 0,
      memoryUsage: 0,
      cacheHitRate: 0
    };
  }

  /**
   * Get operation history for debugging
   * Returns the last N operations
   */
  getOperationHistory(limit: number = 100): Array<{
    type: string;
    timestamp: Date;
    details: any;
  }> {
    return this.operationHistory.slice(-limit);
  }

  /**
   * Validate graph consistency
   * Ensures adjacency lists are properly synchronized
   */
  validateConsistency(): Array<string> {
    const errors: string[] = [];

    // Check that all edges in adjacency lists reference existing nodes
    for (const [sourceId, edges] of this.adjacencyList.entries()) {
      if (!this.nodes.has(sourceId)) {
        errors.push(`Adjacency list contains non-existent source node: ${sourceId}`);
      }

      for (const edge of edges) {
        if (!this.nodes.has(edge.target)) {
          errors.push(`Edge ${edge.id} references non-existent target node: ${edge.target}`);
        }
        
        if (edge.source !== sourceId) {
          errors.push(`Edge ${edge.id} has mismatched source node`);
        }
      }
    }

    // Check reverse adjacency list consistency
    for (const [targetId, edges] of this.reverseAdjacencyList.entries()) {
      if (!this.nodes.has(targetId)) {
        errors.push(`Reverse adjacency list contains non-existent target node: ${targetId}`);
      }

      for (const edge of edges) {
        if (!this.nodes.has(edge.source)) {
          errors.push(`Edge ${edge.id} references non-existent source node: ${edge.source}`);
        }
        
        if (edge.target !== targetId) {
          errors.push(`Edge ${edge.id} has mismatched target node`);
        }
      }
    }

    return errors;
  }
}