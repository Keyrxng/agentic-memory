/**
 * Sequential test runner for LLM extractor tests
 * 
 * This ensures tests run one after another with proper delays
 * to allow Ollama to respond to each request.
 */

import { describe, it, expect, beforeAll } from 'bun:test';
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
    console.log('Please run: ollama pull qwen3:1.7b');
    process.exit(0);
  }
};

describe('LLM Extractor Sequential Tests', () => {
  let extractor: LLMBasedExtractor;
  let context: GraphContext;

  beforeAll(async () => {
    await skipIfNoOllama();
    console.log('✅ Ollama is available, running tests sequentially...');
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

  // Test 1: Basic extraction
  it('1. Basic entity and relationship extraction', async () => {
    console.log('🧪 Running test 1: Basic extraction...');
    
    const text = 'Alice Johnson works at TechCorp as a software engineer.';
    const result = await extractor.extractEntitiesAndRelations(text, context);
    
    expect(result).toBeDefined();
    expect(result.entities).toBeInstanceOf(Array);
    expect(result.relationships).toBeInstanceOf(Array);
    expect(result.dependencies).toBeInstanceOf(Array);
    expect(result.llmMetadata).toBeDefined();
    expect(result.metadata).toBeDefined();
    
    console.log(`✅ Test 1 completed: ${result.entities.length} entities, ${result.relationships.length} relationships`);
    
    // Wait for Ollama to be ready for next request
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);

  // Test 2: Empty text handling
  it('2. Empty text handling', async () => {
    console.log('🧪 Running test 2: Empty text handling...');
    
    const text = '';
    const result = await extractor.extractEntitiesAndRelations(text, context);
    
    expect(result.entities).toHaveLength(0);
    expect(result.relationships).toHaveLength(0);
    
    console.log('✅ Test 2 completed: Empty text handled correctly');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);

  // Test 3: Confidence thresholds
  it('3. Confidence threshold filtering', async () => {
    console.log('🧪 Running test 3: Confidence thresholds...');
    
    const highThresholdExtractor = new LLMBasedExtractor({
      provider: 'ollama',
      model: 'qwen3:1.7b',
      entityConfidenceThreshold: 0.8,
      relationshipConfidenceThreshold: 0.8
    });

    const text = 'Alice Johnson works at TechCorp.';
    const result = await highThresholdExtractor.extractEntitiesAndRelations(text, context);
    
    // All entities and relationships should meet the high threshold
    result.entities.forEach(entity => {
      expect(entity.confidence).toBeGreaterThanOrEqual(0.8);
    });
    
    result.relationships.forEach(relationship => {
      expect(relationship.confidence).toBeGreaterThanOrEqual(0.8);
    });
    
    console.log(`✅ Test 3 completed: ${result.entities.length} high-confidence entities, ${result.relationships.length} high-confidence relationships`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);

  // Test 4: Custom prompts
  it('4. Custom extraction prompts', async () => {
    console.log('🧪 Running test 4: Custom prompts...');
    
    const customExtractor = new LLMBasedExtractor({
      provider: 'ollama',
      model: 'qwen3:1.7b',
      customPrompts: {
        entityExtraction: 'Focus on technical roles and companies',
        relationshipExtraction: 'Focus on employment relationships'
      }
    });

    const text = 'Alice Johnson is a software engineer at TechCorp.';
    const result = await customExtractor.extractEntitiesAndRelations(text, context);
    
    expect(result).toBeDefined();
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.relationships.length).toBeGreaterThan(0);
    
    console.log(`✅ Test 4 completed: Custom prompts extracted ${result.entities.length} entities and ${result.relationships.length} relationships`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);

  // Test 5: Error handling
  it('5. Error handling with invalid model', async () => {
    console.log('🧪 Running test 5: Error handling...');
    
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
    
    console.log('✅ Test 5 completed: Error handling works correctly');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);

  // Test 6: Performance metrics
  it('6. Performance metrics and metadata', async () => {
    console.log('🧪 Running test 6: Performance metrics...');
    
    const text = 'Alice Johnson works at TechCorp.';
    const result = await extractor.extractEntitiesAndRelations(text, context);
    
    expect(result.metadata.totalProcessingTime).toBeGreaterThan(0);
    expect(result.llmMetadata.processingTime).toBeGreaterThan(0);
    expect(result.metadata.methodsUsed).toContain('llm_entity_extraction');
    expect(result.metadata.methodsUsed).toContain('llm_relationship_extraction');
    expect(result.llmMetadata.provider).toBe('ollama');
    expect(result.llmMetadata.model).toBe('qwen3:1.7b');
    
    console.log(`✅ Test 6 completed: Processing time ${result.metadata.totalProcessingTime}ms, LLM time ${result.llmMetadata.processingTime}ms`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);

  // Test 7: Complex text extraction
  it('7. Complex text with multiple entities and relationships', async () => {
    console.log('🧪 Running test 7: Complex text extraction...');
    
    const complexText = `
      Dr. Sarah Chen is a senior researcher at MIT's Computer Science department. 
      She leads the artificial intelligence lab and collaborates with Dr. Michael Rodriguez 
      from Stanford University on machine learning projects. Sarah previously worked at 
      Google DeepMind in London where she developed neural network architectures for 
      natural language processing. She holds a PhD from Carnegie Mellon University and 
      has published over 50 papers on AI and machine learning.
    `;
    
    const result = await extractor.extractEntitiesAndRelations(complexText, context);
    
    expect(result.entities.length).toBeGreaterThan(3); // Should extract multiple entities
    expect(result.relationships.length).toBeGreaterThan(2); // Should extract multiple relationships
    
    console.log(`✅ Test 7 completed: Complex text extracted ${result.entities.length} entities and ${result.relationships.length} relationships`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 60000);
});
