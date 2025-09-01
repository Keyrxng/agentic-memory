/**
 * Vector utility functions for similarity calculations and embeddings
 */

export class VectorUtils {
  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate Euclidean distance between two vectors
   */
  static euclideanDistance(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }

    return Math.sqrt(sum);
  }

  /**
   * Normalize a vector to unit length
   */
  static normalize(vector: Float32Array): Float32Array {
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    if (norm === 0) return new Float32Array(vector.length);

    const normalized = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / norm;
    }

    return normalized;
  }

  /**
   * Calculate centroid of multiple vectors
   */
  static calculateCentroid(vectors: Float32Array[]): Float32Array {
    if (vectors.length === 0) return new Float32Array();

    const dimension = vectors[0].length;
    const centroid = new Float32Array(dimension);

    for (const vector of vectors) {
      for (let i = 0; i < dimension; i++) {
        centroid[i] += vector[i];
      }
    }

    for (let i = 0; i < dimension; i++) {
      centroid[i] /= vectors.length;
    }

    return centroid;
  }

  /**
   * Check if vector has valid values (not NaN or infinite)
   */
  static isValid(vector: Float32Array): boolean {
    for (let i = 0; i < vector.length; i++) {
      if (!isFinite(vector[i])) {
        return false;
      }
    }
    return true;
  }
}
