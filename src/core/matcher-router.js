import { calculateSemanticConfidence } from './vector-matcher.js';
import { matchingStrategy } from '../store/state.js';

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

function calculateTextSimilarity(str1, str2) {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const s2 = str2.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  if (s1 === s2) return 1.0;
  
  const maxLength = Math.max(s1.length, s2.length);
  if (maxLength === 0) return 1.0;
  
  const distance = getLevenshteinDistance(s1, s2);
  return (maxLength - distance) / maxLength;
}

export async function verifyMatchConfidence(sourceAlbum, candidateUrlSlug) {
  const strategy = matchingStrategy.value;
  const cleanUrlString = candidateUrlSlug.replace(/-/g, " ");

  if (strategy === 'levenshtein') {
    return calculateTextSimilarity(sourceAlbum, cleanUrlString);
  }

  if (strategy === 'ai') {
    return await calculateSemanticConfidence(sourceAlbum, cleanUrlString);
  }

  if (strategy === 'hybrid') {
    const textScore = calculateTextSimilarity(sourceAlbum, cleanUrlString);
    if (textScore >= 0.95) return textScore; 
    return await calculateSemanticConfidence(sourceAlbum, cleanUrlString);
  }

  return null;
}