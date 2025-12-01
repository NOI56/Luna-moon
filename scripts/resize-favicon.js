// Script to resize and convert image to favicon sizes
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Input and output paths
// Try luna-original.png first, fallback to logo.png
const inputPath1 = join(projectRoot, 'public', 'images', 'logo', 'luna-original.png');
const inputPath2 = join(projectRoot, 'public', 'images', 'logo', 'logo.png');
const inputPath = existsSync(inputPath1) ? inputPath1 : inputPath2;
const outputDir = join(projectRoot, 'public', 'images', 'logo');

// Favicon sizes (in pixels)
const sizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 64, name: 'favicon-64x64.png' },
  { size: 128, name: 'favicon-128x128.png' },
  { size: 256, name: 'favicon-256x256.png' },
  { size: 512, name: 'favicon-512x512.png' },
  { size: 192, name: 'apple-touch-icon.png' }, // Apple touch icon
];

async function resizeFavicons() {
  try {
    // Check if input file exists
    if (!existsSync(inputPath)) {
      console.error(`❌ Input file not found: ${inputPath}`);
      console.log(`\n📝 Please save your image as: ${inputPath}`);
      console.log('   (You can use any image format, script will convert to PNG)');
      process.exit(1);
    }

    console.log(`📸 Processing image: ${inputPath}`);
    
    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    console.log(`   Original size: ${metadata.width}x${metadata.height}px`);
    console.log(`   Format: ${metadata.format}`);
    
    // Resize to all sizes
    console.log('\n🔄 Resizing images...');
    for (const { size, name } of sizes) {
      const outputPath = join(outputDir, name);
      await sharp(inputPath)
        .resize(size, size, {
          fit: 'cover',
          position: 'center'
        })
        .png()
        .toFile(outputPath);
      console.log(`   ✅ Created: ${name} (${size}x${size}px)`);
    }
    
    // Also create main logo.png (256x256 for general use) - only if input is not logo.png
    if (inputPath !== inputPath2) {
      const mainLogoPath = join(outputDir, 'logo.png');
      await sharp(inputPath)
        .resize(256, 256, {
          fit: 'cover',
          position: 'center'
        })
        .png()
        .toFile(mainLogoPath);
      console.log(`   ✅ Created: logo.png (256x256px)`);
    } else {
      console.log(`   ℹ️  Skipped: logo.png (using existing file)`);
    }
    
    // Create favicon.ico (multi-size ICO file)
    // Note: sharp doesn't support ICO directly, so we'll create a 32x32 PNG as favicon.ico
    const faviconIcoPath = join(projectRoot, 'public', 'favicon.ico');
    await sharp(inputPath)
      .resize(32, 32, {
        fit: 'cover',
        position: 'center'
      })
      .png()
      .toFile(faviconIcoPath);
    console.log(`   ✅ Created: favicon.ico (32x32px)`);
    
    console.log('\n✨ All favicons created successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Hard refresh your browser (Ctrl+Shift+R)');
    console.log('   2. Clear browser cache if needed');
    console.log('   3. Phantom Wallet popup should now show Luna icon');
    
  } catch (error) {
    console.error('❌ Error processing image:', error.message);
    process.exit(1);
  }
}

resizeFavicons();

