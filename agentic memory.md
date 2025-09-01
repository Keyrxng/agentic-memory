## In-Memory Graph Data Structures and Storage

### Graph Representation Strategies

**Adjacency List vs Adjacency Matrix**: For GraphRAG systems handling sparse knowledge graphs, **adjacency lists are optimal** due to superior memory efficiency and traversal performance. Adjacency lists use **O(n + m) memory** where n is nodes and m is edges, while adjacency matrices require **O(n²) memory regardless of sparsity**.[^1][^2]

**Memory breakpoint analysis** shows adjacency lists become less efficient than matrices when graph density exceeds **1/64 (approximately 1.56%)**. Since knowledge graphs are typically sparse with **density well below 1%**, adjacency lists provide significant memory advantages.[^2]

**TypeScript Implementation Pattern**:

```typescript
interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, any>;
  embeddings?: Float32Array;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  properties: Record<string, any>;
}

class InMemoryGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private adjacencyList: Map<string, GraphEdge[]> = new Map();
  private reverseAdjacencyList: Map<string, GraphEdge[]> = new Map();
}
```


### JSON Storage Optimization

**JSONL for Graph Storage**: Knowledge graphs benefit from **JSONL (JSON Lines) format** for incremental loading and streaming processing. This enables **efficient batch operations** and **memory-bounded processing** of large graphs.[^3][^4]

**Optimized JSON Structure** for GraphRAG should minimize metadata overhead and enable fast parsing:[^4]

```typescript
// Entity storage format
interface EntityRecord {
  id: string;
  type: string;
  name: string;
  properties: Record<string, any>;
  embeddings?: number[];
}

// Relationship storage format  
interface RelationshipRecord {
  id: string;
  source: string;
  target: string;
  type: string;
  confidence: number;
  properties: Record<string, any>;
}
```
## Entity Extraction and Relationship Detection

### Dependency-Based Entity Extraction

Recent research demonstrates **dependency-based approaches** can achieve **94% of LLM performance** while being **significantly more scalable**. This approach uses **industrial-grade NLP libraries** to extract entities and relationships without requiring LLM API calls.[^3]

**Implementation Strategy**:

```typescript
interface DependencyRelation {
  head: string;
  dependent: string;
  relation: string;
  confidence: number;
}

class DependencyBasedExtractor {
  async extractEntitiesAndRelations(text: string): Promise<{
    entities: EntityRecord[];
    relations: RelationshipRecord[];
  }> {
    // Parse dependency structure
    const dependencies = await this.parseDependencies(text);
    
    // Extract entities from head-dependent relations
    const entities = this.extractEntitiesFromDependencies(dependencies);
    
    // Infer relationships from syntactic patterns
    const relations = this.inferRelationships(dependencies, entities);
    
    return { entities, relations };
  }
}
```


### Entity Resolution and Duplicate Detection

**Multi-Algorithm Approach**: Combine **deterministic exact matching** with **probabilistic fuzzy matching** for robust entity resolution.[^6][^7]

**Deterministic Matching** for structured attributes:

- **Exact matching** on normalized identifiers
- **Token-based matching** using Jaccard similarity
- **Phonetic matching** using Soundex/Metaphone algorithms[^8]

**Probabilistic Matching** for ambiguous cases:

- **Fellegi-Sunter model** for probabilistic record linkage
- **Fuzzy string matching** using Levenshtein/Jaro-Winkler distance
- **Embedding-based similarity** using cosine distance[^8]

```typescript
class EntityResolver {
  private async resolveEntity(
    newEntity: EntityRecord,
    existingEntities: EntityRecord[]
  ): Promise<{ matched: EntityRecord | null; confidence: number }> {
    
    // Deterministic exact match
    const exactMatch = this.findExactMatch(newEntity, existingEntities);
    if (exactMatch) return { matched: exactMatch, confidence: 1.0 };
    
    // Probabilistic fuzzy matching
    const fuzzyMatches = existingEntities.map(entity => ({
      entity,
      confidence: this.calculateSimilarity(newEntity, entity)
    }));
    
    const bestMatch = fuzzyMatches
      .filter(match => match.confidence > 0.8)
      .sort((a, b) => b.confidence - a.confidence);
    
    return bestMatch ? bestMatch : { matched: null, confidence: 0 };
  }
}
```


## Graph Traversal and Pattern Matching

### Optimized Traversal Algorithms

**BFS vs DFS Selection**: For GraphRAG query processing, **BFS is optimal** for shortest-path queries and **relationship expansion** within distance limits. **DFS is better** for **deep path exploration** and **cycle detection** in knowledge verification.[^9][^10][^11]

**Time Complexity**: Both algorithms achieve **O(V + E) time complexity** where V is vertices and E is edges. **Space complexity** is **O(V) for both**, with DFS using stack space and BFS using queue space.[^9]

