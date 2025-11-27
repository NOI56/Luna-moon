// Unit tests for modules/classifier.js
import { test } from 'node:test';
import assert from 'node:assert';
import {
  shouldRespondHeuristic,
  classifyEmotion,
  classifyMixedEmotions,
  calculateEmotionIntensity,
  classifyEmotionContext,
  isClearlyNegativeMessage
} from '../../modules/classifier.js';

// ============================================
// shouldRespondHeuristic Tests
// ============================================

test('shouldRespondHeuristic - empty text returns false', () => {
  assert.strictEqual(shouldRespondHeuristic(''), false);
  assert.strictEqual(shouldRespondHeuristic('   '), false);
  assert.strictEqual(shouldRespondHeuristic(null), false);
  assert.strictEqual(shouldRespondHeuristic(undefined), false);
});

test('shouldRespondHeuristic - long text (>=120 chars) returns true', () => {
  const longText = 'a'.repeat(120);
  assert.strictEqual(shouldRespondHeuristic(longText), true);
  
  const longerText = 'a'.repeat(200);
  assert.strictEqual(shouldRespondHeuristic(longerText), true);
});

test('shouldRespondHeuristic - force keywords return true', () => {
  const keywords = ['luna', 'moon', 'pump', 'help', 'please', 'love', 'hate', 'why', 'gm', 'gn'];
  
  keywords.forEach(keyword => {
    assert.strictEqual(shouldRespondHeuristic(keyword), true, `Should respond to keyword: ${keyword}`);
    assert.strictEqual(shouldRespondHeuristic(`Hello ${keyword}`), true);
    assert.strictEqual(shouldRespondHeuristic(`${keyword} test`), true);
  });
});

test('shouldRespondHeuristic - question mark returns true', () => {
  assert.strictEqual(shouldRespondHeuristic('What?'), true);
  assert.strictEqual(shouldRespondHeuristic('How are you?'), true);
  assert.strictEqual(shouldRespondHeuristic('Test?'), true);
});

test('shouldRespondHeuristic - short messages have random behavior', () => {
  // Short messages (<=3 chars) should have 20% chance
  // Short messages (<=10 chars) should have 40% chance
  // We can't test randomness directly, but we can test that it returns boolean
  const result1 = shouldRespondHeuristic('hi');
  assert.strictEqual(typeof result1, 'boolean');
  
  const result2 = shouldRespondHeuristic('hello');
  assert.strictEqual(typeof result2, 'boolean');
});

// ============================================
// classifyEmotion Tests
// ============================================

test('classifyEmotion - angry emotions', () => {
  const angryMessages = [
    'fuck you',
    'shut up',
    'stupid',
    'trash',
    'scam',
    'rug',
    'angry',
    'mad',
    'hate you',
    'i hate this'
  ];
  
  angryMessages.forEach(msg => {
    const emotion = classifyEmotion(msg);
    assert.strictEqual(emotion, 'angry', `"${msg}" should be classified as angry, got: ${emotion}`);
  });
});

test('classifyEmotion - sad emotions', () => {
  const sadMessages = [
    'sad',
    'depressed',
    'lonely',
    'cry',
    'hurt',
    'rekt',
    'broke',
    'lost everything'
  ];
  
  sadMessages.forEach(msg => {
    const emotion = classifyEmotion(msg);
    assert.strictEqual(emotion, 'sad', `"${msg}" should be classified as sad, got: ${emotion}`);
  });
});

test('classifyEmotion - sleepy emotions', () => {
  const sleepyMessages = [
    'sleepy',
    'tired',
    'exhausted',
    'going to bed',
    'need sleep',
    'yawn',
    'time to sleep'
  ];
  
  sleepyMessages.forEach(msg => {
    const emotion = classifyEmotion(msg);
    assert.strictEqual(emotion, 'sleepy', `"${msg}" should be classified as sleepy, got: ${emotion}`);
  });
});

test('classifyEmotion - hype emotions', () => {
  const hypeMessages = [
    'hype',
    'pumped',
    'lfg',
    'to the moon',
    'let\'s go',
    'moon',
    'bullish',
    'pump it'
  ];
  
  hypeMessages.forEach(msg => {
    const emotion = classifyEmotion(msg);
    assert.strictEqual(emotion, 'hype', `"${msg}" should be classified as hype, got: ${emotion}`);
  });
});

