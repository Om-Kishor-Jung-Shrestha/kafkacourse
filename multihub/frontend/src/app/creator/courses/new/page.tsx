'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner, Breadcrumb } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { CATEGORIES, LEVELS, labelize } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);

export default function NewCoursePage() {
  const { allowed } = useRequireAuth(['CREATOR', 'ADMIN']);
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', price: '0', level: 'BEGINNER', category: 'programming', tags: '', language: 'en', subtitle: '', outcomes: '', requirements: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) return setError('Enter a valid price (0 for free).');
    setLoading(true);
    setError('');
    try {
      const course = await api.post('/api/courses', {
        title: form.title.trim(),
        description: form.description.trim(),
        priceCents: Math.round(price * 100),
        level: form.level,
        category: form.category,
        language: form.language,
        subtitle: form.subtitle.trim() || undefined,
        learningOutcomes: lines(form.outcomes),
        requirements: lines(form.requirements),
        tags: form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      });
      toast.success('Course created — now add your content.');
      router.push(`/creator/courses/${course.id}/manage`);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  if (!allowed) return null;

  return (
    <div className="container-x py-10 max-w-3xl">
      <div className="text-primary mb-4"><Breadcrumb items={[{ label: 'Creator Studio', href: '/creator/dashboard' }, { label: 'New course' }]} /></div>
      <h1 className="text-3xl font-bold tracking-tight">Create a new course</h1>
      <p className="text-ink-muted mt-1 mb-8">Start with the basics — you&apos;ll add sections, lessons and a thumbnail next.</p>

      <form onSubmit={submit} className="card p-6 space-y-5">
        <div>
          <label htmlFor="title" className="label">Course title</label>
          <input id="title" value={form.title} onChange={set('title')} required maxLength={200} placeholder="e.g. Modern React from Scratch" className="input" />
          <p className="text-xs text-ink-muted mt-1">{form.title.length}/200</p>
        </div>
        <div>
          <label htmlFor="sub" className="label">Subtitle</label>
          <input id="sub" value={form.subtitle} onChange={set('subtitle')} maxLength={200} placeholder="One sentence that sells the course" className="input" />
          <p className="text-xs text-ink-muted mt-1">Shown under the title on your course page.</p>
        </div>
        <div>
          <label htmlFor="desc" className="label">Description</label>
          <textarea id="desc" value={form.description} onChange={set('description')} required rows={6} maxLength={5000} placeholder="What will students learn? Who is it for?" className="input" />
          <p className="text-xs text-ink-muted mt-1">{form.description.length}/5000</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div><label htmlFor="cat" className="label">Category</label><select id="cat" value={form.category} onChange={set('category')} className="input">{CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}</select></div>
          <div><label htmlFor="lvl" className="label">Level</label><select id="lvl" value={form.level} onChange={set('level')} className="input">{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div>
            <label htmlFor="price" className="label">Price (USD)</label>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">$</span><input id="price" type="number" min={0} step="0.01" value={form.price} onChange={set('price')} className="input pl-7" /></div>
            <p className="text-xs text-ink-muted mt-1">{Number(form.price) === 0 ? 'This course will be free.' : 'Learners pay this amount at checkout.'}</p>
          </div>
          <div><label htmlFor="lang" className="label">Language</label><select id="lang" value={form.language} onChange={set('language')} className="input">{[['en', 'English'], ['ne', 'Nepali'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <div>
          <label htmlFor="out" className="label">What will students learn?</label>
          <textarea id="out" value={form.outcomes} onChange={set('outcomes')} rows={4} placeholder={'One outcome per line, e.g.\nBuild and deploy a REST API\nWrite automated tests'} className="input" />
          <p className="text-xs text-ink-muted mt-1">Up to 12 lines — they appear as the checklist at the top of your course page.</p>
        </div>
        <div>
          <label htmlFor="req" className="label">Requirements</label>
          <textarea id="req" value={form.requirements} onChange={set('requirements')} rows={3} placeholder={'One per line, e.g.\nA computer with internet access'} className="input" />
        </div>
        <div>
          <label htmlFor="tags" className="label">Tags</label>
          <input id="tags" value={form.tags} onChange={set('tags')} placeholder="react, javascript, frontend" className="input" />
          <p className="text-xs text-ink-muted mt-1">Comma-separated, up to 10. Tags power search and recommendations.</p>
        </div>
        {error && <p role="alert" className="text-sm text-error bg-red-50 border border-red-200 p-3">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button disabled={loading} className="btn-primary px-6">{loading ? <Spinner size={18} /> : 'Create & continue'}</button>
          <Link href="/creator/dashboard" className="btn-outline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
