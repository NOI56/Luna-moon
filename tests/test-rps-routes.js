// Test script for new modular RPS routes
// Tests all RPS routes that were moved to routes/ directory
// Run: node tests/test-rps-routes.js

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:8787';
const TEST_WALLET = 'TestWallet1111111111111111111111111111111111111111';
const TEST_WALLET_2 = 'TestWallet2222222222222222222222222222222222222222';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`Testing: ${name}`, 'cyan');
  log('='.repeat(60), 'cyan');
}

function logResult(testName, passed, message = '') {
  const icon = passed ? '✓' : '✗';
  const color = passed ? 'green' : 'red';
  log(`${icon} ${testName}${message ? ': ' + message : ''}`, color);
  return passed;
}

async function testAPI(endpoint, method = 'GET', body = null, headers = {}) {
  try {
    const options = {
      method: method,
      headers: { 
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { html: true, status: response.status };
    }
    
    return {
      ok: response.ok,
      status: response.status,
      data: data,
      contentType: contentType
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      status: 0
    };
  }
}

// Test results
let passed = 0;
let failed = 0;

// ============================================
// 1. RPS Matchmaking Routes (routes/rps-matchmaking.js)
// ============================================

async function testMatchmakingRoutes() {
  logTest('RPS Matchmaking Routes');
  
  // Test 1: POST /luna/rps/queue
  let result = await testAPI('/luna/rps/queue', 'POST', {
    wallet: TEST_WALLET
  });
  const queuePassed = logResult('POST /luna/rps/queue', 
    result.ok || result.status === 400, 
    result.ok ? 'Queued successfully' : `Status: ${result.status} - ${result.data?.error || result.error}`);
  queuePassed ? passed++ : failed++;
  
  // Test 2: GET /luna/rps/match
  result = await testAPI(`/luna/rps/match?wallet=${TEST_WALLET}`);
  const matchPassed = logResult('GET /luna/rps/match', 
    result.ok, 
    result.ok ? 'Match status retrieved' : `Status: ${result.status} - ${result.data?.error || result.error}`);
  matchPassed ? passed++ : failed++;
  
  // Test 3: POST /luna/rps/submit
  result = await testAPI('/luna/rps/submit', 'POST', {
    matchId: 'test_match_id',
    wallet: TEST_WALLET,
    choice: 'rock'
  });
  const submitPassed = logResult('POST /luna/rps/submit', 
    result.ok || result.status === 400 || result.status === 404, 
    result.ok ? 'Choice submitted' : `Status: ${result.status} - Expected failure for test match`);
  submitPassed ? passed++ : failed++;
  
  // Test 4: POST /luna/rps/play (vs Luna)
  result = await testAPI('/luna/rps/play', 'POST', {
    user: 'testuser',
    choice: 'rock',
    testMode: true
  });
  const playPassed = logResult('POST /luna/rps/play', 
    result.ok || result.status === 400, 
    result.ok ? 'Game played' : `Status: ${result.status} - ${result.data?.error || result.error}`);
  playPassed ? passed++ : failed++;
}

// ============================================
// 2. RPS Betting Routes (routes/rps-betting.js)
// ============================================

async function testBettingRoutes() {
  logTest('RPS Betting Routes');
  
  // Test 1: POST /luna/rps/betting/create
  let result = await testAPI('/luna/rps/betting/create', 'POST', {
    wallet: TEST_WALLET,
    betAmount: 1000
  });
  const createPassed = logResult('POST /luna/rps/betting/create', 
    result.ok || result.status === 400, 
    result.ok ? 'Room created' : `Status: ${result.status} - ${result.data?.error || result.error}`);
  createPassed ? passed++ : failed++;
  
  // Test 2: POST /luna/rps/betting/cancel
  result = await testAPI('/luna/rps/betting/cancel', 'POST', {
    roomId: 'test_room_id'
  });
  const cancelPassed = logResult('POST /luna/rps/betting/cancel', 
    result.ok || result.status === 400 || result.status === 404, 
    result.ok ? 'Room cancelled' : `Status: ${result.status} - Expected failure for test room`);
  cancelPassed ? passed++ : failed++;
  
  // Test 3: GET /luna/rps/betting/rooms
  result = await testAPI('/luna/rps/betting/rooms');
  const roomsPassed = logResult('GET /luna/rps/betting/rooms', 
    result.ok, 
    result.ok ? `Found ${result.data?.rooms?.length || 0} rooms` : `Status: ${result.status}`);
  roomsPassed ? passed++ : failed++;
  
  // Test 4: POST /luna/rps/betting/join
  result = await testAPI('/luna/rps/betting/join', 'POST', {
    roomId: 'test_room_id',
    wallet: TEST_WALLET_2
  });
  const joinPassed = logResult('POST /luna/rps/betting/join', 
    result.ok || result.status === 400 || result.status === 404, 
    result.ok ? 'Joined room' : `Status: ${result.status} - Expected failure for test room`);
  joinPassed ? passed++ : failed++;
  
  // Test 5: GET /luna/rps/betting/price
  result = await testAPI('/luna/rps/betting/price');
  const pricePassed = logResult('GET /luna/rps/betting/price', 
    result.ok, 
    result.ok ? `Price: ${result.data?.price || 'N/A'}` : `Status: ${result.status}`);
  pricePassed ? passed++ : failed++;
  
  // Test 6: GET /luna/rps/betting/fees
  result = await testAPI('/luna/rps/betting/fees');
  const feesPassed = logResult('GET /luna/rps/betting/fees', 
    result.ok, 
    result.ok ? 'Fees retrieved' : `Status: ${result.status}`);
  feesPassed ? passed++ : failed++;
  
  // Test 7: POST /luna/rps/betting/submit
  result = await testAPI('/luna/rps/betting/submit', 'POST', {
    roomId: 'test_room_id',
    wallet: TEST_WALLET,
    choice: 'paper'
  });
  const submitPassed = logResult('POST /luna/rps/betting/submit', 
    result.ok || result.status === 400 || result.status === 404, 
    result.ok ? 'Choice submitted' : `Status: ${result.status} - Expected failure for test room`);
  submitPassed ? passed++ : failed++;
}

// ============================================
// 3. RPS Stats Routes (routes/rps-stats.js)
// ============================================

async function testStatsRoutes() {
  logTest('RPS Stats Routes');
  
  // Test 1: GET /luna/rps/balance
  let result = await testAPI(`/luna/rps/balance?wallet=${TEST_WALLET}`);
  const balancePassed = logResult('GET /luna/rps/balance', 
    result.ok, 
    result.ok ? `Balance: ${result.data?.balance || 0}` : `Status: ${result.status}`);
  balancePassed ? passed++ : failed++;
  
  // Test 2: GET /luna/rps/contract-address
  result = await testAPI('/luna/rps/contract-address');
  const contractPassed = logResult('GET /luna/rps/contract-address', 
    result.ok, 
    result.ok ? `Contract: ${result.data?.contractAddress?.substring(0, 20)}...` : `Status: ${result.status}`);
  contractPassed ? passed++ : failed++;
  
  // Test 3: GET /luna/rps/leaderboard
  result = await testAPI('/luna/rps/leaderboard');
  const leaderboardPassed = logResult('GET /luna/rps/leaderboard', 
    result.ok, 
    result.ok ? `Found ${result.data?.leaderboard?.length || 0} players` : `Status: ${result.status}`);
  leaderboardPassed ? passed++ : failed++;
  
  // Test 4: GET /luna/rps/sol/balance
  result = await testAPI(`/luna/rps/sol/balance?wallet=${TEST_WALLET}`);
  const solBalancePassed = logResult('GET /luna/rps/sol/balance', 
    result.ok, 
    result.ok ? `SOL Balance: ${result.data?.balance || 0}` : `Status: ${result.status}`);
  solBalancePassed ? passed++ : failed++;
  
  // Test 5: GET /luna/rps/history
  result = await testAPI(`/luna/rps/history?wallet=${TEST_WALLET}`);
  const historyPassed = logResult('GET /luna/rps/history', 
    result.ok, 
    result.ok ? `Found ${result.data?.history?.length || 0} matches` : `Status: ${result.status}`);
  historyPassed ? passed++ : failed++;
  
  // Test 6: GET /luna/rps/stats
  result = await testAPI(`/luna/rps/stats?wallet=${TEST_WALLET}`);
  const statsPassed = logResult('GET /luna/rps/stats', 
    result.ok, 
    result.ok ? 'Stats retrieved' : `Status: ${result.status}`);
  statsPassed ? passed++ : failed++;
}

// ============================================
// 4. RPS Rewards Routes (routes/rps-rewards.js)
// ============================================

async function testRewardsRoutes() {
  logTest('RPS Rewards Routes');
  
  // Test 1: POST /luna/rps/rewards/distribute (requires admin)
  let result = await testAPI('/luna/rps/rewards/distribute', 'POST', {
    totalRewardPool: 1000
  });
  const distributePassed = logResult('POST /luna/rps/rewards/distribute', 
    result.ok || result.status === 400 || result.status === 401 || result.status === 403, 
    result.ok ? 'Rewards distributed' : `Status: ${result.status} - May require admin access`);
  distributePassed ? passed++ : failed++;
  
  // Test 2: GET /luna/rps/rewards/pool
  result = await testAPI('/luna/rps/rewards/pool');
  const poolPassed = logResult('GET /luna/rps/rewards/pool', 
    result.ok, 
    result.ok ? `Pool: ${result.data?.pool || 0}` : `Status: ${result.status}`);
  poolPassed ? passed++ : failed++;
}

// ============================================
// 5. RPS Competition Routes (routes/rps-competition.js)
// ============================================

async function testCompetitionRoutes() {
  logTest('RPS Competition Routes');
  
  // Test 1: GET /luna/rps/competition/time
  let result = await testAPI('/luna/rps/competition/time');
  const timePassed = logResult('GET /luna/rps/competition/time', 
    result.ok, 
    result.ok ? 'Competition time retrieved' : `Status: ${result.status}`);
  timePassed ? passed++ : failed++;
}

// ============================================
// Main Test Runner
// ============================================

async function runTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('RPS Routes Test - New Modular Routes', 'cyan');
  log('='.repeat(60), 'cyan');
  log(`API Base: ${API_BASE}`, 'blue');
  log(`Test Wallet: ${TEST_WALLET}`, 'blue');
  log(`Time: ${new Date().toISOString()}`, 'blue');
  
  try {
    // Test server connection first
    log('\nTesting server connection...', 'yellow');
    const healthCheck = await testAPI('/_health');
    if (!healthCheck.ok) {
      log('\n⚠️  WARNING: Server is not running or not accessible!', 'yellow');
      log('Please start the server with: npm start', 'yellow');
      log('Tests will continue but may fail...\n', 'yellow');
    } else {
      log('✓ Server is running\n', 'green');
    }
    
    // Run all route tests
    await testMatchmakingRoutes();
    await testBettingRoutes();
    await testStatsRoutes();
    await testRewardsRoutes();
    await testCompetitionRoutes();
    
    // Print summary
    log('\n' + '='.repeat(60), 'cyan');
    log('Test Summary', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`✓ Passed: ${passed}`, 'green');
    log(`✗ Failed: ${failed}`, 'red');
    log(`Total Tests: ${passed + failed}`, 'blue');
    
    const successRate = passed + failed > 0 
      ? ((passed / (passed + failed)) * 100).toFixed(1) 
      : 0;
    log(`Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');
    
    log('\n' + '='.repeat(60), 'cyan');
    
    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error) {
    log(`\n✗ Test suite error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests();























