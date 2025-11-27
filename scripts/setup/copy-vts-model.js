// copy-vts-model.js
// Script สำหรับคัดลอกโมเดลจาก VTube Studio ไปยัง Luna AI project

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// หา path ของ VTube Studio models
function findVTSModelsPath() {
  const platform = os.platform();
  const username = os.userInfo().username;
  const appData = process.env.APPDATA || '';
  
  if (platform === 'win32') {
    // Windows paths - ลองหลาย path
    const possiblePaths = [
      // Standard AppData path
      path.join(appData, 'VTubeStudio', 'Live2DModels'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'VTubeStudio', 'Live2DModels'),
      path.join('C:', 'Users', username, 'AppData', 'Roaming', 'VTubeStudio', 'Live2DModels'),
      // Alternative paths
      path.join(os.homedir(), 'AppData', 'Local', 'VTubeStudio', 'Live2DModels'),
      path.join('C:', 'Program Files', 'VTubeStudio', 'Live2DModels'),
      path.join('C:', 'Program Files (x86)', 'VTubeStudio', 'Live2DModels'),
      // Try with different casing
      path.join(appData, 'vtubestudio', 'Live2DModels'),
      path.join(appData, 'VTube Studio', 'Live2DModels'),
    ];
    
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        return p;
      }
    }
    
    // Try to find by searching common locations
    const commonLocations = [
      path.join(appData, 'VTubeStudio'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'VTubeStudio'),
    ];
    
    for (const basePath of commonLocations) {
      if (fs.existsSync(basePath)) {
        // Look for Live2DModels folder
        const items = fs.readdirSync(basePath, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory() && item.name.toLowerCase().includes('live2d')) {
            const modelPath = path.join(basePath, item.name);
            if (fs.existsSync(modelPath)) {
              return modelPath;
            }
          }
        }
      }
    }
  } else if (platform === 'darwin') {
    // macOS
    const possiblePaths = [
      path.join(os.homedir(), 'Library', 'Application Support', 'VTubeStudio', 'Live2DModels'),
      path.join(os.homedir(), 'Library', 'Application Support', 'VTube Studio', 'Live2DModels'),
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  } else if (platform === 'linux') {
    // Linux
    const possiblePaths = [
      path.join(os.homedir(), '.config', 'VTubeStudio', 'Live2DModels'),
      path.join(os.homedir(), '.local', 'share', 'VTubeStudio', 'Live2DModels'),
    ];
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
  }
  
  return null;
}

// หาโมเดลทั้งหมดใน VTS folder
function listVTSModels(vtsPath) {
  if (!vtsPath || !fs.existsSync(vtsPath)) {
    return [];
  }
  
  const items = fs.readdirSync(vtsPath, { withFileTypes: true });
  const models = [];
  
  for (const item of items) {
    if (item.isDirectory()) {
      const modelPath = path.join(vtsPath, item.name);
      // ตรวจสอบว่ามีไฟล์ .model3.json หรือไม่
      const files = fs.readdirSync(modelPath);
      const hasModelFile = files.some(f => f.endsWith('.model3.json'));
      
      if (hasModelFile) {
        models.push({
          name: item.name,
          path: modelPath,
        });
      }
    }
  }
  
  return models;
}

// คัดลอกโมเดล
function copyModel(sourcePath, destPath) {
  console.log(`\n📦 Copying model from: ${sourcePath}`);
  console.log(`   To: ${destPath}`);
  
  // สร้าง destination directory
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(destPath, { recursive: true });
    console.log(`   ✓ Created directory: ${destPath}`);
  }
  
  // คัดลอกไฟล์ทั้งหมด
  const files = fs.readdirSync(sourcePath, { withFileTypes: true });
  let copiedCount = 0;
  
  for (const file of files) {
    const sourceFile = path.join(sourcePath, file.name);
    const destFile = path.join(destPath, file.name);
    
    try {
      if (file.isDirectory()) {
        // คัดลอกโฟลเดอร์ (recursive)
        copyDirectory(sourceFile, destFile);
        copiedCount++;
      } else {
        // คัดลอกไฟล์
        fs.copyFileSync(sourceFile, destFile);
        copiedCount++;
      }
    } catch (error) {
      console.error(`   ✗ Failed to copy ${file.name}:`, error.message);
    }
  }
  
  console.log(`   ✓ Copied ${copiedCount} items`);
  return copiedCount;
}

