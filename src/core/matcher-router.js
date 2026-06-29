// src/core/matcher-router.js
// Strategy-aware match confidence. This is the opt-in AI surface: select a
// strategy in the popup, then call verifyMatchConfidence (exposed for
// deliberate testing as runMatchTest on the background page). The queue's
// de-duplication does NOT go through here; it uses the cheap text matcher in
// text-match.js directly so a bulk scan never triggers model inference.
import { matchingStrategy } from '../store/state.js';
import { calculateTextSimilarity } from './text-match.js';

// Lazily loaded so text-only strategies never pull in the heavy
// Transformers.js/ONNX bundle.
async function calculateSemanticSimilarity(a, b) {
  const mod = await import('./vector-matcher.js');
  return mod.calculateSemanticSimilarity(a, b);
}

export async function verifyMatchConfidence(a, b) {
  const strategy = matchingStrategy.value;
  const textScore = calculateTextSimilarity(a, b);

  if (strategy === 'levenshtein') return textScore;
  if (strategy === 'ai') return await calculateSemanticSimilarity(a, b);

  // hybrid: trust clear verdicts from the cheap matcher and only spend an
  // embedding on genuinely ambiguous pairs. A score above 0.95 is almost
  // certainly the same title; below 0.80 is almost certainly different. The AI
  // only weighs in on the uncertain middle band.
  if (textScore >= 0.95 || textScore < 0.80) return textScore;
  return await calculateSemanticSimilarity(a, b);
}
