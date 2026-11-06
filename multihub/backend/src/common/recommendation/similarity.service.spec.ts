import { cosineSimilarity, topK } from './similarity.service';
import { VECTOR_DIM } from './dictionary';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = new Float32Array(VECTOR_DIM).fill(1);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array(VECTOR_DIM);
    const b = new Float32Array(VECTOR_DIM);
    a[0] = 1;
    b[1] = 1;
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    const a = new Float32Array(VECTOR_DIM);
    const b = new Float32Array(VECTOR_DIM);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    const a = new Float32Array(VECTOR_DIM);
    const b = new Float32Array(VECTOR_DIM - 1);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe('topK', () => {
  it('returns top K items by score descending', () => {
    const items = [1, 5, 3, 9, 2];
    expect(topK(items, (x) => x, 2)).toEqual([9, 5]);
  });

  it('returns all items if fewer than K', () => {
    expect(topK([1, 2], (x) => x, 5)).toEqual([2, 1]);
  });

  it('handles empty input', () => {
    expect(topK([], (x: number) => x, 3)).toEqual([]);
  });
});