// คัดลอกโฟลเดอร์ (recursive)
function copyDirectory(sourceDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const files = fs.readdirSync(sourceDir, { withFileTypes: true });
  
  for (const file of files) {
    const sourcePath = path.join(sourceDir, file.name);
    const destPath = path.join(destDir, file.name);
    
    if (file.isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

// Main function
function main() {
  console.log('🔍 Searching for VTube Studio models...\n');
  
  const vtsPath = findVTSModelsPath();
  
  if (!vtsPath) {
    console.error('❌ VTube Studio models folder not found!');
    console.log('\n📝 Please check these locations:');
    console.log('  Windows: %AppData%\\VTubeStudio\\Live2DModels');
    console.log('  Windows: C:\\Users\\[YourUsername]\\AppData\\Roaming\\VTubeStudio\\Live2DModels');
    console.log('  macOS: ~/Library/Application Support/VTubeStudio/Live2DModels');
    console.log('  Linux: ~/.config/VTubeStudio/Live2DModels');
    console.log('\n💡 Alternative: You can manually copy the model folder:');
    console.log('   1. Find your VTube Studio model folder');
    console.log('   2. Copy the entire folder to:');
    console.log(`      ${path.join(__dirname, 'public', 'models', '[model-name]')}`);
    console.log('   3. Make sure the .model3.json file is inside');
    process.exit(1);
  }
  
  console.log(`✓ Found VTube Studio models at: ${vtsPath}\n`);
  
  // หาโมเดลทั้งหมด
  const models = listVTSModels(vtsPath);
  
  if (models.length === 0) {
    console.error('❌ No Live2D models found in VTube Studio folder!');
    process.exit(1);
  }
  
  console.log(`📋 Found ${models.length} model(s):\n`);
  models.forEach((model, index) => {
    console.log(`  ${index + 1}. ${model.name}`);
  });
  
  // ถ้ามี argument ให้ใช้โมเดลนั้น
  const modelName = process.argv[2];
  
  if (modelName) {
    const model = models.find(m => m.name.toLowerCase() === modelName.toLowerCase());
    if (!model) {
      console.error(`\n❌ Model "${modelName}" not found!`);
      console.log(`\nAvailable models: ${models.map(m => m.name).join(', ')}`);
      process.exit(1);
    }
    
    // คัดลอกโมเดลที่เลือก
    const destPath = path.join(__dirname, 'public', 'models', model.name);
    copyModel(model.path, destPath);
    
    console.log(`\n✅ Successfully copied model "${model.name}"!`);
    console.log(`\n📝 Next steps:`);
    console.log(`   1. Open: http://localhost:8787/luna-character?model=${model.name}`);
    console.log(`   2. Or use in OBS Browser Source with the same URL`);
  } else {
    // ถ้าไม่มี argument ให้แสดงคำแนะนำ
    console.log(`\n💡 Usage:`);
    console.log(`   node copy-vts-model.js [model-name]`);
    console.log(`\n📝 Examples:`);
    models.slice(0, 3).forEach(model => {
      console.log(`   node copy-vts-model.js ${model.name}`);
    });
    console.log(`\n💡 Or copy all models:`);
    console.log(`   node copy-vts-model.js all`);
  }
  
  // ถ้าเลือก "all" ให้คัดลอกทั้งหมด
  if (modelName && modelName.toLowerCase() === 'all') {
    console.log(`\n📦 Copying all models...\n`);
    const destBase = path.join(__dirname, 'public', 'models');
    
    models.forEach(model => {
      const destPath = path.join(destBase, model.name);
      copyModel(model.path, destPath);
    });
    
    console.log(`\n✅ Successfully copied ${models.length} model(s)!`);
    console.log(`\n📝 You can now use any model with:`);
    console.log(`   http://localhost:8787/luna-character?model=[model-name]`);
  }
}

// Run
main();

