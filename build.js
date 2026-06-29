// build.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ASSETS = ['background.js', 'icons', 'popup', 'src', 'models'];
const DIST_DIR = path.join(process.cwd(), 'dist');

// ONNX Runtime wasm binaries, copied from node_modules so inference runs fully
// offline (no jsdelivr CDN fetch). Only the single-threaded variants are needed
// because vector-matcher pins numThreads to 1; the threaded build would require
// cross-origin isolation we do not have in an extension page.
const ORT_WASM_FILES = ['ort-wasm.wasm', 'ort-wasm-simd.wasm'];
const ORT_SRC_DIR = 'node_modules/onnxruntime-web/dist';
const ORT_DEST_DIR = 'src/libs/ort';

// Map local npm node_modules bundles directly to our native extension directory layouts
const VENDOR_LIBS = [
  { src: 'node_modules/webextension-polyfill/dist/browser-polyfill.js', dest: 'src/libs/webextension-polyfill.js' },
  { src: 'node_modules/rxjs/dist/bundles/rxjs.umd.min.js', dest: 'src/libs/rxjs.umd.min.js' },
  { src: 'node_modules/@preact/signals-core/dist/signals-core.module.js', dest: 'src/libs/signals.js' },
  { src: 'node_modules/@xenova/transformers/dist/transformers.min.js', dest: 'src/libs/transformers.js' }
  // Note: the CRDT store is hand-written (src/store/or-set.js) with no vendor
  // dependency, so there is nothing to copy for it here.
];

function cleanAndPrepare() {
  // Clear any existing distribution builds
  if (fs.existsSync(DIST_DIR)) fs.rmSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(DIST_DIR);
  
  // Ensure the internal local libraries folder structure is natively established
  fs.mkdirSync(path.join(process.cwd(), 'src', 'libs'), { recursive: true });

  // Gather dependency bundles out of node_modules cache and drop them into local src/libs/
  VENDOR_LIBS.forEach(lib => {
    const srcPath = path.join(process.cwd(), lib.src);
    const destPath = path.join(process.cwd(), lib.dest);
    if (fs.existsSync(srcPath)) {
      let content = fs.readFileSync(srcPath, 'utf-8');
      // Patch RxJS to work in a strict module worker context.
      if (lib.dest.includes('rxjs.umd.min.js')) {
        console.log('Patching RxJS for strict module environment...');
        // The UMD wrapper uses `this` which is undefined in a module.
        // We replace the top-level `this` argument to the IIFE with `globalThis`.
        // This allows RxJS to attach itself to `globalThis.rxjs`.
        content = content.replace(/(\(function\(g,y\)\{.*?\})\)\(this,/, '$1)(globalThis,');
      }

      // Patch Transformers.js to remove the protobufjs `inquire` eval.
      // ONNX Runtime bundles protobufjs to parse model files; protobuf probes
      // for an optional Node module with eval("require"), which MV3's CSP
      // forbids (only wasm-unsafe-eval is allowed). The call is wrapped in a
      // try/catch and only used for an unavailable Node fallback, so replacing
      // it with a function that returns null is a no-op functionally and
      // removes the CSP violation entirely.
      if (lib.dest.includes('transformers.js')) {
        const evalCall = 'eval("quire".replace(/^/,"re"))';
        if (content.includes(evalCall)) {
          console.log('Patching Transformers.js to remove protobufjs eval (MV3 CSP)...');
          content = content.split(evalCall).join('(function(){return null})');
        } else {
          console.warn('Transformers.js: protobufjs eval pattern not found; the bundled version may have changed.');
        }
      }

      fs.writeFileSync(destPath, content);
    } else {
      console.warn(`Missing vendor module dependency cache: ${lib.src}. Run "npm install" first.`);
    }
  });

  // Clean up old/incorrect RxJS file if it exists
  if (fs.existsSync('src/libs/rxjs.min.js')) fs.rmSync('src/libs/rxjs.min.js');

  // Copy the ONNX Runtime wasm binaries for offline inference.
  const ortDest = path.join(process.cwd(), ORT_DEST_DIR);
  fs.mkdirSync(ortDest, { recursive: true });
  ORT_WASM_FILES.forEach(file => {
    const srcPath = path.join(process.cwd(), ORT_SRC_DIR, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(ortDest, file));
    } else {
      console.warn(`Missing ONNX wasm binary: ${ORT_SRC_DIR}/${file}. Run "npm install" first.`);
    }
  });

  // The local AI model is optional and gitignored. Warn if it is absent so the
  // AI matching strategy degrades gracefully rather than failing silently.
  if (!fs.existsSync(path.join(process.cwd(), 'models'))) {
    console.warn('No models/ directory found. AI matching will be unavailable until you run "npm run fetch-model".');
  }
}

function buildTarget(platform) {
  console.log(`Packaging SoundLog for ${platform.toUpperCase()}...`);
  
  const stagePath = path.join(DIST_DIR, `stage-${platform}`);
  fs.mkdirSync(stagePath, { recursive: true });

  ASSETS.forEach(asset => {
    const src = path.join(process.cwd(), asset);
    const dest = path.join(stagePath, asset);
    if (!fs.existsSync(src)) return; // optional assets (e.g. models/) may be absent
    if (fs.statSync(src).isDirectory()) {
      fs.cpSync(src, dest, { recursive: true });
    } else {
      fs.copyFileSync(src, dest);
    }
  });

  const manifestSrc = path.join(process.cwd(), 'config', `manifest.${platform}.json`);
  const manifestDest = path.join(stagePath, 'manifest.json');
  fs.copyFileSync(manifestSrc, manifestDest);

  const zipName = `soundlog-${platform}.zip`;
  try {
    if (process.platform === 'win32') {
      execSync(`powershell Compress-Archive -Path "${stagePath}\\*" -DestinationPath "${path.join(DIST_DIR, zipName)}" -Force`);
    } else {
      execSync(`cd "${stagePath}" && zip -r "../${zipName}" ./* > /dev/null`);
    }
    console.log(`Generated dist/${zipName}`);
  } catch (err) {
    console.error(`Failed to package ${platform}:`, err.message);
  }

  fs.rmSync(stagePath, { recursive: true });
}

// Master execution pipeline
cleanAndPrepare();
buildTarget('chrome');
buildTarget('firefox');
console.log('\nMulti-platform bundle compilation complete! Vendors populated and artifacts ready in /dist');