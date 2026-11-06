import { encodeCourse, normalizeCategory, priceTierFromCents, VECTOR_DIM } from './dictionary';

describe('dictionary', () => {
  it('encodeCourse produces a vector of VECTOR_DIM length', () => {
    const v = encodeCourse({ category: 'programming', level: 'BEGINNER', tags: ['react'], priceCents: 4999, language: 'en' });
    expect(v.length).toBe(VECTOR_DIM);
  });

  it('normalizeCategory falls back to "other" for unknown categories', () => {
    expect(normalizeCategory('totally-made-up')).toBe('other');
  });

  it('priceTierFromCents returns FREE for 0', () => {
    expect(priceTierFromCents(0)).toBe('FREE');
  });

  it('priceTierFromCents returns PREMIUM for >= 15000', () => {
    expect(priceTierFromCents(20000)).toBe('PREMIUM');
  });

  it('encodeCourse applies sqrt-weighted tags so weight sums are stable', () => {
    const v = encodeCourse({ category: 'other', level: 'BEGINNER', tags: ['react', 'javascript'], priceCents: 0, language: 'en' });
    const nonZero = Array.from(v).filter((x) => x > 0 && x < 1);
    expect(nonZero.length).toBeGreaterThan(0);
  });
});
