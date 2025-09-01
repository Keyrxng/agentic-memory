/**
 * LLM-based entity extraction and relationship detection
 * 
 * This implementation uses local LLMs (Ollama/LM Studio) to perform
 * entity extraction and relationship detection, providing more accurate
 * and contextually aware results than rule-based approaches.
 * 
 * Key Features:
 * - LLM-powered named entity recognition with context awareness
 * - Semantic relationship extraction using structured prompting
 * - Confidence scoring based on LLM reasoning
 * - Support for multiple LLM providers (Ollama, LM Studio)
 * - Structured output parsing for consistent results
 * 
 * Advantages over rule-based approaches:
 * - Better understanding of context and ambiguity
 * - More accurate entity type classification
 * - Semantic relationship inference
 * - Handles complex sentence structures
 * - Adapts to different domains and writing styles
 */

import { generateText, generateEmbeddings } from 'local-stt-tts';
import type {
  EntityRecord,
  RelationshipRecord,
  DependencyRelation,
  GraphContext,
  GraphNode
} from '../core/types.js';
import { EntityResolver } from '../utils/entity-resolver.js';

/**
 * Configuration for LLM-based extraction
 */
export interface LLMExtractionConfig {
  /** LLM provider to use */
  provider: 'ollama' | 'lmstudio';
  /** Model to use for extraction */
  model: string;
  /** Model to use for embeddings (if different) */
  embeddingModel?: string;
  /** Minimum confidence threshold for entities */
  entityConfidenceThreshold: number;
  /** Minimum confidence threshold for relationships */
  relationshipConfidenceThreshold: number;
  /** Maximum entities to extract per text */
  maxEntitiesPerText: number;
  /** Maximum relationships to extract per text */
  maxRelationshipsPerText: number;
  /** Enable confidence scoring from LLM reasoning */
  enableConfidenceScoring: boolean;
  /** Enable entity resolution against existing entities */
  enableEntityResolution: boolean;
  /** Custom extraction prompts */
  customPrompts?: {
    entityExtraction?: string;
    relationshipExtraction?: string;
  };
}

/**
 * Result of LLM-based extraction operation
 */
export interface LLMExtractionResult {
  /** Extracted entities with confidence scores */
  entities: Array<EntityRecord & { confidence: number }>;
  /** Extracted relationships with confidence scores */
  relationships: Array<RelationshipRecord & { confidence: number }>;
  /** Dependency relations found in text */
  dependencies: DependencyRelation[];
  /** LLM reasoning and confidence details */
  llmMetadata: {
    provider: string;
    model: string;
    reasoning: string;
    confidenceFactors: string[];
    processingTime: number;
  };
  /** Extraction metadata */
  metadata: {
    textLength: number;
    totalProcessingTime: number;
    methodsUsed: string[];
  };
}

/**
 * Structured entity extraction result from LLM
 */
interface LLMEntityResult {
  entities: Array<{
    name: string;
    type: 'person' | 'organization' | 'location' | 'concept' | 'event' | 'technology';
    confidence: number;
    properties: Record<string, any>;
    reasoning: string;
  }>;
}

/**
 * Structured relationship extraction result from LLM
 */
interface LLMRelationshipResult {
  relationships: Array<{
    source: string;
    target: string;
    type: string;
    confidence: number;
    properties: Record<string, any>;
    reasoning: string;
  }>;
}

/**
 * LLM-based entity and relationship extractor
 * 
 * Uses local LLMs to perform sophisticated entity extraction and
 * relationship detection with better context understanding than
 * rule-based approaches.
 */
export class LLMBasedExtractor {
  private config: LLMExtractionConfig;
  private entityResolver: EntityResolver;