**Hybrid Traversal Implementation**:

```typescript
class GraphTraversal {
  async bfsExpansion(
    startNode: string,
    maxDepth: number,
    relationTypes?: string[]
  ): Promise<GraphNode[]> {
    const visited = new Set<string>();
    const queue: Array<{node: string, depth: number}> = [{node: startNode, depth: 0}];
    const result: GraphNode[] = [];
    
    while (queue.length > 0) {
      const {node, depth} = queue.shift()!;
      
      if (visited.has(node) || depth > maxDepth) continue;
      
      visited.add(node);
      result.push(this.getNode(node));
      
      // Expand neighbors with type filtering
      const neighbors = this.getNeighbors(node, relationTypes);
      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor.target)) {
          queue.push({node: neighbor.target, depth: depth + 1});
        }
      });
    }
    
    return result;
  }
}
```


### Advanced Pattern Matching

**Subgraph Isomorphism**: For complex GraphRAG queries requiring **structural pattern matching**, implement **constraint-based algorithms** with **candidate region optimization**.[^12][^13]

**Performance Optimization**: Use **pivot vertex selection** to minimize candidate regions. Select vertices with **low frequency labels and high connectivity** as starting points.[^12]

```typescript
interface QueryPattern {
  nodes: Array<{id: string, type?: string, properties?: Record<string, any>}>;
  edges: Array<{source: string, target: string, type?: string}>;
}

class SubgraphMatcher {
  async findMatches(
    pattern: QueryPattern,
    maxResults: number = 100
  ): Promise<Array<Map<string, string>>> {
    // Select optimal pivot vertex
    const pivot = this.selectPivotVertex(pattern);
    
    // Find candidate regions
    const candidates = await this.findCandidateRegions(pivot);
    
    // Perform constraint-based matching
    const matches: Array<Map<string, string>> = [];
    
    for (const candidate of candidates) {
      if (matches.length >= maxResults) break;
      
      const mapping = await this.attemptMatch(pattern, candidate);
      if (mapping) matches.push(mapping);
    }
    
    return matches;
  }
}
```


## Query Optimization and Indexing

### Multi-Modal Indexing Strategy

**Composite Indexing** for GraphRAG requires **multiple access patterns**:[^14][^15]

- **Label indices** for fast node type filtering
- **Property indices** for attribute-based queries
- **Full-text indices** for keyword search
- **Vector indices** for embedding similarity
- **Graph structure indices** for relationship patterns

```typescript
interface GraphIndex {
  labelIndex: Map<string, Set<string>>; // type -> node IDs
  propertyIndex: Map<string, Map<any, Set<string>>>; // property -> value -> node IDs
  textIndex: Map<string, Set<string>>; // token -> node IDs
  vectorIndex: VectorIndex; // for embedding search
}

class IndexedGraph extends InMemoryGraph {
  private indices: GraphIndex = {
    labelIndex: new Map(),
    propertyIndex: new Map(),
    textIndex: new Map(),
    vectorIndex: new VectorIndex()
  };
  
  async query(querySpec: GraphQuery): Promise<QueryResult> {
    // Use most selective index first
    const candidateNodes = await this.findCandidates(querySpec);
    
    // Apply remaining filters
    const filteredNodes = this.applyFilters(candidateNodes, querySpec);
    
    // Expand relationships if needed
    if (querySpec.expand) {
      return await this.expandSubgraph(filteredNodes, querySpec.expand);
    }
    
    return { nodes: filteredNodes };
  }
}
```


### Query Plan Optimization

**Cost-Based Optimization**: Implement **query plan caching** and **statistics-based optimization** similar to traditional databases.[^15][^14]

**Optimization Strategies**:

- **Predicate pushdown** to reduce intermediate results
- **Join ordering** based on selectivity estimates
- **Index hint utilization** for complex queries
- **Parallel execution** for independent subqueries


## Memory Management and Performance

### Temporal Knowledge Management

**Zep's Temporal Architecture**: Recent research demonstrates **temporal knowledge graphs** with **edge invalidation** significantly improve memory system performance. This approach tracks **when relationships become invalid** rather than just when they were created.[^16]

```typescript
interface TemporalEdge extends GraphEdge {
  validFrom: Date;
  validUntil?: Date;
  temporalType: 'fact' | 'event' | 'state';
}

class TemporalGraph extends InMemoryGraph {
  async addTemporalRelationship(
    edge: TemporalEdge,
    context: { timestamp: Date; source: string }
  ): Promise<void> {
    // Check for conflicting relationships
    const existing = await this.findConflictingEdges(edge);
    
    // Invalidate superseded relationships
    for (const conflict of existing) {
      conflict.validUntil = context.timestamp;
    }
    
    // Add new temporal edge
    await this.addEdge(edge);
    
    // Update temporal indices
    await this.updateTemporalIndices(edge);
  }
}
```


