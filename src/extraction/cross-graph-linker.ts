/**
 * Cross-Graph Linker
 * 
 * Creates connections between lexical and domain graph elements to enable:
 * - Entity mentions in text chunks
 * - Evidence support for semantic relationships
 * - Semantic grounding of textual content
 * - Temporal alignment between text and events
 * 
 * This component bridges the dual graph architecture.
 */

import type {
  LexicalGraph,
  DomainGraph,
  CrossGraphLink,
  TextChunk,
  EntityRecord,
  RelationshipRecord,
  GraphContext
} from '../core/types.js';

/**
 * Configuration for cross-graph linking
 */
export interface CrossGraphLinkingConfig {
  /** Enable entity mention detection */
  enableEntityMentions: boolean;
  /** Enable evidence support linking */
  enableEvidenceSupport: boolean;
  /** Enable semantic grounding */
  enableSemanticGrounding: boolean;
  /** Enable temporal alignment */
  enableTemporalAlignment: boolean;
  /** Minimum confidence for cross-graph links */
  minLinkConfidence: number;
  /** Maximum links to create per entity */
  maxLinksPerEntity: number;
  /** Enable fuzzy entity name matching */
  enableFuzzyMatching: boolean;
  /** Fuzzy matching threshold */
  fuzzyThreshold: number;
}

/**
 * Result of cross-graph linking
 */
export interface CrossGraphLinkingResult {
  /** Created cross-graph links */
  links: CrossGraphLink[];
  /** Linking metadata */
  metadata: {
    totalLinks: number;
    entityMentions: number;
    evidenceSupport: number;
    semanticGrounding: number;
    temporalAlignment: number;
    processingTime: number;
  };
}

/**
 * Cross-graph linker for connecting lexical and domain elements
 */
export class CrossGraphLinker {
  private config: CrossGraphLinkingConfig;

  constructor(config: Partial<CrossGraphLinkingConfig> = {}) {
    this.config = {
      enableEntityMentions: config.enableEntityMentions ?? true,
      enableEvidenceSupport: config.enableEvidenceSupport ?? true,
      enableSemanticGrounding: config.enableSemanticGrounding ?? true,
      enableTemporalAlignment: config.enableTemporalAlignment ?? true,
      minLinkConfidence: config.minLinkConfidence ?? 0.6,
      maxLinksPerEntity: config.maxLinksPerEntity ?? 10,
      enableFuzzyMatching: config.enableFuzzyMatching ?? true,
      fuzzyThreshold: config.fuzzyThreshold ?? 0.8,
      ...config
    };
  }

  /**
   * Create cross-graph links between lexical and domain graphs
   */
  async createCrossGraphLinks(
    lexicalGraph: LexicalGraph,
    domainGraph: DomainGraph,
    context: GraphContext
  ): Promise<CrossGraphLink[]> {
    const startTime = Date.now();
    const links: CrossGraphLink[] = [];
    let linkId = 0;

    // 1. Create entity mention links
    if (this.config.enableEntityMentions) {
      const entityMentionLinks = this.createEntityMentionLinks(
        lexicalGraph, 
        domainGraph, 
        linkId
      );
      links.push(...entityMentionLinks);
      linkId += entityMentionLinks.length;
    }

    // 2. Create evidence support links
    if (this.config.enableEvidenceSupport) {
      const evidenceLinks = this.createEvidenceSupportLinks(
        lexicalGraph, 
        domainGraph, 
        linkId
      );
      links.push(...evidenceLinks);
      linkId += evidenceLinks.length;
    }

    // 3. Create semantic grounding links
    if (this.config.enableSemanticGrounding) {
      const groundingLinks = this.createSemanticGroundingLinks(
        lexicalGraph, 
        domainGraph, 
        linkId
      );
      links.push(...groundingLinks);
      linkId += groundingLinks.length;
    }

    // 4. Create temporal alignment links
    if (this.config.enableTemporalAlignment) {
      const temporalLinks = this.createTemporalAlignmentLinks(
        lexicalGraph, 
        domainGraph, 
        linkId
      );
      links.push(...temporalLinks);
      linkId += temporalLinks.length;
    }

    // Filter links by confidence threshold
    const filteredLinks = links.filter(link => link.confidence >= this.config.minLinkConfidence);

    return filteredLinks;
  }

