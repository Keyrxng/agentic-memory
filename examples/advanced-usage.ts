/**
 * Advanced Usage Examples for GraphRAG Agentic Memory System
 * 
 * This file demonstrates sophisticated scenarios and advanced features
 * of the agentic memory system for real-world applications.
 */

import { AgentGraphMemory } from '../src/agent/memory.js';
import type { GraphContext } from '../src/core/types.js';

/**
 * Example 1: Building a Coding Assistant Memory
 * 
 * Demonstrates how to build memory for an AI coding partner that understands
 * project structure, team dynamics, and technical decisions.
 */
async function codingAssistantExample() {
  console.log('🔧 Coding Assistant Memory Example\n');
  
  const memory = new AgentGraphMemory({
    memory: { maxMemoryNodes: 1000, evictionStrategy: 'lru', persistenceEnabled: false },
    extraction: { entityConfidenceThreshold: 0.75, relationshipConfidenceThreshold: 0.6, maxEntitiesPerText: 50 }
  });

  const context: GraphContext = {
    userId: 'developer-1',
    sessionId: 'coding-session',
    timestamp: new Date(),
    relevantEntities: [],
    source: 'development'
  };

  // Learn about the codebase and team
  const projectInfo = [
    "The React frontend uses TypeScript and is deployed on Vercel.",
    "The backend API is built with Node.js and Express, hosted on AWS Lambda.",
    "Sarah leads the frontend team and has expertise in React performance optimization.",
    "Mike handles DevOps and maintains the CI/CD pipeline using GitHub Actions.",
    "The database uses PostgreSQL with Prisma ORM for type-safe queries.",
    "We follow clean architecture principles with dependency injection.",
    "The authentication system uses JWT tokens with refresh token rotation.",
    "Performance monitoring is handled by DataDog with custom metrics."
  ];

  console.log('📚 Learning about the codebase...');
  for (const info of projectInfo) {
    await memory.addMemory(info, context);
  }

  // Simulate technical discussions
  const technicalDecisions = [
    "Sarah decided to implement React Query for better state management and caching.",
    "Mike configured automatic scaling based on CPU usage and request latency.",
    "The team chose to use Zod for runtime type validation in API endpoints.",
    "We migrated from REST to GraphQL for more efficient data fetching.",
    "The frontend build time was optimized from 5 minutes to 2 minutes using esbuild."
  ];

  console.log('💡 Learning from technical discussions...');
  for (const decision of technicalDecisions) {
    await memory.addMemory(decision, context);
  }

  // Query the memory for coding assistance
  const queries = [
    "What technologies are we using for the frontend?",
    "Who should I ask about deployment issues?",
    "What performance optimizations have been implemented?",
    "What are our current technology choices and who made them?"
  ];

  console.log('\n🤖 Coding Assistant Queries:');
  for (const query of queries) {
    const result = await memory.queryMemory(query, context);
    console.log(`\nQ: ${query}`);
    console.log(`A: Found ${result.entities.length} relevant entities with ${result.relationships.length} connections`);
    
    // Show relevant people and technologies
    const people = result.entities.filter(e => e.type === 'person');
    const tech = result.entities.filter(e => e.type === 'concept' || e.type === 'organization');
    
    if (people.length > 0) {
      console.log(`   👥 People: ${people.map(p => p.properties.name).join(', ')}`);
    }
    if (tech.length > 0) {
      console.log(`   💻 Technologies: ${tech.map(t => t.properties.name).slice(0, 3).join(', ')}`);
    }
  }

  memory.clear();
  console.log('\n✅ Coding Assistant Example Complete\n');
}

/**
 * Example 2: Business Intelligence Memory
 * 
 * Demonstrates building memory for business operations, relationships,
 * and strategic decisions in a corporate environment.
 */
