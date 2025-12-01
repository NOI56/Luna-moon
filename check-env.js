// check-env.js
// Script to check environment variables configuration

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file if exists
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Read env.example to get all expected variables
const envExamplePath = join(__dirname, 'env.example');
const envExample = readFileSync(envExamplePath, 'utf8');

// Parse env.example
const expectedVars = [];
const lines = envExample.split('\n');
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const key = trimmed.split('=')[0].trim();
    const value = trimmed.split('=').slice(1).join('=').trim();
    expectedVars.push({ key, defaultValue: value });
  }
}

// Categories
const categories = {
  required: [],
  recommended: [],
  optional: []
};

// Check each variable
for (const { key, defaultValue } of expectedVars) {
  const actualValue = process.env[key];
  const isSet = actualValue !== undefined && actualValue !== '';
  const isPlaceholder = actualValue && (
    actualValue.includes('your_') || 
    actualValue.includes('here') ||
    actualValue === defaultValue
  );

  let category = 'optional';
  let status = '✓';

  // Determine if required
  if (
    key.includes('TOKEN_MINT') ||
    key.includes('ESCROW_WALLET') ||
    key.includes('ESCROW_PRIVATE_KEY') ||
    key.includes('RPC_URL') ||
    (key.includes('OPENAI_KEY') && !process.env.OPENROUTER_KEY) ||
    (key.includes('OPENROUTER_KEY') && !process.env.OPENAI_KEY)
  ) {
    category = 'required';
    if (!isSet || isPlaceholder) {
      status = '✗ MISSING';
    }
  } else if (
    key.includes('KEY') ||
    key.includes('TOKEN') ||
    key.includes('PRIVATE_KEY') ||
    key.includes('WALLET')
  ) {
    category = 'recommended';
    if (!isSet || isPlaceholder) {
      status = '⚠ NOT SET';
    }
  }

  categories[category].push({
    key,
    status,
    isSet,
    isPlaceholder,
    defaultValue: defaultValue.substring(0, 50),
    actualValue: actualValue ? (actualValue.length > 20 ? actualValue.substring(0, 20) + '...' : actualValue) : 'NOT SET'
  });
}

// Print report
console.log('\n' + '='.repeat(80));
console.log('🔍 Environment Variables Check Report');
console.log('='.repeat(80) + '\n');

// Required variables
console.log('📌 REQUIRED VARIABLES (Must be set):');
console.log('-'.repeat(80));
if (categories.required.length === 0) {
  console.log('  (No required variables found)\n');
} else {
  let allRequiredOk = true;
  for (const item of categories.required) {
    const icon = item.status === '✓' ? '✅' : '❌';
    console.log(`  ${icon} ${item.status.padEnd(12)} ${item.key.padEnd(35)} = ${item.actualValue}`);
    if (item.status !== '✓') {
      allRequiredOk = false;
    }
  }
  if (!allRequiredOk) {
    console.log('\n  ⚠️  Some required variables are missing or using placeholder values!');
  }
  console.log();
}

// Recommended variables
console.log('💡 RECOMMENDED VARIABLES (Should be set for full functionality):');
console.log('-'.repeat(80));
if (categories.recommended.length === 0) {
  console.log('  (No recommended variables found)\n');
} else {
  for (const item of categories.recommended) {
    const icon = item.status === '✓' ? '✅' : '⚠️';
    console.log(`  ${icon} ${item.status.padEnd(12)} ${item.key.padEnd(35)} = ${item.actualValue}`);
  }
  console.log();
}

// Optional variables
console.log('⚙️  OPTIONAL VARIABLES (Have default values):');
console.log('-'.repeat(80));
const optionalSet = categories.optional.filter(item => item.isSet && !item.isPlaceholder);
if (optionalSet.length === 0) {
  console.log('  (All using defaults)\n');
} else {
  for (const item of optionalSet) {
    console.log(`  ✅ SET           ${item.key.padEnd(35)} = ${item.actualValue}`);
  }
  console.log();
}

// Summary
const totalRequired = categories.required.length;
const requiredOk = categories.required.filter(item => item.status === '✓').length;
const totalRecommended = categories.recommended.length;
const recommendedOk = categories.recommended.filter(item => item.status === '✓').length;

console.log('='.repeat(80));
console.log('📊 SUMMARY:');
console.log('='.repeat(80));
console.log(`  Required:     ${requiredOk}/${totalRequired} ✓`);
console.log(`  Recommended:  ${recommendedOk}/${totalRecommended} ✓`);
console.log(`  Optional:     ${optionalSet.length} customized`);

if (requiredOk === totalRequired && totalRequired > 0) {
  console.log('\n  ✅ All required variables are properly configured!');
} else if (totalRequired > 0) {
  console.log('\n  ❌ Some required variables are missing. Please check above.');
}

// Specific checks for deposit system
console.log('\n' + '='.repeat(80));
console.log('💾 DEPOSIT SYSTEM CHECK:');
console.log('='.repeat(80));

const depositVars = {
  'DEPOSIT_ESCROW_WALLET': process.env.DEPOSIT_ESCROW_WALLET,
  'DEPOSIT_ESCROW_PRIVATE_KEY': process.env.DEPOSIT_ESCROW_PRIVATE_KEY,
  'DEPOSIT_BURN_WALLET': process.env.DEPOSIT_BURN_WALLET || '1nc1nerator11111111111111111111111111111111',
  'LUNA_TOKEN_MINT': process.env.LUNA_TOKEN_MINT,
  'SOLANA_RPC_URL': process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'DEPOSIT_BASE_MIN_USD': process.env.DEPOSIT_BASE_MIN_USD || '10',
  'DEPOSIT_MIN_USD_FLOOR': process.env.DEPOSIT_MIN_USD_FLOOR || '5',
  'DEPOSIT_MIN_USD_CAP': process.env.DEPOSIT_MIN_USD_CAP || '30'
};

for (const [key, value] of Object.entries(depositVars)) {
  const isSet = value && value !== 'your_' && !value.includes('here');
  const icon = isSet ? '✅' : '❌';
  const displayValue = value ? (key.includes('PRIVATE_KEY') ? '[HIDDEN]' : value.substring(0, 30)) : 'NOT SET';
  console.log(`  ${icon} ${key.padEnd(35)} = ${displayValue}`);
}

console.log('\n');