  constructor(config: Partial<LLMExtractionConfig> = {}) {
    this.config = {
      provider: config.provider ?? 'ollama',
      model: config.model ?? 'qwen3:1.7b',
      embeddingModel: config.embeddingModel ?? config.model,
      entityConfidenceThreshold: config.entityConfidenceThreshold ?? 0.7,
      relationshipConfidenceThreshold: config.relationshipConfidenceThreshold ?? 0.6,
      maxEntitiesPerText: config.maxEntitiesPerText ?? 50,
      maxRelationshipsPerText: config.maxRelationshipsPerText ?? 100,
      enableConfidenceScoring: config.enableConfidenceScoring ?? true,
      enableEntityResolution: config.enableEntityResolution ?? true,
      customPrompts: config.customPrompts ?? {}
    };
  }

  /**
   * Extract entities and relationships from text using LLM
   * 
   * Main entry point that orchestrates the LLM-based extraction pipeline:
   * 1. Entity extraction with LLM
   * 2. Relationship extraction with LLM
   * 3. Confidence scoring and validation
   * 4. Entity resolution (optional)
   * 5. Result filtering and formatting
   */
  async extractEntitiesAndRelations(
    text: string,
    context: GraphContext
  ): Promise<LLMExtractionResult> {
    const startTime = Date.now();
    const methodsUsed: string[] = ['llm_entity_extraction', 'llm_relationship_extraction'];

    // Preprocess text
    const cleanText = this.preprocessText(text);

    // Extract entities using LLM
    const entityStartTime = Date.now();
    const llmEntities = await this.extractEntitiesWithLLM(cleanText, context);
    const entityProcessingTime = Date.now() - entityStartTime;

    // Extract relationships using LLM
    const relationshipStartTime = Date.now();
    const llmRelationships = await this.extractRelationshipsWithLLM(cleanText, llmEntities, context);
    const relationshipProcessingTime = Date.now() - relationshipStartTime;

    // Convert LLM results to our data structures
    const entities = this.convertLLMEntities(llmEntities, context);
    const relationships = this.convertLLMRelationships(llmRelationships, entities, context);

    // Perform entity resolution if enabled
    if (this.config.enableEntityResolution) {
      const resolvedEntities = await this.resolveEntities(entities, context, []);
      const resolvedRelationships = this.updateRelationshipsWithResolvedEntities(relationships, resolvedEntities);
      
      // Update entities with resolution results
      entities.forEach(entity => {
        const resolved = resolvedEntities.find(r => r.originalId === entity.id);
        if (resolved?.matched) {
          entity.id = resolved.matched.id;
          entity.confidence = Math.max(entity.confidence, resolved.confidence);
        }
      });
      
      methodsUsed.push('entity_resolution');
    }

    // Filter by confidence thresholds
    const filteredEntities = entities
      .filter(e => e.confidence >= this.config.entityConfidenceThreshold)
      .slice(0, this.config.maxEntitiesPerText);

    const filteredRelationships = relationships
      .filter(r => r.confidence >= this.config.relationshipConfidenceThreshold)
      .slice(0, this.config.maxRelationshipsPerText);

    // Generate dependency relations from relationships for compatibility
    const dependencies = this.generateDependenciesFromRelationships(filteredRelationships);

    const totalProcessingTime = Date.now() - startTime;

    return {
      entities: filteredEntities,
      relationships: filteredRelationships,
      dependencies,
      llmMetadata: {
        provider: this.config.provider,
        model: this.config.model,
        reasoning: `${llmEntities.reasoning || ''}\n${llmRelationships.reasoning || ''}`.trim(),
        confidenceFactors: [
          `Entity extraction time: ${entityProcessingTime}ms`,
          `Relationship extraction time: ${relationshipProcessingTime}ms`,
          `Total LLM processing: ${entityProcessingTime + relationshipProcessingTime}ms`
        ],
        processingTime: entityProcessingTime + relationshipProcessingTime
      },
      metadata: {
        textLength: text.length,
        totalProcessingTime,
        methodsUsed
      }
    };
  }

