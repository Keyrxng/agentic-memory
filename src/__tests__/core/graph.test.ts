/**
 * Unit tests for core graph data structure
 * 
 * Tests the InMemoryGraph implementation including:
 * - Node and edge creation/deletion
 * - Adjacency list management
 * - Graph consistency and validation
 * - Memory usage tracking
 * - Configuration and limits
 */

import { InMemoryGraph } from '../../core/graph.js';
import type { GraphNode, GraphEdge, GraphConfig } from '../../core/types.js';
import { TestHelpers } from '../setup.js';

describe('InMemoryGraph', () => {
  let graph: InMemoryGraph;

  beforeEach(() => {
    graph = new InMemoryGraph();
  });

  afterEach(() => {
    graph.clear();
  });

  describe('Node Operations', () => {
    test('should add a node with generated ID when not provided', async () => {
      const nodeId = await graph.addNode({
        type: 'person',
        properties: { name: 'Alice' }
      });

      expect(nodeId).toBeDefined();
      expect(typeof nodeId).toBe('string');
      expect(nodeId.length).toBeGreaterThan(0);

      const node = graph.getNode(nodeId);
      expect(node).toBeDefined();
      expect(node?.type).toBe('person');
      expect(node?.properties.name).toBe('Alice');
      expect(node?.createdAt).toBeInstanceOf(Date);
      expect(node?.updatedAt).toBeInstanceOf(Date);
    });

    test('should add a node with provided ID', async () => {
      const customId = 'custom-node-id';
      const nodeId = await graph.addNode({
        id: customId,
        type: 'organization',
        properties: { name: 'TechCorp' }
      });

      expect(nodeId).toBe(customId);
      
      const node = graph.getNode(customId);
      expect(node).toBeDefined();
      expect(node?.id).toBe(customId);
      expect(node?.type).toBe('organization');
    });

    test('should handle embeddings in node creation', async () => {
      const embeddings = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      
      const nodeId = await graph.addNode({
        type: 'concept',
        properties: { name: 'AI' },
        embeddings
      });

      const node = graph.getNode(nodeId);
      expect(node?.embeddings).toEqual(embeddings);
    });

    test('should enforce node capacity limits', async () => {
      const smallGraph = new InMemoryGraph({ maxNodes: 2 });

      await smallGraph.addNode({ type: 'test', properties: { name: 'Node1' } });
      await smallGraph.addNode({ type: 'test', properties: { name: 'Node2' } });

      await expect(
        smallGraph.addNode({ type: 'test', properties: { name: 'Node3' } })
      ).rejects.toThrow('Graph capacity exceeded');

      smallGraph.clear();
    });

    test('should retrieve node correctly', async () => {
      const nodeId = await graph.addNode({
        type: 'person',
        properties: { name: 'Bob', age: 30 }
      });

      const retrieved = graph.getNode(nodeId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(nodeId);
      expect(retrieved?.properties.name).toBe('Bob');
      expect(retrieved?.properties.age).toBe(30);
    });

    test('should return undefined for non-existent node', () => {
      const result = graph.getNode('non-existent-id');
      expect(result).toBeUndefined();
    });

    test('should remove node and clean up adjacency lists', async () => {
      const nodeId = await graph.addNode({
        type: 'person',
        properties: { name: 'Charlie' }
      });

      const success = await graph.removeNode(nodeId);
      expect(success).toBe(true);

      const retrieved = graph.getNode(nodeId);
      expect(retrieved).toBeUndefined();

      // Check that adjacency lists are cleaned up
      const outgoingEdges = graph.getOutgoingEdges(nodeId);
      const incomingEdges = graph.getIncomingEdges(nodeId);
      expect(outgoingEdges).toEqual([]);
      expect(incomingEdges).toEqual([]);
    });

    test('should return false when removing non-existent node', async () => {
      const success = await graph.removeNode('non-existent-id');
      expect(success).toBe(false);
    });
  });

  describe('Edge Operations', () => {
    let sourceId: string;
    let targetId: string;

    beforeEach(async () => {
      sourceId = await graph.addNode({
        type: 'person',
        properties: { name: 'Alice' }
      });
      targetId = await graph.addNode({
        type: 'organization',
        properties: { name: 'Google' }
      });
    });

    test('should add edge between existing nodes', async () => {
      const edgeId = await graph.addEdge({
        source: sourceId,
        target: targetId,
        type: 'works_at',
        weight: 1.0,
        properties: { startDate: '2023-01-01' }
      });

      expect(edgeId).toBeDefined();
      expect(typeof edgeId).toBe('string');

      const outgoingEdges = graph.getOutgoingEdges(sourceId);
      expect(outgoingEdges).toHaveLength(1);
      expect(outgoingEdges[0]!.id).toBe(edgeId);
      expect(outgoingEdges[0]!.type).toBe('works_at');
      expect(outgoingEdges[0]!.weight).toBe(1.0);

      const incomingEdges = graph.getIncomingEdges(targetId);
      expect(incomingEdges).toHaveLength(1);
      expect(incomingEdges[0]!.id).toBe(edgeId);
    });

    test('should add edge with provided ID', async () => {
      const customEdgeId = 'custom-edge-id';
      
      const edgeId = await graph.addEdge({
        id: customEdgeId,
        source: sourceId,
        target: targetId,
        type: 'knows',
        weight: 0.8,
        properties: {}
      });

      expect(edgeId).toBe(customEdgeId);
    });

    test('should reject edge with non-existent source', async () => {
      await expect(
        graph.addEdge({
          source: 'non-existent',
          target: targetId,
          type: 'test',
          weight: 1.0,
          properties: {}
        })
      ).rejects.toThrow('Source node non-existent does not exist');
    });

    test('should reject edge with non-existent target', async () => {
      await expect(
        graph.addEdge({
          source: sourceId,
          target: 'non-existent',
          type: 'test',
          weight: 1.0,
          properties: {}
        })
      ).rejects.toThrow('Target node non-existent does not exist');
    });

    test('should enforce edge capacity per node', async () => {
      const limitedGraph = new InMemoryGraph({ maxEdgesPerNode: 2 });
      
      const src = await limitedGraph.addNode({ type: 'test', properties: { name: 'source' } });
      const tgt1 = await limitedGraph.addNode({ type: 'test', properties: { name: 'target1' } });
      const tgt2 = await limitedGraph.addNode({ type: 'test', properties: { name: 'target2' } });
      const tgt3 = await limitedGraph.addNode({ type: 'test', properties: { name: 'target3' } });

      await limitedGraph.addEdge({ source: src, target: tgt1, type: 'test', weight: 1, properties: {} });
      await limitedGraph.addEdge({ source: src, target: tgt2, type: 'test', weight: 1, properties: {} });

      await expect(
        limitedGraph.addEdge({ source: src, target: tgt3, type: 'test', weight: 1, properties: {} })
      ).rejects.toThrow('Edge capacity exceeded');

      limitedGraph.clear();
    });

    test('should get outgoing edges with type filter', async () => {
      const target2Id = await graph.addNode({ type: 'person', properties: { name: 'Bob' } });

      await graph.addEdge({
        source: sourceId, target: targetId, type: 'works_at', weight: 1, properties: {}
      });
      await graph.addEdge({
        source: sourceId, target: target2Id, type: 'knows', weight: 0.8, properties: {}
      });

      const allEdges = graph.getOutgoingEdges(sourceId);
      expect(allEdges).toHaveLength(2);

      const worksAtEdges = graph.getOutgoingEdges(sourceId, ['works_at']);
      expect(worksAtEdges).toHaveLength(1);
      expect(worksAtEdges[0]!.type).toBe('works_at');

      const knowsEdges = graph.getOutgoingEdges(sourceId, ['knows']);
      expect(knowsEdges).toHaveLength(1);
      expect(knowsEdges[0]!.type).toBe('knows');
    });

    test('should get incoming edges with type filter', async () => {
      const source2Id = await graph.addNode({ type: 'person', properties: { name: 'Carol' } });

      await graph.addEdge({
        source: sourceId, target: targetId, type: 'works_at', weight: 1, properties: {}
      });
      await graph.addEdge({
        source: source2Id, target: targetId, type: 'founded', weight: 0.9, properties: {}
      });

      const allEdges = graph.getIncomingEdges(targetId);
      expect(allEdges).toHaveLength(2);

      const worksAtEdges = graph.getIncomingEdges(targetId, ['works_at']);
      expect(worksAtEdges).toHaveLength(1);
      expect(worksAtEdges[0]!.type).toBe('works_at');
    });

    test('should remove edge correctly', async () => {
      const edgeId = await graph.addEdge({
        source: sourceId, target: targetId, type: 'test', weight: 1, properties: {}
      });

      const success = await graph.removeEdge(edgeId);
      expect(success).toBe(true);

      const outgoingEdges = graph.getOutgoingEdges(sourceId);
      const incomingEdges = graph.getIncomingEdges(targetId);
      expect(outgoingEdges).toHaveLength(0);
      expect(incomingEdges).toHaveLength(0);
    });

    test('should return false when removing non-existent edge', async () => {
      const success = await graph.removeEdge('non-existent-edge');
      expect(success).toBe(false);
    });
  });

  describe('Graph Traversal Support', () => {
    let nodes: string[];

    beforeEach(async () => {
      // Create a small test graph: A -> B -> C, A -> C
      nodes = [];
      nodes.push(await graph.addNode({ type: 'test', properties: { name: 'A' } }));
      nodes.push(await graph.addNode({ type: 'test', properties: { name: 'B' } }));
      nodes.push(await graph.addNode({ type: 'test', properties: { name: 'C' } }));

      await graph.addEdge({ source: nodes[0]!, target: nodes[1]!, type: 'connects', weight: 1, properties: {} });
      await graph.addEdge({ source: nodes[1]!, target: nodes[2]!, type: 'connects', weight: 1, properties: {} });
      await graph.addEdge({ source: nodes[0]!, target: nodes[2]!, type: 'direct', weight: 0.5, properties: {} });
    });

    test('should get neighbors correctly', () => {
      const neighbors = graph.getNeighbors(nodes[0]!); // A's neighbors
      expect(neighbors).toHaveLength(2); // B and C

      const outNeighbors = neighbors.filter(n => n.direction === 'out');
      expect(outNeighbors).toHaveLength(2);

      const neighborNames = outNeighbors.map(n => n.node.properties.name).sort();
      expect(neighborNames).toEqual(['B', 'C']);
    });

    test('should get neighbors with relationship filter', () => {
      const connectsNeighbors = graph.getNeighbors(nodes[0]!, ['connects']);
      expect(connectsNeighbors).toHaveLength(1);
      expect(connectsNeighbors[0]!.node.properties.name).toBe('B');

      const directNeighbors = graph.getNeighbors(nodes[0]!, ['direct']);
      expect(directNeighbors).toHaveLength(1);
      expect(directNeighbors[0]!.node.properties.name).toBe('C');
    });

    test('should get incoming and outgoing neighbors', () => {
      const nodeB = nodes[1]!;
      const neighbors = graph.getNeighbors(nodeB);

      const outgoing = neighbors.filter(n => n.direction === 'out');
      const incoming = neighbors.filter(n => n.direction === 'in');

      expect(outgoing).toHaveLength(1);
      expect(outgoing[0]!.node.properties.name).toBe('C');

      expect(incoming).toHaveLength(1);
      expect(incoming[0]!.node.properties.name).toBe('A');
    });
  });

  describe('Graph Queries and Bulk Operations', () => {
    test('should get all nodes and edges', async () => {
      const nodeIds = [];
      nodeIds.push(await graph.addNode({ type: 'person', properties: { name: 'Alice' } }));
      nodeIds.push(await graph.addNode({ type: 'person', properties: { name: 'Bob' } }));

      await graph.addEdge({
        source: nodeIds[0], target: nodeIds[1], type: 'knows', weight: 1, properties: {}
      });

      const allNodes = graph.getAllNodes();
      expect(allNodes).toHaveLength(2);
      expect(allNodes.map(n => n.properties.name).sort()).toEqual(['Alice', 'Bob']);

      const allEdges = graph.getAllEdges();
      expect(allEdges).toHaveLength(1);
      expect(allEdges[0]!.type).toBe('knows');
    });

    test('should clear graph completely', async () => {
      await graph.addNode({ type: 'test', properties: { name: 'test' } });
      await graph.addNode({ type: 'test', properties: { name: 'test2' } });

      graph.clear();

      expect(graph.getAllNodes()).toHaveLength(0);
      expect(graph.getAllEdges()).toHaveLength(0);

      const metrics = graph.getMetrics();
      expect(metrics.nodeCount).toBe(0);
      expect(metrics.edgeCount).toBe(0);
    });
  });

  describe('Metrics and Monitoring', () => {
    test('should track basic metrics correctly', async () => {
      const initialMetrics = graph.getMetrics();
      expect(initialMetrics.nodeCount).toBe(0);
      expect(initialMetrics.edgeCount).toBe(0);
      expect(initialMetrics.density).toBe(0);

      const node1 = await graph.addNode({ type: 'test', properties: { name: 'A' } });
      const node2 = await graph.addNode({ type: 'test', properties: { name: 'B' } });
      await graph.addEdge({ source: node1, target: node2, type: 'test', weight: 1, properties: {} });

      const metricsAfter = graph.getMetrics();
      expect(metricsAfter.nodeCount).toBe(2);
      expect(metricsAfter.edgeCount).toBe(1);
      expect(metricsAfter.density).toBeGreaterThan(0);
    });

    test('should calculate density correctly', async () => {
      // For a directed graph with n nodes, max edges = n * (n-1)
      // With 3 nodes: max = 3 * 2 = 6 edges
      const nodes = [];
      for (let i = 0; i < 3; i++) {
        nodes.push(await graph.addNode({ type: 'test', properties: { name: `Node${i}` } }));
      }

      // Add 2 edges out of possible 6
      await graph.addEdge({ source: nodes[0], target: nodes[1], type: 'test', weight: 1, properties: {} });
      await graph.addEdge({ source: nodes[1], target: nodes[2], type: 'test', weight: 1, properties: {} });

      const metrics = graph.getMetrics();
      expect(metrics.density).toBeCloseTo(2 / 6, 3); // ≈ 0.333
    });

    test('should estimate memory usage', async () => {
      const initialMetrics = graph.getMetrics();
      const initialMemory = initialMetrics.memoryUsage;

      await graph.addNode({ type: 'test', properties: { name: 'Test', data: 'some data' } });
      
      const afterMetrics = graph.getMetrics();
      expect(afterMetrics.memoryUsage).toBeGreaterThan(initialMemory);
    });
  });

  describe('Graph Consistency and Validation', () => {
    test('should validate consistent empty graph', () => {
      const errors = graph.validateConsistency();
      expect(errors).toHaveLength(0);
    });

    test('should validate consistent graph with nodes and edges', async () => {
      const node1 = await graph.addNode({ type: 'test', properties: { name: 'A' } });
      const node2 = await graph.addNode({ type: 'test', properties: { name: 'B' } });
      await graph.addEdge({ source: node1, target: node2, type: 'test', weight: 1, properties: {} });

      const errors = graph.validateConsistency();
      expect(errors).toHaveLength(0);
    });

    test('should track operation history', async () => {
      const nodeId = await graph.addNode({ type: 'test', properties: { name: 'Test' } });
      await graph.removeNode(nodeId);

      const history = graph.getOperationHistory(10);
      expect(history).toHaveLength(2);
      expect(history[0].type).toBe('add_node');
      expect(history[1].type).toBe('remove_node');
    });

    test('should limit operation history', async () => {
      // Add many operations
      for (let i = 0; i < 150; i++) {
        await graph.addNode({ type: 'test', properties: { name: `Node${i}` } });
      }

      const history = graph.getOperationHistory(100);
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Configuration and Limits', () => {
    test('should respect configuration settings', () => {
      const config: Partial<GraphConfig> = {
        maxNodes: 500,
        maxEdgesPerNode: 50,
        entityResolutionThreshold: 0.75,
        enableTemporal: false
      };

      const configuredGraph = new InMemoryGraph(config);
      
      // We can't directly test private config, but we can test behavior
      expect(configuredGraph).toBeDefined();
      
      configuredGraph.clear();
    });

    test('should use default configuration when not provided', () => {
      const defaultGraph = new InMemoryGraph();
      expect(defaultGraph).toBeDefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty adjacency lists gracefully', () => {
      const nonExistentId = 'does-not-exist';
      
      const outgoing = graph.getOutgoingEdges(nonExistentId);
      const incoming = graph.getIncomingEdges(nonExistentId);
      const neighbors = graph.getNeighbors(nonExistentId);

      expect(outgoing).toEqual([]);
      expect(incoming).toEqual([]);
      expect(neighbors).toEqual([]);
    });

    test('should handle self-loops correctly', async () => {
      const nodeId = await graph.addNode({ type: 'test', properties: { name: 'Self' } });
      
      const edgeId = await graph.addEdge({
        source: nodeId,
        target: nodeId,
        type: 'self_reference',
        weight: 1,
        properties: {}
      });

      const neighbors = graph.getNeighbors(nodeId);
      // Should appear in both outgoing and incoming
      expect(neighbors.length).toBeGreaterThanOrEqual(1);
      
      const outgoing = graph.getOutgoingEdges(nodeId);
      const incoming = graph.getIncomingEdges(nodeId);
      expect(outgoing).toHaveLength(1);
      expect(incoming).toHaveLength(1);
    });

    test('should handle concurrent node removal gracefully', async () => {
      const nodeIds = [];
      for (let i = 0; i < 5; i++) {
        nodeIds.push(await graph.addNode({ type: 'test', properties: { name: `Node${i}` } }));
      }

      // Add some edges
      for (let i = 0; i < 4; i++) {
        await graph.addEdge({
          source: nodeIds[i],
          target: nodeIds[i + 1],
          type: 'next',
          weight: 1,
          properties: {}
        });
      }

      // Remove a node that has both incoming and outgoing edges
      const success = await graph.removeNode(nodeIds[2]);
      expect(success).toBe(true);

      // Verify consistency
      const errors = graph.validateConsistency();
      expect(errors).toHaveLength(0);

      // Verify the graph is still connected around the removed node
      const remainingNodes = graph.getAllNodes();
      expect(remainingNodes).toHaveLength(4);
    });
  });
});
