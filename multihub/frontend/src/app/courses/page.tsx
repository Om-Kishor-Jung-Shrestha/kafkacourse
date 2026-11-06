'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { CourseCard } from '@/components/CourseCard';
import { CourseCardSkeleton, EmptyState, ErrorState } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORIES, LEVELS, labelize } from '@/lib/format';

const PAGE_SIZE = 12;

const SORTS = [
  ['newest', 'Newest'], ['popular', 'Most popular'], ['rating', 'Highest rated'],
  ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'],
];

const PRICES: [string, string][] = [['', 'All prices'], ['free', 'Free'], ['paid', 'Paid'], ['under50', 'Under $50']];

function priceParams(price: string): string {
  if (price === 'free') return '&maxPrice=0';
  if (price === 'paid') return '&minPrice=1';
  if (price === 'under50') return '&maxPrice=5000';
  return '';
}

function Catalog() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get('q') ?? '';
  const category = sp.get('category') ?? '';
  const level = sp.get('level') ?? '';
  const price = sp.get('price') ?? '';
  const sort = sp.get('sort') ?? 'newest';
  const page = Math.max(1, Number(sp.get('page') ?? 1));

  const [result, setResult] = useState<{ data: any[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  function set(next: Record<string, string>) {
    const p = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (!('page' in next)) p.delete('page'); // filters reset pagination
    router.push(`/courses${p.toString() ? `?${p}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError('');
    const qs =
      `page=${page}&limit=${PAGE_SIZE}&sort=${sort}` +
      (q ? `&q=${encodeURIComponent(q)}` : '') +
      (category ? `&category=${category}` : '') +
      (level ? `&level=${level}` : '') +
      priceParams(price);
    api.get(`/api/search/courses?${qs}`)
      .then((r) => !cancelled && setResult({ data: r.data ?? [], total: r.total ?? 0 }))
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [q, category, level, price, sort, page]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const activeCount = [category, level, price].filter(Boolean).length;

  const title = q ? `Results for “${q}”` : category ? labelize(category) + ' courses' : 'All courses';

  return (
    <div className="container-x py-8">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-ink-muted mt-1">{result ? `${result.total.toLocaleString()} course${result.total === 1 ? '' : 's'}` : 'Loading…'}</p>

      <div className="flex items-center justify-between gap-3 mt-6 pb-4 border-b border-border">
        <button onClick={() => setFiltersOpen((v) => !v)} className="btn-outline lg:hidden" aria-expanded={filtersOpen}>
          <Icon name="settings" size={16} /> Filters{activeCount > 0 && ` (${activeCount})`}
        </button>
        {activeCount > 0 && <button onClick={() => set({ category: '', level: '', price: '' })} className="text-primary font-bold text-sm hover:underline hidden lg:block">Clear filters</button>}
        <label className="flex items-center gap-2 text-sm ml-auto">
          <span className="font-bold">Sort by</span>
          <select value={sort} onChange={(e) => set({ sort: e.target.value })} className="input w-auto py-2">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-8 mt-6">
        <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block space-y-6`}>
          <FilterGroup title="Category" value={category} onChange={(v) => set({ category: v })} options={[['', 'All categories'], ...CATEGORIES.map((c) => [c, labelize(c)] as [string, string])]} />
          <FilterGroup title="Level" value={level} onChange={(v) => set({ level: v })} options={[['', 'All levels'], ...Object.entries(LEVELS).filter(([k]) => k !== 'ALL_LEVELS')]} />
          <FilterGroup title="Price" value={price} onChange={(v) => set({ price: v })} options={PRICES} />
          {activeCount > 0 && <button onClick={() => set({ category: '', level: '', price: '' })} className="text-primary font-bold text-sm hover:underline lg:hidden">Clear filters</button>}
        </aside>

        <section>
          {error && <ErrorState message={error} onRetry={() => set({})} />}
          {!error && result === null && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-8">
              {Array.from({ length: 6 }).map((_, i) => <CourseCardSkeleton key={i} />)}
            </div>
          )}
          {result && result.data.length === 0 && (
            <EmptyState icon="search" title="No courses found" text="Try a different search term or remove some filters." action={<button onClick={() => router.push('/courses')} className="btn-dark">Clear all</button>} />
          )}
          {result && result.data.length > 0 && (
            <>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-8">
                {result.data.map((c) => <CourseCard key={c.id} course={c} />)}
              </div>
              {totalPages > 1 && <Pagination page={page} total={totalPages} onChange={(p) => set({ page: String(p) })} />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterGroup({ title, value, onChange, options }: { title: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <fieldset>
      <legend className="font-bold mb-2 pb-2 border-b border-border w-full">{title}</legend>
      <div className="space-y-1.5">
        {options.map(([v, l]) => (
          <label key={v} className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary">
            <input type="radio" name={title} checked={value === v} onChange={() => onChange(v)} className="accent-[#0f766e] w-4 h-4" />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Array.from({ length: total }, (_, i) => i + 1).filter((p) => p === 1 || p === total || Math.abs(p - page) <= 1);
  return (
    <nav className="flex items-center justify-center gap-1 mt-10" aria-label="Pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn-outline w-10 h-10 p-0" aria-label="Previous page"><Icon name="left" size={16} /></button>
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - pages[i - 1] > 1 && <span className="px-1 text-ink-muted">…</span>}
          <button onClick={() => onChange(p)} aria-current={p === page ? 'page' : undefined} className={`w-10 h-10 text-sm font-bold ${p === page ? 'bg-ink text-white' : 'hover:bg-surface'}`}>{p}</button>
        </span>
      ))}
      <button disabled={page >= total} onClick={() => onChange(page + 1)} className="btn-outline w-10 h-10 p-0" aria-label="Next page"><Icon name="right" size={16} /></button>
    </nav>
  );
}

export default function CoursesPage() {
  return (
    <Suspense fallback={<div className="container-x py-8"><div className="skeleton h-9 w-64" /></div>}>
      <Catalog />
    </Suspense>
  );
}
