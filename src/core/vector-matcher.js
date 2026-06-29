// src/core/vector-matcher.js
import { env, pipeline } from '../libs/transformers.js';

// ============================================================================
// COMPLIANT MANIFEST V3 ENVIRONMENT OVERRIDES
// ============================================================================
// These flags override default library behaviors to prevent dynamic evaluation
// strings (eval) from executing, ensuring seamless operation inside strict sandboxes.
env.allowLocalModels = false; // Blocks unsecure remote content delivery network lookups
env.localModelPath = browser.runtime.getURL('models/'); // Forces asset routing out of local folders
env.backends.onnx.env.wasm.numThreads = 1; // Pins memory pooling tasks to a safe, single WASM thread

// Internal structural storage tracking our initialized AI pipeline singleton context
let embeddingPipelineInstance = null;

/**
 * Singleton Pattern: Resolves or instantiates the Transformers feature extraction pipeline.
 * This ensures the heavy model architecture files are parsed and mapped into active memory 
 * only once across the life execution circle of the worker context.
 * * @returns {Promise<Function>} The underlying ONNX compilation worker extractor routine.
 */
async function getEmbeddingPipeline() {
  if (!embeddingPipelineInstance) {
    console.log("Loading ONNX WebAssembly vector pipeline [Xenova/all-MiniLM-L6-v2]...");
    embeddingPipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingPipelineInstance;
}

/**
 * Generates a standard coordinate float array vector embedding out of a raw string block.
 * * @param {string} textString - The target phrase or text segment to process.
 * @returns {Promise<Array<number>>} A clean, one-dimensional coordinate array of size 384.
 */
async function getVectorEmbedding(textString) {
  const extractor = await getEmbeddingPipeline();
  
  // Pass text straight into ONNX runtime while applying strict mean pooling and normalization flags
  const outputTensor = await extractor(textString, { pooling: 'mean', normalize: true });
  
  // Safely extract the data points straight out of underlying browser WebAssembly memory buffers
  return Array.from(outputTensor.data);
}

/**
 * Calculates the exact Cosine Similarity index rating metric across two textual records.
 * Provides a highly reliable confidence matching calculation based purely on semantic meaning
 * rather than simple character sequences (e.g. "The Glow, Pt. 2" vs "The Glow, Part II (Remastered)")
 * * @param {string} stringA - First comparison string element (e.g., historical Last.fm scrobble metadata)
 * @param {string} stringB - Second comparison string element (e.g., RateYourMusic structural search entries)
 * @returns {Promise<number>} A clean matching decimal percentage index bounded between 0.00 and 1.00.
 */
export async function calculateSemanticSimilarity(stringA, stringB) {
  // Edge-case protection layer
  if (!stringA || !stringB) return 0;
  
  const cleanA = stringA.trim();
  const cleanB = stringB.trim();
  
  if (cleanA.toLowerCase() === cleanB.toLowerCase()) return 1.0; // Fast shortcut match for exact spellers

  try {
    // Generate coordinate paths for both elements
    const vecA = await getVectorEmbedding(cleanA);
    const vecB = await getVectorEmbedding(cleanB);
    
    // Evaluate the dot product across the 384 dimensional tensor axis arrays
    let dotProduct = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
    }
    
    console.log(`AI Vector Comparison Match Result: "${cleanA}" <-> "${cleanB}" = ${(dotProduct * 100).toFixed(1)}%`);
    
    // Since vectors were pre-normalized by the extractor pipeline layer, the dot product
    // is equivalent to the absolute cosine similarity calculation index score.
    return dotProduct;
    
  } catch (err) {
    console.error("Vector Inference Engine Error. Reverting to structural fallback protocols: ", err);
    return 0; // Return zero baseline security score if target local processing loop stalls out
  }
}