async function businessIntelligenceExample() {
  console.log('💼 Business Intelligence Memory Example\n');
  
  const memory = new AgentGraphMemory({
    memory: { maxMemoryNodes: 2000, evictionStrategy: 'lru', persistenceEnabled: false },
    extraction: { entityConfidenceThreshold: 0.8, relationshipConfidenceThreshold: 0.6, maxEntitiesPerText: 40 }
  });

  const context: GraphContext = {
    userId: 'business-analyst',
    sessionId: 'bi-session',
    timestamp: new Date(),
    relevantEntities: [],
    source: 'business_intelligence'
  };

  // Learn about business structure and relationships
  const businessInfo = [
    "TechCorp acquired StartupAI for $50 million to enhance their machine learning capabilities.",
    "The Q4 revenue increased by 25% year-over-year, driven by enterprise sales growth.",
    "Jennifer Martinez was promoted to VP of Sales after leading the European expansion.",
    "The company launched three new product lines targeting the healthcare vertical.",
    "Partnership with Microsoft Azure provides cloud infrastructure for 70% of our services.",
    "Customer satisfaction scores improved from 4.2 to 4.7 after the UX redesign project.",
    "The London office opened with 50 employees focusing on GDPR compliance and EU sales.",
    "R&D spending increased to 15% of revenue, focusing on AI and automation technologies."
  ];

  console.log('📈 Learning business context...');
  for (const info of businessInfo) {
    await memory.addMemory(info, context);
  }

  // Add competitive intelligence
  const competitiveInfo = [
    "Competitor DataTech raised $100M Series C led by Andreessen Horowitz.",
    "Google announced a competing product in the same market segment.",
    "Industry report shows 40% market share for cloud-based solutions.",
    "Key differentiator is our proprietary real-time analytics engine.",
    "Enterprise customers prefer our solution due to better security features."
  ];

  console.log('🎯 Learning competitive landscape...');
  for (const info of competitiveInfo) {
    await memory.addMemory(info, context);
  }

  // Business intelligence queries
  const biQueries = [
    "What are our key competitive advantages?",
    "Who leads our sales organization?",
    "What recent acquisitions have we made?",
    "How is our financial performance trending?",
    "What partnerships do we have in place?"
  ];

  console.log('\n📊 Business Intelligence Queries:');
  for (const query of biQueries) {
    const result = await memory.queryMemory(query, context, { maxDepth: 3 });
    console.log(`\nQ: ${query}`);
    console.log(`A: Found ${result.entities.length} insights across ${result.subgraph.nodes.length} connected entities`);
    
    // Extract key insights
    const organizations = result.entities.filter(e => e.type === 'organization');
    const people = result.entities.filter(e => e.type === 'person');
    const concepts = result.entities.filter(e => e.type === 'concept');
    
    if (organizations.length > 0) {
      console.log(`   🏢 Organizations: ${organizations.map(o => o.properties.name).slice(0, 3).join(', ')}`);
    }
    if (people.length > 0) {
      console.log(`   👤 Key People: ${people.map(p => p.properties.name).slice(0, 2).join(', ')}`);
    }
    if (concepts.length > 0) {
      console.log(`   💡 Key Concepts: ${concepts.map(c => c.properties.name).slice(0, 3).join(', ')}`);
    }
  }

  memory.clear();
  console.log('\n✅ Business Intelligence Example Complete\n');
}

/**
 * Example 3: Personal Assistant Memory
 * 
 * Demonstrates building sophisticated memory for a personal AI assistant
 * that tracks relationships, preferences, and personal context.
 */
