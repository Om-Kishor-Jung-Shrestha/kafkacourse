// §18.1 — finite vocabulary encoding (RULE-17: no opaque Float[] vectors, only
// dictionary-backed one-hot / weighted features so vectors stay interpretable).

export const DICTIONARY_VERSION = 1;

export const CATEGORIES = [
  'programming', 'data-science', 'design', 'business', 'marketing',
  'photography', 'music', 'health', 'fitness', 'lifestyle',
  'language', 'math', 'science', 'history', 'literature',
  'art', 'cooking', 'gaming', 'sports', 'travel', 'other',
] as const;
export type CategoryKey = (typeof CATEGORIES)[number];

export const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'] as const;
export type LevelKey = (typeof LEVELS)[number];

export const TAGS = [
  'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'kotlin', 'swift',
  'react', 'vue', 'nextjs', 'nodejs', 'angular', 'svelte',
  'postgres', 'mysql', 'mongodb', 'redis', 'kafka', 'graphql', 'rest',
  'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'terraform', 'devops',
  'security', 'networking', 'linux', 'system-design', 'microservices',
  'ml', 'deep-learning', 'nlp', 'computer-vision', 'llm',
  'pytorch', 'tensorflow', 'pandas', 'numpy', 'sql', 'statistics',
  'figma', 'photoshop', 'illustrator', 'ux-design', 'ui-design', 'branding',
  'product-management', 'agile', 'scrum', 'leadership', 'negotiation',
  'seo', 'content-marketing', 'growth', 'analytics',
  'accounting', 'investing', 'crypto',
  'public-speaking', 'writing', 'copywriting', 'productivity',
  'guitar', 'piano', 'singing', 'music-theory',
  'drawing', 'painting', 'photography-portrait',
  'spanish', 'french', 'german', 'japanese',
  'yoga', 'meditation', 'nutrition', 'weight-training',
  'ios', 'android', 'flutter', 'unity', 'game-design',
  'testing', 'tdd', 'code-review',
] as const;
export type TagKey = (typeof TAGS)[number];

export const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi'] as const;
export type LanguageKey = (typeof LANGUAGES)[number];

export const PRICE_TIERS = ['FREE', 'LOW', 'MID', 'HIGH', 'PREMIUM'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const VECTOR_DIM = CATEGORIES.length + LEVELS.length + TAGS.length + LANGUAGES.length + PRICE_TIERS.length;

export function normalizeCategory(s: string): CategoryKey {
  const slug = s.toLowerCase().trim().replace(/\s+/g, '-');
  return (CATEGORIES as readonly string[]).includes(slug) ? (slug as CategoryKey) : 'other';
}

export function normalizeLanguage(s?: string): LanguageKey {
  if (!s) return 'en';
  const code = s.toLowerCase().split('-')[0];
  return (LANGUAGES as readonly string[]).includes(code) ? (code as LanguageKey) : 'en';
}

export function priceTierFromCents(c: number): PriceTier {
  if (c <= 0) return 'FREE';
  if (c < 2000) return 'LOW';
  if (c < 6000) return 'MID';
  if (c < 15000) return 'HIGH';
  return 'PREMIUM';
}

export interface CourseFeatures {
  category: string;
  level: LevelKey;
  tags: string[];
  priceCents: number;
  language: string;
}

/**
 * Encodes a course into a fixed-length feature vector using only the finite
 * dictionary above (one-hot category/level/language/price-tier, sqrt-weighted
 * multi-hot tags). This is the vector cosineSimilarity() compares.
 */
export function encodeCourse(f: CourseFeatures): Float32Array {
  const v = new Float32Array(VECTOR_DIM);
  let i = 0;

  const catIdx = CATEGORIES.indexOf(normalizeCategory(f.category));
  if (catIdx >= 0) v[i + catIdx] = 1;
  i += CATEGORIES.length;

  const lvlIdx = LEVELS.indexOf(f.level);
  if (lvlIdx >= 0) v[i + lvlIdx] = 1;
  i += LEVELS.length;

  const validTags = f.tags
    .map((t) => t.toLowerCase().trim().replace(/\s+/g, '-'))
    .filter((t) => (TAGS as readonly string[]).includes(t));
  const w = validTags.length > 0 ? 1 / Math.sqrt(validTags.length) : 0;
  for (const tag of validTags) {
    const idx = (TAGS as readonly string[]).indexOf(tag as TagKey);
    if (idx >= 0) v[i + idx] = w;
  }
  i += TAGS.length;

  const langIdx = LANGUAGES.indexOf(normalizeLanguage(f.language));
  if (langIdx >= 0) v[i + langIdx] = 1;
  i += LANGUAGES.length;

  const ptIdx = PRICE_TIERS.indexOf(priceTierFromCents(f.priceCents));
  if (ptIdx >= 0) v[i + ptIdx] = 1;
  i += PRICE_TIERS.length;

  return v;
}
