/**
 * Main server entry point for the Agentic Memory HTTP Server
 * 
 * Serves the agentic memory system over HTTP using Hono framework.
 * Provides REST API endpoints for the UI to interact with the memory graph.
 */

import { serve } from '@hono/node-server';
import app, { memory } from './api.js';
import { seedMemoryFromJSONL } from './seed.js';

// Configuration
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '127.0.0.1';

console.log(`🧠 Starting Agentic Memory Server...`);
console.log(`📡 Server will be available at http://${HOST}:${PORT}`);
console.log(`🔗 API endpoints:`);
console.log(`   GET  /api/health - Health check`);
console.log(`   GET  /api/graph - Complete graph data`);
console.log(`   GET  /api/metrics - System metrics`);
console.log(`   POST /api/memory - Add memory`);
console.log(`   POST /api/query - Query memory`);
console.log(`   POST /api/memory/bulk - Add bulk memories`);
console.log(`   GET  /api/search - Search content`);
console.log(`   GET  /api/graph/subgraph/:nodeId - Get subgraph`);
console.log(`   GET  /api/nodes/:nodeId - Get node details`);
console.log(`   DELETE /api/memory/clear - Clear memory`);

// Seed the memory system with initial data
console.log(`🌱 Initializing memory system...`);
memory.initialize().then(() => {
  console.log(`✅ Memory system initialized with persistence enabled`);
  
  console.log(`🌱 Seeding memory system with initial data...`);
  return seedMemoryFromJSONL(memory, 'data/memories.jsonl', {
    clearExisting: false, // Don't clear existing data on restart
    batchSize: 5, // Process 5 memories at a time
    delayBetweenBatches: 200, // 200ms delay between batches
    verbose: true
  });
}).then((seedResult) => {
  if (seedResult.success) {
    console.log(`✅ Memory seeding completed!`);
    console.log(`📊 Loaded ${seedResult.totalProcessed} memories`);
    console.log(`🏗️  Created ${seedResult.totalEntities} entities and ${seedResult.totalRelationships} relationships`);
  } else {
    console.log(`⚠️  Memory seeding completed with errors:`);
    seedResult.errors.forEach(error => console.log(`   - ${error}`));
  }

  // Start the server
  serve({
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  }, (info) => {
    console.log(`✅ Agentic Memory Server is running on http://${info.address}:${info.port}`);
    console.log(`🚀 Ready to serve memory data to your UI!`);
    console.log(`📈 Memory system initialized with seeded data and persistence enabled`);
  });
}).catch((error) => {
  console.error(`❌ Failed to initialize memory system:`, error);
  console.log(`🚀 Starting server anyway...`);

  // Start the server even if initialization fails
  serve({
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  }, (info) => {
    console.log(`✅ Agentic Memory Server is running on http://${info.address}:${info.port}`);
    console.log(`🚀 Ready to serve memory data to your UI!`);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Agentic Memory Server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Agentic Memory Server...');
  process.exit(0);
});
