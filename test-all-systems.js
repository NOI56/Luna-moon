// Comprehensive System Test for Luna AI
// Tests all endpoints, HTML pages, and system functionality
// Run: node test-all-systems.js

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.API_BASE || 'http://localhost:8787';
const TEST_WALLET = 'TestWallet1111111111111111111111111111111111111111';

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

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  warnings: 0,
  details: []
};

function recordResult(name, passed, message = '', isWarning = false) {
  if (passed) {
    testResults.passed++;
  } else if (isWarning) {
    testResults.warnings++;
  } else {
    testResults.failed++;
  }
  testResults.details.push({ name, passed, message, isWarning });
  logResult(name, passed, message);
}

// ============================================
// 1. Server Health & Basic Endpoints
// ============================================

async function testServerHealth() {
  logTest('Server Health & Basic Endpoints');
  
  // Test 1: Health check
  let result = await testAPI('/_health');
  recordResult('Health Check (_health)', result.ok && result.data.ok, 
    result.ok ? `Status: ${result.status}` : result.error);
  
  // Test 2: Luna Status
  result = await testAPI('/luna/status');
  recordResult('Luna Status', result.ok && result.data.ok,
    result.ok ? 'System status retrieved' : result.error);
  
  // Test 3: Luna Health (detailed)
  result = await testAPI('/luna/health');
  recordResult('Luna Health Check', result.ok && result.data.ok,
    result.ok ? 'Detailed health check passed' : result.error);
  
  // Test 4: Luna Stats
  result = await testAPI('/luna/stats');
  recordResult('Luna Stats', result.ok && result.data.ok,
    result.ok ? 'Statistics retrieved' : result.error);
}

// ============================================
// 2. Chat System
// ============================================

async function testChatSystem() {
  logTest('Chat System');
  
  // Test 1: Send message
  let result = await testAPI('/luna/message', 'POST', {
    text: 'Hello Luna!',
    user: 'testuser'
  });
  recordResult('Send Chat Message', result.ok && result.data.ok,
    result.ok ? 'Message sent successfully' : result.error || result.data.error);
  
  // Test 2: Wake Luna
  result = await testAPI('/luna/wake');
  recordResult('Wake Luna', result.ok && result.data.ok,
    result.ok ? 'Luna awakened' : result.error);
  
  // Test 3: Allow Sleep
  result = await testAPI('/luna/allow-sleep');
  recordResult('Allow Sleep', result.ok && result.data.ok,
    result.ok ? 'Sleep mode restored' : result.error);
  
  // Test 4: Expression test
  result = await testAPI('/luna/expression?emo=soft');
  recordResult('Expression Test', result.ok,
    result.ok ? 'Expression triggered' : result.error);
}

// ============================================
// 3. RPS Game System
// ============================================

async function testRPSSystem() {
  logTest('Rock Paper Scissors System');
  
  // Test 1: Check balance
  let result = await testAPI(`/luna/rps/balance?wallet=${TEST_WALLET}`);
  recordResult('RPS Balance Check', result.ok && result.data.ok,
    result.ok ? `Balance: ${result.data.balance || 0}` : result.error);
  
  // Test 2: Get contract address
  result = await testAPI('/luna/rps/contract-address');
  recordResult('Contract Address', result.ok && result.data.ok,
    result.ok ? 'Contract address retrieved' : result.error);
  
  // Test 3: Get leaderboard
  result = await testAPI('/luna/rps/leaderboard');
  recordResult('RPS Leaderboard', result.ok && result.data.ok,
    result.ok ? 'Leaderboard retrieved' : result.error);
  
  // Test 4: Get history
  result = await testAPI('/luna/rps/history?wallet=' + TEST_WALLET);
  recordResult('RPS History', result.ok && result.data.ok,
    result.ok ? 'History retrieved' : result.error);
  
  // Test 5: Get stats
  result = await testAPI('/luna/rps/stats');
  recordResult('RPS Stats', result.ok && result.data.ok,
    result.ok ? 'Stats retrieved' : result.error);
  
  // Test 6: Get rewards pool
  result = await testAPI('/luna/rps/rewards/pool');
  recordResult('Rewards Pool', result.ok && result.data.ok,
    result.ok ? 'Rewards pool retrieved' : result.error);
  
  // Test 7: Get competition time
  result = await testAPI('/luna/rps/competition/time');
  recordResult('Competition Time', result.ok && result.data.ok,
    result.ok ? 'Competition time retrieved' : result.error);
  
  // Test 8: Get betting price
  result = await testAPI('/luna/rps/betting/price');
  recordResult('Betting Price', result.ok && result.data.ok,
    result.ok ? 'Price retrieved' : result.error);
  
  // Test 9: Get betting rooms
  result = await testAPI('/luna/rps/betting/rooms');
  recordResult('Betting Rooms', result.ok && result.data.ok,
    result.ok ? 'Rooms retrieved' : result.error);
  
  // Test 10: Get betting fees
  result = await testAPI('/luna/rps/betting/fees');
  recordResult('Betting Fees', result.ok && result.data.ok,
    result.ok ? 'Fees retrieved' : result.error);
}

