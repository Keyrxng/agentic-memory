/**
 * Test setup and utilities
 * 
 * Global test configuration and helper functions for Jest tests.
 * Sets up common test utilities and environment for all test suites.
 */

// Global test timeout for async operations
jest.setTimeout(10000);

// Mock console methods for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  // Mock console.log to reduce noise during tests (unless VERBOSE_TESTS is set)
  if (!process.env.VERBOSE_TESTS) {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterEach(() => {
  // Restore console methods
  if (!process.env.VERBOSE_TESTS) {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
  }
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

// Custom matcher for numeric ranges
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Export test utilities
export const TestHelpers = {
  /**
   * Create a test context for graph operations
   */
  createTestContext(overrides: Partial<any> = {}) {
    return {
      userId: 'test-user',
      sessionId: 'test-session-' + Date.now(),
      timestamp: new Date(),
      relevantEntities: [],
      source: 'test',
      ...overrides
    };
  },

  /**
   * Generate deterministic test data
   */
  generateTestEntity(name: string, type: string = 'person') {
    return {
      id: `${type}_${name.toLowerCase().replace(/\s+/g, '_')}`,
      type,
      name,
      properties: { testGenerated: true },
      confidence: 0.9
    };
  },

  /**
   * Generate test relationship
   */
  generateTestRelationship(sourceId: string, targetId: string, type: string = 'knows') {
    return {
      id: `${sourceId}_${type}_${targetId}`,
      source: sourceId,
      target: targetId,
      type,
      confidence: 0.8,
      properties: { testGenerated: true }
    };
  },

  /**
   * Wait for async operations to complete
   */
  async waitFor(conditionFn: () => boolean, timeoutMs: number = 1000) {
    const startTime = Date.now();
    while (!conditionFn() && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!conditionFn()) {
      throw new Error(`Condition not met within ${timeoutMs}ms`);
    }
  },

  /**
   * Create test memory content variations
   */
  getTestMemoryContent() {
    return {
      simple: "Alice works at Google as a software engineer.",
      complex: "Dr. Sarah Johnson leads the AI research team at TechCorp. The team, which includes Bob Smith and Maria Garcia, develops machine learning models for autonomous vehicles. TechCorp is headquartered in San Francisco and collaborates with Stanford University on various research projects.",
      relationships: "John knows Mary. Mary works with Bob. Bob manages the engineering team at Microsoft.",
      temporal: "Alice joined Google in 2020. She was promoted to senior engineer in 2022. She moved to the AI division in 2023.",
      ambiguous: "Smith met with the CEO yesterday. They discussed the new project requirements."
    };
  }
};
