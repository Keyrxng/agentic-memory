/**
 * Hono HTTP Server for Agentic Memory System
 * 
 * Provides REST API endpoints to serve the agentic memory data to the UI.
 * Exposes graph data, metrics, and memory operations through HTTP endpoints.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AgentGraphMemory } from '../agent/memory.js';
import type { 
  MemoryAddResult, 
  MemoryQueryResult 
} from '../agent/memory.js';
import type { 
  GraphContext, 
  GraphNode, 
  GraphEdge 
} from '../core/types.js';
import type { AgenticMemoryGraph, AgenticMemoryNode, AgenticMemoryEdge } from './types.js';

// Initialize the memory system
export const memory = new AgentGraphMemory({
  graph: {
    maxNodes: 50000,
    enableTemporal: true
  },
  extraction: {
    entityConfidenceThreshold: 0.7,
    relationshipConfidenceThreshold: 0.6,
    maxEntitiesPerText: 50
  },
  memory: {
    maxMemoryNodes: 10000,
    evictionStrategy: 'lru',
    persistenceEnabled: true
  }
});

const app = new Hono();

// Enable CORS for UI communication
app.use('/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Helper function to convert graph data to UI format
function convertToUIFormat(nodes: GraphNode[], edges: GraphEdge[]): AgenticMemoryGraph {
  const uiNodes: AgenticMemoryNode[] = nodes.map(node => ({
    id: node.id,
    type: (node.type as any) || 'entity',
    content: node.properties.name || node.id,
    metadata: {
      ...node.properties,
      createdAt: node.createdAt?.toISOString(),
      updatedAt: node.updatedAt?.toISOString()
    },
    timestamp: node.createdAt?.getTime() || Date.now(),
    confidence: node.properties.confidence || 0.8,
    category: node.properties.category,
    tags: node.properties.tags || []
  }));

  const uiEdges: AgenticMemoryEdge[] = edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: (edge.type as any) || 'associative',
    weight: edge.weight || 1.0,
    confidence: edge.properties?.confidence || 0.8,
    metadata: {
      ...edge.properties,
      createdAt: edge.createdAt?.toISOString(),
      updatedAt: edge.updatedAt?.toISOString()
    },
    timestamp: edge.createdAt?.getTime() || Date.now(),
    bidirectional: edge.properties?.bidirectional || false
  }));

  return {
    nodes: uiNodes,
    edges: uiEdges,
    metadata: {
      version: '1.0.0',
      created: Date.now(),
      updated: Date.now(),
      nodeCount: uiNodes.length,
      edgeCount: uiEdges.length
    }
  };
}

// Helper function to create graph context
function createContext(sessionId?: string, userId?: string): GraphContext {
  return {
    sessionId: sessionId || 'default-session',
    userId: userId || 'default-user',
    timestamp: new Date(),
    source: 'api-server',
    relevantEntities: []
  };
}

// Routes

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'agentic-memory-server'
  });
});

/**
 * GET /api/graph
 * Get the complete graph data in UI format
 */
app.get('/api/graph', async (c) => {
  try {
    const allNodes = memory['graph'].getAllNodes();
    const allEdges = memory['graph'].getAllEdges();
    
    const uiData = convertToUIFormat(allNodes, allEdges);
    
    return c.json(uiData);
  } catch (error) {
    console.error('Error fetching graph data:', error);
    return c.json({ error: 'Failed to fetch graph data' }, 500);
  }
});

/**
 * GET /api/metrics
 * Get memory system metrics
 */
app.get('/api/metrics', async (c) => {
  try {
    const metrics = memory.getMetrics();
    return c.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return c.json({ error: 'Failed to fetch metrics' }, 500);
  }
});

/**
 * POST /api/memory
 * Add new memory content to the system
 */
app.post('/api/memory', async (c) => {
  try {
    const body = await c.req.json();
    const { content, sessionId, userId } = body;
    
    if (!content || typeof content !== 'string') {
      return c.json({ error: 'Content is required and must be a string' }, 400);
    }
    
    const context = createContext(sessionId, userId);
    const result = await memory.addMemory(content, context);
    
    return c.json(result);
  } catch (error) {
    console.error('Error adding memory:', error);
    return c.json({ error: 'Failed to add memory' }, 500);
  }
});

/**
 * POST /api/query
 * Query the memory system
 */
app.post('/api/query', async (c) => {
  try {
    const body = await c.req.json();
    const { query, sessionId, userId, options = {} } = body;
    
    if (!query || typeof query !== 'string') {
      return c.json({ error: 'Query is required and must be a string' }, 400);
    }
    
    const context = createContext(sessionId, userId);
    const result = await memory.queryMemory(query, context, options);
    
    return c.json(result);
  } catch (error) {
    console.error('Error querying memory:', error);
    return c.json({ error: 'Failed to query memory' }, 500);
  }
});

/**
 * GET /api/graph/subgraph/:nodeId
 * Get a subgraph starting from a specific node
 */
