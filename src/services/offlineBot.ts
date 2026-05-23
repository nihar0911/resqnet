import offlineDb from './offlineChatDb.json';

// Simple token-based Jaccard similarity
function getSimilarity(str1: string, str2: string) {
  const set1 = new Set(str1.toLowerCase().split(/\W+/).filter(w => w.length > 0));
  const set2 = new Set(str2.toLowerCase().split(/\W+/).filter(w => w.length > 0));
  
  if (set1.size === 0 || set2.size === 0) return 0;
  
  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }
  
  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

export function getOfflineChatResponse(message: string, disasterType: string): string {
  // Normalize disaster type if needed, default to Flood if unknown
  const validDisaster = (offlineDb as any)[disasterType] ? disasterType : 'Flood';
  const qaPairs = (offlineDb as any)[validDisaster] as Array<{question: string, answer: string}>;
  
  let bestMatch = null;
  let highestScore = 0;

  for (const pair of qaPairs) {
    const score = getSimilarity(message, pair.question);
    if (score > highestScore) {
      highestScore = score;
      bestMatch = pair;
    }
  }

  // If score is too low, we didn't understand the question.
  // 0.15 is a reasonable threshold for partial matches in short sentences.
  if (highestScore > 0.15 && bestMatch) {
    return bestMatch.answer;
  }

  // Fallback if no match
  return "Connection is unstable. Stay safe and conserve your device battery. Rescue is en route.";
}
