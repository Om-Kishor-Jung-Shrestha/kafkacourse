export function money(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  return v === 0 ? 'Free' : `$${v.toFixed(2)}`;
}

export function moneyPlain(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

/** 3725 -> "1h 2m" ; 300 -> "5m" ; 0 -> "" */
export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${Math.max(m, 1)}m`;
}

/** 125 -> "2:05" (lesson row timestamps) */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function timeAgo(iso: string | Date): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function shortDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fullName(u: { firstName?: string | null; lastName?: string | null; email?: string } | null | undefined): string {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '';
}

export function initials(u: { firstName?: string | null; lastName?: string | null; email?: string } | null | undefined): string {
  const f = u?.firstName?.[0] ?? '';
  const l = u?.lastName?.[0] ?? '';
  return (f + l || u?.email?.[0] || '?').toUpperCase();
}

export function labelize(s: string): string {
  return s.replace(/[-_]/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export const CATEGORIES = [
  'programming', 'data-science', 'design', 'business', 'marketing', 'music', 'health', 'other',
] as const;

export const LEVELS: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Expert',
  ALL_LEVELS: 'All levels',
};

/** Pull a YouTube video id out of the common URL shapes, else null. */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
