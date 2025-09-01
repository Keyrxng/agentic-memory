/**
 * Graph traversal algorithms optimized for GraphRAG operations
 * 
 * Implements both BFS and DFS with specific optimizations for knowledge graph
 * querying and relationship expansion. BFS is optimal for shortest-path queries
 * and relationship expansion within distance limits. DFS is better for deep path
 * exploration and cycle detection in knowledge verification.
 * 
 * Time Complexity: O(V + E) for both algorithms
 * Space Complexity: O(V) for both (BFS uses queue, DFS uses stack)
 * 
 * References:
 * - Graph traversal optimization: https://memgraph.com/blog/graph-search-algorithms-developers-guide
 * - BFS vs DFS selection: https://www.puppygraph.com/blog/depth-first-search-vs-breadth-first-search
 * - Traversal patterns: https://www.puppygraph.com/blog/graph-traversal
 */

import type { GraphNode, GraphEdge, GraphContext } from './types.js';
import type { InMemoryGraph } from './graph.js';
import type { PersistentGraph } from '../storage/persistent-graph.js';

/**
 * Graph interface for traversal operations
 */
export interface GraphLike {
  getNode(nodeId: string): GraphNode | undefined;
  getNeighbors(nodeId: string, relationTypes?: string[]): Array<{ node: GraphNode; edge: GraphEdge; direction: 'out' | 'in' }>;
  getOutgoingEdges(nodeId: string, relationTypes?: string[]): GraphEdge[];
  getIncomingEdges(nodeId: string, relationTypes?: string[]): GraphEdge[];
}

/**
 * Configuration for traversal operations
 */
export interface TraversalConfig {
  /** Maximum depth to traverse */
  maxDepth: number;
  /** Maximum number of nodes to visit */
  maxNodes: number;
  /** Relationship types to follow (null = all types) */
  relationTypes?: string[];
  /** Direction of traversal */
  direction: 'out' | 'in' | 'both';
  /** Whether to include the starting node in results */
  includeStartNode: boolean;
  /** Custom filter function for nodes */
  nodeFilter?: (node: GraphNode) => boolean;
  /** Custom filter function for edges */
  edgeFilter?: (edge: GraphEdge) => boolean;
}

/**
 * Result of a traversal operation
 */
export interface TraversalResult {
  /** Nodes found during traversal */
  nodes: GraphNode[];
  /** Edges traversed during operation */
  edges: GraphEdge[];
  /** Path information for each node */
  paths: Map<string, string[]>; // nodeId -> path from start
  /** Traversal metadata */
  metadata: {
    nodesVisited: number;
    edgesTraversed: number;
    maxDepthReached: number;
    executionTime: number;
  };
}

/**
 * Advanced graph traversal implementation
 * 
 * Provides both BFS and DFS algorithms with GraphRAG-specific optimizations:
 * - Memory-bounded traversal with configurable limits
 * - Path tracking for explanation generation
 * - Flexible filtering for relationship types and node properties
 * - Cycle detection and prevention
 */
export class GraphTraversal {
  private graph: GraphLike;

  constructor(graph: GraphLike) {
    this.graph = graph;
  }