### Progressive Loading and Streaming

**Memory-Bounded Processing**: For large knowledge graphs, implement **progressive loading** with **LRU eviction** to maintain memory bounds.[^4]

```typescript
class BoundedGraphCache {
  private maxNodes: number;
  private accessOrder: string[] = [];
  
  async loadSubgraph(
    centerNode: string,
    radius: number
  ): Promise<void> {
    const requiredNodes = await this.calculateSubgraph(centerNode, radius);
    
    // Evict least recently used nodes if needed
    while (this.nodes.size + requiredNodes.length > this.maxNodes) {
      const evictNode = this.accessOrder.shift();
      if (evictNode) this.evictNode(evictNode);
    }
    
    // Load required subgraph
    for (const node of requiredNodes) {
      await this.loadNode(node);
      this.markAccessed(node.id);
    }
  }
}
```


## Integration Patterns and Architecture

### Agent Memory Integration

Following **12-factor agent principles**, implement **stateless graph operations** that maintain **explicit context passing**:[^17][^18]

```typescript
interface GraphContext {
  userId: string;
  sessionId: string;
  timestamp: Date;
  relevantEntities: string[];
}

class AgentGraphMemory {
  async addMemory(
    content: string,
    context: GraphContext
  ): Promise<void> {
    // Extract entities and relationships
    const extraction = await this.extractor.process(content, context);
    
    // Resolve entities against existing knowledge
    const resolvedEntities = await this.resolver.resolveEntities(
      extraction.entities,
      context
    );
    
    // Update graph with temporal context
    await this.temporalGraph.addKnowledge(
      resolvedEntities,
      extraction.relationships,
      context
    );
    
    // Update indices
    await this.indexManager.updateIndices(resolvedEntities);
  }
  
  async queryMemory(
    query: string,
    context: GraphContext
  ): Promise<GraphMemoryResult> {
    // Parse natural language query
    const structured = await this.queryParser.parse(query, context);
    
    // Execute graph traversal
    const subgraph = await this.traversal.execute(structured);
    
    // Rank results by relevance
    const ranked = await this.ranker.rankResults(subgraph, context);
    
    return { results: ranked, context: subgraph };
  }
}
```


### Schema Evolution and Validation

**Dynamic Schema Management**: Implement **schema evolution** that allows knowledge graph structure to **adapt automatically** while maintaining **data integrity**:[^19][^20]

```typescript
interface SchemaEvolution {
  addEntityType(type: string, properties: PropertySchema[]): Promise<void>;
  addRelationType(type: string, constraints: RelationConstraint[]): Promise<void>;
  migrateExistingData(oldSchema: Schema, newSchema: Schema): Promise<void>;
}

class AdaptiveGraph implements SchemaEvolution {
  private schema: GraphSchema = new GraphSchema();
  
  async evolveSchema(
    newEntities: EntityRecord[],
    newRelations: RelationshipRecord[]
  ): Promise<void> {
    // Detect new patterns
    const patterns = await this.patternDetector.analyze(newEntities, newRelations);
    
    // Propose schema changes
    const changes = await this.schemaEvolver.proposeChanges(patterns);
    
    // Validate changes don't break existing data
    const validation = await this.validator.validateChanges(changes);
    
    if (validation.isValid) {
      // Apply schema evolution
      await this.applySchemaChanges(changes);
      
      // Migrate existing data if needed
      await this.migrateData(changes.migrations);
    }
  }
}
```


## Production Implementation Considerations

### Error Handling and Recovery

**Transactional Graph Updates**: Implement **atomic graph modifications** with **rollback capability** for error recovery:

```typescript
class GraphTransaction {
  private operations: GraphOperation[] = [];
  private checkpoints: GraphCheckpoint[] = [];
  
  async execute(operation: GraphOperation): Promise<void> {
    try {
      // Create checkpoint before modification
      const checkpoint = await this.createCheckpoint();
      this.checkpoints.push(checkpoint);
      
      // Execute operation
      await operation.execute();
      this.operations.push(operation);
      
    } catch (error) {
      // Rollback to last checkpoint
      await this.rollback();
      throw error;
    }
  }
  
  async commit(): Promise<void> {
    // Finalize all operations and clear checkpoints
    this.operations = [];
    this.checkpoints = [];
  }
}
```


### Monitoring and Performance Metrics

**Graph-Specific Metrics**: Track **graph health** and **query performance** with specialized metrics:[^15]

- **Graph density evolution** over time
- **Query selectivity** and **index effectiveness**
- **Entity resolution accuracy** rates
- **Temporal edge invalidation** patterns
- **Memory usage** and **cache hit rates**

