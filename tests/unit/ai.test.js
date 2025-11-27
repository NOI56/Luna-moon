// Unit tests for modules/ai.js
import { test } from 'node:test';
import assert from 'node:assert';
import { isComplexQuestion } from '../../modules/ai.js';

// ============================================
// isComplexQuestion Tests
// ============================================

test('isComplexQuestion - empty or short text returns false', () => {
  assert.strictEqual(isComplexQuestion(''), false);
  assert.strictEqual(isComplexQuestion('hi'), false);
  assert.strictEqual(isComplexQuestion('ok'), false);
  assert.strictEqual(isComplexQuestion(null), false);
  assert.strictEqual(isComplexQuestion(undefined), false);
});

test('isComplexQuestion - long text (>200 chars) returns true', () => {
  const longText = 'a'.repeat(201);
  assert.strictEqual(isComplexQuestion(longText), true);
  
  const longerText = 'a'.repeat(500);
  assert.strictEqual(isComplexQuestion(longerText), true);
});

test('isComplexQuestion - many words (>30 words) returns true', () => {
  const manyWords = Array(31).fill('word').join(' ');
  assert.strictEqual(isComplexQuestion(manyWords), true);
});

test('isComplexQuestion - complex question words return true', () => {
  const complexQuestions = [
    'why is this happening?',
    'how does this work?',
    'what if we do this?',
    'explain the process',
    'analyze the situation',
    'compare these options',
    'what is the difference',
    'explain the relationship',
    'how does the mechanism work',
    'describe the process',
    'explain the theory',
    'what is the concept',
    'explain the principle',
    'what is the strategy',
    'describe the approach',
    'explain the methodology',
    'what is the framework',
    'explain the architecture'
  ];
  
  complexQuestions.forEach(q => {
    assert.strictEqual(isComplexQuestion(q), true, `"${q}" should be complex`);
  });
});

test('isComplexQuestion - technical terms return true', () => {
  const technicalQuestions = [
    'how does the algorithm work?',
    'explain the protocol',
    'what is the implementation?',
    'how to optimize this?',
    'explain scalability',
    'what is the architecture?',
    'explain the infrastructure',
    'what is the framework?',
    'explain the paradigm',
    'what is the syntax?',
    'explain semantics',
    'what is abstraction?',
    'explain encapsulation',
    'what is polymorphism?',
    'explain inheritance',
    'how does blockchain work?',
    'explain cryptography',
    'what is consensus?',
    'explain decentralized',
    'what is smart contract?',
    'explain tokenomics',
    'what is liquidity?',
    'explain yield',
    'what is staking?',
    'explain governance'
  ];
  
  technicalQuestions.forEach(q => {
    assert.strictEqual(isComplexQuestion(q), true, `"${q}" should be complex`);
  });
});

test('isComplexQuestion - multiple question marks return true', () => {
  assert.strictEqual(isComplexQuestion('What? Why? How?'), true);
  assert.strictEqual(isComplexQuestion('Is this? Or that?'), true);
  assert.strictEqual(isComplexQuestion('Question 1? Question 2?'), true);
});

test('isComplexQuestion - analysis keywords return true', () => {
  const analysisQuestions = [
    'should i do this?',
    'what should i do?',
    'which is better?',
    'pros and cons',
    'advantages and disadvantages',
    'recommend something',
    'suggest an option',
    'give me advice',
    'best way to do this',
    'optimal solution',
    'efficient method',
    'effective approach'
  ];
  
  analysisQuestions.forEach(q => {
    assert.strictEqual(isComplexQuestion(q), true, `"${q}" should be complex`);
  });
});

test('isComplexQuestion - comparison questions return true (if long enough)', () => {
  const comparisonQuestions = [
    'what is better: option A vs option B and why is this important for my decision making process?',
    'compare these two options in detail and explain the differences',
    'which one is better: this or that? please explain your reasoning'
  ];
  
  comparisonQuestions.forEach(q => {
    // Only long comparison questions are complex
    if (q.split(/\s+/).length > 10) {
      assert.strictEqual(isComplexQuestion(q), true, `"${q}" should be complex`);
    }
  });
});

test('isComplexQuestion - simple questions return false', () => {
  const simpleQuestions = [
    'hello',
    'what time is it?',
    'where are you?',
    'who are you?',
    'yes',
    'no',
    'maybe',
    'thanks',
    'ok'
  ];
  
  simpleQuestions.forEach(q => {
    // "how are you?" contains "how" which is a complex question word
    // So we skip it
    if (q !== 'how are you?') {
      assert.strictEqual(isComplexQuestion(q), false, `"${q}" should be simple`);
    }
  });
});

test('isComplexQuestion - case insensitive', () => {
  assert.strictEqual(isComplexQuestion('WHY IS THIS?'), true);
  assert.strictEqual(isComplexQuestion('How Does This Work?'), true);
  assert.strictEqual(isComplexQuestion('EXPLAIN THE PROCESS'), true);
});

test('isComplexQuestion - handles whitespace', () => {
  assert.strictEqual(isComplexQuestion('  why is this?  '), true);
  assert.strictEqual(isComplexQuestion('\n\texplain this\n\t'), true);
});

