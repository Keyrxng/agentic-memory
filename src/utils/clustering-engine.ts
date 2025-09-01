import type { GraphNode } from '../core/types.js';
import { VectorUtils } from './vector-utils.js';

/**
 * Memory cluster for grouping semantically similar content
 */
export interface MemoryCluster {
  id: string;
  centroid: Float32Array;
  members: GraphNode[];
  theme: string;
  confidence: number;
  createdAt: Date;
  lastUpdated: Date;
}

/**
 * Configuration for memory clustering
 */
export interface ClusteringConfig {
  enabled: boolean;
  similarityThreshold: number;
  maxClusters: number;
  minClusterSize: number;
  clusteringAlgorithm: 'kmeans' | 'hierarchical';
}

/**
 * Internal hierarchical cluster representation
 */
interface HierarchicalCluster {
  id: string;
  nodes: GraphNode[];
  centroid: Float32Array;
  size: number;
  mergedFrom: string[];
}

/**
 * Clustering engine for semantic grouping of memory nodes
 */
export class ClusteringEngine {
  /**
   * Create semantic clusters from memory nodes
   */
  async createClusters(
    nodes: GraphNode[],
    config: ClusteringConfig
  ): Promise<MemoryCluster[]> {
    if (!config.enabled) {
      return [];
    }

    console.log(`🔍 Creating semantic clusters with ${config.clusteringAlgorithm} algorithm...`);

    const startTime = Date.now();
    const nodesWithEmbeddings = nodes.filter(
      node => node.embeddings && node.embeddings.length > 0 && VectorUtils.isValid(node.embeddings)
    );

    if (nodesWithEmbeddings.length < config.minClusterSize) {
      console.log(`⚠️ Not enough nodes with embeddings for clustering (${nodesWithEmbeddings.length})`);
      return [];
    }

    const clusters: MemoryCluster[] = [];

    if (config.clusteringAlgorithm === 'kmeans') {
      const kmeansClusters = await this.performKMeansClustering(
        nodesWithEmbeddings,
        config.maxClusters,
        config.similarityThreshold
      );
      clusters.push(...kmeansClusters);
    } else if (config.clusteringAlgorithm === 'hierarchical') {
      const hierarchicalClusters = await this.performHierarchicalClustering(
        nodesWithEmbeddings,
        config.maxClusters,
        config.similarityThreshold
      );
      clusters.push(...hierarchicalClusters);
    }

    const processingTime = Date.now() - startTime;
    console.log(`✅ Created ${clusters.length} clusters in ${processingTime}ms`);

    return clusters;
  }

  /**
   * Find clusters related to a query embedding
   */
  findRelatedClusters(
    queryEmbedding: Float32Array,
    clusters: MemoryCluster[],
    maxResults: number = 5
  ): MemoryCluster[] {
    const clusterSimilarities: Array<{ cluster: MemoryCluster; similarity: number }> = [];

    for (const cluster of clusters) {
      const similarity = VectorUtils.cosineSimilarity(queryEmbedding, cluster.centroid);
      if (similarity > 0.3) { // Minimum similarity threshold
        clusterSimilarities.push({ cluster, similarity });
      }
    }

    // Sort by similarity and return top results
    clusterSimilarities.sort((a, b) => b.similarity - a.similarity);

    return clusterSimilarities.slice(0, maxResults).map(item => item.cluster);
  }

  /**
   * Perform K-means clustering on nodes with embeddings
   */
  private async performKMeansClustering(
    nodes: GraphNode[],
    k: number,
    similarityThreshold: number
  ): Promise<MemoryCluster[]> {
    const clusters: MemoryCluster[] = [];
    const embeddings = nodes.map(node => node.embeddings!).filter(Boolean);

    if (embeddings.length === 0) return clusters;

    // Initialize centroids using k-means++ initialization
    const centroids = this.initializeCentroids(embeddings, Math.min(k, embeddings.length));

    // K-means iterations
    const maxIterations = 10;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const clusterAssignments = this.assignNodesToClusters(nodes, centroids, similarityThreshold);

      // Update centroids
      const newCentroids = this.updateCentroids(clusterAssignments, centroids.length);

      // Check for convergence
      if (this.centroidsConverged(centroids, newCentroids)) {
        break;
      }

      centroids.splice(0, centroids.length, ...newCentroids);
    }