async function personalAssistantExample() {
  console.log('👤 Personal Assistant Memory Example\n');
  
  const memory = new AgentGraphMemory({
    memory: { maxMemoryNodes: 1500, evictionStrategy: 'temporal', persistenceEnabled: false },
    extraction: { entityConfidenceThreshold: 0.7, relationshipConfidenceThreshold: 0.6, maxEntitiesPerText: 50 },
    resolution: { fuzzyThreshold: 0.85, enablePhonetic: true }
  });

  const context: GraphContext = {
    userId: 'user-personal',
    sessionId: 'personal-assistant',
    timestamp: new Date(),
    relevantEntities: [],
    source: 'personal_conversation'
  };

  // Learn personal context and relationships
  const personalInfo = [
    "My wife Emily works as a pediatrician at Children's Hospital downtown.",
    "Our daughter Sophie is 8 years old and loves piano lessons on Wednesdays.",
    "I have a meeting with the Johnson account team every Tuesday at 2 PM.",
    "My favorite coffee shop is Blue Bottle on Market Street.",
    "Mom's birthday is coming up on March 15th, she loves gardening books.",
    "The dentist appointment is scheduled for next Friday at 10 AM with Dr. Smith.",
    "I'm allergic to shellfish and prefer Mediterranean cuisine.",
    "The car needs an oil change every 5,000 miles, last done at 45,000 miles."
  ];

  console.log('🏠 Learning personal context...');
  for (const info of personalInfo) {
    await memory.addMemory(info, context);
  }

  // Add preferences and habits
  const preferences = [
    "I prefer morning workouts at 6 AM before the family wakes up.",
    "Amazon deliveries should go to the office address during weekdays.",
    "Weekend family time is sacred - no work calls unless emergency.",
    "I like to read business books during my commute on the train.",
    "Anniversary dinner reservation at Chez Laurent needs to be made two weeks ahead."
  ];

  console.log('⚙️ Learning preferences and habits...');
  for (const pref of preferences) {
    await memory.addMemory(pref, context);
  }

  // Personal assistant queries
  const personalQueries = [
    "What do I need to remember about my family?",
    "When are my regular appointments?",
    "What are my dietary restrictions?",
    "What should I know about upcoming birthdays?",
    "What are my preferences for scheduling?"
  ];

  console.log('\n🤖 Personal Assistant Queries:');
  for (const query of personalQueries) {
    const result = await memory.queryMemory(query, context, { maxResults: 8 });
    console.log(`\nQ: ${query}`);
    console.log(`A: Recalled ${result.entities.length} relevant details`);
    
    // Show personal insights
    for (const entity of result.entities.slice(0, 3)) {
      const relevance = result.metadata.relevanceScores.get(entity.id) || 0;
      if (relevance > 0.3) {
        console.log(`   • ${entity.properties.name || entity.id} (${(relevance * 100).toFixed(0)}% relevant)`);
      }
    }
  }

  memory.clear();
  console.log('\n✅ Personal Assistant Example Complete\n');
}

/**
 * Example 4: Learning and Adaptation
 * 
 * Demonstrates how the memory system learns and adapts over time,
 * showing entity resolution and relationship evolution.
 */
async function learningAdaptationExample() {
  console.log('🧠 Learning and Adaptation Example\n');
  
  const memory = new AgentGraphMemory({
    memory: { maxMemoryNodes: 500, evictionStrategy: 'lru', persistenceEnabled: false }
  });

  const context: GraphContext = {
    userId: 'learning-demo',
    sessionId: 'adaptation-demo',
    timestamp: new Date(),
    relevantEntities: [],
    source: 'learning_demo'
  };

  console.log('📚 Initial learning phase...');
  
  // Initial information
  await memory.addMemory("John is a developer.", context);
  let metrics = memory.getMetrics();
  console.log(`   Initial: ${metrics.nodeCount} entities`);

  // Add more specific information
  await memory.addMemory("John Smith works as a senior software engineer.", context);
  metrics = memory.getMetrics();
  console.log(`   After detail: ${metrics.nodeCount} entities (entity resolution working)`);

  // Add relationship information
  await memory.addMemory("John Smith leads the backend team at our company.", context);
  metrics = memory.getMetrics();
  console.log(`   After relationships: ${metrics.nodeCount} entities, ${metrics.edgeCount} relationships`);

  // Show learning progression
  const query = "Tell me about John";
  const result = await memory.queryMemory(query, context);
  
  console.log(`\n🔍 Query: "${query}"`);
  console.log(`   Found ${result.entities.length} entities about John`);
  
  for (const entity of result.entities) {
    if (entity.properties.name && entity.properties.name.toLowerCase().includes('john')) {
      console.log(`   • ${entity.properties.name} (${entity.type})`);
      console.log(`     Properties: ${Object.keys(entity.properties).length} attributes`);
    }
  }

  memory.clear();
  console.log('\n✅ Learning and Adaptation Example Complete\n');
}

/**
 * Run all advanced examples
 */
async function runAdvancedExamples() {
  console.log('🚀 GraphRAG Agentic Memory - Advanced Examples\n');
  console.log('=' + '='.repeat(60) + '\n');

  try {
    await codingAssistantExample();
    await businessIntelligenceExample();
    await personalAssistantExample();
    await learningAdaptationExample();
    
    console.log('🎉 All Advanced Examples Completed Successfully!\n');
    console.log('These examples demonstrate the sophisticated capabilities of the');
    console.log('GraphRAG agentic memory system for real-world AI assistant applications.\n');
    
  } catch (error) {
    console.error('❌ Example failed:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (import.meta.main) {
  runAdvancedExamples();
}

export {
  codingAssistantExample,
  businessIntelligenceExample,
  personalAssistantExample,
  learningAdaptationExample
};
