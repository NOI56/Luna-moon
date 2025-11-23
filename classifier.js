// modules/classifier.js
// Simple heuristic + optional hook for AI-based "should respond" logic.

const FORCE_KEYWORDS = ["luna", "moon", "pump", "fun", "help", "love", "hate", "why", "gm", "gn", "?"];

export function shouldRespondHeuristic(text) {
  const t = (text || "").toLowerCase().trim();
  if (!t) return false;
  if (t.length >= 120) return true;
  if (FORCE_KEYWORDS.some((k) => t.includes(k))) return true;
  if (t.endsWith("?")) return true;
  if (t.length <= 3) return Math.random() < 0.2;
  if (t.length <= 10) return Math.random() < 0.4;
  return Math.random() < 0.7;
}
