'use client';
import { useRef } from 'react';
import { Icon } from '@/components/Icon';
import { CourseCard } from '@/components/CourseCard';
import { CourseCardSkeleton } from '@/components/ui';

/** Horizontally scrolling carousel of course cards with arrow controls. */
export function CourseRow({ title, subtitle, courses, loading }: { title: string; subtitle?: string; courses: any[] | null; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });

  if (!loading && (!courses || courses.length === 0)) return null;

  return (
    <section className="py-8">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="h-section">{title}</h2>
          {subtitle && <p className="text-ink-muted mt-1">{subtitle}</p>}
        </div>
        <div className="hidden sm:flex gap-2">
          <button onClick={() => scroll(-1)} aria-label="Previous" className="w-10 h-10 border border-ink inline-flex items-center justify-center hover:bg-surface"><Icon name="left" /></button>
          <button onClick={() => scroll(1)} aria-label="Next" className="w-10 h-10 border border-ink inline-flex items-center justify-center hover:bg-surface"><Icon name="right" /></button>
        </div>
      </div>
      <div ref={ref} className="flex gap-4 overflow-x-auto no-scrollbar snap-x scroll-smooth pb-2">
        {loading || !courses
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-[240px] shrink-0"><CourseCardSkeleton /></div>)
          : courses.map((c) => (
              <div key={c.id} className="w-[240px] shrink-0 snap-start">
                <CourseCard course={c} />
              </div>
            ))}
      </div>
    </section>
  );
}