app.get('/api/graph/subgraph/:nodeId', async (c) => {
  try {
    const nodeId = c.req.param('nodeId');
    const maxDepth = parseInt(c.req.query('maxDepth') || '2');
    const maxNodes = parseInt(c.req.query('maxNodes') || '50');
    
    // Use the traversal system to get a subgraph
    const traversal = memory['traversal'];
    const result = await traversal.bfsTraversal(nodeId, {
      maxDepth,
      maxNodes,
      direction: 'both',
      includeStartNode: true
    });
    
    const uiData = convertToUIFormat(result.nodes, result.edges);
    
    return c.json({
      ...uiData,
      paths: Object.fromEntries(result.paths),
      startNode: nodeId
    });
  } catch (error) {
    console.error('Error fetching subgraph:', error);
    return c.json({ error: 'Failed to fetch subgraph' }, 500);
  }
});

/**
 * GET /api/nodes/:nodeId
 * Get detailed information about a specific node
 */
app.get('/api/nodes/:nodeId', async (c) => {
  try {
    const nodeId = c.req.param('nodeId');
    const node = memory['graph'].getNode(nodeId);
    
    if (!node) {
      return c.json({ error: 'Node not found' }, 404);
    }
    
    // Get connected edges using existing methods
    const outgoingEdges = memory['graph'].getOutgoingEdges(nodeId);
    const incomingEdges = memory['graph'].getIncomingEdges(nodeId);
    const allEdges = [...outgoingEdges, ...incomingEdges];
    
    return c.json({
      node,
      connections: allEdges.length,
      edges: allEdges.map((edge: GraphEdge) => ({
        id: edge.id,
        type: edge.type,
        weight: edge.weight,
        target: edge.target === nodeId ? edge.source : edge.target,
        direction: edge.target === nodeId ? 'incoming' : 'outgoing'
      }))
    });
  } catch (error) {
    console.error('Error fetching node:', error);
    return c.json({ error: 'Failed to fetch node' }, 500);
  }
});

/**
 * DELETE /api/memory/clear
 * Clear all memory (useful for testing)
 */
app.delete('/api/memory/clear', async (c) => {
  try {
    memory.clear();
    return c.json({ message: 'Memory cleared successfully' });
  } catch (error) {
    console.error('Error clearing memory:', error);
    return c.json({ error: 'Failed to clear memory' }, 500);
  }
});

/**
 * POST /api/memory/bulk
 * Add multiple memories in bulk
 */
app.post('/api/memory/bulk', async (c) => {
  try {
    const body = await c.req.json();
    const { memories, sessionId, userId } = body;
    
    if (!Array.isArray(memories)) {
      return c.json({ error: 'Memories must be an array' }, 400);
    }
    
    const context = createContext(sessionId, userId);
    const results: MemoryAddResult[] = [];
    
    for (const content of memories) {
      if (typeof content === 'string') {
        const result = await memory.addMemory(content, context);
        results.push(result);
      }
    }
    
    return c.json({
      processed: results.length,
      results,
      summary: {
        totalEntities: results.reduce((sum, r) => sum + r.metadata.entitiesExtracted, 0),
        totalRelationships: results.reduce((sum, r) => sum + r.metadata.relationshipsExtracted, 0),
        totalTime: results.reduce((sum, r) => sum + r.metadata.processingTime, 0)
      }
    });
  } catch (error) {
    console.error('Error adding bulk memories:', error);
    return c.json({ error: 'Failed to add bulk memories' }, 500);
  }
});

/**
 * GET /api/search
 * Search nodes and edges by content
 */
app.get('/api/search', async (c) => {
  try {
    const query = c.req.query('q') || '';
    const limit = parseInt(c.req.query('limit') || '20');
    const type = c.req.query('type') || 'all'; // 'nodes', 'edges', 'all'
    
    if (!query.trim()) {
      return c.json({ error: 'Search query is required' }, 400);
    }
    
    const allNodes = memory['graph'].getAllNodes();
    const allEdges = memory['graph'].getAllEdges();
    const queryLower = query.toLowerCase();
    
    let results = [];
    
    if (type === 'nodes' || type === 'all') {
      const matchingNodes = allNodes
        .filter(node => {
          const name = node.properties.name?.toLowerCase() || '';
          return name.includes(queryLower) || 
                 Object.values(node.properties).some(value => 
                   typeof value === 'string' && value.toLowerCase().includes(queryLower)
                 );
        })
        .slice(0, limit)
        .map(node => ({ ...node, resultType: 'node' }));
      
      results.push(...matchingNodes);
    }
    
    if (type === 'edges' || type === 'all') {
      const matchingEdges = allEdges
        .filter(edge => {
          return edge.type.toLowerCase().includes(queryLower) ||
                 Object.values(edge.properties || {}).some(value => 
                   typeof value === 'string' && value.toLowerCase().includes(queryLower)
                 );
        })
        .slice(0, limit)
        .map(edge => ({ ...edge, resultType: 'edge' }));
      
      results.push(...matchingEdges);
    }
    
    return c.json({
      query,
      results: results.slice(0, limit),
      total: results.length,
      hasMore: results.length === limit
    });
  } catch (error) {
    console.error('Error searching:', error);
    return c.json({ error: 'Failed to search' }, 500);
  }
});

export default app;
