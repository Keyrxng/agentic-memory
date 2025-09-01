/**
 * Data seeding utilities for the Agentic Memory System
 * Handles loading initial data from JSONL files and populating the memory system
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AgentGraphMemory } from '../agent/memory.js';
import type { GraphContext } from '../core/types.js';

/**
 * Memory entry format for JSONL seeding
 */
export interface MemoryEntry {
  content: string;
  sessionId?: string;
  userId?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
}

/**
 * Seed the memory system with data from a JSONL file
 * @param memory - The AgentGraphMemory instance to seed
 * @param filePath - Path to the JSONL file (relative to project root)
 * @param options - Seeding options
 */
export async function seedMemoryFromJSONL(
  memory: AgentGraphMemory,
  filePath: string = 'data/memories.jsonl',
  options: {
    clearExisting?: boolean;
    batchSize?: number;
    delayBetweenBatches?: number;
    verbose?: boolean;
  } = {}
): Promise<{
  success: boolean;
  totalProcessed: number;
  totalEntities: number;
  totalRelationships: number;
  errors: string[];
}> {
  const {
    clearExisting = false,
    batchSize = 10,
    delayBetweenBatches = 100,
    verbose = true
  } = options;

  const result = {
    success: false,
    totalProcessed: 0,
    totalEntities: 0,
    totalRelationships: 0,
    errors: [] as string[]
  };

  try {
    // Check if file exists
    const fullPath = join(process.cwd(), filePath);
    if (!existsSync(fullPath)) {
      result.errors.push(`Seed file not found: ${fullPath}`);
      return result;
    }

    if (verbose) {
      console.log(`🌱 Starting memory seeding from: ${fullPath}`);
    }

    // Read and parse JSONL file
    const fileContent = readFileSync(fullPath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(line => line.trim());

    if (lines.length === 0) {
      result.errors.push('JSONL file is empty');
      return result;
    }

    if (verbose) {
      console.log(`📄 Found ${lines.length} memory entries to process`);
    }

    // Process entries in batches
    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize);

      for (const line of batch) {
        try {
          const entry: MemoryEntry = JSON.parse(line.trim());

          // Create context for this memory
          const context: GraphContext = {
            sessionId: entry.sessionId || 'seed-session',
            userId: entry.userId || 'seed-user',
            timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
            source: 'seed-data',
            relevantEntities: []
          };

          // Add memory to the system
          const addResult = await memory.addMemory(entry.content, context);

          result.totalProcessed++;
          result.totalEntities += addResult.metadata.entitiesExtracted;
          result.totalRelationships += addResult.metadata.relationshipsExtracted;

          if (verbose && result.totalProcessed % 10 === 0) {
            console.log(`📊 Processed ${result.totalProcessed}/${lines.length} memories`);
          }

        } catch (parseError) {
          const errorMsg = `Failed to parse line ${i + batch.indexOf(line) + 1}: ${parseError}`;
          result.errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < lines.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    result.success = true;

    if (verbose) {
      console.log(`✅ Memory seeding completed successfully!`);
      console.log(`📈 Summary:`);
      console.log(`   - Memories processed: ${result.totalProcessed}`);
      console.log(`   - Entities extracted: ${result.totalEntities}`);
      console.log(`   - Relationships created: ${result.totalRelationships}`);
      if (result.errors.length > 0) {
        console.log(`   - Errors encountered: ${result.errors.length}`);
      }
    }

  } catch (error) {
    const errorMsg = `Failed to seed memory: ${error}`;
    result.errors.push(errorMsg);
    console.error(`❌ ${errorMsg}`);
  }

  return result;
}

/**
 * Create a delay utility for batch processing
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
