// Quick System Status Check for Luna AI
// Run: node check-system-status.js

import fetch from 'node-fetch';

const API_BASE = process.env.API_BASE || 'http://localhost:8787';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkStatus() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🔍 ตรวจสอบสถานะระบบ Luna AI', 'cyan');
  log('='.repeat(60), 'cyan');
  
  try {
    // 1. Basic Health Check
    log('\n📡 ตรวจสอบ Server...', 'blue');
    const healthRes = await fetch(`${API_BASE}/_health`);
    const health = await healthRes.json();
    if (health.ok) {
      log('  ✅ Server ทำงานได้ปกติ', 'green');
    } else {
      log('  ❌ Server มีปัญหา', 'red');
      return;
    }
    
    // 2. Luna Status
    log('\n🤖 ตรวจสอบ Luna Status...', 'blue');
    try {
      const statusRes = await fetch(`${API_BASE}/luna/status`);
      const status = await statusRes.json();
      if (status.ok) {
        log('  ✅ Luna Status: ทำงานได้', 'green');
        log(`  📊 VTS: ${status.vts.status}`, status.vts.authenticated ? 'green' : 'yellow');
        log(`  🎤 TTS: ${status.tts.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}`, status.tts.enabled ? 'green' : 'yellow');
        log(`  🧠 AI: ${status.ai.hasKey ? 'พร้อมใช้งาน' : 'ไม่มี API Key'}`, status.ai.hasKey ? 'green' : 'red');
        log(`  😴 Sleepy Mode: ${status.sleepy.mode ? 'เปิด' : 'ปิด'}`, 'blue');
      } else {
        log('  ⚠️  Luna Status: มีปัญหา', 'yellow');
      }
    } catch (e) {
      log(`  ❌ ไม่สามารถดึง Luna Status: ${e.message}`, 'red');
    }
    
    // 3. Health Check (Detailed)
    log('\n🏥 ตรวจสอบ Health Check...', 'blue');
    try {
      const healthRes = await fetch(`${API_BASE}/luna/health`);
      const health = await healthRes.json();
      if (health.ok) {
        log('  ✅ ระบบสุขภาพดี (Healthy)', 'green');
        log(`  ⏱️  Uptime: ${Math.round(health.uptime / 60)} นาที`, 'blue');
        log(`  💾 Memory: ${health.resources.memory.heapUsed}MB / ${health.resources.memory.heapTotal}MB (${health.resources.memory.percentage}%)`, 
            health.resources.memory.percentage > 80 ? 'yellow' : 'green');
        log(`  🔌 WebSocket Clients: ${health.resources.websocket.connectedClients}`, 'blue');
        
        if (health.issues && health.issues.length > 0) {
          log('\n  ⚠️  ปัญหาที่พบ:', 'yellow');
          health.issues.forEach(issue => log(`    - ${issue}`, 'yellow'));
        }
      } else {
        log('  ⚠️  ระบบมีปัญหา (Degraded)', 'yellow');
        if (health.issues && health.issues.length > 0) {
          log('  ปัญหา:', 'red');
          health.issues.forEach(issue => log(`    - ${issue}`, 'red'));
        }
      }
    } catch (e) {
      log(`  ❌ ไม่สามารถดึง Health Check: ${e.message}`, 'red');
    }
    
    // 4. Test Chat
    log('\n💬 ทดสอบ Chat System...', 'blue');
    try {
      const chatRes = await fetch(`${API_BASE}/luna/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'สวัสดี', user: 'test' })
      });
      const chat = await chatRes.json();
      if (chat.ok) {
        log('  ✅ Chat System: ทำงานได้', 'green');
      } else {
        log(`  ❌ Chat System: ${chat.error || 'มีปัญหา'}`, 'red');
      }
    } catch (e) {
      log(`  ❌ Chat System Error: ${e.message}`, 'red');
    }
    
    // 5. RPS System
    log('\n🎮 ตรวจสอบ RPS System...', 'blue');
    try {
      const rpsRes = await fetch(`${API_BASE}/luna/rps/contract-address`);
      const rps = await rpsRes.json();
      if (rps.ok) {
        log('  ✅ RPS System: ทำงานได้', 'green');
        log(`  📍 Contract: ${rps.contractAddress ? rps.contractAddress.substring(0, 20) + '...' : 'N/A'}`, 'blue');
      } else {
        log('  ⚠️  RPS System: มีปัญหา', 'yellow');
      }
    } catch (e) {
      log(`  ⚠️  RPS System: ${e.message}`, 'yellow');
    }
    
    // Summary
    log('\n' + '='.repeat(60), 'cyan');
    log('📋 สรุปสถานะระบบ', 'cyan');
    log('='.repeat(60), 'cyan');
    log('✅ ระบบส่วนใหญ่ทำงานได้ดี', 'green');
    log('⚠️  หากพบปัญหา ให้ restart server: npm start', 'yellow');
    log('='.repeat(60) + '\n', 'cyan');
    
  } catch (error) {
    log('\n❌ ไม่สามารถเชื่อมต่อกับ server!', 'red');
    log('กรุณาตรวจสอบว่า server กำลังทำงานอยู่:', 'yellow');
    log('  npm start', 'blue');
    log(`\nError: ${error.message}\n`, 'red');
  }
}

checkStatus();