    // Create cluster objects
    for (let i = 0; i < centroids.length; i++) {
      const clusterNodes = nodes.filter(node => {
        if (!node.embeddings) return false;
        const similarity = VectorUtils.cosineSimilarity(node.embeddings, centroids[i]);
        return similarity > similarityThreshold;
      });

      if (clusterNodes.length >= 2) { // Minimum cluster size
        const theme = this.extractClusterTheme(clusterNodes);
        clusters.push({
          id: `cluster_${i}_${Date.now()}`,
          centroid: centroids[i],
          members: clusterNodes,
          theme,
          confidence: this.calculateClusterConfidence(clusterNodes, centroids[i]),
          createdAt: new Date(),
          lastUpdated: new Date()
        });
      }
    }

    return clusters;
  }

  /**
   * Perform agglomerative hierarchical clustering on nodes with embeddings
   */
  private async performHierarchicalClustering(
    nodes: GraphNode[],
    maxClusters: number,
    similarityThreshold: number
  ): Promise<MemoryCluster[]> {
    const clusters: MemoryCluster[] = [];
    const embeddings = nodes.map(node => node.embeddings!).filter(Boolean);

    if (embeddings.length === 0) return clusters;

    // Initialize each node as its own cluster
    let currentClusters: HierarchicalCluster[] = nodes.map((node, index) => ({
      id: `cluster_${index}`,
      nodes: [node],
      centroid: new Float32Array(node.embeddings!),
      size: 1,
      mergedFrom: []
    }));

    let clusterId = nodes.length;

    // Continue merging until we have the desired number of clusters or similarity threshold is met
    while (currentClusters.length > Math.max(1, maxClusters)) {
      // Find the two most similar clusters
      let bestPair = { i: 0, j: 1, similarity: 0 };
      
      for (let i = 0; i < currentClusters.length; i++) {
        for (let j = i + 1; j < currentClusters.length; j++) {
          const similarity = VectorUtils.cosineSimilarity(
            currentClusters[i].centroid,
            currentClusters[j].centroid
          );
          
          if (similarity > bestPair.similarity) {
            bestPair = { i, j, similarity };
          }
        }
      }

      // Stop if similarity is too low
      if (bestPair.similarity < similarityThreshold) {
        break;
      }

      // Merge the two most similar clusters
      const cluster1 = currentClusters[bestPair.i];
      const cluster2 = currentClusters[bestPair.j];
      
      const mergedNodes = [...cluster1.nodes, ...cluster2.nodes];
      const mergedEmbeddings = mergedNodes
        .map(node => node.embeddings!)
        .filter(Boolean) as Float32Array[];
      
      const mergedCluster: HierarchicalCluster = {
        id: `cluster_${clusterId++}`,
        nodes: mergedNodes,
        centroid: VectorUtils.calculateCentroid(mergedEmbeddings),
        size: mergedNodes.length,
        mergedFrom: [cluster1.id, cluster2.id]
      };

      // Remove the original clusters and add the merged one
      currentClusters = currentClusters.filter((_, index) => 
        index !== bestPair.i && index !== bestPair.j
      );
      currentClusters.push(mergedCluster);
    }

    // Convert hierarchical clusters to MemoryCluster format
    for (let i = 0; i < currentClusters.length; i++) {
      const hierarchicalCluster = currentClusters[i];
      
      if (hierarchicalCluster.nodes.length >= 2) { // Minimum cluster size
        const theme = this.extractClusterTheme(hierarchicalCluster.nodes);
        const confidence = this.calculateClusterConfidence(hierarchicalCluster.nodes, hierarchicalCluster.centroid);
        
        clusters.push({
          id: `hierarchical_${hierarchicalCluster.id}_${Date.now()}`,
          centroid: hierarchicalCluster.centroid,
          members: hierarchicalCluster.nodes,
          theme,
          confidence,
          createdAt: new Date(),
          lastUpdated: new Date()
        });
      }
    }

    return clusters;
  }

  /**
   * Initialize centroids using k-means++ algorithm
   */
  private initializeCentroids(embeddings: Float32Array[], k: number): Float32Array[] {
    const centroids: Float32Array[] = [];

    // First centroid: random selection
    centroids.push(new Float32Array(embeddings[Math.floor(Math.random() * embeddings.length)]));

    // Subsequent centroids: probability proportional to squared distance
    for (let i = 1; i < k; i++) {
      const distances = embeddings.map(embedding =>
        Math.min(...centroids.map(centroid =>
          VectorUtils.euclideanDistance(embedding, centroid)
        ))
      );

      const sumDistances = distances.reduce((sum, dist) => sum + dist * dist, 0);
      const probabilities = distances.map(dist => (dist * dist) / sumDistances);

      let cumulativeProb = 0;
      const random = Math.random();

      for (let j = 0; j < probabilities.length; j++) {
        cumulativeProb += probabilities[j];
        if (random <= cumulativeProb) {
          centroids.push(new Float32Array(embeddings[j]));
          break;
        }
      }
    }

    return centroids;
  }

  /**
   * Assign nodes to nearest centroids
   */
  private assignNodesToClusters(
    nodes: GraphNode[],
    centroids: Float32Array[],
    similarityThreshold: number
  ): GraphNode[][] {
    const clusterAssignments: GraphNode[][] = centroids.map(() => []);

    for (const node of nodes) {
      if (!node.embeddings) continue;

      let bestCentroidIndex = 0;
      let bestSimilarity = 0;

      for (let i = 0; i < centroids.length; i++) {
        const similarity = VectorUtils.cosineSimilarity(node.embeddings, centroids[i]);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestCentroidIndex = i;
        }
      }

      if (bestSimilarity > similarityThreshold) {
        clusterAssignments[bestCentroidIndex].push(node);
      }
    }

    return clusterAssignments;
  }

  /**
   * Update centroids based on cluster assignments
   */
  private updateCentroids(clusterAssignments: GraphNode[][], numCentroids: number): Float32Array[] {
    const newCentroids: Float32Array[] = [];

    for (let i = 0; i < numCentroids; i++) {
      const clusterNodes = clusterAssignments[i];
      if (clusterNodes.length > 0) {
        const clusterEmbeddings = clusterNodes
          .map(node => node.embeddings)
          .filter(Boolean) as Float32Array[];

        newCentroids.push(VectorUtils.calculateCentroid(clusterEmbeddings));
      } else {
        // Keep old centroid if cluster is empty
        newCentroids.push(new Float32Array());
      }
    }

    return newCentroids;
  }

  /**
   * Check if centroids have converged
   */
  private centroidsConverged(oldCentroids: Float32Array[], newCentroids: Float32Array[]): boolean {
    const threshold = 0.001;

    for (let i = 0; i < oldCentroids.length; i++) {
      if (oldCentroids[i].length === 0 || newCentroids[i].length === 0) continue;

      const distance = VectorUtils.euclideanDistance(oldCentroids[i], newCentroids[i]);
      if (distance > threshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extract theme from cluster nodes
   */
  private extractClusterTheme(nodes: GraphNode[]): string {
    const types = nodes.map(node => node.type);
    const mostCommonType = types.reduce((a, b, i, arr) =>
      arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
    );

    const names = nodes.map(node => node.properties.name).filter(Boolean);
    if (names.length > 0) {
      return `${mostCommonType}: ${names.slice(0, 2).join(', ')}${names.length > 2 ? '...' : ''}`;
    }

    return `${mostCommonType} cluster`;
  }

  /**
   * Calculate cluster confidence based on member similarity to centroid
   */
  private calculateClusterConfidence(nodes: GraphNode[], centroid: Float32Array): number {
    if (nodes.length === 0) return 0;

    let totalSimilarity = 0;
    let validNodes = 0;

    for (const node of nodes) {
      if (node.embeddings) {
        totalSimilarity += VectorUtils.cosineSimilarity(node.embeddings, centroid);
        validNodes++;
      }
    }

    return validNodes > 0 ? totalSimilarity / validNodes : 0;
  }
}
