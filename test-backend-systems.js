// Test script for Notification, Referral, and Chat Systems
// Run: node test-backend-systems.js

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:8787';
const TEST_WALLET1 = 'TestWallet1111111111111111111111111111111111111111';
const TEST_WALLET2 = 'TestWallet2222222222222222222222222222222222222222';
const TEST_WALLET3 = 'TestWallet3333333333333333333333333333333333333333';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n${'='.repeat(50)}`, 'cyan');
  log(`Testing: ${name}`, 'cyan');
  log('='.repeat(50), 'cyan');
}

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
// 1. Notification System Tests
// ============================================

async function testNotificationSystem() {
  logTest('Notification System');
  
  // Test 1: Get notifications (should be empty initially)
  log('\n1. Getting notifications for wallet1...', 'yellow');
  let result = await testAPI(`/luna/notifications?wallet=${TEST_WALLET1}`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Found ${result.data.notifications.length} notifications`, 'green');
    log(`  Unread: ${result.data.unreadCount}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 2: Mark notification as read (should fail - no notification yet)
  log('\n2. Trying to mark non-existent notification as read...', 'yellow');
  result = await testAPI('/luna/notifications/read', 'POST', {
    wallet: TEST_WALLET1,
    notificationId: 'fake_id'
  });
  if (result.ok && !result.data.ok) {
    log(`✓ Success: Correctly returned false for non-existent notification`, 'green');
  } else {
    log(`✗ Failed: Should return false`, 'red');
  }
  
  log('\nNote: Notifications are sent automatically when:', 'blue');
  log('  - New betting room is created', 'blue');
  log('  - Match is found', 'blue');
  log('  - Reward distribution time approaches', 'blue');
  log('  - Referral rewards are earned', 'blue');
}

// ============================================
// 2. Referral System Tests
// ============================================

async function testReferralSystem() {
  logTest('Referral System');
  
  // Test 1: Get referral link
  log('\n1. Getting referral link for wallet1...', 'yellow');
  let result = await testAPI(`/luna/referral/link?wallet=${TEST_WALLET1}`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Referral link generated`, 'green');
    log(`  Link: ${result.data.referralLink}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 2: Get referral stats (should be empty initially)
  log('\n2. Getting referral stats for wallet1...', 'yellow');
  result = await testAPI(`/luna/referral/stats?wallet=${TEST_WALLET1}`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Stats retrieved`, 'green');
    log(`  Total Referrals: ${result.data.stats.totalReferrals}`, 'blue');
    log(`  Total Rewards: ${result.data.stats.totalRewards} Luna`, 'blue');
    log(`  Signups: ${result.data.stats.stats.signups}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 3: Register referral (wallet2 referred by wallet1)
  // Note: This might fail if wallet2 was already referred in previous test run
  log('\n3. Registering wallet2 as referral of wallet1...', 'yellow');
  result = await testAPI('/luna/referral/register', 'POST', {
    wallet: TEST_WALLET2,
    referrer: TEST_WALLET1
  });
  if (result.ok && result.data.ok) {
    log(`✓ Success: Referral registered`, 'green');
  } else if (!result.ok && !result.data.ok) {
    log(`⚠ Note: Referral already exists (this is OK if running test multiple times)`, 'yellow');
    log(`  Error: ${result.data.error || result.data.message}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 4: Try to register same referral again (should fail)
  log('\n4. Trying to register same referral again (should fail)...', 'yellow');
  result = await testAPI('/luna/referral/register', 'POST', {
    wallet: TEST_WALLET2,
    referrer: TEST_WALLET1
  });
  if (!result.ok && !result.data.ok) {
    log(`✓ Success: Correctly rejected duplicate referral`, 'green');
    log(`  Error: ${result.data.error || result.data.message}`, 'blue');
  } else {
    log(`✗ Failed: Should reject duplicate`, 'red');
  }
  
  // Test 5: Try to refer yourself (should fail)
  log('\n5. Trying to refer yourself (should fail)...', 'yellow');
  result = await testAPI('/luna/referral/register', 'POST', {
    wallet: TEST_WALLET1,
    referrer: TEST_WALLET1
  });
  if (!result.ok && !result.data.ok) {
    log(`✓ Success: Correctly rejected self-referral`, 'green');
    log(`  Error: ${result.data.error || result.data.message}`, 'blue');
  } else {
    log(`✗ Failed: Should reject self-referral`, 'red');
  }
  
  // Test 6: Get updated referral stats
  log('\n6. Getting updated referral stats for wallet1...', 'yellow');
  result = await testAPI(`/luna/referral/stats?wallet=${TEST_WALLET1}`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Updated stats retrieved`, 'green');
    log(`  Total Referrals: ${result.data.stats.totalReferrals}`, 'blue');
    log(`  Signups: ${result.data.stats.stats.signups}`, 'blue');
    if (result.data.stats.totalReferrals > 0) {
      log(`  ✓ Referral count increased!`, 'green');
    }
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 7: Register another referral (wallet3 referred by wallet1)
  // Note: This might fail if wallet3 was already referred in previous test run
  log('\n7. Registering wallet3 as referral of wallet1...', 'yellow');
  result = await testAPI('/luna/referral/register', 'POST', {
    wallet: TEST_WALLET3,
    referrer: TEST_WALLET1
  });
  if (result.ok && result.data.ok) {
    log(`✓ Success: Second referral registered`, 'green');
  } else if (!result.ok && !result.data.ok) {
    log(`⚠ Note: Referral already exists (this is OK if running test multiple times)`, 'yellow');
    log(`  Error: ${result.data.error || result.data.message}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 8: Final stats check
  log('\n8. Final referral stats check...', 'yellow');
  result = await testAPI(`/luna/referral/stats?wallet=${TEST_WALLET1}`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Final stats`, 'green');
    log(`  Total Referrals: ${result.data.stats.totalReferrals}`, 'blue');
    log(`  Referrals: ${result.data.stats.referrals.join(', ')}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
}

// ============================================
// 3. Chat System Tests
// ============================================

async function testChatSystem() {
  logTest('Chat System');
  
  const TEST_ROOM_ID = 'test_room_123';
  
  // Test 1: Get messages from non-existent room (should return empty)
  log('\n1. Getting messages from non-existent room...', 'yellow');
  let result = await testAPI(`/luna/chat/messages?roomId=${TEST_ROOM_ID}`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Room created automatically`, 'green');
    log(`  Messages: ${result.data.messages.length}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 2: Send first message
  log('\n2. Sending first chat message...', 'yellow');
  result = await testAPI('/luna/chat/send', 'POST', {
    roomId: TEST_ROOM_ID,
    wallet: TEST_WALLET1,
    message: 'Hello everyone!',
    username: 'Player1'
  });
  if (result.ok && result.data.ok) {
    log(`✓ Success: Message sent`, 'green');
    log(`  Message ID: ${result.data.message.id}`, 'blue');
    log(`  Content: ${result.data.message.message}`, 'blue');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 3: Send second message from different wallet
  log('\n3. Sending second message from different wallet...', 'yellow');
  result = await testAPI('/luna/chat/send', 'POST', {
    roomId: TEST_ROOM_ID,
    wallet: TEST_WALLET2,
    message: 'Hey there! How are you?',
    username: 'Player2'
  });
  if (result.ok && result.data.ok) {
    log(`✓ Success: Second message sent`, 'green');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 4: Get all messages
  log('\n4. Getting all messages from room...', 'yellow');
  result = await testAPI(`/luna/chat/messages?roomId=${TEST_ROOM_ID}&limit=50`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Retrieved ${result.data.messages.length} messages`, 'green');
    result.data.messages.forEach((msg, index) => {
      log(`  ${index + 1}. [${msg.username}]: ${msg.message}`, 'blue');
    });
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 5: Try to send empty message (should fail)
  log('\n5. Trying to send empty message (should fail)...', 'yellow');
  result = await testAPI('/luna/chat/send', 'POST', {
    roomId: TEST_ROOM_ID,
    wallet: TEST_WALLET1,
    message: '',
    username: 'Player1'
  });
  if (!result.ok && !result.data.ok) {
    log(`✓ Success: Correctly rejected empty message`, 'green');
    log(`  Error: ${result.data.error || result.data.message}`, 'blue');
  } else {
    log(`✗ Failed: Should reject empty message`, 'red');
    log(`  Response: ${JSON.stringify(result.data)}`, 'yellow');
  }
  
  // Test 6: Try to send message without roomId (should fail)
  log('\n6. Trying to send message without roomId (should fail)...', 'yellow');
  result = await testAPI('/luna/chat/send', 'POST', {
    wallet: TEST_WALLET1,
    message: 'Test message'
  });
  if (!result.ok && !result.data.ok) {
    log(`✓ Success: Correctly rejected missing roomId`, 'green');
    log(`  Error: ${result.data.error || result.data.message}`, 'blue');
  } else {
    log(`✗ Failed: Should reject missing roomId`, 'red');
    log(`  Response: ${JSON.stringify(result.data)}`, 'yellow');
  }
  
  // Test 7: Send message to different room
  log('\n7. Sending message to different room...', 'yellow');
  result = await testAPI('/luna/chat/send', 'POST', {
    roomId: 'betting_room_456',
    wallet: TEST_WALLET3,
    message: 'This is a betting room chat!',
    username: 'Player3'
  });
  if (result.ok && result.data.ok) {
    log(`✓ Success: Message sent to different room`, 'green');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
  
  // Test 8: Get messages from different room
  log('\n8. Getting messages from different room...', 'yellow');
  result = await testAPI(`/luna/chat/messages?roomId=betting_room_456`);
  if (result.ok && result.data.ok) {
    log(`✓ Success: Retrieved ${result.data.messages.length} messages from betting room`, 'green');
  } else {
    log(`✗ Failed: ${result.error || result.data.error}`, 'red');
  }
}

// ============================================
// Main Test Runner
// ============================================

async function runAllTests() {
  log('\n' + '='.repeat(50), 'cyan');
  log('Backend Systems Test Suite', 'cyan');
  log('='.repeat(50), 'cyan');
  log(`API Base: ${API_BASE}`, 'blue');
  log(`Test Wallets:`, 'blue');
  log(`  Wallet1: ${TEST_WALLET1}`, 'blue');
  log(`  Wallet2: ${TEST_WALLET2}`, 'blue');
  log(`  Wallet3: ${TEST_WALLET3}`, 'blue');
  
  try {
    // Test Notification System
    await testNotificationSystem();
    
    // Test Referral System
    await testReferralSystem();
    
    // Test Chat System
    await testChatSystem();
    
    log('\n' + '='.repeat(50), 'cyan');
    log('All Tests Completed!', 'cyan');
    log('='.repeat(50), 'cyan');
    log('\nNote: Some tests may show expected failures (e.g., duplicate referrals)', 'yellow');
    log('This is normal behavior to test error handling.', 'yellow');
    
  } catch (error) {
    log(`\n✗ Test suite error: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run tests
runAllTests();

