'use client';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { ErrorState, PageSpinner, ProgressBar, Tabs } from '@/components/ui';
import { api, assetUrl } from '@/lib/api';
import { clock, duration, youtubeId } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

type Lesson = { id: string; title: string; content?: string | null; videoUrl?: string | null; durationSeconds: number };

function Player() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const sp = useSearchParams();
  const toast = useToast();
  const { allowed } = useRequireAuth();

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Set<string>>(new Set());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'notes' | 'resources'>('overview');
  const [sidebar, setSidebar] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    api.get(`/api/enrollments/${enrollmentId}/learn`)
      .then((d) => {
        setData(d);
        setDone(new Set(d.completedLessonIds));
        const all: Lesson[] = d.course.sections.flatMap((s: any) => s.lessons);
        const wanted = sp.get('lesson');
        const start = all.find((l) => l.id === wanted) ?? all.find((l) => !d.completedLessonIds.includes(l.id)) ?? all[0];
        setCurrentId(start?.id ?? null);
        setOpenSections(Object.fromEntries(d.course.sections.map((s: any) => [s.id, s.lessons.some((l: Lesson) => l.id === start?.id)])));
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, enrollmentId]);

  const sections: any[] = data?.course.sections ?? [];
  const lessons: Lesson[] = useMemo(() => sections.flatMap((s) => s.lessons), [sections]);
  const idx = lessons.findIndex((l) => l.id === currentId);
  const lesson = idx >= 0 ? lessons[idx] : null;
  const progress = lessons.length ? done.size / lessons.length : 0;
  const finished = lessons.length > 0 && done.size >= lessons.length;

  const select = useCallback((id: string) => {
    setCurrentId(id);
    setSidebar(false);
    setTab('overview');
    const url = new URL(window.location.href);
    url.searchParams.set('lesson', id);
    window.history.replaceState(null, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const setCompleted = useCallback(async (lessonId: string, completed: boolean, advance = false) => {
    const prev = new Set(done);
    const optimistic = new Set(done);
    completed ? optimistic.add(lessonId) : optimistic.delete(lessonId);
    setDone(optimistic);
    setSaving(true);
    try {
      const res = await api.post(`/api/enrollments/${enrollmentId}/lessons/${lessonId}/complete`, { completed });
      setDone(new Set(res.completedLessonIds));
      if (completed && res.status === 'COMPLETED' && res.completedLessonIds.length === lessons.length) toast.success('Course completed — congratulations! 🎉');
      if (completed && advance) {
        const i = lessons.findIndex((l) => l.id === lessonId);
        if (lessons[i + 1]) select(lessons[i + 1].id);
      }
    } catch (e: any) {
      setDone(prev);
      toast.error(e.message);
    } finally { setSaving(false); }
  }, [done, enrollmentId, lessons, select, toast]);

  if (!allowed) return <PageSpinner />;
  if (error) return <div className="container-x py-10"><ErrorState message={error} /><Link href="/dashboard" className="btn-dark mt-4">Back to My learning</Link></div>;
  if (!data) return <PageSpinner />;

  const course = data.course;
  const isDone = lesson ? done.has(lesson.id) : false;

  const sidebarEl = (
    <div className="bg-white h-full overflow-y-auto">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-white z-10">
        <h2 className="font-bold">Course content</h2>
        <button className="lg:hidden" onClick={() => setSidebar(false)} aria-label="Close"><Icon name="close" /></button>
      </div>
      {sections.map((s, si) => {
        const sd = s.lessons.filter((l: Lesson) => done.has(l.id)).length;
        const isOpen = openSections[s.id];
        return (
          <div key={s.id} className="border-b border-border">
            <button onClick={() => setOpenSections({ ...openSections, [s.id]: !isOpen })} className="w-full text-left px-4 py-3 bg-surface hover:bg-gray-100 flex items-start gap-2" aria-expanded={!!isOpen}>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Section {si + 1}: {s.title}</p>
                <p className="text-xs text-ink-muted mt-0.5">{sd}/{s.lessons.length}</p>
              </div>
              <Icon name={isOpen ? 'up' : 'down'} size={16} className="mt-1" />
            </button>
            {isOpen && s.lessons.map((l: Lesson) => (
              <div key={l.id} className={`flex items-start gap-3 px-4 py-3 text-sm ${l.id === currentId ? 'bg-primary-soft' : 'hover:bg-surface'}`}>
                <input
                  type="checkbox"
                  checked={done.has(l.id)}
                  onChange={(e) => setCompleted(l.id, e.target.checked)}
                  aria-label={`Mark "${l.title}" complete`}
                  className="mt-1 w-4 h-4 accent-[#0f766e] shrink-0"
                />
                <button onClick={() => select(l.id)} className="text-left flex-1 min-w-0">
                  <p className={l.id === currentId ? 'font-bold' : ''}>{l.title}</p>
                  <p className="text-xs text-ink-muted mt-0.5 flex items-center gap-1"><Icon name={l.videoUrl ? 'video' : 'file'} size={12} />{l.durationSeconds ? clock(l.durationSeconds) : l.videoUrl ? 'Video' : 'Reading'}</p>
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-72px)]">
      {/* Course bar */}
      <div className="bg-ink text-white">
        <div className="px-4 sm:px-6 h-14 flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-1 text-sm hover:text-white/80 shrink-0"><Icon name="left" size={16} /><span className="hidden sm:inline">My learning</span></Link>
          <span className="w-px h-6 bg-white/20" />
          <Link href={`/courses/${course.slug}`} className="font-bold truncate hover:underline flex-1">{course.title}</Link>
          <div className="hidden sm:flex items-center gap-3 w-56 shrink-0">
            <ProgressBar value={progress} className="flex-1 !bg-white/25" />
            <span className="text-xs font-bold w-10 text-right">{Math.round(progress * 100)}%</span>
          </div>
          <button className="lg:hidden btn bg-white text-ink px-3 py-1.5" onClick={() => setSidebar(true)}><Icon name="menu" size={16} /> Content</button>
        </div>
      </div>

      <div className="flex-1 lg:grid lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          {lesson ? <LessonView lesson={lesson} key={lesson.id} onEnded={() => !isDone && setCompleted(lesson.id, true)} /> : (
            <div className="aspect-video bg-ink text-white flex items-center justify-center">This course has no lessons yet.</div>
          )}

          <div className="px-4 sm:px-8 py-6 max-w-4xl">
            {finished && (
              <div className="border border-green-300 bg-green-50 text-green-900 p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-bold"><Icon name="award" /> You completed this course!</span>
                <span className="flex gap-2">
                  <Link href={`/certificate/${enrollmentId}`} className="btn-primary">Get certificate</Link>
                  <Link href={`/courses/${course.slug}#reviews`} className="btn-outline">Leave a review</Link>
                </span>
              </div>
            )}

            {lesson && (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h1 className="text-2xl font-bold">{lesson.title}</h1>
                <div className="flex items-center gap-2">
                  <button disabled={idx <= 0} onClick={() => select(lessons[idx - 1].id)} className="btn-outline" aria-label="Previous lesson"><Icon name="left" size={16} /><span className="hidden sm:inline">Previous</span></button>
                  <button onClick={() => setCompleted(lesson.id, !isDone)} disabled={saving} className={isDone ? 'btn-outline border-success text-success' : 'btn-outline'}>
                    <Icon name="checkCircle" size={16} /> {isDone ? 'Completed' : 'Mark complete'}
                  </button>
                  {idx < lessons.length - 1 && (
                    <button onClick={() => isDone ? select(lessons[idx + 1].id) : setCompleted(lesson.id, true, true)} className="btn-primary">Next<Icon name="right" size={16} /></button>
                  )}
                </div>
              </div>
            )}

            <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'notes', label: 'Lesson notes' }, { id: 'resources', label: 'Resources', count: course.resources?.length ?? 0 }]} />
            <div className="py-6">
              {tab === 'overview' && (
                <div className="space-y-4">
                  <p className="whitespace-pre-line text-ink-soft leading-relaxed">{course.description}</p>
                  <dl className="grid sm:grid-cols-3 gap-4 text-sm pt-2">
                    <div><dt className="text-ink-muted">Lessons</dt><dd className="font-bold">{lessons.length}</dd></div>
                    <div><dt className="text-ink-muted">Total length</dt><dd className="font-bold">{duration(lessons.reduce((a, l) => a + l.durationSeconds, 0)) || '—'}</dd></div>
                    <div><dt className="text-ink-muted">Instructor</dt><dd className="font-bold">{[course.creator?.firstName, course.creator?.lastName].filter(Boolean).join(' ')}</dd></div>
                  </dl>
                </div>
              )}
              {tab === 'notes' && (lesson?.content ? <p className="whitespace-pre-line text-ink-soft leading-relaxed">{lesson.content}</p> : <p className="text-ink-muted">No written notes for this lesson.</p>)}
              {tab === 'resources' && (
                course.resources?.length ? (
                  <ul className="divide-y divide-border border border-border">
                    {course.resources.map((r: any) => (
                      <li key={r.id}><a href={assetUrl(r.url) ?? '#'} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-surface text-primary font-bold"><Icon name="download" size={16} />{r.name}</a></li>
                    ))}
                  </ul>
                ) : <p className="text-ink-muted">No downloadable resources for this course.</p>
              )}
            </div>
          </div>
        </div>

        <aside className="hidden lg:block border-l border-border sticky top-[72px] self-start h-[calc(100vh-72px-56px)]">{sidebarEl}</aside>
      </div>

      {sidebar && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setSidebar(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[340px] max-w-[90vw]">{sidebarEl}</div>
        </div>
      )}
    </div>
  );
}

/** Video (YouTube embed or native player) or a text-lesson panel. */
function LessonView({ lesson, onEnded }: { lesson: Lesson; onEnded: () => void }) {
  const url = lesson.videoUrl?.trim();
  if (url) {
    const yt = youtubeId(url);
    return (
      <div className="bg-black">
        <div className="aspect-video max-h-[70vh] w-full mx-auto">
          {yt ? (
            <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${yt}?rel=0`} title={lesson.title} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video key={url} className="w-full h-full" controls controlsList="nodownload" src={assetUrl(url) ?? url} onEnded={onEnded} />
          )}
        </div>
        {yt && <p className="text-xs text-white/60 bg-ink px-4 py-1.5">YouTube lessons can&apos;t report when they finish — use “Mark complete” below.</p>}
      </div>
    );
  }
  return (
    <div className="aspect-video max-h-[70vh] bg-ink text-white flex flex-col items-center justify-center gap-3 text-center px-6">
      <Icon name="file" size={44} className="opacity-70" />
      <p className="font-bold text-lg">{lesson.title}</p>
      <p className="text-white/70 text-sm">{lesson.content ? 'This is a reading lesson — see the “Lesson notes” tab below.' : 'The instructor hasn’t attached a video or notes to this lesson yet.'}</p>
    </div>
  );
}

export default function LearnPage() {
  return <Suspense fallback={<PageSpinner />}><Player /></Suspense>;
}
