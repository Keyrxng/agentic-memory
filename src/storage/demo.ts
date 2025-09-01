/**
 * Storage module demonstration
 *
 * This script demonstrates the key features of the storage module:
 * - JSONL-based persistent storage
 * - Memory-bounded loading
 * - Backup and recovery
 * - Integration with the graph system
 */

import { createStorage, PersistentGraph } from './index.js';
import type { GraphNode, GraphEdge } from '../core/types.js';

/**
 * Demonstrate basic storage operations
 */
async function demonstrateBasicStorage(): Promise<void> {
  console.log('🧪 Demonstrating basic storage operations...\n');

  // Create storage instance
  const storage = await createStorage('./demo-data');

  // Create some sample data
  const nodes: GraphNode[] = [
    {
      id: 'person-1',
      type: 'person',
      properties: { name: 'Alice Johnson', age: 30, occupation: 'Engineer' },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'person-2',
      type: 'person',
      properties: { name: 'Bob Smith', age: 25, occupation: 'Designer' },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'company-1',
      type: 'company',
      properties: { name: 'Tech Corp', industry: 'Technology' },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const edges: GraphEdge[] = [
    {
      id: 'works-at-1',
      source: 'person-1',
      target: 'company-1',
      type: 'works_at',
      weight: 1.0,
      properties: { role: 'Senior Engineer', since: '2020' },
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'knows-1',
      source: 'person-1',
      target: 'person-2',
      type: 'knows',
      weight: 0.8,
      properties: { context: 'colleagues' },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  // Store data
  console.log('📝 Storing nodes and edges...');
  const nodeResult = await storage.storeNodes(nodes);
  const edgeResult = await storage.storeEdges(edges);

  console.log(`✅ Stored ${nodeResult.count} nodes and ${edgeResult.count} edges\n`);

  // Load data back
  console.log('📖 Loading data back...');
  const { nodes: loadedNodes } = await storage.loadNodes({ limit: 10 });
  const { edges: loadedEdges } = await storage.loadEdges({ limit: 10 });

  console.log(`✅ Loaded ${loadedNodes.length} nodes and ${loadedEdges.length} edges\n`);

  // Get storage stats
  console.log('📊 Storage statistics:');
  const stats = await storage.getStats();
  console.log(`   - Total nodes: ${stats.totalNodes}`);
  console.log(`   - Total edges: ${stats.totalEdges}`);
  console.log(`   - Storage size: ${stats.storageSize} bytes`);
  console.log(`   - Files: ${stats.files.length}\n`);

  // Create backup
  console.log('💾 Creating backup...');
  await storage.createBackup('demo-backup');
  console.log('✅ Backup created\n');

  // Cleanup
  await storage.close();
}

/**
 * Demonstrate persistent graph operations
 */
async function demonstratePersistentGraph(): Promise<void> {
  console.log('🔄 Demonstrating persistent graph operations...\n');

  // Create persistent graph with storage enabled
  const persistentGraph = new PersistentGraph({
    storage: {
      persistToDisk: true,
      syncInterval: 30000,
      storageDirectory: './demo-graph-data',
      compressionEnabled: false,
      enabled: true,
      maxMemoryUsage: 100 * 1024 * 1024 // 100MB
    }
  });

  // Initialize (this will create/load storage)
  await persistentGraph.initialize();

  // Add some data
  console.log('📝 Adding data to persistent graph...');
  await persistentGraph.addNode({
    type: 'person',
    properties: { name: 'Charlie Brown', age: 35 }
  });

  await persistentGraph.addNode({
    type: 'person',
    properties: { name: 'Diana Prince', age: 28 }
  });

  const companyId = await persistentGraph.addNode({
    type: 'company',
    properties: { name: 'Wonder Industries' }
  });

  // Add relationships
  await persistentGraph.addEdge({
    source: 'person-1', // This will be auto-generated, but for demo we'll use a simple approach
    target: companyId,
    type: 'works_at',
    weight: 1.0,
    properties: { role: 'Employee' }
  });

  console.log('✅ Data added to persistent graph\n');

  // Get metrics
  console.log('📊 Graph metrics:');
  const metrics = persistentGraph.getMetrics();
  console.log(`   - Nodes: ${metrics.nodeCount}`);
  console.log(`   - Edges: ${metrics.edgeCount}`);
  console.log(`   - Pending changes: ${metrics.storageMetrics.pendingChanges}`);
  console.log(`   - Storage enabled: ${metrics.storageMetrics.storageEnabled}\n`);

  // Force sync to storage
  console.log('🔄 Syncing to storage...');
  await persistentGraph.syncToStorage();
  console.log('✅ Synced to storage\n');

  // Create backup
  console.log('💾 Creating graph backup...');
  await persistentGraph.createBackup('graph-demo-backup');
  console.log('✅ Graph backup created\n');

  // Cleanup
  await persistentGraph.close();
}

/**
 * Main demonstration function
 */
async function main(): Promise<void> {
  console.log('🚀 Storage Module Demonstration\n');
  console.log('=' .repeat(50) + '\n');

  try {
    // Demonstrate basic storage
    await demonstrateBasicStorage();

    console.log('=' .repeat(50) + '\n');

    // Demonstrate persistent graph
    await demonstratePersistentGraph();

    console.log('=' .repeat(50) + '\n');
    console.log('🎉 Storage module demonstration completed successfully!');

  } catch (error) {
    console.error('❌ Demonstration failed:', error);
    process.exit(1);
  }
}

// Run demonstration if this file is executed directly
if (import.meta.main) {
  main();
}
