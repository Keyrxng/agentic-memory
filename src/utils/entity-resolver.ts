import type { GraphNode, EntityRecord } from '../core/types.js';
import { VectorUtils } from './vector-utils.js';

/**
 * Entity resolution utilities for matching and merging entities
 */
export class EntityResolver {
  private entityNameIndex: Map<string, string> = new Map(); // name -> nodeId

  /**
   * Update the name index with current graph nodes
   */
  updateIndex(nodes: GraphNode[]): void {
    this.entityNameIndex.clear();
    for (const node of nodes) {
      if (node.properties.name) {
        this.entityNameIndex.set(node.properties.name.toLowerCase().trim(), node.id);
      }
    }
  }

  /**
   * Resolve an entity against existing knowledge
   */
  resolveEntity(
    entity: EntityRecord,
    graphNodes: Map<string, GraphNode>,
    options: {
      fuzzyThreshold?: number;
      enableEmbeddings?: boolean;
    } = {}
  ): { matched: EntityRecord | null; confidence: number } {
    const { fuzzyThreshold = 0.8, enableEmbeddings = true } = options;

    // Prefer deterministic ID match first
    const byId = graphNodes.get(entity.id);
    if (byId && byId.type === entity.type) {
      return {
        matched: this.nodeToEntityRecord(byId),
        confidence: 0.95
      };
    }

    // Fallback to name-based resolution
    const normalizedName = entity.name.toLowerCase().trim();
    const existingNodeId = this.entityNameIndex.get(normalizedName);
    if (existingNodeId) {
      const existingNode = graphNodes.get(existingNodeId);
      if (existingNode && existingNode.type === entity.type) {
        return {
          matched: this.nodeToEntityRecord(existingNode),
          confidence: 0.9
        };
      }
    }

    // Try embedding-based resolution if enabled
    if (enableEmbeddings && entity.embeddings) {
      const embeddingMatch = this.findEmbeddingMatch(entity, Array.from(graphNodes.values()));
      if (embeddingMatch && embeddingMatch.confidence >= fuzzyThreshold) {
        return embeddingMatch;
      }
    }

    return { matched: null, confidence: 0 };
  }

  /**
   * Find best embedding match for an entity
   */
  private findEmbeddingMatch(
    entity: EntityRecord,
    candidates: GraphNode[]
  ): { matched: EntityRecord | null; confidence: number } | null {
    if (!entity.embeddings) return null;

    let bestMatch: GraphNode | null = null;
    let highestConfidence = 0;

    const entityEmbedding = new Float32Array(entity.embeddings);

    for (const candidate of candidates) {
      if (candidate.embeddings && candidate.type === entity.type) {
        const candidateEmbedding = new Float32Array(candidate.embeddings);
        const similarity = VectorUtils.cosineSimilarity(entityEmbedding, candidateEmbedding);

        if (similarity > highestConfidence) {
          highestConfidence = similarity;
          bestMatch = candidate;
        }
      }
    }

    return bestMatch ? {
      matched: this.nodeToEntityRecord(bestMatch),
      confidence: highestConfidence
    } : null;
  }

  /**
   * Merge properties from new entity into existing entity
   */
  mergeEntityProperties(
    existing: EntityRecord,
    updates: EntityRecord,
    context: { userId: string; timestamp: Date }
  ): EntityRecord {
    return {
      ...existing,
      properties: {
        ...existing.properties,
        ...updates.properties,
        lastUpdated: context.timestamp.toISOString(),
        updatedBy: context.userId
      }
    };
  }

  /**
   * Convert graph node to entity record
   */
  private nodeToEntityRecord(node: GraphNode): EntityRecord {
    return {
      id: node.id,
      type: node.type,
      name: node.properties.name || node.id,
      properties: node.properties,
      embeddings: node.embeddings ? Array.from(node.embeddings) : undefined
    };
  }
}