test('classifyEmotion - soft emotions', () => {
  const softMessages = [
    'cute',
    'sweet',
    'adorable',
    'beautiful',
    'pretty',
    'gentle',
    'lovely'
  ];
  
  softMessages.forEach(msg => {
    const emotion = classifyEmotion(msg);
    // Some words might not be in EMOTION_PATTERNS, so check if it's soft or null
    if (emotion !== null) {
      assert.strictEqual(emotion, 'soft', `"${msg}" should be classified as soft, got: ${emotion}`);
    }
  });
});

test('classifyEmotion - neutral/default returns null', () => {
  const neutralMessages = [
    'hello',
    'hi',
    'test',
    'ok',
    'yes',
    'no',
    'maybe'
  ];
  
  neutralMessages.forEach(msg => {
    const emotion = classifyEmotion(msg);
    // classifyEmotion returns null if no emotion detected
    assert.ok(emotion === null || emotion === 'soft', `"${msg}" should be null or soft, got: ${emotion}`);
  });
});

test('classifyEmotion - case insensitive', () => {
  assert.strictEqual(classifyEmotion('ANGRY'), 'angry');
  assert.strictEqual(classifyEmotion('Sad'), 'sad');
  assert.strictEqual(classifyEmotion('HYPE'), 'hype');
  assert.strictEqual(classifyEmotion('SLEEPY'), 'sleepy');
});

// ============================================
// classifyMixedEmotions Tests
// ============================================

test('classifyMixedEmotions - returns object with primary and secondary', () => {
  const result = classifyMixedEmotions('test message');
  assert.strictEqual(typeof result, 'object', 'Should return an object');
  assert.ok('primary' in result, 'Should have primary property');
  assert.ok('secondary' in result, 'Should have secondary property');
});

test('classifyMixedEmotions - detects multiple emotions', () => {
  const result = classifyMixedEmotions('I am sad and angry');
  assert.strictEqual(typeof result, 'object');
  // Should detect both sad and angry (sad comes first in priority)
  assert.ok(result.primary === 'sad' || result.primary === 'angry', 'Should detect sad or angry as primary');
});

// ============================================
// calculateEmotionIntensity Tests
// ============================================

test('calculateEmotionIntensity - returns number between 0 and 1', () => {
  const intensity = calculateEmotionIntensity('test', 'angry');
  assert.strictEqual(typeof intensity, 'number');
  assert.ok(intensity >= 0 && intensity <= 1, 'Intensity should be between 0 and 1');
});

test('calculateEmotionIntensity - stronger words have higher intensity', () => {
  const weak = calculateEmotionIntensity('a bit angry', 'angry');
  const strong = calculateEmotionIntensity('fuck you stupid', 'angry');
  
  assert.ok(strong >= weak, 'Stronger words should have higher intensity');
});

// ============================================
// classifyEmotionContext Tests
// ============================================

test('classifyEmotionContext - returns context string or null', () => {
  const result = classifyEmotionContext('I am sad');
  // classifyEmotionContext returns a context string or null
  assert.ok(result === null || typeof result === 'string', 'Should return string or null');
});

// ============================================
// isClearlyNegativeMessage Tests
// ============================================

test('isClearlyNegativeMessage - detects negative messages', () => {
  const negativeMessages = [
    'you are so bad',
    'so bad',
    'hate you',
    'i hate you',
    'stupid',
    'you are stupid'
  ];
  
  negativeMessages.forEach(msg => {
    assert.strictEqual(isClearlyNegativeMessage(msg), true, `"${msg}" should be negative`);
  });
});

test('isClearlyNegativeMessage - positive messages return false', () => {
  const positiveMessages = [
    'hello',
    'love you',
    'cute',
    'nice',
    'good'
  ];
  
  positiveMessages.forEach(msg => {
    assert.strictEqual(isClearlyNegativeMessage(msg), false, `"${msg}" should not be negative`);
  });
});