  /**
   * Create links for entity mentions in text chunks
   */
  private createEntityMentionLinks(
    lexicalGraph: LexicalGraph,
    domainGraph: DomainGraph,
    startLinkId: number
  ): CrossGraphLink[] {
    const links: CrossGraphLink[] = [];
    let linkId = startLinkId;

    for (const [entityId, entity] of domainGraph.entities) {
      const entityLinks: CrossGraphLink[] = [];
      
      for (const [chunkId, chunk] of lexicalGraph.textChunks) {
        const confidence = this.calculateEntityMentionConfidence(entity, chunk);
        
        if (confidence >= this.config.minLinkConfidence) {
          entityLinks.push({
            id: `link_${linkId++}`,
            sourceGraph: 'domain',
            sourceId: entityId,
            targetGraph: 'lexical',
            targetId: chunkId,
            type: 'entity_mention',
            confidence,
            metadata: {
              mentionType: this.detectMentionType(entity, chunk),
              entityName: entity.name,
              chunkContent: chunk.content.substring(0, 100) + '...'
            },
            createdAt: new Date()
          });
        }
      }

      // Limit links per entity
      if (entityLinks.length > this.config.maxLinksPerEntity) {
        entityLinks.sort((a, b) => b.confidence - a.confidence);
        entityLinks.splice(this.config.maxLinksPerEntity);
      }

      links.push(...entityLinks);
    }

    return links;
  }