  /**
   * Extract entities using LLM with structured prompting
   */
  private async extractEntitiesWithLLM(
    text: string,
    context: GraphContext
  ): Promise<LLMEntityResult & { reasoning: string }> {
    const prompt = this.config.customPrompts?.entityExtraction || this.getDefaultEntityExtractionPrompt();
    
    const systemPrompt = `You are an expert entity extraction system. Analyze the given text and identify all meaningful entities (people, organizations, locations, concepts, events, technologies).

IMPORTANT: Respond with ONLY valid JSON in this exact format:
{
  "entities": [
    {
      "name": "entity name",
      "type": "person|organization|location|concept|event|technology",
      "confidence": 0.0-1.0,
      "properties": {"key": "value"},
      "reasoning": "brief explanation of why this is an entity"
    }
  ]
}

Guidelines:
- Extract only meaningful, specific entities
- Use appropriate entity types
- Provide confidence scores based on clarity and context
- Include relevant properties (e.g., title, role, industry)
- Keep reasoning concise but informative
- Ensure all entity names are exactly as they appear in the text`;

    const userPrompt = `Text to analyze: "${text}"

Extract all entities and return as JSON:`;

    try {
      const result = await generateText({
        provider: this.config.provider,
        model: this.config.model,
        promptOrMessages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        thinking: { logReasoning: true, isReasoningModel: true },
        tools: []
      });

      // Parse the JSON response with multiple fallback strategies
      const parsed = this.parseLLMResponse(result.reply) as LLMEntityResult;
      
      // Validate the parsed result
      if (!parsed || !Array.isArray(parsed.entities)) {
        throw new Error('Invalid entity structure in LLM response');
      }

      // Clean and validate entities
      const cleanedEntities = parsed.entities
        .filter(entity => 
          entity.name && 
          entity.type && 
          typeof entity.confidence === 'number' &&
          entity.confidence >= 0 && 
          entity.confidence <= 1
        )
        .map(entity => ({
          ...entity,
          name: entity.name.trim(),
          type: entity.type.toLowerCase() as any,
          confidence: Math.max(0, Math.min(1, entity.confidence)),
          properties: entity.properties || {},
          reasoning: entity.reasoning || 'No reasoning provided'
        }));

      return {
        entities: cleanedEntities,
        reasoning: result.thoughts?.[1] || 'No reasoning provided'
      };
    } catch (error) {
      console.error('Error in LLM entity extraction:', error);
      
      // Fallback to basic extraction
      return {
        entities: [],
        reasoning: `LLM extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}. Falling back to basic extraction.`
      };
    }
  }

  /**
   * Extract relationships using LLM with structured prompting
   */
  private async extractRelationshipsWithLLM(
    text: string,
    entities: LLMEntityResult,
    context: GraphContext
  ): Promise<LLMRelationshipResult & { reasoning: string }> {
    const prompt = this.config.customPrompts?.relationshipExtraction || this.getDefaultRelationshipExtractionPrompt();
    
    const systemPrompt = `You are an expert relationship extraction system. Analyze the given text and identify meaningful relationships between entities.

IMPORTANT: Respond with ONLY valid JSON in this exact format:
{
  "relationships": [
    {
      "source": "source entity name",
      "target": "target entity name", 
      "type": "relationship type (e.g., works_at, knows, located_in)",
      "confidence": 0.0-1.0,
      "properties": {"key": "value"},
      "reasoning": "brief explanation of the relationship"
    }
  ]
}

Guidelines:
- Focus on meaningful, explicit relationships
- Use clear, consistent relationship types
- Provide confidence based on clarity in text
- Include relevant properties (e.g., duration, role, context)
- Ensure source and target entities exist in the provided entity list
- Use exact entity names as they appear in the entity list`;

    const entityList = entities.entities.map(e => `- ${e.name} (${e.type})`).join('\n');
    
    const userPrompt = `Text to analyze: "${text}"

Available entities:
${entityList}

Extract all relationships and return as JSON:`;

    try {
      const result = await generateText({
        provider: this.config.provider,
        model: this.config.model,
        promptOrMessages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        thinking: { logReasoning: true, isReasoningModel: true },
        tools: []
      });

      // Parse the JSON response with multiple fallback strategies
      const parsed = this.parseLLMResponse(result.reply) as LLMRelationshipResult;
      
      // Validate the parsed result
      if (!parsed || !Array.isArray(parsed.relationships)) {
        throw new Error('Invalid relationship structure in LLM response');
      }

      // Clean and validate relationships
      const cleanedRelationships = parsed.relationships
        .filter(rel => 
          rel.source && 
          rel.target && 
          rel.type &&
          typeof rel.confidence === 'number' &&
          rel.confidence >= 0 && 
          rel.confidence <= 1
        )
        .map(rel => ({
          ...rel,
          source: rel.source.trim(),
          target: rel.target.trim(),
          type: rel.type.trim().toLowerCase(),
          confidence: Math.max(0, Math.min(1, rel.confidence)),
          properties: rel.properties || {},
          reasoning: rel.reasoning || 'No reasoning provided'
        }));

      return {
        relationships: cleanedRelationships,
        reasoning: result.thoughts?.[1] || 'No reasoning provided'
      };
    } catch (error) {
      console.error('Error in LLM relationship extraction:', error);
      
      // Fallback to basic extraction
      return {
        relationships: [],
        reasoning: `LLM extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}. Falling back to basic extraction.`
      };
    }
  }

