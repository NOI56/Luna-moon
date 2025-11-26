// Quick script to check if API keys are set
import dotenv from 'dotenv';

dotenv.config();

console.log('\n=== API Key Check ===\n');

const openaiKey = process.env.OPENAI_KEY;
const openrouterKey = process.env.OPENROUTER_KEY;

if (openaiKey) {
  const masked = openaiKey.substring(0, 7) + '...' + openaiKey.substring(openaiKey.length - 4);
  console.log('✓ OPENAI_KEY: SET');
  console.log(`  Key: ${masked}`);
} else {
  console.log('✗ OPENAI_KEY: NOT SET');
}

if (openrouterKey) {
  const masked = openrouterKey.substring(0, 7) + '...' + openrouterKey.substring(openrouterKey.length - 4);
  console.log('✓ OPENROUTER_KEY: SET');
  console.log(`  Key: ${masked}`);
} else {
  console.log('✗ OPENROUTER_KEY: NOT SET');
}

if (!openaiKey && !openrouterKey) {
  console.log('\n⚠️  ERROR: No API key found!');
  console.log('Please set either OPENAI_KEY or OPENROUTER_KEY in your .env file');
  process.exit(1);
}

console.log('\n✅ At least one API key is set\n');


