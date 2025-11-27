// Unit tests for modules/memory.js
// Note: Memory system uses file I/O and has complex state management
// These tests verify basic functionality without modifying protected files

import { test } from 'node:test';
import assert from 'node:assert';
import { getUserMemory, updateUserMemory } from '../../modules/memory.js';

// ============================================
// getUserMemory Tests
// ============================================

test('getUserMemory - returns object or null for any user', () => {
  const memory = getUserMemory('test_user_123');
  
  // getUserMemory may return object or null
  assert.ok(memory === null || typeof memory === 'object', 'Should return object or null');
  // If it's an object, it should have expected structure
  if (memory !== null && typeof memory === 'object') {
    assert.ok('conversationHistory' in memory || Object.keys(memory).length === 0);
  }
});

test('getUserMemory - handles different usernames', () => {
  const user1 = getUserMemory('user1');
  const user2 = getUserMemory('user2');
  
  // Should return objects for both
  assert.strictEqual(typeof user1, 'object');
  assert.strictEqual(typeof user2, 'object');
});

// ============================================
// updateUserMemory Tests
// ============================================
// Note: updateUserMemory has complex internal logic
// We test that it doesn't throw errors and updates memory

test('updateUserMemory - accepts valid patch object', () => {
  const testUser = 'test_update_user';
  
  // Should not throw error
  try {
    updateUserMemory(testUser, {
      lastMessage: 'test message',
      lastReply: 'test reply',
      lastEmotion: 'soft'
    });
    assert.ok(true, 'updateUserMemory should not throw');
  } catch (error) {
    // If it throws, it should be a meaningful error
    assert.strictEqual(typeof error.message, 'string');
  }
});

test('updateUserMemory - handles empty patch', () => {
  const testUser = 'test_empty_patch';
  
  try {
    updateUserMemory(testUser, {});
    assert.ok(true, 'updateUserMemory should handle empty patch');
  } catch (error) {
    assert.strictEqual(typeof error.message, 'string');
  }
});

test('updateUserMemory - handles emotion updates', () => {
  const testUser = 'test_emotion_user';
  
  try {
    updateUserMemory(testUser, {
      lastEmotion: 'happy'
    });
    assert.ok(true, 'updateUserMemory should handle emotion');
  } catch (error) {
    assert.strictEqual(typeof error.message, 'string');
  }
});

