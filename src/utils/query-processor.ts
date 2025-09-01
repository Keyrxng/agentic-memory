import type { GraphNode, GraphEdge, EntityRecord } from '../core/types.js';
import { VectorUtils } from './vector-utils.js';

/**
 * Query processing utilities for memory retrieval
 */
export class QueryProcessor {
  /**
   * Find relevant nodes based on text and entity matching
   */
  findRelevantNodes(
    query: string,
    queryEntities: Array<EntityRecord & { confidence: number }>,
    allNodes: GraphNode[],
    nameIndex: Map<string, string>,
    queryEmbedding?: Float32Array
  ): GraphNode[] {
    const relevantNodes: GraphNode[] = [];
    const queryLower = query.toLowerCase();

    // Find nodes by extracted entities
    for (const entity of queryEntities) {
      const nodeId = nameIndex.get(entity.name.toLowerCase().trim());
      if (nodeId) {
        const node = allNodes.find(n => n.id === nodeId);
        if (node) {
          relevantNodes.push(node);
        }
      }
    }

    // Find nodes by text matching in properties
    const textMatchedNodes: GraphNode[] = [];
    for (const node of allNodes) {
      const nodeName = node.properties.name?.toLowerCase() || '';
      if (nodeName.includes(queryLower) || queryLower.includes(nodeName)) {
        textMatchedNodes.push(node);
      } else if (queryEmbedding && node.embeddings && node.embeddings.length > 0) {
        const vectorSimilarity = VectorUtils.cosineSimilarity(queryEmbedding, node.embeddings);
        if (vectorSimilarity > 0.3) {
          textMatchedNodes.push(node);
        }
      } else {
        // Check other properties for text matches
        const hasTextMatch = Object.values(node.properties).some(value =>
          typeof value === 'string' && value.toLowerCase().includes(queryLower)
        );
        if (hasTextMatch) {
          textMatchedNodes.push(node);
        }
      }
    }

    // Combine and deduplicate
    for (const node of textMatchedNodes) {
      if (!relevantNodes.find(n => n.id === node.id)) {
        relevantNodes.push(node);
      }
    }

    return relevantNodes;
  }

  /**
   * Check if a node is relevant to a query
   */
  isRelevantToQuery(
    node: GraphNode,
    query: string,
    queryEmbedding?: Float32Array
  ): boolean {
    const queryLower = query.toLowerCase();
    const nodeName = node.properties.name?.toLowerCase() || '';

    // Basic text relevance check
    const textRelevant = nodeName.includes(queryLower) ||
      queryLower.includes(nodeName) ||
      Object.values(node.properties).some(value =>
        typeof value === 'string' && value.toLowerCase().includes(queryLower)
      );

    // If we have vector search enabled, be more permissive
    if (queryEmbedding && node.embeddings && node.embeddings.length > 0) {
      const vectorSimilarity = VectorUtils.cosineSimilarity(queryEmbedding, node.embeddings);
      // Consider node relevant if either text matches OR vector similarity is high enough
      return textRelevant || vectorSimilarity > 0.2;
    }

    // Fallback to text-only relevance
    return textRelevant;
  }

  /**
   * Calculate relevance score for a node
   */
  calculateRelevanceScore(
    node: GraphNode,
    query: string,
    queryEntities: Array<EntityRecord & { confidence: number }>,
    queryEmbedding?: Float32Array
  ): number {
    let score = 0;
    const queryLower = query.toLowerCase();
    const nodeName = node.properties.name?.toLowerCase() || '';

    // Name similarity score
    if (nodeName === queryLower) {
      score += 1.0;
    } else if (nodeName.includes(queryLower) || queryLower.includes(nodeName)) {
      score += 0.7;
    }

    // Entity extraction confidence
    const matchingEntity = queryEntities.find(e =>
      e.name.toLowerCase() === nodeName
    );
    if (matchingEntity) {
      score += matchingEntity.confidence * 0.5;
    }

    // Property relevance
    for (const value of Object.values(node.properties)) {
      if (typeof value === 'string' && value.toLowerCase().includes(queryLower)) {
        score += 0.2;
      }
    }

    // Vector similarity score (if embeddings available)
    if (queryEmbedding && node.embeddings && node.embeddings.length > 0) {
      const vectorSimilarity = VectorUtils.cosineSimilarity(queryEmbedding, node.embeddings);
      // Give vector similarity higher weight for semantic search
      score += vectorSimilarity * 1.2;
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Find similar nodes by vector embedding
   */
  findSimilarNodesByEmbedding(
    queryEmbedding: Float32Array,
    allNodes: GraphNode[],
    maxResults: number,
    similarityThreshold: number = 0.1
  ): GraphNode[] {
    const similarNodes: Array<{ node: GraphNode; similarity: number }> = [];

    // Calculate similarity for all nodes that have embeddings
    for (const node of allNodes) {
      if (node.embeddings && node.embeddings.length > 0) {
        const similarity = VectorUtils.cosineSimilarity(queryEmbedding, node.embeddings);
        // Lower threshold for semantic search to include more potential matches
        if (similarity > similarityThreshold) {
          similarNodes.push({ node, similarity });
        }
      }
    }

    // Sort by similarity and return top results
    similarNodes.sort((a, b) => b.similarity - a.similarity);

    return similarNodes.slice(0, Math.max(maxResults, 10)).map(item => item.node);
  }

  /**
   * Rank and filter query results
   */
  rankResults(
    nodes: GraphNode[],
    query: string,
    queryEntities: Array<EntityRecord & { confidence: number }>,
    queryEmbedding?: Float32Array,
    relevanceThreshold: number = 0.05
  ): { nodes: GraphNode[]; scores: Map<string, number> } {
    const relevanceScores = new Map<string, number>();
    const rankedEntities: GraphNode[] = [];

    for (const node of nodes) {
      const relevance = this.calculateRelevanceScore(node, query, queryEntities, queryEmbedding);
      relevanceScores.set(node.id, relevance);

      if (relevance > relevanceThreshold) {
        rankedEntities.push(node);
      }
    }

    // Sort by relevance
    rankedEntities.sort((a, b) => {
      const scoreA = relevanceScores.get(a.id) || 0;
      const scoreB = relevanceScores.get(b.id) || 0;
      return scoreB - scoreA;
    });

    return { nodes: rankedEntities, scores: relevanceScores };
  }
}
