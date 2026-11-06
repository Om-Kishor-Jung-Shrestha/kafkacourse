'use client';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { HeartFilled, Icon } from '@/components/Icon';
import { useToast } from '@/components/Toast';
import { Avatar, Badge, Breadcrumb, CourseThumb, EmptyState, PageSpinner, Spinner, StarInput, Stars } from '@/components/ui';
import { api } from '@/lib/api';
import { fetchQuote, useCommerce, type Quote } from '@/lib/commerce';
import { LEVELS, duration, fullName, labelize, money, moneyPlain, shortDate, timeAgo } from '@/lib/format';
import { useAuth } from '@/lib/hooks';

function CourseDetail() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const { user, ready } = useAuth();

  const [course, setCourse] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [enrollment, setEnrollment] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const { inCart, addToCart, inWishlist, toggleWishlist, coupon, setCoupon } = useCommerce();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      setCourse(await api.get(`/api/courses/${slug}`));
    } catch {
      setNotFound(true);
    }
  }, [slug]);

  const loadEnrollment = useCallback(async (courseId: string) => {
    if (!getToken()) return null;
    try {
      const list: any[] = await api.get('/api/enrollments/me');
      const e = list.find((x) => x.courseId === courseId) ?? null;
      setEnrollment(e);
      return e;
    } catch { return null; }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (course && ready && user) loadEnrollment(course.id);
  }, [course, ready, user, loadEnrollment]);

  // A shared link like /courses/x?couponCode=ABC applies that coupon for this browser session.
  useEffect(() => {
    const fromUrl = sp.get('couponCode')?.trim().toUpperCase();
    if (fromUrl) setCoupon(fromUrl);
  }, [sp, setCoupon]);

  // Live price preview (with the applied coupon, if it is valid for this course).
  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    fetchQuote([course.id], coupon).then((r) => {
      if (cancelled) return;
      if (r.quote) setQuote(r.quote);
      else if (coupon) fetchQuote([course.id]).then((p) => !cancelled && setQuote(p.quote ?? null));
    });
    return () => { cancelled = true; };
  }, [course?.id, coupon]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const sections = course?.sections ?? [];
    const lessons = sections.flatMap((s: any) => s.lessons ?? []);
    const reviews = course?.reviews ?? [];
    const avg = reviews.length ? reviews.reduce((a: number, r: any) => a + r.rating, 0) / reviews.length : 0;
    const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r: any) => r.rating === n).length }));
    return { sections, lessons, totalSeconds: lessons.reduce((a: number, l: any) => a + (l.durationSeconds ?? 0), 0), reviews, avg, dist };
  }, [course]);

  if (notFound) return <div className="container-x py-16"><EmptyState icon="search" title="Course not found" text="It may have been removed or the link is wrong." action={<Link href="/courses" className="btn-dark">Browse courses</Link>} /></div>;
  if (!course) return <PageSpinner />;

  const published = course.status === 'PUBLISHED';
  const free = course.priceCents === 0;
  const isOwner = user && user.id === course.creatorId;
  const creatorName = fullName(course.creator);

  async function enrollFree() {
    if (!user) { router.push(`/login?next=${encodeURIComponent(`/courses/${slug}`)}`); return; }
    setBusy(true);
    try {
      await api.post(`/api/enrollments/${course.id}/enroll`);
      const e = await loadEnrollment(course.id);
      toast.success('You are enrolled!');
      if (e) router.push(`/learn/${e.id}`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function buyNow() {
    setBusy(true);
    const ok = await addToCart(course.id);
    setBusy(false);
    if (ok) router.push('/checkout');
  }

  const refunded = enrollment?.status === 'REFUNDED';
  const netCents = quote?.totalCents ?? course.priceCents;
  const discounted = !!quote && quote.discountCents > 0;
  const saved = inWishlist(course.id);

  const cta = refunded ? (
    <button disabled className="btn-outline w-full py-3.5 text-base">Refunded</button>
  ) : enrollment ? (
    <Link href={`/learn/${enrollment.id}`} className="btn-primary w-full py-3.5 text-base">Go to course</Link>
  ) : isOwner ? (
    <Link href={`/creator/courses/${course.id}/manage`} className="btn-dark w-full py-3.5 text-base">Manage your course</Link>
  ) : free ? (
    <button onClick={enrollFree} disabled={busy || !published} className="btn-primary w-full py-3.5 text-base">{busy ? <Spinner size={18} /> : 'Enroll for free'}</button>
  ) : (
    <div className="space-y-3">
      <div className="flex gap-2">
        {inCart(course.id)
          ? <Link href="/cart" className="btn-primary flex-1 py-3.5 text-base">Go to cart</Link>
          : <button onClick={() => addToCart(course.id).then((ok) => ok && toast.success('Added to cart'))} disabled={busy || !published} className="btn-primary flex-1 py-3.5 text-base">Add to cart</button>}
        <button onClick={() => toggleWishlist(course.id)} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'} className="btn-outline w-14 shrink-0">
          {saved ? <HeartFilled size={20} className="text-accent" /> : <Icon name="heart" size={20} />}
        </button>
      </div>
      <button onClick={buyNow} disabled={busy || !published} className="btn-outline w-full py-3.5 text-base">{busy ? <Spinner size={18} /> : 'Buy now'}</button>
    </div>
  );

  const includes: [any, string][] = [
    ['video', `${duration(stats.totalSeconds) || '—'} of content`],
    ['file', `${stats.lessons.length} lessons in ${stats.sections.length} sections`],
    ['infinity', 'Full lifetime access'],
    ['globe', `Taught in ${course.language?.toUpperCase() ?? 'EN'}`],
  ];

  return (
    <>
      {/* Hero */}
      <section className="bg-ink text-white">
        <div className="container-x py-8 lg:py-12">
          <div className="lg:w-[calc(100%-420px)] lg:pr-10">
            <Breadcrumb items={[{ label: 'Courses', href: '/courses' }, { label: labelize(course.category), href: `/courses?category=${course.category}` }, { label: LEVELS[course.level] ?? course.level }]} />
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mt-4">{course.title}</h1>
            <p className="text-lg mt-3 text-white/90 line-clamp-3">{course.subtitle || course.description}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-sm">
              {stats.reviews.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="font-bold text-amber-300">{stats.avg.toFixed(1)}</span><Stars value={stats.avg} />
                  <a href="#reviews" className="underline text-white/80">({stats.reviews.length} rating{stats.reviews.length === 1 ? '' : 's'})</a>
                </span>
              )}
              <span>{(course._count?.enrollments ?? 0).toLocaleString()} student{course._count?.enrollments === 1 ? '' : 's'}</span>
            </div>
            <p className="text-sm mt-2">Created by <span className="underline">{creatorName || 'MultiHub instructor'}</span></p>
            <p className="text-sm mt-1 flex items-center gap-4 text-white/80">
              <span className="flex items-center gap-1.5"><Icon name="clock" size={14} /> Updated {shortDate(course.updatedAt)}</span>
              <span className="flex items-center gap-1.5"><Icon name="globe" size={14} /> {course.language?.toUpperCase()}</span>
            </p>
            {!published && <div className="mt-4"><Badge tone="amber">This course is {labelize(course.status)} and not open for enrollment</Badge></div>}
          </div>
        </div>
      </section>

      <div className="container-x">
        <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-10">
          {/* Purchase card (sticky on desktop, first on mobile) */}
          <aside className="lg:order-2 lg:-mt-[300px] relative z-10 mb-8 lg:mb-0">
            <div className="lg:sticky lg:top-24 bg-white border border-border shadow-card">
              <div className="aspect-video bg-gray-100"><CourseThumb course={course} /></div>
              <div className="p-6">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <p className="text-3xl font-bold">{money(netCents)}</p>
                  {discounted && <p className="text-lg text-ink-muted line-through">{money(course.priceCents)}</p>}
                  {discounted && quote?.coupon && <span className="text-sm font-bold text-primary">{quote.coupon.percentOff}% off</span>}
                </div>
                {discounted && quote?.coupon && <p className="text-xs text-ink-muted mt-1 flex items-center gap-1.5"><Icon name="tag" size={13} /><b>{quote.coupon.code}</b> applied</p>}
                <div className="mt-4">{cta}</div>
                <h3 className="font-bold mt-6 mb-3">This course includes:</h3>
                <ul className="space-y-2.5 text-sm">
                  {includes.map(([icon, text]) => <li key={text} className="flex items-center gap-3"><Icon name={icon} size={16} className="text-ink-muted" />{text}</li>)}
                </ul>
              </div>
            </div>
          </aside>

          <div className="lg:order-1 min-w-0 py-8 space-y-10">
            {/* What you'll learn */}
            {(course.learningOutcomes?.length > 0 || stats.sections.length > 0) && (
              <section className="border border-border p-6">
                <h2 className="text-2xl font-bold mb-4">What you&apos;ll learn</h2>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                  {(course.learningOutcomes?.length > 0 ? course.learningOutcomes : stats.sections.slice(0, 8).map((x: any) => x.title)).map((t: string, i: number) => (
                    <li key={i} className="flex gap-3"><Icon name="check" size={16} className="shrink-0 mt-0.5 text-ink" />{t}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Curriculum */}
            <section>
              <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-2xl font-bold">Course content</h2>
                  <p className="text-sm text-ink-muted mt-1">{stats.sections.length} sections • {stats.lessons.length} lessons{stats.totalSeconds > 0 && ` • ${duration(stats.totalSeconds)} total length`}</p>
                </div>
                {stats.sections.length > 0 && (
                  <button className="text-primary font-bold text-sm hover:underline" onClick={() => {
                    const allOpen = stats.sections.every((s: any) => open[s.id]);
                    setOpen(Object.fromEntries(stats.sections.map((s: any) => [s.id, !allOpen])));
                  }}>
                    {stats.sections.every((s: any) => open[s.id]) ? 'Collapse all sections' : 'Expand all sections'}
                  </button>
                )}
              </div>
              {stats.sections.length === 0 ? <p className="text-ink-muted text-sm border border-border p-6">The instructor hasn&apos;t added content yet.</p> : (
                <div className="border border-border divide-y divide-border">
                  {stats.sections.map((s: any) => {
                    const secs = (s.lessons ?? []).reduce((a: number, l: any) => a + (l.durationSeconds ?? 0), 0);
                    const isOpen = !!open[s.id];
                    return (
                      <div key={s.id}>
                        <button onClick={() => setOpen({ ...open, [s.id]: !isOpen })} className="w-full flex items-center gap-3 px-4 py-3.5 bg-surface text-left hover:bg-gray-100" aria-expanded={isOpen}>
                          <Icon name={isOpen ? 'up' : 'down'} size={16} />
                          <span className="font-bold flex-1">{s.title}</span>
                          <span className="text-sm text-ink-muted shrink-0">{s.lessons?.length ?? 0} lessons{secs > 0 && ` • ${duration(secs)}`}</span>
                        </button>
                        {isOpen && (
                          <ul className="px-4 py-2">
                            {(s.lessons ?? []).map((l: any) => (
                              <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
                                <Icon name={l.hasVideo ? 'video' : 'file'} size={15} className="text-ink-muted shrink-0" />
                                <span className="flex-1">{l.title}</span>
                                {l.durationSeconds > 0 && <span className="text-ink-muted">{duration(l.durationSeconds)}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {course.requirements?.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-3">Requirements</h2>
                <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-soft">{course.requirements.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
              </section>
            )}

            {/* Description */}
            <section>
              <h2 className="text-2xl font-bold mb-3">Description</h2>
              <p className="whitespace-pre-line leading-relaxed text-ink-soft">{course.description}</p>
              {course.tags?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">{course.tags.map((t: string) => <Link key={t} href={`/courses?q=${encodeURIComponent(t)}`}><Badge tone="teal">{t}</Badge></Link>)}</div>
              )}
            </section>

            {/* Instructor */}
            <section>
              <h2 className="text-2xl font-bold mb-3">Instructor</h2>
              <div className="flex items-center gap-4">
                <Avatar user={course.creator} size={72} />
                <div><p className="font-bold text-primary text-lg">{creatorName || 'MultiHub instructor'}</p><p className="text-sm text-ink-muted">Course creator</p></div>
              </div>
            </section>

            <ReviewsSection course={course} stats={stats} enrollment={enrollment} user={user} onChanged={load} />
          </div>
        </div>
      </div>

    </>
  );
}

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
}

/* ───────── Reviews ───────── */
function ReviewsSection({ course, stats, enrollment, user, onChanged }: { course: any; stats: any; enrollment: any; user: any; onChanged: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const hasReviewed = stats.reviews.some((r: any) => r.userId === user?.id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/reviews', { courseId: course.id, rating, comment: comment.trim() || undefined });
      setComment('');
      toast.success('Thanks for your review!');
      onChanged();
    } catch (err: any) { toast.error(err.message); } finally { setBusy(false); }
  }

  return (
    <section id="reviews">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        Student feedback
      </h2>
      {stats.reviews.length > 0 ? (
        <div className="flex flex-wrap gap-8 items-center mb-6">
          <div className="text-center">
            <p className="text-6xl font-bold text-amber-700">{stats.avg.toFixed(1)}</p>
            <Stars value={stats.avg} size={16} />
            <p className="text-sm font-bold text-amber-700 mt-1">Course rating</p>
          </div>
          <div className="flex-1 min-w-[220px] space-y-1.5">
            {stats.dist.map((d: any) => (
              <div key={d.n} className="flex items-center gap-3 text-sm">
                <div className="flex-1 h-2.5 bg-gray-200"><div className="h-full bg-ink-muted" style={{ width: `${(d.count / stats.reviews.length) * 100}%` }} /></div>
                <span className="w-14 text-primary">{d.n} stars</span>
                <span className="w-10 text-ink-muted text-right">{Math.round((d.count / stats.reviews.length) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : <p className="text-ink-muted text-sm mb-4">No reviews yet.</p>}

      {enrollment && !hasReviewed && (
        <form onSubmit={submit} className="border border-border p-5 mb-6 space-y-3 bg-surface">
          <p className="font-bold">How would you rate this course?</p>
          <StarInput value={rating} onChange={setRating} />
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} placeholder="Tell others what you thought (optional)" className="input" />
          <button disabled={busy} className="btn-dark">{busy ? 'Submitting…' : 'Submit review'}</button>
        </form>
      )}
      {!user && <p className="text-sm text-ink-muted mb-4"><Link href={`/login?next=/courses/${course.slug}`} className="text-primary font-bold hover:underline">Log in</Link> and enroll to leave a review.</p>}

      <div className="divide-y divide-border">
        {stats.reviews.map((r: any) => (
          <div key={r.id} className="py-5 flex gap-4">
            <Avatar user={r.user} size={44} />
            <div>
              <p className="font-bold">{fullName(r.user) || 'Anonymous'}</p>
              <div className="flex items-center gap-2 mt-0.5"><Stars value={r.rating} /><span className="text-xs text-ink-muted">{timeAgo(r.createdAt)}</span></div>
              {r.comment && <p className="text-sm mt-2 text-ink-soft whitespace-pre-line">{r.comment}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CourseDetailPage() {
  return <Suspense fallback={<PageSpinner />}><CourseDetail /></Suspense>;
}
