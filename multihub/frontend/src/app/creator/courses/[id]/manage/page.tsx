'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Breadcrumb, CourseThumb, EmptyState, Modal, PageSpinner, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { CATEGORIES, LEVELS, duration, labelize, money } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

type LessonForm = { id?: string; sectionId: string; title: string; videoUrl: string; minutes: string; content: string };

export default function ManageCoursePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { allowed } = useRequireAuth(['CREATOR', 'ADMIN']);
  const fileRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [lesson, setLesson] = useState<LessonForm | null>(null);
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingSection, setEditingSection] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const list: any[] = await api.get('/api/courses/mine/list');
      const c = list.find((x) => x.id === id);
      c ? setCourse(c) : setMissing(true);
    } catch (e: any) { toast.error(e.message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  if (!allowed) return null;
  if (missing) return <div className="container-x py-16"><EmptyState icon="search" title="Course not found" text="It doesn't exist or isn't yours." action={<Link href="/creator/dashboard" className="btn-dark">Back to Creator Studio</Link>} /></div>;
  if (!course) return <PageSpinner />;

  const sections: any[] = course.sections ?? [];
  const lessonCount = sections.reduce((a, s) => a + (s.lessons?.length ?? 0), 0);
  const totalSeconds = sections.reduce((a, s) => a + s.lessons.reduce((b: number, l: any) => b + l.durationSeconds, 0), 0);
  const editable = course.status === 'DRAFT' || course.status === 'REJECTED';
  const checklist: [string, boolean][] = [
    ['At least one section', sections.length > 0],
    ['At least one lesson', lessonCount > 0],
    ['Course thumbnail', !!course.thumbnailUrl],
    ['Description (50+ characters)', (course.description ?? '').length >= 50],
    ['Learning outcomes listed', (course.learningOutcomes ?? []).length > 0],
  ];
  const canSubmit = editable && sections.length > 0 && lessonCount > 0;

  async function run(fn: () => Promise<any>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); await load(); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  const addSection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionTitle.trim()) return;
    run(async () => { await api.post(`/api/courses/${id}/sections`, { title: sectionTitle.trim() }); setSectionTitle(''); });
  };

  const saveLesson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    const body = {
      title: lesson.title.trim(),
      videoUrl: lesson.videoUrl.trim(),
      content: lesson.content,
      durationSeconds: Math.round((Number(lesson.minutes) || 0) * 60),
    };
    run(async () => {
      lesson.id
        ? await api.patch(`/api/courses/${id}/sections/${lesson.sectionId}/lessons/${lesson.id}`, body)
        : await api.post(`/api/courses/${id}/sections/${lesson.sectionId}/lessons`, body);
      setLesson(null);
    }, lesson.id ? 'Lesson updated' : 'Lesson added');
  };

  async function onThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast.error('Use a JPEG, PNG or WEBP image.');
    if (f.size > 10 * 1024 * 1024) return toast.error('Thumbnail must be 10 MB or smaller.');
    setUploading(true);
    try { await api.upload(`/api/courses/${id}/thumbnail`, f); toast.success('Thumbnail updated'); await load(); }
    catch (err: any) { toast.error(err.message); } finally { setUploading(false); }
  }

  return (
    <div className="container-x py-8">
      <div className="text-primary mb-4"><Breadcrumb items={[{ label: 'Creator Studio', href: '/creator/dashboard' }, { label: 'Manage course' }]} /></div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{course.title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-ink-muted">
            <StatusBadge status={course.status} />
            <span>{money(course.priceCents)}</span><span>•</span><span>{labelize(course.category)}</span><span>•</span><span>{LEVELS[course.level]}</span>
            <span>•</span><span>{sections.length} sections, {lessonCount} lessons{totalSeconds > 0 && `, ${duration(totalSeconds)}`}</span>
          </div>
          {course.status === 'REJECTED' && course.rejectionReason && <p className="mt-3 text-sm text-error bg-red-50 border border-red-200 p-3 flex gap-2"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />Rejected: {course.rejectionReason}. Update the course and resubmit.</p>}
          {course.status === 'PENDING_REVIEW' && <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 p-3">Your course is in review. You&apos;ll be notified once an admin approves or rejects it.</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDetails(true)} className="btn-outline"><Icon name="settings" size={16} />Course details</button>
          {course.status === 'PUBLISHED' && <Link href={`/courses/${course.slug}`} className="btn-outline"><Icon name="eye" size={16} />View live</Link>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-8">
        {/* Curriculum */}
        <section>
          <h2 className="h-section mb-4">Curriculum</h2>
          <div className="space-y-4">
            {sections.length === 0 && <EmptyState icon="layers" title="No sections yet" text="Sections group your lessons. Add your first one below." />}
            {sections.map((s, si) => (
              <div key={s.id} className="border border-border">
                <div className="flex items-center gap-3 px-4 py-3 bg-surface">
                  <span className="font-bold text-sm text-ink-muted">Section {si + 1}</span>
                  {editingSection && editingSection.id === s.id ? (
                    <form className="flex-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.patch(`/api/courses/${id}/sections/${s.id}`, { title: editingSection.title }); setEditingSection(null); }); }}>
                      <input autoFocus value={editingSection.title} onChange={(e) => setEditingSection({ ...editingSection, title: e.target.value })} className="input py-1.5" />
                      <button className="btn-dark py-1.5">Save</button>
                      <button type="button" onClick={() => setEditingSection(null)} className="btn-ghost py-1.5">Cancel</button>
                    </form>
                  ) : (
                    <>
                      <span className="font-bold flex-1 min-w-0 truncate">{s.title}</span>
                      <button onClick={() => setEditingSection({ id: s.id, title: s.title })} className="p-1.5 hover:bg-white" aria-label="Rename section"><Icon name="edit" size={16} /></button>
                      <button onClick={() => confirm(`Delete section "${s.title}" and its ${s.lessons.length} lessons?`) && run(() => api.del(`/api/courses/${id}/sections/${s.id}`), 'Section deleted')} className="p-1.5 hover:bg-white text-error" aria-label="Delete section"><Icon name="trash" size={16} /></button>
                    </>
                  )}
                </div>
                <ul className="divide-y divide-border">
                  {s.lessons.map((l: any) => (
                    <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <Icon name={l.videoUrl ? 'video' : 'file'} size={16} className="text-ink-muted shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{l.title}</span>
                      {!l.videoUrl && <span className="text-xs text-amber-700 hidden sm:inline">No video</span>}
                      {l.durationSeconds > 0 && <span className="text-ink-muted text-xs">{duration(l.durationSeconds)}</span>}
                      <button onClick={() => setLesson({ id: l.id, sectionId: s.id, title: l.title, videoUrl: l.videoUrl ?? '', minutes: l.durationSeconds ? String(+(l.durationSeconds / 60).toFixed(2)) : '', content: l.content ?? '' })} className="p-1.5 hover:bg-surface" aria-label="Edit lesson"><Icon name="edit" size={15} /></button>
                      <button onClick={() => confirm(`Delete lesson "${l.title}"?`) && run(() => api.del(`/api/courses/${id}/sections/${s.id}/lessons/${l.id}`), 'Lesson deleted')} className="p-1.5 hover:bg-surface text-error" aria-label="Delete lesson"><Icon name="trash" size={15} /></button>
                    </li>
                  ))}
                  <li className="px-4 py-2.5">
                    <button onClick={() => setLesson({ sectionId: s.id, title: '', videoUrl: '', minutes: '', content: '' })} className="text-primary font-bold text-sm hover:underline inline-flex items-center gap-1.5"><Icon name="plus" size={15} />Add lesson</button>
                  </li>
                </ul>
              </div>
            ))}
          </div>

          <form onSubmit={addSection} className="mt-5 flex gap-2">
            <input value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} placeholder="New section title, e.g. “Getting started”" maxLength={200} className="input" aria-label="New section title" />
            <button disabled={busy || !sectionTitle.trim()} className="btn-dark shrink-0"><Icon name="plus" size={16} />Add section</button>
          </form>
        </section>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="card p-5">
            <h3 className="font-bold mb-3">Thumbnail</h3>
            <div className="aspect-video bg-gray-100 overflow-hidden relative"><CourseThumb course={course} />{uploading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Spinner /></div>}</div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onThumb} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-outline w-full mt-3"><Icon name="upload" size={16} />Upload image</button>
            <p className="text-xs text-ink-muted mt-2">16:9 works best. JPEG, PNG or WEBP, up to 10 MB.</p>
          </div>

          <div className="card p-5">
            <h3 className="font-bold mb-3">Ready to publish?</h3>
            <ul className="space-y-2 text-sm mb-4">
              {checklist.map(([label, ok]) => <li key={label} className={`flex items-center gap-2 ${ok ? 'text-success' : 'text-ink-muted'}`}><Icon name={ok ? 'checkCircle' : 'info'} size={16} />{label}</li>)}
            </ul>
            {editable ? (
              <button disabled={!canSubmit || busy} onClick={() => run(async () => { await api.post(`/api/courses/${id}/submit`); router.push('/creator/dashboard'); }, 'Submitted for review')} className="btn-primary w-full">{course.status === 'REJECTED' ? 'Resubmit for review' : 'Submit for review'}</button>
            ) : <p className="text-sm text-ink-muted">Status: <b>{labelize(course.status)}</b></p>}
            {editable && !canSubmit && <p className="text-xs text-ink-muted mt-2">Add a section with at least one lesson to submit.</p>}
            {course.status === 'PUBLISHED' && (
              <button onClick={() => confirm('Archive this course? It will no longer be available to new learners.') && run(async () => { await api.patch(`/api/courses/${id}/archive`); }, 'Course archived')} className="text-sm text-error font-bold hover:underline mt-3">Archive course</button>
            )}
          </div>
        </aside>
      </div>

      {/* Lesson modal */}
      <Modal open={!!lesson} onClose={() => setLesson(null)} title={lesson?.id ? 'Edit lesson' : 'Add lesson'} wide>
        {lesson && (
          <form onSubmit={saveLesson} className="space-y-4">
            <div><label htmlFor="lt" className="label">Title</label><input id="lt" autoFocus required maxLength={200} value={lesson.title} onChange={(e) => setLesson({ ...lesson, title: e.target.value })} className="input" /></div>
            <div>
              <label htmlFor="lv" className="label">Video URL</label>
              <input id="lv" value={lesson.videoUrl} onChange={(e) => setLesson({ ...lesson, videoUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=… or a direct .mp4 link" className="input" />
              <p className="text-xs text-ink-muted mt-1">YouTube links are embedded; direct video files (.mp4, .webm) play in the built-in player. Leave empty for a reading lesson.</p>
            </div>
            <div><label htmlFor="ld" className="label">Duration (minutes)</label><input id="ld" type="number" min={0} step="0.5" value={lesson.minutes} onChange={(e) => setLesson({ ...lesson, minutes: e.target.value })} className="input max-w-[160px]" /></div>
            <div><label htmlFor="lc" className="label">Lesson notes (optional)</label><textarea id="lc" rows={5} value={lesson.content} onChange={(e) => setLesson({ ...lesson, content: e.target.value })} className="input" placeholder="Text shown beside the video, or the full lesson for reading lessons." /></div>
            <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setLesson(null)} className="btn-outline">Cancel</button><button disabled={busy || !lesson.title.trim()} className="btn-primary">{busy ? <Spinner size={16} /> : 'Save lesson'}</button></div>
          </form>
        )}
      </Modal>

      <DetailsModal open={details} onClose={() => setDetails(false)} course={course} onSaved={async () => { setDetails(false); toast.success('Course details saved'); await load(); }} />
    </div>
  );
}

function DetailsModal({ open, onClose, course, onSaved }: { open: boolean; onClose: () => void; course: any; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', subtitle: '', description: '', outcomes: '', requirements: '', price: '0', level: 'BEGINNER', category: 'programming', tags: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setF({ title: course.title, subtitle: course.subtitle ?? '', outcomes: (course.learningOutcomes ?? []).join('\n'), requirements: (course.requirements ?? []).join('\n'), description: course.description, price: String(course.priceCents / 100), level: course.level, category: course.category, tags: (course.tags ?? []).join(', ') });
  }, [open, course]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/api/courses/${course.id}`, {
        title: f.title.trim(), subtitle: f.subtitle.trim(), description: f.description.trim(), learningOutcomes: f.outcomes.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12), requirements: f.requirements.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12), priceCents: Math.round(Number(f.price) * 100),
        level: f.level, category: f.category, tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      });
      onSaved();
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Course details" wide>
      <form onSubmit={save} className="space-y-4">
        <div><label htmlFor="dt" className="label">Title</label><input id="dt" required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="input" /></div>
        <div><label htmlFor="ds" className="label">Subtitle</label><input id="ds" maxLength={200} value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} className="input" /></div>
        <div><label htmlFor="dd" className="label">Description</label><textarea id="dd" required rows={6} maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="input" /></div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><label htmlFor="dc" className="label">Category</label><select id="dc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="input">{CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}</select></div>
          <div><label htmlFor="dl" className="label">Level</label><select id="dl" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} className="input">{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label htmlFor="dp" className="label">Price (USD)</label><input id="dp" type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="input" /></div>
        </div>
        <div><label htmlFor="do" className="label">What students will learn (one per line)</label><textarea id="do" rows={4} value={f.outcomes} onChange={(e) => setF({ ...f, outcomes: e.target.value })} className="input" /></div>
        <div><label htmlFor="dr" className="label">Requirements (one per line)</label><textarea id="dr" rows={3} value={f.requirements} onChange={(e) => setF({ ...f, requirements: e.target.value })} className="input" /></div>
        <div><label htmlFor="dg" className="label">Tags</label><input id="dg" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} className="input" placeholder="comma, separated" /></div>
        <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onClose} className="btn-outline">Cancel</button><button disabled={busy} className="btn-primary">{busy ? <Spinner size={16} /> : 'Save changes'}</button></div>
      </form>
    </Modal>
  );
}
