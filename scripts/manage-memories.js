#!/usr/bin/env node

/**
 * Memory Data Manager
 * Utility script for managing the agentic memory JSONL data file
 * Usage: node scripts/manage-memories.js [command] [options]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_FILE = 'data/memories.jsonl';

/**
 * Add a new memory to the JSONL file
 */
function addMemory(content, options = {}) {
  const entry = {
    content,
    sessionId: options.sessionId || 'manual-entry',
    userId: options.userId || 'system',
    timestamp: options.timestamp || new Date().toISOString(),
    metadata: options.metadata || {}
  };

  const line = JSON.stringify(entry) + '\n';

  // Check if file exists, create if not
  if (!existsSync(DATA_FILE)) {
    writeFileSync(DATA_FILE, line);
    console.log(`✅ Created ${DATA_FILE} with new memory`);
  } else {
    // Append to existing file
    const existing = readFileSync(DATA_FILE, 'utf-8');
    writeFileSync(DATA_FILE, existing + line);
    console.log(`✅ Added memory to ${DATA_FILE}`);
  }

  console.log(`📝 Memory: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
}

/**
 * List all memories in the file
 */
function listMemories() {
  if (!existsSync(DATA_FILE)) {
    console.log(`❌ File ${DATA_FILE} does not exist`);
    return;
  }

  const content = readFileSync(DATA_FILE, 'utf-8');
  const lines = content.trim().split('\n');

  console.log(`📄 Found ${lines.length} memories in ${DATA_FILE}:\n`);

  lines.forEach((line, index) => {
    try {
      const entry = JSON.parse(line);
      console.log(`${index + 1}. ${entry.content.substring(0, 80)}${entry.content.length > 80 ? '...' : ''}`);
      console.log(`   User: ${entry.userId} | Session: ${entry.sessionId}`);
      console.log(`   Time: ${new Date(entry.timestamp).toLocaleString()}\n`);
    } catch (error) {
      console.log(`${index + 1}. [INVALID JSON LINE]\n`);
    }
  });
}

/**
 * Count memories in the file
 */
function countMemories() {
  if (!existsSync(DATA_FILE)) {
    console.log(`❌ File ${DATA_FILE} does not exist`);
    return;
  }

  const content = readFileSync(DATA_FILE, 'utf-8');
  const lines = content.trim().split('\n');

  console.log(`📊 ${DATA_FILE} contains ${lines.length} memories`);
}

/**
 * Validate JSONL file format
 */
function validateFile() {
  if (!existsSync(DATA_FILE)) {
    console.log(`❌ File ${DATA_FILE} does not exist`);
    return;
  }

  const content = readFileSync(DATA_FILE, 'utf-8');
  const lines = content.trim().split('\n');

  let validLines = 0;
  let invalidLines = 0;

  lines.forEach((line, index) => {
    try {
      const entry = JSON.parse(line);
      if (entry.content && typeof entry.content === 'string') {
        validLines++;
      } else {
        console.log(`⚠️  Line ${index + 1}: Missing or invalid 'content' field`);
        invalidLines++;
      }
    } catch (error) {
      console.log(`❌ Line ${index + 1}: Invalid JSON - ${error.message}`);
      invalidLines++;
    }
  });

  console.log(`✅ Validation complete:`);
  console.log(`   Valid lines: ${validLines}`);
  console.log(`   Invalid lines: ${invalidLines}`);
  console.log(`   Total lines: ${lines.length}`);
}

// Main CLI handler
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'add':
    if (args.length === 0) {
      console.log('❌ Usage: node manage-memories.js add "memory content" [--session-id=value] [--user-id=value]');
      process.exit(1);
    }
    const content = args[0];
    const options = {};

    // Parse additional options
    args.slice(1).forEach(arg => {
      if (arg.startsWith('--session-id=')) {
        options.sessionId = arg.split('=')[1];
      } else if (arg.startsWith('--user-id=')) {
        options.userId = arg.split('=')[1];
      }
    });

    addMemory(content, options);
    break;

  case 'list':
    listMemories();
    break;

  case 'count':
    countMemories();
    break;

  case 'validate':
    validateFile();
    break;

  default:
    console.log('📚 Agentic Memory Data Manager');
    console.log('');
    console.log('Usage: node manage-memories.js <command> [options]');
    console.log('');
    console.log('Commands:');
    console.log('  add <content>     Add a new memory entry');
    console.log('  list              List all memories');
    console.log('  count             Count memories');
    console.log('  validate          Validate JSONL file format');
    console.log('');
    console.log('Options:');
    console.log('  --session-id=value  Set session ID for new memory');
    console.log('  --user-id=value     Set user ID for new memory');
    console.log('');
    console.log('Examples:');
    console.log('  node manage-memories.js add "John Doe is a new team member"');
    console.log('  node manage-memories.js add "Project deadline moved to next week" --session-id=meeting-001');
    console.log('  node manage-memories.js list');
    break;
}
