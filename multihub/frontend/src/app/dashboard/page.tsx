'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CourseRow } from '@/components/CourseRow';
import { EnrollmentCard } from '@/components/EnrollmentCard';
import { Icon } from '@/components/Icon';
import { EmptyState, ErrorState, PageSpinner, StatCard, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { duration } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

type TabId = 'all' | 'progress' | 'completed';

export default function DashboardPage() {
  const { user, allowed } = useRequireAuth();
  const [enrollments, setEnrollments] = useState<any[] | null>(null);
  const [recs, setRecs] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!allowed) return;
    api.get('/api/enrollments/me').then((list: any[]) => setEnrollments(list.filter((e) => e.status !== 'REFUNDED'))).catch((e) => setError(e.message));
    api.get('/api/recommendations?limit=12').then(setRecs).catch(() => setRecs([]));
  }, [allowed]);

  const stats = useMemo(() => {
    const list = enrollments ?? [];
    const completed = list.filter((e) => e.status === 'COMPLETED').length;
    const lessons = list.reduce((a, e) => a + (e.completedCount ?? 0), 0);
    return { total: list.length, completed, inProgress: list.length - completed, lessons };
  }, [enrollments]);

  const visible = useMemo(() => {
    let list = enrollments ?? [];
    if (tab === 'progress') list = list.filter((e) => e.status !== 'COMPLETED');
    if (tab === 'completed') list = list.filter((e) => e.status === 'COMPLETED');
    if (q.trim()) list = list.filter((e) => e.course?.title?.toLowerCase().includes(q.trim().toLowerCase()));
    return list;
  }, [enrollments, tab, q]);

  // "Continue" = the in-progress course touched most recently (progress > 0 first)
  const resume = useMemo(() => {
    const list = (enrollments ?? []).filter((e) => e.status !== 'COMPLETED' && e.status !== 'REFUNDED');
    return list.sort((a, b) => (b.progress > 0 ? 1 : 0) - (a.progress > 0 ? 1 : 0))[0];
  }, [enrollments]);

  if (!allowed || (enrollments === null && !error)) return <PageSpinner />;

  return (
    <>
      <section className="bg-ink text-white">
        <div className="container-x pt-10 pb-0">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">My learning</h1>
          <p className="text-white/70 mt-2">Welcome back, {user?.firstName ?? 'learner'}.</p>
          <div className="mt-8 -mb-px">
            <div className="[&_[role=tablist]]:border-white/20 [&_button]:text-white/70 [&_button[aria-selected=true]]:text-white [&_button[aria-selected=true]]:border-white">
              <Tabs value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All courses', count: stats.total }, { id: 'progress', label: 'In progress', count: stats.inProgress }, { id: 'completed', label: 'Completed', count: stats.completed }]} />
            </div>
          </div>
        </div>
      </section>

      <div className="container-x py-8">
        {error && <ErrorState message={error} />}

        {user && !user.isEmailVerified && (
          <div className="border border-amber-200 bg-amber-50 text-amber-900 text-sm p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2"><Icon name="mail" size={18} /> Your email isn&apos;t verified yet. Verify it to unlock teaching.</span>
            <Link href="/profile" className="font-bold underline">Verify email</Link>
          </div>
        )}

        {enrollments && enrollments.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon="book" label="Enrolled" value={stats.total} />
            <StatCard icon="play" label="In progress" value={stats.inProgress} />
            <StatCard icon="award" label="Completed" value={stats.completed} />
            <StatCard icon="checkCircle" label="Lessons finished" value={stats.lessons} />
          </div>
        )}

        {resume && tab === 'all' && !q && (
          <Link href={`/learn/${resume.id}`} className="card hover:shadow-card transition-shadow p-5 mb-8 flex flex-wrap items-center gap-4 justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">{resume.progress > 0 ? 'Continue where you left off' : 'Start your first lesson'}</p>
              <p className="font-bold text-lg mt-1">{resume.course?.title}</p>
              <p className="text-sm text-ink-muted">{Math.round(resume.progress * 100)}% complete{resume.totalSeconds > 0 && ` • ${duration(resume.totalSeconds)} total`}</p>
            </div>
            <span className="btn-primary"><Icon name="play" size={16} /> {resume.progress > 0 ? 'Resume' : 'Start'}</span>
          </Link>
        )}

        {enrollments && enrollments.length > 0 && (
          <div className="flex items-center border border-ink/70 h-11 px-3 max-w-sm mb-6 focus-within:ring-2 focus-within:ring-primary/40">
            <Icon name="search" size={16} className="text-ink-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my courses" aria-label="Search my courses" className="flex-1 outline-none px-2 text-sm bg-transparent" />
          </div>
        )}

        {enrollments && enrollments.length === 0 ? (
          <EmptyState icon="book" title="You haven't enrolled in any courses yet" text="Explore the catalog and start learning today." action={<Link href="/courses" className="btn-dark">Browse courses</Link>} />
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="Nothing here" text={q ? 'No courses match your search.' : tab === 'completed' ? 'Finish a course to see it here.' : 'Everything is completed — nice work!'} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visible.map((e) => <EnrollmentCard key={e.id} enrollment={e} />)}
          </div>
        )}

        <div className="mt-4">
          <CourseRow title="Recommended for you" subtitle="Hybrid picks: content similarity blended with what similar learners enrolled in." courses={recs} loading={recs === null} />
        </div>
      </div>
    </>
  );
}
