/**
 * Domain Graph Extractor
 * 
 * Focuses on semantic relationships and entities within a domain by:
 * - Extracting entities and their types
 * - Building semantic relationships between entities
 * - Creating entity hierarchies and taxonomies
 * - Organizing domain-specific knowledge structures
 * 
 * This extractor builds the "domain" side of the dual graph architecture.
 */

import type {
  EntityRecord,
  RelationshipRecord,
  EntityHierarchy,
  DomainGraph,
  GraphContext
} from '../core/types.js';
import { LLMBasedExtractor } from './llm-extractor.js';

/**
 * Configuration for domain extraction
 */
export interface DomainExtractionConfig {
  /** Enable entity hierarchy building */
  enableHierarchies: boolean;
  /** Enable taxonomy detection */
  enableTaxonomies: boolean;
  /** Enable organizational structure detection */
  enableOrganizationalStructures: boolean;
  /** Enable concept clustering */
  enableConceptClustering: boolean;
  /** Minimum confidence for hierarchy relationships */
  minHierarchyConfidence: number;
  /** Maximum hierarchy depth */
  maxHierarchyDepth: number;
  /** Enable domain-specific entity types */
  enableDomainSpecificTypes: boolean;
  /** Custom domain entity types */
  customEntityTypes?: string[];
  /** Enable relationship categorization */
  enableRelationshipCategorization: boolean;
}

/**
 * Result of domain extraction
 */
export interface DomainExtractionResult {
  /** Extracted entities */
  entities: EntityRecord[];
  /** Semantic relationships */
  relationships: RelationshipRecord[];
  /** Entity hierarchies */
  hierarchies: EntityHierarchy[];
  /** Extraction metadata */
  metadata: {
    entitiesExtracted: number;
    relationshipsExtracted: number;
    hierarchiesCreated: number;
    processingTime: number;
    domainTypes: string[];
  };
}

/**
 * Domain graph extractor for semantic relationships and entities
 */
export class DomainGraphExtractor {
  private config: DomainExtractionConfig;
  private llmExtractor: LLMBasedExtractor;

  constructor(
    config: Partial<DomainExtractionConfig> = {},
    llmExtractor?: LLMBasedExtractor
  ) {
    this.config = {
      enableHierarchies: config.enableHierarchies ?? true,
      enableTaxonomies: config.enableTaxonomies ?? true,
      enableOrganizationalStructures: config.enableOrganizationalStructures ?? true,
      enableConceptClustering: config.enableConceptClustering ?? true,
      minHierarchyConfidence: config.minHierarchyConfidence ?? 0.7,
      maxHierarchyDepth: config.maxHierarchyDepth ?? 5,
      enableDomainSpecificTypes: config.enableDomainSpecificTypes ?? true,
      customEntityTypes: config.customEntityTypes ?? [],
      enableRelationshipCategorization: config.enableRelationshipCategorization ?? true,
      ...config
    };

    // Use provided LLM extractor or create default one
    this.llmExtractor = llmExtractor || new LLMBasedExtractor({
      entityConfidenceThreshold: 0.7,
      relationshipConfidenceThreshold: 0.6,
      enableEntityResolution: true
    });
  }

