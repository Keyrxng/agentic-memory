#!/usr/bin/env bun

/**
 * Indexing System Demo
 *
 * Demonstrates the multi-modal indexing capabilities of the GraphRAG system:
 * - Label indexing for node type filtering
 * - Property indexing for attribute queries
 * - Text indexing for full-text search
 * - Vector indexing for similarity search
 * - Pattern indexing for graph pattern matching
 */

import { LabelIndex, PropertyIndex, TextIndex, VectorIndex, PatternIndex } from './index.js';
import type { GraphPattern, PatternNode, PatternEdge } from './pattern-index.js';

console.log('🚀 GraphRAG Indexing System Demo\n');

// Sample graph data
const sampleNodes = [
  { id: 'user_1', type: 'User', properties: { name: 'Alice', age: 30, role: 'developer' }, content: 'Alice is a senior developer with 5 years experience' },
  { id: 'user_2', type: 'User', properties: { name: 'Bob', age: 25, role: 'designer' }, content: 'Bob is a UI/UX designer specializing in mobile apps' },
  { id: 'project_1', type: 'Project', properties: { name: 'GraphRAG', status: 'active', priority: 'high' }, content: 'GraphRAG is an agentic memory system for knowledge graphs' },
  { id: 'project_2', type: 'Project', properties: { name: 'AI Chat', status: 'planning', priority: 'medium' }, content: 'AI Chat is a conversational AI platform' },
  { id: 'task_1', type: 'Task', properties: { title: 'Implement indexing', status: 'in_progress', assignee: 'user_1' }, content: 'Implement multi-modal indexing system for efficient queries' },
  { id: 'task_2', type: 'Task', properties: { title: 'Add vector search', status: 'pending', assignee: 'user_2' }, content: 'Add vector similarity search capabilities' }
];

const sampleEdges = [
  { id: 'edge_1', from: 'user_1', to: 'project_1', type: 'works_on', properties: { role: 'lead' } },
  { id: 'edge_2', from: 'user_2', to: 'project_1', type: 'works_on', properties: { role: 'contributor' } },
  { id: 'edge_3', from: 'user_1', to: 'task_1', type: 'assigned_to', properties: { priority: 'high' } },
  { id: 'edge_4', from: 'user_2', to: 'task_2', type: 'assigned_to', properties: { priority: 'medium' } }
];

async function demoLabelIndex() {
  console.log('📊 Label Index Demo');
  console.log('==================');

  const labelIndex = new LabelIndex();

  // Index nodes by type
  for (const node of sampleNodes) {
    labelIndex.add(node.type, node.id);
  }

  // Query for all User nodes
  const users = labelIndex.query('User');
  console.log(`Found ${users.size} users:`, Array.from(users));

  // Query for all Project nodes
  const projects = labelIndex.query('Project');
  console.log(`Found ${projects.size} projects:`, Array.from(projects));

  // Query for all Task nodes
  const tasks = labelIndex.query('Task');
  console.log(`Found ${tasks.size} tasks:`, Array.from(tasks));

  console.log('Stats:', labelIndex.getStats());
  console.log();
}

async function demoPropertyIndex() {
  console.log('🔍 Property Index Demo');
  console.log('=====================');

  const propertyIndex = new PropertyIndex();

  // Index nodes by properties
  for (const node of sampleNodes) {
    // Index each property separately
    for (const [key, value] of Object.entries(node.properties)) {
      propertyIndex.add(key, node.id, { value });
    }
  }

  // Query by exact property match
  const developers = propertyIndex.query({ property: 'role', operator: 'eq', value: 'developer' });
  console.log(`Found ${developers.size} developers:`, Array.from(developers));

  // Query by age range
  const youngUsers = propertyIndex.query({ property: 'age', operator: 'gte', value: 20 });
  console.log(`Found ${youngUsers.size} users aged 20+:`, Array.from(youngUsers));

  // Query by status
  const activeProjects = propertyIndex.query({ property: 'status', operator: 'eq', value: 'active' });
  console.log(`Found ${activeProjects.size} active projects:`, Array.from(activeProjects));

  console.log('Stats:', propertyIndex.getStats());
  console.log();
}

