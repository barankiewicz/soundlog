// scripts/fetch-model.mjs
// Downloads the quantized all-MiniLM-L6-v2 model into models/ so the extension
// can run sentence embeddings fully offline. Run once with `npm run fetch-model`
// (needs network); the files are gitignored and bundled into dist/ by build.js.
import fs from 'fs';
import path from 'path';

const REPO = 'Xenova/all-MiniLM-L6-v2';
const BASE = `https://huggingface.co/${REPO}/resolve/main`;
const OUT_DIR = path.join(process.cwd(), 'models', REPO);

// The file set Transformers.js loads for a quantized feature-extraction model.
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx'
];

function human(bytes) {
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function download(file) {
  const url = `${BASE}/${file}`;
  const dest = path.join(OUT_DIR, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  process.stdout.write(`  ${file} ... `);
  // HuggingFace rejects requests without a User-Agent.
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'soundlog-fetch-model' }, redirect: 'follow' });
  } catch (err) {
    // A real network/DNS/TLS failure surfaces here (fetch rejects).
    throw new Error(`network error fetching ${url}: ${err.cause?.message || err.message}`);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(human(buf.length));
}

async function main() {
  console.log(`Fetching ${REPO} into models/`);
  for (const file of FILES) {
    await download(file);
  }
  console.log('\nDone. Run "npm run build" to bundle the model into dist/.');
}

main().catch(err => {
  console.error('\nfetch-model failed:', err.message);
  process.exit(1);
});
