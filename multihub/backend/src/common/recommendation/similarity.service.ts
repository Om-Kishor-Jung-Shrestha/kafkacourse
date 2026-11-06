import { VECTOR_DIM } from './dictionary';

// §18.2 — cosine similarity between two dictionary-encoded feature vectors.
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length !== VECTOR_DIM) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Simple top-K selection by score, descending.
export function topK<T>(items: T[], scoreFn: (t: T) => number, k: number): T[] {
  return [...items]
    .map((item) => ({ item, s: scoreFn(item) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((h) => h.item);
}