```typescript
interface GraphMetrics {
  nodeCount: number;
  edgeCount: number;
  density: number;
  queryLatency: Map<string, number>;
  indexHitRate: Map<string, number>;
  entityResolutionAccuracy: number;
}

class GraphMonitor {
  async captureMetrics(): Promise<GraphMetrics> {
    return {
      nodeCount: this.graph.getNodeCount(),
      edgeCount: this.graph.getEdgeCount(),
      density: this.calculateDensity(),
      queryLatency: this.getQueryLatencies(),
      indexHitRate: this.getIndexHitRates(),
      entityResolutionAccuracy: await this.measureResolutionAccuracy()
    };
  }
}
```

This technical implementation guide provides the foundation for building sophisticated, production-ready GraphRAG memory systems using TypeScript and in-memory data structures. The approach emphasizes **local processing**, **custom implementations**, and **performance optimization** while maintaining the flexibility to evolve with advancing research in graph-based AI memory systems.

The architecture supports **real-time knowledge acquisition**, **intelligent query processing**, and **temporal memory management** - essential capabilities for advanced AI assistants that need to maintain sophisticated contextual understanding across conversations and tasks.
<span style="display:none">[^21][^22][^23][^24][^25][^26][^27][^28][^29][^30][^31][^32][^33][^34][^35][^36][^37]</span>

<div style="text-align: center">⁂</div>

[^1]: https://codevisionz.com/lessons/adjacency-matrix-vs-adjacency-list/

[^2]: https://stackoverflow.com/questions/2218322/what-is-better-adjacency-lists-or-adjacency-matrices-for-graph-problems-in-c

[^3]: https://arxiv.org/html/2507.03226v2

[^4]: https://blog.tomsawyer.com/json-graph-visualization-techniques

[^5]: https://daily.dev/blog/whats-new-in-nodejs-2024

[^6]: https://www.growthloop.com/university/article/entity-resolution

[^7]: https://www.rudderstack.com/blog/what-is-entity-resolution/

[^8]: https://spotintelligence.com/2024/01/22/entity-resolution/

[^9]: https://memgraph.com/blog/graph-search-algorithms-developers-guide

[^10]: https://www.puppygraph.com/blog/graph-traversal

[^11]: https://www.puppygraph.com/blog/depth-first-search-vs-breadth-first-search

[^12]: https://arxiv.org/pdf/2312.02988.pdf

[^13]: https://figshare.swinburne.edu.au/articles/thesis/A_Sub_graph_Isomorphism_Identification_Theorem/26282281

[^14]: https://hypermode.com/blog/query-optimization

[^15]: https://memgraph.com/blog/query-optimization-in-memgraph-common-mistakes

[^16]: https://arxiv.org/html/2501.13956v1

[^17]: https://dzone.com/articles/understanding-twelve-factor-agents

[^18]: https://github.com/humanlayer/12-factor-agents

[^19]: https://www.emergentmind.com/topics/schema-adaptable-knowledge-graph-construction

[^20]: https://arxiv.org/html/2505.23628v1

[^21]: https://memgraph.com/docs/data-modeling/modeling-guides/model-a-knowledge-graph

[^22]: https://aclanthology.org/C16-1218.pdf

[^23]: https://arxiv.org/pdf/2109.12520.pdf

[^24]: https://www.geeksforgeeks.org/dsa/comparison-between-adjacency-list-and-adjacency-matrix-representation-of-graph/

[^25]: https://devopedia.org/entity-linking

[^26]: https://www.semantic-web-journal.net/system/files/swj3674.pdf

[^27]: https://www.tandfonline.com/doi/full/10.1080/09544828.2025.2450762?af=R

[^28]: https://blog.algomaster.io/p/master-graph-algorithms-for-coding

[^29]: https://journal.hep.com.cn/fcs/EN/10.1007/s11704-020-0360-y

[^30]: https://graphdb.ontotext.com/documentation/11.0/data-loading-query-optimisations.html

[^31]: https://tomr.au/posts/vibe-coding-a-graph-database/

[^32]: https://docs.mem0.ai/open-source/graph_memory/overview

[^33]: https://netflix.github.io/falcor/documentation/jsongraph.html

[^34]: https://www.npmjs.com/package/@uncharted.software/bgraph

[^35]: https://www.reddit.com/r/cpp/comments/ybn7xq/study_project_a_memoryoptimized_json_data/

[^36]: https://hpi.de/fileadmin/user_upload/fachgebiete/naumann/publications/PDFs/2021_panse_evaluation.pdf

[^37]: https://stackoverflow.com/questions/74516719/typescript-clean-architecture-and-in-memory-database-repository

