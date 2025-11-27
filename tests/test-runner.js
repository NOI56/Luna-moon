// Test Runner - Run all unit tests
// Usage: node tests/test-runner.js

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function runTest(file) {
  return new Promise((resolve, reject) => {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`Running: ${file}`, 'cyan');
    log('='.repeat(60), 'cyan');
    
    const testProcess = spawn('node', ['--test', file], {
      cwd: __dirname,
      stdio: 'inherit',
      shell: true
    });
    
    testProcess.on('close', (code) => {
      if (code === 0) {
        log(`✓ ${file} passed`, 'green');
        resolve(true);
      } else {
        log(`✗ ${file} failed`, 'red');
        resolve(false);
      }
    });
    
    testProcess.on('error', (error) => {
      log(`✗ Error running ${file}: ${error.message}`, 'red');
      reject(error);
    });
  });
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 Luna AI - Unit Tests', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const testFiles = [
    join(__dirname, 'unit', 'classifier.test.js'),
    join(__dirname, 'unit', 'ai.test.js'),
    join(__dirname, 'unit', 'memory.test.js')
  ];
  
  const results = [];
  
  for (const testFile of testFiles) {
    try {
      const passed = await runTest(testFile);
      results.push({ file: testFile, passed });
    } catch (error) {
      results.push({ file: testFile, passed: false, error: error.message });
    }
  }
  
  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 Test Summary', 'cyan');
  log('='.repeat(60), 'cyan');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  log(`✓ Passed: ${passed}`, 'green');
  log(`✗ Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`Total: ${results.length}`, 'blue');
  
  if (failed > 0) {
    log('\nFailed Tests:', 'red');
    results.filter(r => !r.passed).forEach(r => {
      log(`  ✗ ${r.file}`, 'red');
      if (r.error) {
        log(`    Error: ${r.error}`, 'yellow');
      }
    });
  }
  
  log('\n' + '='.repeat(60), 'cyan');
  
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(error => {
  log(`\n✗ Test runner error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

