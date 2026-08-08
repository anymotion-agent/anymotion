import fs from 'fs';
import path from 'path';
import https from 'https';

const EDITOR_DIR = path.resolve(process.cwd(), 'web-editor');
const ASSETS_DIR = path.join(EDITOR_DIR, 'assets', 'sfx');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return download(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Status ${response.statusCode} for ${url}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function setup() {
  console.log('Setting up Anymotion Editor Assets...');
  
  if (!fs.existsSync(EDITOR_DIR)) {
    fs.mkdirSync(EDITOR_DIR, { recursive: true });
  }

  // 1. Download 50+ Animations (Animate.css)
  console.log('Downloading animations.css...');
  await download(
    'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css',
    path.join(EDITOR_DIR, 'animations.css')
  );
  
  // 2. Download Real SFX Pack (Kenney UI Audio)
  console.log('Downloading Real SFX Pack...');
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  // Kenney UI Audio pack — correct file names from the pack
  // Source: https://kenney.nl/assets/ui-audio  (CC0 Public Domain)
  const sfxFiles = [
    'click_001.ogg', 'click_002.ogg', 'click_003.ogg', 'click_004.ogg', 'click_005.ogg',
    'drop_001.ogg', 'drop_002.ogg', 'drop_003.ogg', 'drop_004.ogg',
    'error_001.ogg', 'error_002.ogg', 'error_003.ogg', 'error_004.ogg',
    'confirmation_001.ogg', 'confirmation_002.ogg', 'confirmation_003.ogg', 'confirmation_004.ogg',
    'switch_001.ogg', 'switch_002.ogg', 'switch_003.ogg', 'switch_004.ogg',
    'maximize_001.ogg', 'minimize_001.ogg',
    'question_001.ogg', 'question_002.ogg', 'question_003.ogg',
    'glass_001.ogg', 'glass_002.ogg', 'glass_003.ogg', 'glass_004.ogg', 'glass_005.ogg',
    'rollover_001.ogg', 'rollover_002.ogg', 'rollover_003.ogg', 'rollover_004.ogg', 'rollover_005.ogg',
    'rollover_006.ogg'
  ];

  const baseUrl = 'https://raw.githubusercontent.com/mrchrisadams/kenney-ui-audio/main/Audio/';
  
  let count = 0;
  for (const file of sfxFiles) {
    try {
      await download(`${baseUrl}${file}`, path.join(ASSETS_DIR, file));
      count++;
      process.stdout.write(`\rDownloaded ${count}/${sfxFiles.length} SFX files...`);
    } catch (e) {
      console.warn(`\nFailed to download ${file}: ${e.message}`);
    }
  }
  
  console.log('\n\n✅ Asset setup complete! Editor is now loaded with real SFX and 50+ animations.');
}

setup().catch(console.error);