  /**
   * Calculate confidence in entity mention
   */
  private calculateEntityMentionConfidence(entity: EntityRecord, chunk: TextChunk): number {
    let confidence = 0.0;
    
    // Exact name match
    if (chunk.content.toLowerCase().includes(entity.name.toLowerCase())) {
      confidence += 0.8;
    }
    
    // Fuzzy name match
    if (this.config.enableFuzzyMatching) {
      const fuzzyScore = this.calculateFuzzySimilarity(entity.name, chunk.content);
      if (fuzzyScore > this.config.fuzzyThreshold) {
        confidence += fuzzyScore * 0.6;
      }
    }
    
    // Entity type context
    if (this.hasEntityTypeContext(entity, chunk)) {
      confidence += 0.2;
    }
    
    // Position in chunk (earlier mentions get higher confidence)
    const mentionPosition = chunk.content.toLowerCase().indexOf(entity.name.toLowerCase());
    if (mentionPosition >= 0) {
      const positionScore = 1.0 - (mentionPosition / chunk.content.length);
      confidence += positionScore * 0.1;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Detect the type of entity mention
   */
  private detectMentionType(entity: EntityRecord, chunk: TextChunk): string {
    const content = chunk.content.toLowerCase();
    const entityName = entity.name.toLowerCase();
    
    if (content.includes(`the ${entityName}`) || content.includes(`a ${entityName}`)) {
      return 'definite_mention';
    }
    
    if (content.includes(`${entityName} is`) || content.includes(`${entityName} was`)) {
      return 'subject_mention';
    }
    
    if (content.includes(`of ${entityName}`) || content.includes(`by ${entityName}`)) {
      return 'object_mention';
    }
    
    return 'general_mention';
  }

  /**
   * Check if chunk has context for entity type
   */
  private hasEntityTypeContext(entity: EntityRecord, chunk: TextChunk): boolean {
    const content = chunk.content.toLowerCase();
    
    switch (entity.type) {
      case 'person':
        return content.includes('person') || content.includes('people') || 
               content.includes('he') || content.includes('she') || 
               content.includes('they') || content.includes('who');
      
      case 'organization':
        return content.includes('company') || content.includes('organization') || 
               content.includes('team') || content.includes('department') ||
               content.includes('corp') || content.includes('inc');
      
      case 'location':
        return content.includes('place') || content.includes('location') || 
               content.includes('city') || content.includes('country') ||
               content.includes('where') || content.includes('at');
      
      case 'concept':
        return content.includes('concept') || content.includes('idea') || 
               content.includes('topic') || content.includes('subject');
      
      case 'event':
        return content.includes('event') || content.includes('meeting') || 
               content.includes('conference') || content.includes('when');
      
      default:
        return false;
    }
  }

  /**
   * Create evidence support links
   */
  private createEvidenceSupportLinks(
    lexicalGraph: LexicalGraph,
    domainGraph: DomainGraph,
    startLinkId: number
  ): CrossGraphLink[] {
    const links: CrossGraphLink[] = [];
    let linkId = startLinkId;

    for (const [relationshipId, relationship] of domainGraph.semanticRelations) {
      const sourceEntity = domainGraph.entities.get(relationship.source);
      const targetEntity = domainGraph.entities.get(relationship.target);
      
      if (!sourceEntity || !targetEntity) continue;

      // Find chunks that mention both entities
      for (const [chunkId, chunk] of lexicalGraph.textChunks) {
        const sourceMention = chunk.content.toLowerCase().includes(sourceEntity.name.toLowerCase());
        const targetMention = chunk.content.toLowerCase().includes(targetEntity.name.toLowerCase());
        
        if (sourceMention && targetMention) {
          const confidence = this.calculateEvidenceSupportConfidence(relationship, chunk);
          
          if (confidence >= this.config.minLinkConfidence) {
            links.push({
              id: `link_${linkId++}`,
              sourceGraph: 'domain',
              sourceId: relationshipId,
              targetGraph: 'lexical',
              targetId: chunkId,
              type: 'evidence_support',
              confidence,
              metadata: {
                relationshipType: relationship.type,
                sourceEntity: sourceEntity.name,
                targetEntity: targetEntity.name,
                chunkContent: chunk.content.substring(0, 100) + '...'
              },
              createdAt: new Date()
            });
          }
        }
      }
    }

    return links;
  }

  /**
   * Calculate confidence in evidence support
   */
  private calculateEvidenceSupportConfidence(
    relationship: RelationshipRecord,
    chunk: TextChunk
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Higher confidence for explicit relationship mentions
    const relationshipTerms = this.getRelationshipTerms(relationship.type);
    for (const term of relationshipTerms) {
      if (chunk.content.toLowerCase().includes(term)) {
        confidence += 0.3;
        break;
      }
    }
    
    // Higher confidence for longer chunks (more context)
    if (chunk.content.length > 200) {
      confidence += 0.1;
    }
    
    // Higher confidence for chunks with good structure
    if (chunk.metadata.chunkType === 'sentence') {
      confidence += 0.1;
    }
    
    return Math.min(1.0, confidence);
  }

  /**
   * Get relationship terms for a relationship type
   */
  private getRelationshipTerms(relationshipType: string): string[] {
    const termMap: Record<string, string[]> = {
      'works_at': ['works', 'employed', 'job', 'position'],
      'manages': ['manages', 'leads', 'supervises', 'directs'],
      'knows': ['knows', 'familiar', 'acquainted', 'friends'],
      'located_in': ['located', 'situated', 'found', 'based'],
      'part_of': ['part', 'member', 'belongs', 'included'],
      'created': ['created', 'developed', 'built', 'established']
    };
    
    return termMap[relationshipType] || [relationshipType];
  }

  /**
   * Create semantic grounding links
   */
  private createSemanticGroundingLinks(
    lexicalGraph: LexicalGraph,
    domainGraph: DomainGraph,
    startLinkId: number
  ): CrossGraphLink[] {
    const links: CrossGraphLink[] = [];
    let linkId = startLinkId;

    // Link chunks to their semantic context
    for (const [chunkId, chunk] of lexicalGraph.textChunks) {
      const chunkEmbedding = lexicalGraph.embeddings.get(chunkId);
      if (!chunkEmbedding) continue;

      // Find semantically similar entities
      for (const [entityId, entity] of domainGraph.entities) {
        const similarity = this.calculateSemanticSimilarity(chunk, entity);
        
        if (similarity >= this.config.minLinkConfidence) {
          links.push({
            id: `link_${linkId++}`,
            sourceGraph: 'lexical',
            sourceId: chunkId,
            targetGraph: 'domain',
            targetId: entityId,
            type: 'semantic_grounding',
            confidence: similarity,
            metadata: {
              similarityType: 'semantic',
              chunkContent: chunk.content.substring(0, 100) + '...',
              entityName: entity.name,
              entityType: entity.type
            },
            createdAt: new Date()
          });
        }
      }
    }

    return links;
  }

  /**
   * Calculate semantic similarity between chunk and entity
   */
  private calculateSemanticSimilarity(chunk: TextChunk, entity: EntityRecord): number {
    let similarity = 0.0;
    
    // Content overlap
    const chunkWords = new Set(chunk.content.toLowerCase().split(/\s+/));
    const entityWords = new Set(entity.name.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...chunkWords].filter(x => entityWords.has(x)));
    const union = new Set([...chunkWords, ...entityWords]);
    
    if (union.size > 0) {
      similarity += (intersection.size / union.size) * 0.4;
    }
    
    // Entity type relevance
    if (this.isEntityTypeRelevant(entity.type, chunk.content)) {
      similarity += 0.3;
    }
    
    // Property relevance
    if (entity.properties) {
      for (const [key, value] of Object.entries(entity.properties)) {
        if (typeof value === 'string' && chunk.content.toLowerCase().includes(value.toLowerCase())) {
          similarity += 0.2;
          break;
        }
      }
    }
    
    return Math.min(1.0, similarity);
  }

  /**
   * Check if entity type is relevant to chunk content
   */
  private isEntityTypeRelevant(entityType: string, content: string): boolean {
    const contentLower = content.toLowerCase();
    
    switch (entityType) {
      case 'person':
        return contentLower.includes('he') || contentLower.includes('she') || 
               contentLower.includes('they') || contentLower.includes('who');
      
      case 'organization':
        return contentLower.includes('company') || contentLower.includes('team') || 
               contentLower.includes('organization');
      
      case 'location':
        return contentLower.includes('where') || contentLower.includes('place') || 
               contentLower.includes('location');
      
      case 'event':
        return contentLower.includes('when') || contentLower.includes('event') || 
               contentLower.includes('meeting');
      
      default:
        return false;
    }
  }

  /**
   * Create temporal alignment links
   */
  private createTemporalAlignmentLinks(
    lexicalGraph: LexicalGraph,
    domainGraph: DomainGraph,
    startLinkId: number
  ): CrossGraphLink[] {
    const links: CrossGraphLink[] = [];
    let linkId = startLinkId;

    // Find temporal entities
    const temporalEntities = Array.from(domainGraph.entities.values()).filter(e => 
      e.type === 'event' || e.properties?.date || e.properties?.time
    );

    for (const entity of temporalEntities) {
      for (const [chunkId, chunk] of lexicalGraph.textChunks) {
        const temporalAlignment = this.calculateTemporalAlignment(entity, chunk);
        
        if (temporalAlignment >= this.config.minLinkConfidence) {
          links.push({
            id: `link_${linkId++}`,
            sourceGraph: 'domain',
            sourceId: entity.id,
            targetGraph: 'lexical',
            targetId: chunkId,
            type: 'temporal_alignment',
            confidence: temporalAlignment,
            metadata: {
              temporalType: entity.type === 'event' ? 'event' : 'temporal_reference',
              entityName: entity.name,
              chunkContent: chunk.content.substring(0, 100) + '...'
            },
            createdAt: new Date()
          });
        }
      }
    }

    return links;
  }

  /**
   * Calculate temporal alignment between entity and chunk
   */
  private calculateTemporalAlignment(entity: EntityRecord, chunk: TextChunk): number {
    let alignment = 0.0;
    
    // Check for temporal references in chunk
    const temporalTerms = ['today', 'yesterday', 'tomorrow', 'now', 'recent', 'future', 'past'];
    const hasTemporalTerms = temporalTerms.some(term => 
      chunk.content.toLowerCase().includes(term)
    );
    
    if (hasTemporalTerms) {
      alignment += 0.3;
    }
    
    // Check for date/time patterns
    const datePattern = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/;
    if (datePattern.test(chunk.content)) {
      alignment += 0.4;
    }
    
    // Check for event-related terms
    const eventTerms = ['meeting', 'conference', 'deadline', 'milestone', 'launch'];
    const hasEventTerms = eventTerms.some(term => 
      chunk.content.toLowerCase().includes(term)
    );
    
    if (hasEventTerms && entity.type === 'event') {
      alignment += 0.3;
    }
    
    return Math.min(1.0, alignment);
  }

  /**
   * Calculate fuzzy similarity between strings
   */
  private calculateFuzzySimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1 === word2 || 
            word1.includes(word2) || 
            word2.includes(word1)) {
          matches++;
          break;
        }
      }
    }
    
    return matches / Math.max(words1.length, words2.length);
  }
}
