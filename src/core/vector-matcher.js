// src/core/vector-matcher.js
import { env, pipeline } from '../libs/transformers.js';

// Fully local, offline inference. The model weights ship in the extension
// (run `npm run fetch-model`, then build) and the ONNX wasm runtime is bundled
// from node_modules at build time. Nothing is fetched from a remote CDN, which
// is what makes the "local-first, zero cloud" claim true.
env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = browser.runtime.getURL('models/');

// Point ONNX at the bundled wasm binaries instead of the jsdelivr CDN.
env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('src/libs/ort/');
// Single thread: avoids the cross-origin-isolation requirement of the threaded
// wasm build and keeps memory predictable inside the extension sandbox.
env.backends.onnx.wasm.numThreads = 1;

let embeddingPipelineInstance = null;

async function getEmbeddingPipeline() {
  if (!embeddingPipelineInstance) {
    console.log("Loading ONNX pipeline [Xenova/all-MiniLM-L6-v2]...");
    embeddingPipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingPipelineInstance;
}

async function getVectorEmbedding(text) {
  const extractor = await getEmbeddingPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Returns cosine similarity [0, 1] between two strings using on-device ONNX embeddings.
// Handles variants like "The Glow, Pt. 2" vs "The Glow, Part II (Remastered)".
export async function calculateSemanticSimilarity(stringA, stringB) {
  if (!stringA || !stringB) return 0;

  const cleanA = stringA.trim();
  const cleanB = stringB.trim();

  if (cleanA.toLowerCase() === cleanB.toLowerCase()) return 1.0;

  try {
    const vecA = await getVectorEmbedding(cleanA);
    const vecB = await getVectorEmbedding(cleanB);

    // Vectors are pre-normalized by the extractor, so dot product == cosine similarity
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];

    console.log(`Vector match: "${cleanA}" <-> "${cleanB}" = ${(dot * 100).toFixed(1)}%`);
    return dot;
  } catch (err) {
    console.error("Vector inference failed, returning 0:", err);
    return 0;
  }
}