  /**
   * Extract domain graph from text
   */
  async extractDomainGraph(
    text: string,
    context: GraphContext
  ): Promise<DomainGraph> {
    const startTime = Date.now();
    
    // 1. Extract entities and relationships using LLM
    const extractionResult = await this.llmExtractor.extractEntitiesAndRelations(text, context);
    
    // 2. Build entity hierarchies
    const hierarchies = this.config.enableHierarchies
      ? this.buildEntityHierarchies(extractionResult.entities, extractionResult.relationships)
      : [];
    
    // 3. Create domain-specific indices
    const domainIndices = this.buildDomainIndices(extractionResult.entities, extractionResult.relationships);
    
    const processingTime = Date.now() - startTime;
    
    return {
      id: `domain_${context.sessionId}_${Date.now()}`,
      type: 'domain',
      entities: new Map(extractionResult.entities.map(e => [e.id, e])),
      semanticRelations: new Map(extractionResult.relationships.map(r => [r.id, r])),
      entityHierarchies: new Map(hierarchies.map(h => [h.id, h])),
      domainIndices,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Build entity hierarchies from entities and relationships
   */
  private buildEntityHierarchies(
    entities: EntityRecord[],
    relationships: RelationshipRecord[]
  ): EntityHierarchy[] {
    const hierarchies: EntityHierarchy[] = [];
    let hierarchyId = 0;

    // Build organizational hierarchies
    if (this.config.enableOrganizationalStructures) {
      const orgHierarchies = this.buildOrganizationalHierarchies(entities, relationships);
      hierarchies.push(...orgHierarchies);
    }

    // Build concept taxonomies
    if (this.config.enableTaxonomies) {
      const conceptTaxonomies = this.buildConceptTaxonomies(entities, relationships);
      hierarchies.push(...conceptTaxonomies);
    }

    // Build temporal hierarchies
    const temporalHierarchies = this.buildTemporalHierarchies(entities, relationships);
    hierarchies.push(...temporalHierarchies);

    return hierarchies;
  }

  /**
   * Build organizational hierarchies (e.g., company structure)
   */
  private buildOrganizationalHierarchies(
    entities: EntityRecord[],
    relationships: RelationshipRecord[]
  ): EntityHierarchy[] {
    const hierarchies: EntityHierarchy[] = [];
    let hierarchyId = 0;

    // Find organizational entities
    const orgEntities = entities.filter(e => 
      e.type === 'organization' || 
      e.properties?.role ||
      e.properties?.department ||
      e.properties?.level
    );

    // Group by organization
    const orgGroups = new Map<string, EntityRecord[]>();
    for (const entity of orgEntities) {
      const orgName = entity.properties?.organization || entity.properties?.company || 'unknown';
      if (!orgGroups.has(orgName)) {
        orgGroups.set(orgName, []);
      }
      orgGroups.get(orgName)!.push(entity);
    }

    // Build hierarchy for each organization
    for (const [orgName, members] of orgGroups) {
      if (members.length > 1) {
        const hierarchy = this.createHierarchyFromMembers(members, relationships, hierarchyId++);
        if (hierarchy) {
          hierarchy.id = `org_hierarchy_${hierarchyId}`;
          hierarchy.type = 'organization';
          hierarchies.push(hierarchy);
        }
      }
    }

    return hierarchies;
  }

  /**
   * Build concept taxonomies (e.g., knowledge domains)
   */
  private buildConceptTaxonomies(
    entities: EntityRecord[],
    relationships: RelationshipRecord[]
  ): EntityHierarchy[] {
    const hierarchies: EntityHierarchy[] = [];
    let hierarchyId = 0;

    // Find concept entities
    const conceptEntities = entities.filter(e => 
      e.type === 'concept' || 
      e.type === 'technology' ||
      e.properties?.category ||
      e.properties?.domain
    );

    // Group by domain/category
    const domainGroups = new Map<string, EntityRecord[]>();
    for (const entity of conceptEntities) {
      const domain = entity.properties?.domain || entity.properties?.category || 'general';
      if (!domainGroups.has(domain)) {
        domainGroups.set(domain, []);
      }
      domainGroups.get(domain)!.push(entity);
    }

    // Build taxonomy for each domain
    for (const [domain, concepts] of domainGroups) {
      if (concepts.length > 1) {
        const hierarchy = this.createHierarchyFromMembers(concepts, relationships, hierarchyId++);
        if (hierarchy) {
          hierarchy.id = `concept_taxonomy_${hierarchyId}`;
          hierarchy.type = 'taxonomy';
          hierarchies.push(hierarchy);
        }
      }
    }

    return hierarchies;
  }

  /**
   * Build temporal hierarchies (e.g., event sequences)
   */
  private buildTemporalHierarchies(
    entities: EntityRecord[],
    relationships: RelationshipRecord[]
  ): EntityHierarchy[] {
    const hierarchies: EntityHierarchy[] = [];
    let hierarchyId = 0;

    // Find temporal entities
    const temporalEntities = entities.filter(e => 
      e.type === 'event' ||
      e.properties?.date ||
      e.properties?.time ||
      e.properties?.period
    );

    // Group by time period
    const timeGroups = new Map<string, EntityRecord[]>();
    for (const entity of temporalEntities) {
      const timePeriod = entity.properties?.period || entity.properties?.era || 'recent';
      if (!timeGroups.has(timePeriod)) {
        timeGroups.set(timePeriod, []);
      }
      timeGroups.get(timePeriod)!.push(entity);
    }

    // Build temporal hierarchy for each period
    for (const [period, events] of timeGroups) {
      if (events.length > 1) {
        const hierarchy = this.createHierarchyFromMembers(events, relationships, hierarchyId++);
        if (hierarchy) {
          hierarchy.id = `temporal_hierarchy_${hierarchyId}`;
          hierarchy.type = 'temporal';
          hierarchies.push(hierarchy);
        }
      }
    }

    return hierarchies;
  }

  /**
   * Create hierarchy from a group of related entities
   */
  private createHierarchyFromMembers(
    members: EntityRecord[],
    relationships: RelationshipRecord[],
    hierarchyId: number
  ): EntityHierarchy | null {
    if (members.length === 0) return null;

    const parentChild = new Map<string, string[]>();
    const siblings = new Map<string, string[]>();
    
    // Find root entity (entity with most incoming relationships)
    const rootEntity = this.findRootEntity(members, relationships);
    
    // Build parent-child relationships
    for (const member of members) {
      const children = this.findChildren(member, members, relationships);
      if (children.length > 0) {
        parentChild.set(member.id, children.map(c => c.id));
      }
    }

    // Build sibling relationships
    for (const member of members) {
      const siblingsList = this.findSiblings(member, members, relationships);
      if (siblingsList.length > 0) {
        siblings.set(member.id, siblingsList.map(s => s.id));
      }
    }

    // Calculate hierarchy confidence
    const confidence = this.calculateHierarchyConfidence(members, parentChild, siblings);

    if (confidence >= this.config.minHierarchyConfidence) {
      return {
        id: `hierarchy_${hierarchyId}`,
        rootEntityId: rootEntity.id,
        parentChild,
        siblings,
        type: 'taxonomy', // Will be overridden by caller
        confidence
      };
    }

    return null;
  }

  /**
   * Find root entity in a hierarchy
   */
  private findRootEntity(
    members: EntityRecord[],
    relationships: RelationshipRecord[]
  ): EntityRecord {
    // Simple heuristic: entity with most incoming relationships
    const incomingCount = new Map<string, number>();
    
    for (const member of members) {
      incomingCount.set(member.id, 0);
    }

    for (const rel of relationships) {
      if (members.some(m => m.id === rel.target)) {
        const current = incomingCount.get(rel.target) || 0;
        incomingCount.set(rel.target, current + 1);
      }
    }

    let maxIncoming = 0;
    let rootEntity = members[0];

    for (const [entityId, count] of incomingCount) {
      if (count > maxIncoming) {
        maxIncoming = count;
        rootEntity = members.find(m => m.id === entityId) || rootEntity;
      }
    }

    return rootEntity;
  }

  /**
   * Find child entities
   */
  private findChildren(
    parent: EntityRecord,
    members: EntityRecord[],
    relationships: RelationshipRecord[]
  ): EntityRecord[] {
    const children: EntityRecord[] = [];

    for (const rel of relationships) {
      if (rel.source === parent.id && rel.type.includes('contains') || rel.type.includes('manages')) {
        const child = members.find(m => m.id === rel.target);
        if (child) {
          children.push(child);
        }
      }
    }

    return children;
  }

  /**
   * Find sibling entities
   */
  private findSiblings(
    entity: EntityRecord,
    members: EntityRecord[],
    relationships: RelationshipRecord[]
  ): EntityRecord[] {
    const siblings: EntityRecord[] = [];

    // Find entities that share similar relationships
    for (const rel of relationships) {
      if (rel.target === entity.id && rel.type.includes('contains') || rel.type.includes('manages')) {
        const parent = rel.source;
        
        // Find other entities with the same parent
        for (const otherRel of relationships) {
          if (otherRel.source === parent && otherRel.target !== entity.id) {
            const sibling = members.find(m => m.id === otherRel.target);
            if (sibling && !siblings.some(s => s.id === sibling.id)) {
              siblings.push(sibling);
            }
          }
        }
      }
    }

    return siblings;
  }

  /**
   * Calculate confidence in hierarchy structure
   */
  private calculateHierarchyConfidence(
    members: EntityRecord[],
    parentChild: Map<string, string[]>,
    siblings: Map<string, string[]>
  ): number {
    let confidence = 1.0;
    
    // Penalize hierarchies with too many members
    if (members.length > 20) {
      confidence *= 0.8;
    }
    
    // Reward hierarchies with clear parent-child relationships
    const hasParentChild = parentChild.size > 0;
    if (hasParentChild) {
      confidence *= 1.2;
    }
    
    // Reward hierarchies with sibling relationships
    const hasSiblings = siblings.size > 0;
    if (hasSiblings) {
      confidence *= 1.1;
    }
    
    // Penalize very flat hierarchies
    const avgChildrenPerParent = Array.from(parentChild.values())
      .reduce((sum, children) => sum + children.length, 0) / Math.max(1, parentChild.size);
    
    if (avgChildrenPerParent < 1.5) {
      confidence *= 0.9;
    }
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Build domain-specific indices for efficient querying
   */
  private buildDomainIndices(
    entities: EntityRecord[],
    relationships: RelationshipRecord[]
  ): DomainGraph['domainIndices'] {
    const entityTypeIndex = new Map<string, Set<string>>();
    const relationshipTypeIndex = new Map<string, Set<string>>();
    const confidenceIndex = new Map<number, Set<string>>();

    // Build entity type index
    for (const entity of entities) {
      if (!entityTypeIndex.has(entity.type)) {
        entityTypeIndex.set(entity.type, new Set());
      }
      entityTypeIndex.get(entity.type)!.add(entity.id);
    }

    // Build relationship type index
    for (const relationship of relationships) {
      if (!relationshipTypeIndex.has(relationship.type)) {
        relationshipTypeIndex.set(relationship.type, new Set());
      }
      relationshipTypeIndex.get(relationship.type)!.add(relationship.id);
    }

    // Build confidence index (group by confidence ranges)
    for (const relationship of relationships) {
      const confidenceRange = Math.floor(relationship.confidence * 10) / 10; // Round to 0.1
      if (!confidenceIndex.has(confidenceRange)) {
        confidenceIndex.set(confidenceRange, new Set());
      }
      confidenceIndex.get(confidenceRange)!.add(relationship.id);
    }

    return {
      entityTypeIndex,
      relationshipTypeIndex,
      confidenceIndex
    };
  }

  /**
   * Query the domain graph
   */
  queryDomainGraph(
    graph: DomainGraph,
    query: {
      entityTypes?: string[];
      relationshipTypes?: string[];
      entityNames?: string[];
      confidenceThreshold?: number;
      limit?: number;
    }
  ): {
    entities: EntityRecord[];
    relationships: RelationshipRecord[];
    hierarchies: EntityHierarchy[];
  } {
    let entities = Array.from(graph.entities.values());
    let relationships = Array.from(graph.semanticRelations.values());
    let hierarchies = Array.from(graph.entityHierarchies.values());

    // Filter by entity types
    if (query.entityTypes && query.entityTypes.length > 0) {
      entities = entities.filter(e => query.entityTypes!.includes(e.type));
    }

    // Filter by relationship types
    if (query.relationshipTypes && query.relationshipTypes.length > 0) {
      relationships = relationships.filter(r => query.relationshipTypes!.includes(r.type));
    }

    // Filter by entity names
    if (query.entityNames && query.entityNames.length > 0) {
      entities = entities.filter(e => 
        query.entityNames!.some(name => 
          e.name.toLowerCase().includes(name.toLowerCase())
        )
      );
    }

    // Filter by confidence threshold
    if (query.confidenceThreshold) {
      relationships = relationships.filter(r => r.confidence >= query.confidenceThreshold!);
    }

    // Apply limit
    if (query.limit) {
      entities = entities.slice(0, query.limit);
      relationships = relationships.slice(0, query.limit);
      hierarchies = hierarchies.slice(0, query.limit);
    }

    return { entities, relationships, hierarchies };
  }
}
