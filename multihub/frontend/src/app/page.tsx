'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { CourseRow } from '@/components/CourseRow';
import { EnrollmentCard } from '@/components/EnrollmentCard';
import { api } from '@/lib/api';
import { CATEGORIES, labelize } from '@/lib/format';
import { useAuth } from '@/lib/hooks';

const CAT_ICON: Record<string, IconName> = {
  programming: 'layers', 'data-science': 'trending', design: 'edit', business: 'bag',
  marketing: 'users', music: 'film', health: 'heart', other: 'book',
};

export default function HomePage() {
  const { user, ready } = useAuth();
  const [popular, setPopular] = useState<any[] | null>(null);
  const [newest, setNewest] = useState<any[] | null>(null);
  const [free, setFree] = useState<any[] | null>(null);
  const [recs, setRecs] = useState<any[] | null>(null);
  const [mine, setMine] = useState<any[] | null>(null);

  useEffect(() => {
    const list = (qs: string) => api.get(`/api/search/courses?${qs}`).then((r) => r.data ?? []).catch(() => []);
    list('sort=popular&limit=12').then(setPopular);
    list('sort=newest&limit=12').then(setNewest);
    list('maxPrice=0&limit=12').then(setFree);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!user) { setRecs([]); setMine([]); return; }
    api.get('/api/recommendations?limit=12').then(setRecs).catch(() => setRecs([]));
    api.get('/api/enrollments/me').then(setMine).catch(() => setMine([]));
  }, [ready, user]);

  const inProgress = (mine ?? []).filter((e) => e.status !== 'COMPLETED' && e.status !== 'REFUNDED').slice(0, 4);

  return (
    <>
      {/* Hero */}
      <section className="bg-primary-soft border-b border-border">
        <div className="container-x py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
              {user ? `Welcome back, ${user.firstName ?? 'learner'}.` : 'Learn without limits.'}
            </h1>
            <p className="text-lg text-ink-soft mt-5 max-w-xl">
              {user
                ? 'Pick up where you left off, or find your next skill from our catalog of expert-led courses.'
                : 'Start, switch or advance your career with courses from expert instructors. Learn at your own pace, on any device.'}
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/courses" className="btn-dark px-6 py-3 text-base">Browse courses</Link>
              {user
                ? <Link href="/dashboard" className="btn-outline px-6 py-3 text-base bg-white">My learning</Link>
                : <Link href="/register" className="btn-outline px-6 py-3 text-base bg-white">Join for free</Link>}
            </div>
          </div>
          <div className="hidden lg:grid grid-cols-2 gap-3">
            {[
              ['programming', 'bg-teal-700'], ['design', 'bg-rose-600'],
              ['data-science', 'bg-sky-700'], ['business', 'bg-amber-600'],
            ].map(([c, bg]) => (
              <Link key={c} href={`/courses?category=${c}`} className={`${bg} text-white aspect-[16/10] p-5 flex flex-col justify-between hover:brightness-110 transition`}>
                <Icon name={CAT_ICON[c]} size={30} />
                <span className="font-bold text-lg">{labelize(c)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="container-x">
        {/* Continue learning */}
        {inProgress.length > 0 && (
          <section className="pt-10">
            <div className="flex items-end justify-between mb-4">
              <h2 className="h-section">Let&apos;s start learning</h2>
              <Link href="/dashboard" className="text-primary font-bold text-sm hover:underline">My learning</Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {inProgress.map((e) => <EnrollmentCard key={e.id} enrollment={e} />)}
            </div>
          </section>
        )}

        {/* Category chips */}
        <section className="pt-10">
          <h2 className="h-section mb-4">Top categories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {CATEGORIES.map((c) => (
              <Link key={c} href={`/courses?category=${c}`} className="border border-border hover:border-ink hover:bg-surface p-4 flex flex-col items-center gap-2 text-center transition-colors">
                <Icon name={CAT_ICON[c]} size={26} className="text-primary" />
                <span className="text-sm font-bold">{labelize(c)}</span>
              </Link>
            ))}
          </div>
        </section>

        {user && <CourseRow title="Recommended for you" subtitle="Picked from your interests and what similar learners enroll in." courses={recs} loading={recs === null} />}
        <CourseRow title="Most popular" subtitle="What other learners are taking right now." courses={popular} loading={popular === null} />
        <CourseRow title="New releases" courses={newest} loading={newest === null} />
        <CourseRow title="Start learning for free" courses={free} loading={free === null} />

        {/* Value props */}
        <section className="py-10 grid sm:grid-cols-3 gap-6">
          {[
            ['infinity', 'Learn at your own pace', 'Lifetime access to every course you enroll in. Pause, rewind, and revisit any time.'],
            ['award', 'Expert instructors', 'Every course is reviewed by our admins before it goes live.'],
            ['checkCircle', 'Track your progress', 'Lesson-by-lesson progress so you always know what to do next.'],
          ].map(([icon, title, text]) => (
            <div key={title} className="flex gap-4">
              <span className="w-12 h-12 bg-primary-soft text-primary inline-flex items-center justify-center shrink-0"><Icon name={icon as IconName} size={24} /></span>
              <div><h3 className="font-bold">{title}</h3><p className="text-sm text-ink-muted mt-1">{text}</p></div>
            </div>
          ))}
        </section>

        {/* Instructor CTA */}
        <section className="bg-ink text-white my-8 grid md:grid-cols-2 items-center">
          <div className="p-8 lg:p-12">
            <h2 className="text-3xl font-bold tracking-tight">Become an instructor</h2>
            <p className="text-white/80 mt-3 max-w-md">Share what you know. Build a course, reach learners, and earn on every enrollment.</p>
            <Link href="/teach" className="btn bg-white text-ink hover:bg-gray-100 mt-6">Start teaching</Link>
          </div>
          <div className="hidden md:flex justify-center p-8 text-primary"><Icon name="rocket" size={140} strokeWidth={1.2} /></div>
        </section>
      </div>
    </>
  );
}