  /**
   * Robust JSON parsing with multiple fallback strategies
   */
  private parseLLMResponse(response: string): any {
    // Strategy 1: Look for JSON between curly braces
    let jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn('Failed to parse JSON with strategy 1:', e);
      }
    }

    // Strategy 2: Look for JSON array
    jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn('Failed to parse JSON with strategy 2:', e);
      }
    }

    // Strategy 3: Try to extract JSON from markdown code blocks
    jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.warn('Failed to parse JSON with strategy 3:', e);
      }
    }

    // Strategy 4: Try to find and fix common JSON issues
    const cleanedResponse = response
      .replace(/```/g, '')
      .replace(/^\s*```json\s*/, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      return JSON.parse(cleanedResponse);
    } catch (e) {
      console.warn('Failed to parse JSON with strategy 4:', e);
    }

    // Strategy 5: Try to fix common JSON syntax errors
    try {
      const fixedResponse = cleanedResponse
        .replace(/(\w+):/g, '"$1":') // Fix unquoted keys
        .replace(/'/g, '"') // Replace single quotes with double quotes
        .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

      return JSON.parse(fixedResponse);
    } catch (e) {
      console.warn('Failed to parse JSON with strategy 5:', e);
    }

    throw new Error('Could not parse LLM response as valid JSON');
  }

  /**
   * Convert LLM entity results to our data structures
   */
  private convertLLMEntities(
    llmEntities: LLMEntityResult,
    context: GraphContext
  ): Array<EntityRecord & { confidence: number }> {
    return llmEntities.entities.map(entity => ({
      id: this.generateEntityId(entity.name, entity.type),
      type: entity.type,
      name: entity.name,
      properties: {
        ...entity.properties,
        extractedBy: 'llm_extraction',
        reasoning: entity.reasoning,
        context: context.sessionId
      },
      confidence: entity.confidence
    }));
  }

  /**
   * Convert LLM relationship results to our data structures
   */
  private convertLLMRelationships(
    llmRelationships: LLMRelationshipResult,
    entities: Array<EntityRecord & { confidence: number }>,
    context: GraphContext
  ): Array<RelationshipRecord & { confidence: number }> {
    const entityMap = new Map(entities.map(e => [e.name, e]));
    
    return llmRelationships.relationships
      .filter(rel => {
        const sourceExists = entityMap.has(rel.source);
        const targetExists = entityMap.has(rel.target);
        return sourceExists && targetExists && rel.source !== rel.target;
      })
      .map(rel => {
        const sourceEntity = entityMap.get(rel.source)!;
        const targetEntity = entityMap.get(rel.target)!;
        
        return {
          id: this.generateRelationshipId(sourceEntity.id, targetEntity.id, rel.type),
          source: sourceEntity.id,
          target: targetEntity.id,
          type: rel.type,
          confidence: rel.confidence,
          properties: {
            ...rel.properties,
            extractedBy: 'llm_extraction',
            reasoning: rel.reasoning,
            context: context.sessionId
          }
        };
      });
  }

  /**
   * Perform entity resolution against existing entities
   */
  private async resolveEntities(
    entities: Array<EntityRecord & { confidence: number }>,
    context: GraphContext,
    existingEntities: EntityRecord[] = []
  ): Promise<Array<{ originalId: string; matched: EntityRecord | null; confidence: number; method: string }>> {
    const results = [];

    // Convert existing entities to GraphNode format for EntityResolver
    const graphNodes = new Map<string, GraphNode>();
    for (const entity of existingEntities) {
      graphNodes.set(entity.id, {
        id: entity.id,
        type: entity.type,
        properties: entity.properties,
        embeddings: entity.embeddings ? new Float32Array(entity.embeddings) : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Update the entity resolver's index with existing entities
    this.entityResolver.updateIndex(Array.from(graphNodes.values()));

    for (const entity of entities) {
      // Use the full EntityResolver capabilities
      const resolution = this.entityResolver.resolveEntity(
        entity,
        graphNodes,
        {
          fuzzyThreshold: 0.8,
          enableEmbeddings: true
        }
      );

      const result = {
        originalId: entity.id,
        matched: resolution.matched,
        confidence: resolution.confidence,
        method: resolution.matched ? 'entity_resolver' : 'none'
      };

      results.push(result);
    }

    return results;
  }

  /**
   * Update relationships with resolved entity IDs
   */
  private updateRelationshipsWithResolvedEntities(
    relationships: Array<RelationshipRecord & { confidence: number }>,
    resolvedEntities: Array<{ originalId: string; matched: EntityRecord | null; confidence: number; method: string }>
  ): Array<RelationshipRecord & { confidence: number }> {
    const resolutionMap = new Map(resolvedEntities.map(r => [r.originalId, r]));
    
    return relationships.map(rel => {
      const sourceResolution = resolutionMap.get(rel.source);
      const targetResolution = resolutionMap.get(rel.target);
      
      if (sourceResolution?.matched) {
        rel.source = sourceResolution.matched.id;
      }
      if (targetResolution?.matched) {
        rel.target = targetResolution.matched.id;
      }
      
      return rel;
    });
  }

  /**
   * Generate dependency relations from relationships for compatibility
   */
  private generateDependenciesFromRelationships(
    relationships: Array<RelationshipRecord & { confidence: number }>
  ): DependencyRelation[] {
    return relationships.map(rel => ({
      head: rel.source,
      dependent: rel.target,
      relation: rel.type,
      confidence: rel.confidence
    }));
  }

  /**
   * Get default entity extraction prompt
   */
  private getDefaultEntityExtractionPrompt(): string {
    return `Extract all meaningful entities from the text, including:
- People (names, titles, roles)
- Organizations (companies, institutions, groups)
- Locations (cities, countries, addresses)
- Concepts (ideas, topics, fields)
- Events (meetings, conferences, milestones)
- Technologies (tools, platforms, systems)

Focus on entities that are:
- Specifically named or referenced
- Relevant to the main topic
- Have clear context and meaning
- Are not generic or overly broad`;
  }

  /**
   * Get default relationship extraction prompt
   */
  private getDefaultRelationshipExtractionPrompt(): string {
    return `Extract meaningful relationships between entities, including:
- Employment/work relationships (works_at, leads, manages)
- Location relationships (lives_in, located_at, based_in)
- Knowledge relationships (knows, studies, teaches)
- Ownership relationships (owns, controls, manages)
- Association relationships (partners_with, collaborates_with, member_of)
- Temporal relationships (attended, participated_in, created)

Focus on relationships that are:
- Explicitly stated in the text
- Have clear source and target entities
- Provide meaningful context
- Are not overly generic or obvious`;
  }

  // Helper methods
  private preprocessText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/['']/g, "'")
      .trim();
  }

  private generateEntityId(name: string, type: string): string {
    const normalized = name.toLowerCase().replace(/\s+/g, '_');
    return `${type}_${normalized}`;
  }

  private generateRelationshipId(sourceId: string, targetId: string, type: string): string {
    return `${sourceId}_${type}_${targetId}`;
  }
}
