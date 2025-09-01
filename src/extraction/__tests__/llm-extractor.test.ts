/**
 * Tests for the LLM-based extractor using real Ollama
 * 
 * These tests require Ollama to be running with the qwen3:1.7b model.
 * Run: ollama pull qwen3:1.7b
 */

import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { LLMBasedExtractor, type LLMExtractionConfig } from '../llm-extractor.js';
import type { GraphContext } from '../../core/types.js';

// Check if Ollama is available
async function checkOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    return response.ok;
  } catch {
    return false;
  }
}

// Skip tests if Ollama is not available
const skipIfNoOllama = async () => {
  const available = await checkOllamaAvailable();
  if (!available) {
    console.log('⚠️  Ollama not available, skipping tests');
    process.exit(0);
  }
};

describe('LLMBasedExtractor', () => {
  let extractor: LLMBasedExtractor;
  let context: GraphContext;

  beforeAll(async () => {
    await skipIfNoOllama();
  });

  beforeEach(() => {
    const config: Partial<LLMExtractionConfig> = {
      provider: 'ollama',
      model: 'qwen3:1.7b',
      entityConfidenceThreshold: 0.7,
      relationshipConfidenceThreshold: 0.6
    };

    extractor = new LLMBasedExtractor(config);
    context = {
      userId: 'test-user',
      sessionId: 'test-session',
      timestamp: new Date(),
      relevantEntities: [],
      source: 'test'
    };
  });

  describe('constructor', () => {
    it('should create extractor with default config', () => {
      const defaultExtractor = new LLMBasedExtractor();
      expect(defaultExtractor).toBeInstanceOf(LLMBasedExtractor);
    });

    it('should create extractor with custom config', () => {
      const customConfig: Partial<LLMExtractionConfig> = {
        provider: 'lmstudio',
        model: 'custom-model',
        entityConfidenceThreshold: 0.8
      };

      const customExtractor = new LLMBasedExtractor(customConfig);
      expect(customExtractor).toBeInstanceOf(LLMBasedExtractor);
    });
  });

  describe('extractEntitiesAndRelations', () => {
    it('should extract entities and relationships from text', async () => {
      const text = 'Alice Johnson works at TechCorp as a software engineer.';
      
      const result = await extractor.extractEntitiesAndRelations(text, context);
      
      expect(result).toBeDefined();
      expect(result.entities).toBeInstanceOf(Array);
      expect(result.relationships).toBeInstanceOf(Array);
      expect(result.dependencies).toBeInstanceOf(Array);
      expect(result.llmMetadata).toBeDefined();
      expect(result.metadata).toBeDefined();
      
      // Wait a bit to ensure Ollama can handle the next request
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000); // 30 second timeout for Ollama

    it('should handle empty text', async () => {
      const text = '';
      
      const result = await extractor.extractEntitiesAndRelations(text, context);
      
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);

    it('should respect confidence thresholds', async () => {
      const highThresholdExtractor = new LLMBasedExtractor({
        provider: 'ollama',
        model: 'qwen3:1.7b',
        entityConfidenceThreshold: 0.9,
        relationshipConfidenceThreshold: 0.9
      });

      const text = 'Alice Johnson works at TechCorp.';
      
      const result = await highThresholdExtractor.extractEntitiesAndRelations(text, context);
      
      // All entities and relationships should meet the high threshold
      result.entities.forEach(entity => {
        expect(entity.confidence).toBeGreaterThanOrEqual(0.9);
      });
      
      result.relationships.forEach(relationship => {
        expect(relationship.confidence).toBeGreaterThanOrEqual(0.9);
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);

    it('should respect max limits', async () => {
      const limitedExtractor = new LLMBasedExtractor({
        provider: 'ollama',
        model: 'qwen3:1.7b',
        maxEntitiesPerText: 1,
        maxRelationshipsPerText: 1
      });

      const text = 'Alice Johnson works at TechCorp. Bob Smith works at DeepMind.';
      
      const result = await limitedExtractor.extractEntitiesAndRelations(text, context);
      
      expect(result.entities).toHaveLength(1);
      expect(result.relationships).toHaveLength(1);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);
  });

  describe('custom prompts', () => {
    it('should use custom entity extraction prompts', async () => {
      const customExtractor = new LLMBasedExtractor({
        provider: 'ollama',
        model: 'qwen3:1.7b',
        customPrompts: {
          entityExtraction: 'Focus on technical roles and companies'
        }
      });

      const text = 'Alice Johnson is a software engineer at TechCorp.';
      
      const result = await customExtractor.extractEntitiesAndRelations(text, context);
      
      expect(result).toBeDefined();
      expect(result.entities.length).toBeGreaterThan(0);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);

    it('should use custom relationship extraction prompts', async () => {
      const customExtractor = new LLMBasedExtractor({
        provider: 'ollama',
        model: 'qwen3:1.7b',
        customPrompts: {
          relationshipExtraction: 'Focus on employment relationships'
        }
      });

      const text = 'Alice Johnson works at TechCorp.';
      
      const result = await customExtractor.extractEntitiesAndRelations(text, context);
      
      expect(result).toBeDefined();
      expect(result.relationships.length).toBeGreaterThan(0);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);
  });

  describe('error handling', () => {
    it('should handle LLM failures gracefully', async () => {
      // Test with a non-existent model to trigger failure
      const failingExtractor = new LLMBasedExtractor({
        provider: 'ollama',
        model: 'non-existent-model',
        entityConfidenceThreshold: 0.7,
        relationshipConfidenceThreshold: 0.6
      });

      const text = 'Alice Johnson works at TechCorp.';
      const result = await failingExtractor.extractEntitiesAndRelations(text, context);
      
      // Should return empty results with error reasoning
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
      expect(result.llmMetadata.reasoning).toContain('LLM extraction failed');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);
  });

  describe('metadata and performance', () => {
    it('should include processing time metadata', async () => {
      const text = 'Alice Johnson works at TechCorp.';
      
      const result = await extractor.extractEntitiesAndRelations(text, context);
      
      expect(result.metadata.totalProcessingTime).toBeGreaterThan(0);
      expect(result.llmMetadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.methodsUsed).toContain('llm_entity_extraction');
      expect(result.metadata.methodsUsed).toContain('llm_relationship_extraction');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);

    it('should include LLM provider and model information', async () => {
      const text = 'Alice Johnson works at TechCorp.';
      
      const result = await extractor.extractEntitiesAndRelations(text, context);
      
      expect(result.llmMetadata.provider).toBe('ollama');
      expect(result.llmMetadata.model).toBe('qwen3:1.7b');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 30000);
  });
});