// ============================================
// 4. Notification System
// ============================================

async function testNotificationSystem() {
  logTest('Notification System');
  
  // Test 1: Get notifications
  let result = await testAPI(`/luna/notifications?wallet=${TEST_WALLET}`);
  recordResult('Get Notifications', result.ok && result.data.ok,
    result.ok ? `Found ${result.data.notifications?.length || 0} notifications` : result.error);
  
  // Test 2: Mark as read (may fail if no notifications)
  result = await testAPI('/luna/notifications/read', 'POST', {
    wallet: TEST_WALLET,
    notificationId: 'test_id'
  });
  recordResult('Mark Notification Read', result.ok,
    result.ok ? 'Request processed' : 'Expected failure if no notifications');
}

// ============================================
// 5. Referral System
// ============================================

async function testReferralSystem() {
  logTest('Referral System');
  
  // Test 1: Get referral link
  let result = await testAPI(`/luna/referral/link?wallet=${TEST_WALLET}`);
  recordResult('Get Referral Link', result.ok && result.data.ok,
    result.ok ? 'Referral link generated' : result.error);
  
  // Test 2: Get referral stats
  result = await testAPI(`/luna/referral/stats?wallet=${TEST_WALLET}`);
  recordResult('Get Referral Stats', result.ok && result.data.ok,
    result.ok ? 'Stats retrieved' : result.error);
}

// ============================================
// 6. Chat Room System
// ============================================

async function testChatRoomSystem() {
  logTest('Chat Room System');
  
  const TEST_ROOM = 'test_room_' + Date.now();
  
  // Test 1: Get messages (creates room automatically)
  let result = await testAPI(`/luna/chat/messages?roomId=${TEST_ROOM}`);
  recordResult('Get Chat Messages', result.ok && result.data.ok,
    result.ok ? 'Room created/accessed' : result.error);
  
  // Test 2: Send message
  result = await testAPI('/luna/chat/send', 'POST', {
    roomId: TEST_ROOM,
    wallet: TEST_WALLET,
    message: 'Test message',
    username: 'TestUser'
  });
  recordResult('Send Chat Room Message', result.ok && result.data.ok,
    result.ok ? 'Message sent' : result.error);
}

// ============================================
// 7. VTS System
// ============================================

async function testVTSSystem() {
  logTest('VTube Studio System');
  
  // Test 1: Get VTS parameters
  let result = await testAPI('/luna/vts/parameters');
  recordResult('VTS Parameters', result.ok && result.data.ok,
    result.ok ? 'Parameters retrieved' : result.error || 'VTS may not be enabled');
  
  // Test 2: VTS Health
  result = await testAPI('/Luna/health/vts');
  recordResult('VTS Health', result.ok,
    result.ok ? 'VTS health check passed' : 'VTS may not be enabled');
}

// ============================================
// 8. HTML Pages
// ============================================

async function testHTMLPages() {
  logTest('HTML Pages');
  
  const pages = [
    '/',
    '/about.html',
    '/rps_game.html',
    '/rps_vs_luna.html',
    '/rps_betting.html',
    '/rps_history.html',
    '/rps_leaderboard.html',
    '/rps_stats.html',
    '/rps_overlay.html',
    '/overlay.html',
    '/luna-character',
    '/test_notifications.html',
    '/chat_tester.html',
    '/mood_overlay.html',
    '/luna_character.html',
    '/luna_character_vts.html'
  ];
  
  for (const page of pages) {
    const result = await testAPI(page);
    const exists = result.status === 200 || (result.data && result.data.html);
    recordResult(`Page: ${page}`, exists,
      exists ? `Status: ${result.status}` : `Status: ${result.status || 'Error'}`);
  }
}

// ============================================
// 9. Static Assets
// ============================================

async function testStaticAssets() {
  logTest('Static Assets');
  
  // Test CSS files
  const cssFiles = ['/css/chat.css', '/css/notifications.css', '/css/referral.css', '/css/overlay.css'];
  for (const file of cssFiles) {
    const result = await testAPI(file);
    recordResult(`CSS: ${file}`, result.status === 200,
      result.status === 200 ? 'OK' : `Status: ${result.status}`);
  }
  
  // Test JS files
  const jsFiles = ['/js/chat.js', '/js/notifications.js', '/js/referral.js'];
  for (const file of jsFiles) {
    const result = await testAPI(file);
    recordResult(`JS: ${file}`, result.status === 200,
      result.status === 200 ? 'OK' : `Status: ${result.status}`);
  }
  
  // Test models directory
  const result = await testAPI('/models');
  recordResult('Models Directory', result.status === 200 || result.status === 403,
    result.status === 200 || result.status === 403 ? 'Accessible' : `Status: ${result.status}`);
}

