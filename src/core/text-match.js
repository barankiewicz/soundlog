// src/core/text-match.js
// Cheap, deterministic, dependency-free string matching. Kept separate from
// matcher-router so the hot de-duplication path never imports the reactive
// state layer or the Transformers.js/ONNX bundle.

function getLevenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Normalized Levenshtein similarity in [0, 1]. Strips punctuation and case so
// "The Glow Pt. 2" and "the glow pt 2" compare as identical.
export function calculateTextSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const s2 = str2.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  if (s1 === s2) return 1.0;

  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 1.0;

  return (maxLength - getLevenshteinDistance(s1, s2)) / maxLength;
}

// Used to de-duplicate the queue. Catches reissues and remasters
// ("Abbey Road" vs "Abbey Road (Remastered)") without any model.
export function verifyTextMatch(a, b) {
  return calculateTextSimilarity(a, b);
}
