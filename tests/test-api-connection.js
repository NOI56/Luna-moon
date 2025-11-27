// Test API connection
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const apiKey = process.env.OPENROUTER_KEY || process.env.OPENAI_KEY;
const endpoint = process.env.OPENAI_KEY
  ? "https://api.openai.com/v1/chat/completions"
  : "https://openrouter.ai/api/v1/chat/completions";

const model = process.env.COMPLEX_MODEL || process.env.SIMPLE_MODEL || "anthropic/claude-3-opus";

console.log('\n=== Testing API Connection ===\n');
console.log(`Endpoint: ${endpoint}`);
console.log(`Model: ${model}`);
console.log(`API Key: ${apiKey ? apiKey.substring(0, 7) + '...' + apiKey.substring(apiKey.length - 4) : 'NOT SET'}\n`);

if (!apiKey) {
  console.log('❌ No API key found!');
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${apiKey}`
};

if (!process.env.OPENAI_KEY) {
  headers["HTTP-Referer"] = "https://luna.local";
  headers["X-Title"] = "Luna AI Streamer";
}

const body = {
  model: model,
  messages: [
    { role: "user", content: "Hello, this is a test message." }
  ]
};

try {
  console.log('Sending test request...\n');
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const responseText = await response.text();
  console.log(`Status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    console.log(`\n❌ Error Response:`);
    console.log(responseText);
    
    try {
      const errorJson = JSON.parse(responseText);
      if (errorJson.error) {
        console.log(`\nError Code: ${errorJson.error.code || 'N/A'}`);
        console.log(`Error Message: ${errorJson.error.message || 'N/A'}`);
      }
    } catch (e) {
      // Not JSON
    }
  } else {
    try {
      const json = JSON.parse(responseText);
      console.log('\n✅ Success!');
      console.log(`Response: ${json.choices?.[0]?.message?.content || 'No content'}`);
    } catch (e) {
      console.log('\n✅ Success! (Non-JSON response)');
      console.log(responseText);
    }
  }
} catch (error) {
  console.log(`\n❌ Network Error:`);
  console.log(error.message);
}