  /**
   * Breadth-First Search traversal
   * 
   * Optimal for:
   * - Shortest path discovery
   * - Relationship expansion within distance limits
   * - Finding nearest neighbors
   * - Level-order exploration of knowledge graphs
   * 
   * Use when you need to explore the immediate neighborhood before
   * going deeper, which is common in contextual knowledge retrieval.
   */
  async bfsTraversal(
    startNodeId: string,
    config: TraversalConfig
  ): Promise<TraversalResult> {
    const startTime = Date.now();
    const visited = new Set<string>();
    const queue: Array<{nodeId: string, depth: number, path: string[]}> = [];
    const result: GraphNode[] = [];
    const traversedEdges: GraphEdge[] = [];
    const paths = new Map<string, string[]>();
    
    let nodesVisited = 0;
    let edgesTraversed = 0;
    let maxDepthReached = 0;

    // Validate start node exists
    const startNode = this.graph.getNode(startNodeId);
    if (!startNode) {
      throw new Error(`Start node ${startNodeId} does not exist`);
    }

    // Initialize queue with start node
    queue.push({nodeId: startNodeId, depth: 0, path: [startNodeId]});
    
    if (config.includeStartNode) {
      if (!config.nodeFilter || config.nodeFilter(startNode)) {
        result.push(startNode);
        paths.set(startNodeId, [startNodeId]);
      }
    }

    // BFS main loop
    while (queue.length > 0 && result.length < config.maxNodes) {
      const {nodeId, depth, path} = queue.shift()!;
      
      // Skip if already visited or depth exceeded
      if (visited.has(nodeId) || depth > config.maxDepth) {
        continue;
      }

      visited.add(nodeId);
      nodesVisited++;
      maxDepthReached = Math.max(maxDepthReached, depth);

      // Get neighbors based on direction preference
      const neighbors = this.getNeighborsForTraversal(nodeId, config);

      for (const {node: neighborNode, edge} of neighbors) {
        edgesTraversed++;

        // Apply edge filter if provided
        if (config.edgeFilter && !config.edgeFilter(edge)) {
          continue;
        }

        const neighborId = neighborNode.id;
        const newPath = [...path, neighborId];

        // Skip if already visited
        if (visited.has(neighborId)) {
          continue;
        }

        // Apply node filter if provided
        if (config.nodeFilter && !config.nodeFilter(neighborNode)) {
          continue;
        }

        // Add to results if not already included
        if (!result.some(n => n.id === neighborId)) {
          result.push(neighborNode);
          paths.set(neighborId, newPath);
          traversedEdges.push(edge);
        }

        // Add to queue for further exploration
        if (depth + 1 <= config.maxDepth) {
          queue.push({
            nodeId: neighborId,
            depth: depth + 1,
            path: newPath
          });
        }
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      nodes: result,
      edges: traversedEdges,
      paths,
      metadata: {
        nodesVisited,
        edgesTraversed,
        maxDepthReached,
        executionTime
      }
    };
  }

  /**
   * Depth-First Search traversal
   * 
   * Optimal for:
   * - Deep path exploration
   * - Cycle detection in knowledge verification
   * - Finding all paths between nodes
   * - Exploring complete subtrees
   * 
   * Use when you need to explore one branch completely before
   * moving to the next, useful for detailed relationship analysis.
   */
  async dfsTraversal(
    startNodeId: string,
    config: TraversalConfig
  ): Promise<TraversalResult> {
    const startTime = Date.now();
    const visited = new Set<string>();
    const stack: Array<{nodeId: string, depth: number, path: string[]}> = [];
    const result: GraphNode[] = [];
    const traversedEdges: GraphEdge[] = [];
    const paths = new Map<string, string[]>();
    
    let nodesVisited = 0;
    let edgesTraversed = 0;
    let maxDepthReached = 0;

    // Validate start node exists
    const startNode = this.graph.getNode(startNodeId);
    if (!startNode) {
      throw new Error(`Start node ${startNodeId} does not exist`);
    }

    // Initialize stack with start node
    stack.push({nodeId: startNodeId, depth: 0, path: [startNodeId]});
    
    if (config.includeStartNode) {
      if (!config.nodeFilter || config.nodeFilter(startNode)) {
        result.push(startNode);
        paths.set(startNodeId, [startNodeId]);
      }
    }

    // DFS main loop
    while (stack.length > 0 && result.length < config.maxNodes) {
      const {nodeId, depth, path} = stack.pop()!;
      
      // Skip if already visited or depth exceeded
      if (visited.has(nodeId) || depth > config.maxDepth) {
        continue;
      }

      visited.add(nodeId);
      nodesVisited++;
      maxDepthReached = Math.max(maxDepthReached, depth);

      // Get neighbors based on direction preference
      const neighbors = this.getNeighborsForTraversal(nodeId, config);

      // Process neighbors in reverse order for DFS (last pushed is first popped)
      for (let i = neighbors.length - 1; i >= 0; i--) {
        const neighbor = neighbors[i];
        if (!neighbor) continue;
        
        const {node: neighborNode, edge} = neighbor;
        edgesTraversed++;

        // Apply edge filter if provided
        if (config.edgeFilter && !config.edgeFilter(edge)) {
          continue;
        }

        const neighborId = neighborNode.id;
        const newPath = [...path, neighborId];

        // Skip if already visited
        if (visited.has(neighborId)) {
          continue;
        }

        // Apply node filter if provided
        if (config.nodeFilter && !config.nodeFilter(neighborNode)) {
          continue;
        }

        // Add to results if not already included
        if (!result.some(n => n.id === neighborId)) {
          result.push(neighborNode);
          paths.set(neighborId, newPath);
          traversedEdges.push(edge);
        }

        // Add to stack for further exploration
        if (depth + 1 <= config.maxDepth) {
          stack.push({
            nodeId: neighborId,
            depth: depth + 1,
            path: newPath
          });
        }
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      nodes: result,
      edges: traversedEdges,
      paths,
      metadata: {
        nodesVisited,
        edgesTraversed,
        maxDepthReached,
        executionTime
      }
    };
  }

  /**
   * Bidirectional search for finding shortest paths between two nodes
   * 
   * More efficient than unidirectional search for finding connections
   * between specific nodes in large graphs.
   */
  async bidirectionalSearch(
    startNodeId: string,
    targetNodeId: string,
    config: Omit<TraversalConfig, 'direction' | 'includeStartNode'>
  ): Promise<{
    path: string[] | null;
    distance: number;
    metadata: {
      nodesVisited: number;
      executionTime: number;
    };
  }> {
    const startTime = Date.now();
    
    if (startNodeId === targetNodeId) {
      return {
        path: [startNodeId],
        distance: 0,
        metadata: { nodesVisited: 1, executionTime: Date.now() - startTime }
      };
    }

    // Two queues for forward and backward search
    const forwardQueue = [{nodeId: startNodeId, depth: 0, path: [startNodeId]}];
    const backwardQueue = [{nodeId: targetNodeId, depth: 0, path: [targetNodeId]}];
    
    const forwardVisited = new Map<string, {depth: number, path: string[]}>();
    const backwardVisited = new Map<string, {depth: number, path: string[]}>();
    
    forwardVisited.set(startNodeId, {depth: 0, path: [startNodeId]});
    backwardVisited.set(targetNodeId, {depth: 0, path: [targetNodeId]});
    
    let nodesVisited = 0;

    while (forwardQueue.length > 0 || backwardQueue.length > 0) {
      // Expand forward search
      if (forwardQueue.length > 0) {
        const {nodeId, depth, path} = forwardQueue.shift()!;
        nodesVisited++;

        if (depth >= config.maxDepth) continue;

        const neighbors = this.getNeighborsForTraversal(nodeId, {
          ...config,
          direction: 'out',
          includeStartNode: false
        });

        for (const {node: neighborNode} of neighbors) {
          const neighborId = neighborNode.id;
          const newPath = [...path, neighborId];

          // Check if we've met the backward search
          if (backwardVisited.has(neighborId)) {
            const backwardData = backwardVisited.get(neighborId)!;
            const completePath = [...newPath.slice(0, -1), ...backwardData.path.reverse()];
            return {
              path: completePath,
              distance: depth + 1 + backwardData.depth,
              metadata: { nodesVisited, executionTime: Date.now() - startTime }
            };
          }

          // Add to forward search if not visited
          if (!forwardVisited.has(neighborId)) {
            forwardVisited.set(neighborId, {depth: depth + 1, path: newPath});
            forwardQueue.push({nodeId: neighborId, depth: depth + 1, path: newPath});
          }
        }
      }

      // Expand backward search
      if (backwardQueue.length > 0) {
        const {nodeId, depth, path} = backwardQueue.shift()!;
        nodesVisited++;

        if (depth >= config.maxDepth) continue;

        const neighbors = this.getNeighborsForTraversal(nodeId, {
          ...config,
          direction: 'in',
          includeStartNode: false
        });

        for (const {node: neighborNode} of neighbors) {
          const neighborId = neighborNode.id;
          const newPath = [...path, neighborId];

          // Check if we've met the forward search
          if (forwardVisited.has(neighborId)) {
            const forwardData = forwardVisited.get(neighborId)!;
            const completePath = [...forwardData.path.slice(0, -1), ...newPath.reverse()];
            return {
              path: completePath,
              distance: forwardData.depth + depth + 1,
              metadata: { nodesVisited, executionTime: Date.now() - startTime }
            };
          }

          // Add to backward search if not visited
          if (!backwardVisited.has(neighborId)) {
            backwardVisited.set(neighborId, {depth: depth + 1, path: newPath});
            backwardQueue.push({nodeId: neighborId, depth: depth + 1, path: newPath});
          }
        }
      }
    }

    // No path found
    return {
      path: null,
      distance: -1,
      metadata: { nodesVisited, executionTime: Date.now() - startTime }
    };
  }

  /**
   * Find all paths between two nodes within a maximum depth
   * 
   * Useful for finding multiple relationship paths for context
   * and explanation generation in the agentic memory system.
   */
  async findAllPaths(
    startNodeId: string,
    targetNodeId: string,
    maxDepth: number,
    maxPaths: number = 10
  ): Promise<{
    paths: string[][];
    metadata: {
      totalPaths: number;
      executionTime: number;
    };
  }> {
    const startTime = Date.now();
    const allPaths: string[][] = [];
    
    const dfsForPaths = (
      currentNodeId: string,
      currentPath: string[],
      visited: Set<string>,
      depth: number
    ) => {
      if (allPaths.length >= maxPaths) return;
      if (depth > maxDepth) return;
      
      if (currentNodeId === targetNodeId) {
        allPaths.push([...currentPath]);
        return;
      }

      const neighbors = this.graph.getNeighbors(currentNodeId);
      for (const {node} of neighbors) {
        if (!visited.has(node.id)) {
          visited.add(node.id);
          dfsForPaths(node.id, [...currentPath, node.id], visited, depth + 1);
          visited.delete(node.id);
        }
      }
    };

    const visited = new Set<string>([startNodeId]);
    dfsForPaths(startNodeId, [startNodeId], visited, 0);

    return {
      paths: allPaths,
      metadata: {
        totalPaths: allPaths.length,
        executionTime: Date.now() - startTime
      }
    };
  }

  /**
   * Helper method to get neighbors based on traversal configuration
   */
  private getNeighborsForTraversal(
    nodeId: string,
    config: TraversalConfig
  ): Array<{node: GraphNode, edge: GraphEdge}> {
    const neighbors: Array<{node: GraphNode, edge: GraphEdge}> = [];

    if (config.direction === 'out' || config.direction === 'both') {
      const outEdges = this.graph.getOutgoingEdges(nodeId, config.relationTypes);
      for (const edge of outEdges) {
        const node = this.graph.getNode(edge.target);
        if (node) {
          neighbors.push({node, edge});
        }
      }
    }

    if (config.direction === 'in' || config.direction === 'both') {
      const inEdges = this.graph.getIncomingEdges(nodeId, config.relationTypes);
      for (const edge of inEdges) {
        const node = this.graph.getNode(edge.source);
        if (node) {
          neighbors.push({node, edge});
        }
      }
    }

    return neighbors;
  }
}