// ============================================
// 10. File System Check
// ============================================

async function testFileSystem() {
  logTest('File System Check');
  
  const publicDir = path.join(__dirname, 'public');
  const requiredFiles = [
    'index.html',
    'about.html',
    'rps_game.html',
    'rps_vs_luna.html',
    'rps_betting.html',
    'rps_history.html',
    'rps_leaderboard.html',
    'rps_stats.html',
    'rps_overlay.html',
    'overlay.html',
    'luna_character.html',
    'luna_character_vts.html',
    'mood_overlay.html',
    'chat_tester.html',
    'test_notifications.html'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(publicDir, file);
    const exists = fs.existsSync(filePath);
    recordResult(`File: ${file}`, exists,
      exists ? 'Exists' : 'Missing');
  }
  
  // Check directories
  const requiredDirs = ['css', 'js', 'models', 'images'];
  for (const dir of requiredDirs) {
    const dirPath = path.join(publicDir, dir);
    const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    recordResult(`Directory: ${dir}`, exists,
      exists ? 'Exists' : 'Missing');
  }
}

// ============================================
// 11. Configuration Check
// ============================================

async function testConfiguration() {
  logTest('Configuration Check');
  
  // Check .env file
  const envPath = path.join(__dirname, '.env');
  const envExists = fs.existsSync(envPath);
  recordResult('Environment File (.env)', envExists,
    envExists ? 'Found' : 'Missing - using env.example');
  
  // Check env.example
  const envExamplePath = path.join(__dirname, 'env.example');
  const envExampleExists = fs.existsSync(envExamplePath);
  recordResult('Environment Example (env.example)', envExampleExists,
    envExampleExists ? 'Found' : 'Missing');
  
  // Check package.json
  const packagePath = path.join(__dirname, 'package.json');
  const packageExists = fs.existsSync(packagePath);
  recordResult('Package.json', packageExists,
    packageExists ? 'Found' : 'Missing');
  
  // Check node_modules
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  const nodeModulesExists = fs.existsSync(nodeModulesPath);
  recordResult('Node Modules', nodeModulesExists,
    nodeModulesExists ? 'Found' : 'Missing - run npm install');
  
  // Check database
  const dbPath = path.join(__dirname, 'tmp', 'luna.db');
  const dbExists = fs.existsSync(dbPath);
  recordResult('Database (tmp/luna.db)', dbExists,
    dbExists ? 'Found' : 'Will be created on first run');
}

// ============================================
// Main Test Runner
// ============================================

async function runAllTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('Luna AI - Comprehensive System Test', 'cyan');
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
      log('Some tests will be skipped...\n', 'yellow');
    } else {
      log('✓ Server is running\n', 'green');
    }
    
    // Run all tests
    await testConfiguration();
    await testFileSystem();
    
    if (healthCheck.ok) {
      await testServerHealth();
      await testChatSystem();
      await testRPSSystem();
      await testNotificationSystem();
      await testReferralSystem();
      await testChatRoomSystem();
      await testVTSSystem();
      await testHTMLPages();
      await testStaticAssets();
    } else {
      log('\n⚠️  Skipping API tests - server not running', 'yellow');
    }
    
    // Print summary
    log('\n' + '='.repeat(60), 'cyan');
    log('Test Summary', 'cyan');
    log('='.repeat(60), 'cyan');
    log(`✓ Passed: ${testResults.passed}`, 'green');
    log(`✗ Failed: ${testResults.failed}`, 'red');
    log(`⚠ Warnings: ${testResults.warnings}`, 'yellow');
    log(`Total Tests: ${testResults.passed + testResults.failed + testResults.warnings}`, 'blue');
    
    const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
    log(`Success Rate: ${successRate}%`, successRate >= 80 ? 'green' : 'yellow');
    
    // Print failed tests
    if (testResults.failed > 0) {
      log('\nFailed Tests:', 'red');
      testResults.details
        .filter(t => !t.passed && !t.isWarning)
        .forEach(t => log(`  ✗ ${t.name}: ${t.message}`, 'red'));
    }
    
    // Print warnings
    if (testResults.warnings > 0) {
      log('\nWarnings:', 'yellow');
      testResults.details
        .filter(t => t.isWarning)
        .forEach(t => log(`  ⚠ ${t.name}: ${t.message}`, 'yellow'));
    }
    
    log('\n' + '='.repeat(60), 'cyan');
    
  } catch (error) {
    log(`\n✗ Test suite error: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run tests
runAllTests();