async function demoTextIndex() {
  console.log('📝 Text Index Demo');
  console.log('=================');

  const textIndex = new TextIndex();

  // Index node content
  for (const node of sampleNodes) {
    textIndex.add(node.content, node.id);
  }

  // Search for "developer"
  const developerResults = textIndex.query('developer');
  console.log(`Found ${developerResults.size} items mentioning "developer":`, Array.from(developerResults));

  // Search for "AI"
  const aiResults = textIndex.query('AI');
  console.log(`Found ${aiResults.size} items mentioning "AI":`, Array.from(aiResults));

  // Fuzzy search for "graph"
  const graphResults = textIndex.query('graph', { threshold: 0.6 });
  console.log(`Found ${graphResults.size} items related to "graph":`, Array.from(graphResults));

  console.log('Stats:', textIndex.getStats());
  console.log();
}

async function demoVectorIndex() {
  console.log('🔗 Vector Index Demo');
  console.log('===================');

  const vectorIndex = new VectorIndex();

  // Create sample embeddings (normally these would come from an embedding model)
  const embeddings = new Map<string, Float32Array>();
  embeddings.set('user_1', new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]));
  embeddings.set('user_2', new Float32Array([0.2, 0.3, 0.4, 0.5, 0.6]));
  embeddings.set('project_1', new Float32Array([0.3, 0.4, 0.5, 0.6, 0.7]));
  embeddings.set('project_2', new Float32Array([0.4, 0.5, 0.6, 0.7, 0.8]));
  embeddings.set('task_1', new Float32Array([0.1, 0.3, 0.5, 0.7, 0.9]));
  embeddings.set('task_2', new Float32Array([0.2, 0.4, 0.6, 0.8, 1.0]));

  // Index vectors
  for (const [id, embedding] of embeddings) {
    vectorIndex.add(embedding, id);
  }

  // Find similar items to user_1
  const queryEmbedding = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
  const similar = vectorIndex.findSimilar(queryEmbedding, 3);
  console.log('Items similar to user_1:');
  similar.forEach(item => {
    console.log(`  ${item.itemId}: ${item.similarity.toFixed(3)}`);
  });

  // Query with custom parameters
  const customQuery = {
    embedding: queryEmbedding,
    threshold: 0.8,
    topK: 2,
    metric: 'cosine' as const
  };
  const customResults = vectorIndex.query(customQuery);
  console.log(`Custom query results (threshold 0.8):`, Array.from(customResults));

  console.log('Vector stats:', vectorIndex.getVectorStats());
  console.log('Index stats:', vectorIndex.getStats());
  console.log();
}

async function demoPatternIndex() {
  console.log('🎯 Pattern Index Demo');
  console.log('====================');

  const patternIndex = new PatternIndex();

  // Define some common patterns
  const patterns: Array<{id: string, pattern: GraphPattern}> = [
    {
      id: 'user_project_pattern',
      pattern: {
        nodes: {
          user: { type: 'User', variable: 'u' },
          project: { type: 'Project', variable: 'p' }
        },
        edges: [
          {
            from: 'u',
            to: 'p',
            type: 'works_on',
            direction: 'out'
          }
        ]
      }
    },
    {
      id: 'assigned_task_pattern',
      pattern: {
        nodes: {
          user: { type: 'User', variable: 'u' },
          task: { type: 'Task', variable: 't' }
        },
        edges: [
          {
            from: 'u',
            to: 't',
            type: 'assigned_to',
            direction: 'out'
          }
        ]
      }
    }
  ];

  // Index patterns
  for (const { id, pattern } of patterns) {
    patternIndex.add(pattern, id);
  }

  // Query for patterns matching User-Project relationships
  const userProjectQuery: GraphPattern = {
    nodes: {
      person: { type: 'User' },
      proj: { type: 'Project' }
    },
    edges: [
      {
        from: 'person',
        to: 'proj',
        type: 'works_on',
        direction: 'out'
      }
    ]
  };

  const matchingPatterns = patternIndex.query(userProjectQuery);
  console.log(`Found ${matchingPatterns.size} patterns matching User-Project relationship:`, Array.from(matchingPatterns));

  // Get patterns by node type
  const userPatterns = patternIndex.getPatternsByNodeType('User');
  console.log(`Found ${userPatterns.size} patterns involving User nodes:`, Array.from(userPatterns));

  // Get patterns by edge type
  const workPatterns = patternIndex.getPatternsByEdgeType('works_on');
  console.log(`Found ${workPatterns.size} patterns involving 'works_on' edges:`, Array.from(workPatterns));

  console.log('Stats:', patternIndex.getStats());
  console.log();
}

async function runDemo() {
  try {
    await demoLabelIndex();
    await demoPropertyIndex();
    await demoTextIndex();
    await demoVectorIndex();
    await demoPatternIndex();

    console.log('✅ All indexing demos completed successfully!');
  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

// Run the demo
runDemo();
