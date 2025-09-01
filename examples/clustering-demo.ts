/**
 * Demonstration of the semantic memory clustering functionality
 * This script shows how to use the AgentGraphMemory system with clustering
 * Uses mock embeddings for demonstration purposes
 */

import { AgentGraphMemory } from '../src/agent/memory.js';

// Mock embeddings generator for demonstration
function generateMockEmbeddings(text: string): Float32Array {
  // Simple hash-based mock embeddings (not for production use)
  const hash = text.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);

  const embeddings = new Float32Array(128);
  for (let i = 0; i < 128; i++) {
    embeddings[i] = Math.sin(hash + i) * 0.5 + 0.5; // Normalize to 0-1
  }

  return embeddings;
}

async function demonstrateClustering() {
  console.log('🚀 Starting Semantic Memory Clustering Demo\n');

  // Initialize the memory system
  const memory = new AgentGraphMemory({
    memory: {
      maxMemoryNodes: 1000,
      evictionStrategy: 'lru',
      persistenceEnabled: false
    }
  });

  await memory.initialize();

  // Sample content about different topics
  const sampleMemories = [
    // Tech companies and AI
    "Alice works at Google as a software engineer specializing in machine learning.",
    "Bob is a data scientist at Microsoft working on Azure AI services.",
    "Charlie leads the AI research team at OpenAI developing GPT models.",
    "Diana is a researcher at DeepMind focusing on reinforcement learning.",

    // Academic and research
    "Dr. Sarah Chen teaches computer science at Stanford University.",
    "Professor Mike Johnson conducts research in natural language processing at MIT.",
    "Dr. Lisa Wang is a postdoctoral researcher at Carnegie Mellon studying AI ethics.",

    // Business and startups
    "Tom founded a startup that uses AI for healthcare diagnostics.",
    "Emma is a product manager at a fintech company implementing AI for fraud detection.",
    "James runs a consulting firm specializing in AI strategy for enterprises.",

    // Personal connections
    "Alice and Bob collaborated on a machine learning project last year.",
    "Charlie and Dr. Sarah Chen co-authored a paper on transformer architectures.",
    "Diana and Professor Mike Johnson worked together at a conference."
  ];

  console.log('📝 Adding sample memories with mock embeddings...\n');

  // Add memories with mock embeddings
  for (const content of sampleMemories) {
    try {
      // Generate mock embeddings for the content
      const embeddings = generateMockEmbeddings(content);

      const result = await memory.addMemory(content, {
        userId: 'demo-user',
        sessionId: 'clustering-demo',
        timestamp: new Date(),
        relevantEntities: [],
        source: 'demo'
      }, {
        embeddings: embeddings
      });

      console.log(`✅ Added: "${content.substring(0, 50)}..." (${result.entities.length} entities, ${result.relationships.length} relationships)`);
    } catch (error) {
      console.log(`⚠️  Failed to add: "${content.substring(0, 50)}..." - ${error.message}`);
    }
  }

  console.log('\n🔍 Creating semantic clusters...\n');

  // Create clusters
  const clusters = await memory.createClusters({
    enabled: true,
    similarityThreshold: 0.6,
    maxClusters: 5,
    minClusterSize: 2,
    clusteringAlgorithm: 'kmeans'
  });

  console.log(`📊 Created ${clusters.length} clusters:\n`);

  // Display cluster information
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    console.log(`Cluster ${i + 1}: ${cluster.theme}`);
    console.log(`  - Members: ${cluster.members.length}`);
    console.log(`  - Confidence: ${(cluster.confidence * 100).toFixed(1)}%`);
    console.log(`  - Sample entities: ${cluster.members.slice(0, 3).map(m => m.properties.name).join(', ')}`);
    console.log('');
  }

  // Demonstrate cluster-based querying
  console.log('🔍 Testing cluster-based memory retrieval...\n');

  const queryEmbedding = generateMockEmbeddings("Tell me about AI researchers and their work");

  // Find related clusters
  const relatedClusters = await memory.findRelatedClusters(
    queryEmbedding,
    clusters,
    3
  );

  console.log(`Found ${relatedClusters.length} related clusters for query about AI researchers:\n`);

  for (let i = 0; i < relatedClusters.length; i++) {
    const cluster = relatedClusters[i];
    console.log(`Related Cluster ${i + 1}: ${cluster.theme}`);
    console.log(`  - Relevance: High`);
    console.log(`  - Key entities: ${cluster.members.map(m => m.properties.name).join(', ')}`);
    console.log('');
  }

  // Demonstrate contextual memory retrieval
  console.log('🎯 Testing contextual memory retrieval...\n');

  const conversationHistory = [
    { role: 'user', content: 'I need to find experts in machine learning' },
    { role: 'assistant', content: 'I can help you find machine learning experts from our knowledge base.' },
    { role: 'user', content: 'Are there any researchers working on AI ethics?' }
  ];

  const contextualMemories = await memory.getContextualMemories(conversationHistory, 5);

  console.log(`Retrieved ${contextualMemories.length} contextual memories for conversation about ML experts and AI ethics:\n`);

  for (const memory of contextualMemories) {
    console.log(`- ${memory.properties.name} (${memory.type})`);
  }

  console.log('\n✨ Demo completed successfully!');
  console.log(`\n📈 Memory system metrics:`);
  const metrics = memory.getMetrics();
  console.log(`- Total nodes: ${metrics.memoryMetrics.totalNodes}`);
  console.log(`- Total edges: ${metrics.memoryMetrics.totalEdges}`);
  console.log(`- Memory bound: ${metrics.memoryMetrics.memoryBound}`);
}

// Run the demo
demonstrateClustering().catch(console.error);
