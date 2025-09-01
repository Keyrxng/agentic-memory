/**
 * Type definitions for the Hono API server
 * Defines UI-compatible data structures for the agentic memory system
 */

// Core agentic memory types compatible with UI
export interface AgenticMemoryNode {
  id: string;
  type: 'entity' | 'concept' | 'relationship' | 'memory';
  content: string;
  metadata: Record<string, any>;
  timestamp: number;
  confidence: number;
  category?: string;
  tags?: string[];
}

export interface AgenticMemoryEdge {
  id: string;
  source: string;
  target: string;
  type: 'causal' | 'hierarchical' | 'associative' | 'temporal' | 'semantic';
  weight: number;
  confidence: number;
  metadata: Record<string, any>;
  timestamp: number;
  bidirectional?: boolean;
}

export interface AgenticMemoryGraph {
  nodes: AgenticMemoryNode[];
  edges: AgenticMemoryEdge[];
  metadata: {
    version: string;
    created: number;
    updated: number;
    nodeCount: number;
    edgeCount: number;
  };
}

// API Request/Response types
export interface AddMemoryRequest {
  content: string;
  sessionId?: string;
  userId?: string;
}

export interface QueryMemoryRequest {
  query: string;
  sessionId?: string;
  userId?: string;
  options?: {
    maxResults?: number;
    maxDepth?: number;
    includeRelated?: boolean;
  };
}

export interface BulkMemoryRequest {
  memories: string[];
  sessionId?: string;
  userId?: string;
}

export interface SearchRequest {
  q: string;
  limit?: number;
  type?: 'nodes' | 'edges' | 'all';
}

export interface SubgraphResponse extends AgenticMemoryGraph {
  paths: Record<string, string[]>;
  startNode: string;
}

export interface NodeDetailResponse {
  node: any;
  connections: number;
  edges: Array<{
    id: string;
    type: string;
    weight: number;
    target: string;
    direction: 'incoming' | 'outgoing';
  }>;
}

export interface SearchResponse {
  query: string;
  results: any[];
  total: number;
  hasMore: boolean;
}

export interface BulkMemoryResponse {
  processed: number;
  results: any[];
  summary: {
    totalEntities: number;
    totalRelationships: number;
    totalTime: number;
  };
}
