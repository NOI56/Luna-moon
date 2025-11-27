// Integration tests for API endpoints
import { test } from 'node:test';
import assert from 'node:assert';
import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:8787';
const TEST_WALLET = 'TestWallet1111111111111111111111111111111111111111';

async function testAPI(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    return {
      ok: response.ok,
      status: response.status,
      data: data
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message
    };
  }
}

// ============================================
// Health Check Tests
// ============================================

test('Health Check - /_health endpoint', async () => {
  const result = await testAPI('/_health');
  
  assert.ok(result.ok || result.status === 200, 'Health check should return 200');
  if (result.data) {
    assert.strictEqual(typeof result.data.ok, 'boolean', 'Should have ok property');
  }
});

test('Luna Status - /luna/status endpoint', async () => {
  const result = await testAPI('/luna/status');
  
  assert.ok(result.ok || result.status === 200, 'Status endpoint should return 200');
  if (result.data) {
    assert.strictEqual(typeof result.data.ok, 'boolean', 'Should have ok property');
    assert.ok('vts' in result.data, 'Should have vts status');
    assert.ok('tts' in result.data, 'Should have tts status');
    assert.ok('ai' in result.data, 'Should have ai status');
  }
});

test('Luna Health - /luna/health endpoint', async () => {
  const result = await testAPI('/luna/health');
  
  assert.ok(result.ok || result.status === 200, 'Health endpoint should return 200');
  if (result.data) {
    assert.strictEqual(typeof result.data.ok, 'boolean', 'Should have ok property');
    assert.ok('status' in result.data, 'Should have status property');
  }
});

// ============================================
// Chat System Tests
// ============================================

test('Chat - POST /luna/message', async () => {
  const result = await testAPI('/luna/message', 'POST', {
    text: 'Hello Luna!',
    user: 'testuser'
  });
  
  assert.ok(result.ok || result.status === 200, 'Chat endpoint should return 200');
  if (result.data && result.data.ok) {
    assert.ok('reply' in result.data, 'Should have reply');
    assert.strictEqual(typeof result.data.reply, 'string', 'Reply should be string');
  }
});

// ============================================
// RPS System Tests
// ============================================

test('RPS Balance - GET /luna/rps/balance', async () => {
  const result = await testAPI(`/luna/rps/balance?wallet=${TEST_WALLET}`);
  
  assert.ok(result.ok || result.status === 200, 'Balance endpoint should return 200');
  if (result.data && result.data.ok) {
    assert.strictEqual(typeof result.data.balance, 'number', 'Balance should be number');
  }
});

test('RPS Contract Address - GET /luna/rps/contract-address', async () => {
  const result = await testAPI('/luna/rps/contract-address');
  
  assert.ok(result.ok || result.status === 200, 'Contract address endpoint should return 200');
  if (result.data && result.data.ok) {
    assert.ok('contractAddress' in result.data, 'Should have contractAddress');
  }
});

test('RPS Leaderboard - GET /luna/rps/leaderboard', async () => {
  const result = await testAPI('/luna/rps/leaderboard');
  
  assert.ok(result.ok || result.status === 200, 'Leaderboard endpoint should return 200');
  if (result.data && result.data.ok) {
    assert.ok(Array.isArray(result.data.leaderboard), 'Leaderboard should be array');
  }
});

// ============================================
// Notification System Tests
// ============================================

test('Notifications - GET /luna/notifications', async () => {
  const result = await testAPI(`/luna/notifications?wallet=${TEST_WALLET}`);
  
  assert.ok(result.ok || result.status === 200, 'Notifications endpoint should return 200');
  if (result.data && result.data.ok) {
    assert.ok(Array.isArray(result.data.notifications), 'Notifications should be array');
    assert.strictEqual(typeof result.data.unreadCount, 'number', 'UnreadCount should be number');
  }
});

// ============================================
// Referral System Tests
// ============================================

test('Referral Link - GET /luna/referral/link', async () => {
  const result = await testAPI(`/luna/referral/link?wallet=${TEST_WALLET}`);
  
  assert.ok(result.ok || result.status === 200, 'Referral link endpoint should return 200');
  if (result.data && result.data.ok) {
    assert.ok('referralLink' in result.data, 'Should have referralLink');
    assert.strictEqual(typeof result.data.referralLink, 'string', 'ReferralLink should be string');
  }
});

test('Referral Stats - GET /luna/referral/stats', async () => {
  const result = await testAPI(`/luna/referral/stats?wallet=${TEST_WALLET}`);
  
  assert.ok(result.ok || result.status === 200, 'Referral stats endpoint should return 200');
  if (result.data && result.data.ok) {
    assert.ok('stats' in result.data, 'Should have stats');
  }
});

