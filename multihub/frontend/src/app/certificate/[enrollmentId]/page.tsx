'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { ErrorState, PageSpinner } from '@/components/ui';
import { api } from '@/lib/api';
import { duration, shortDate } from '@/lib/format';
import { useRequireAuth } from '@/lib/hooks';

/** Printable certificate of completion (use the browser's "Save as PDF"). */
export default function CertificatePage() {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const { allowed } = useRequireAuth();
  const [cert, setCert] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (allowed) api.get(`/api/enrollments/${enrollmentId}/certificate`).then(setCert).catch((e) => setError(e.message));
  }, [allowed, enrollmentId]);

  if (!allowed || (!cert && !error)) return <PageSpinner />;
  if (error) return <div className="container-x py-16 max-w-xl"><ErrorState message={error} /><Link href="/dashboard" className="btn-dark mt-4">Back to My learning</Link></div>;

  return (
    <div className="container-x py-10 max-w-4xl">
      <div className="flex justify-between items-center mb-6 print:hidden">
        <Link href="/dashboard" className="text-primary font-bold hover:underline">← My learning</Link>
        <button onClick={() => window.print()} className="btn-dark"><Icon name="print" size={16} />Print / Save as PDF</button>
      </div>
      <div className="border-[10px] border-double border-primary bg-white p-10 sm:p-16 text-center">
        <div className="flex items-center justify-center gap-2"><span className="w-10 h-10 bg-primary text-white inline-flex items-center justify-center font-bold text-lg">M</span><span className="text-2xl font-bold">MultiHub</span></div>
        <p className="uppercase tracking-[0.3em] text-sm text-ink-muted mt-10">Certificate of completion</p>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mt-6">{cert.courseTitle}</h1>
        <p className="text-ink-muted mt-3">{cert.instructorName && <>Instructors: <b className="text-ink">{cert.instructorName}</b></>}</p>
        <p className="text-sm text-ink-muted mt-10">This certificate is awarded to</p>
        <p className="text-3xl sm:text-4xl font-bold mt-2 pb-3 border-b-2 border-ink inline-block px-10">{cert.studentName}</p>
        <p className="mt-6 text-sm">for completing the course on <b>{shortDate(cert.completedAt)}</b>{cert.totalSeconds > 0 && <> — {cert.lessonCount} lessons, {duration(cert.totalSeconds)} total</>}.</p>
        <div className="mt-12 pt-5 border-t border-border text-xs text-ink-muted">
          <p>Certificate no. <b className="text-ink tracking-wider">{cert.code}</b></p>
          <p className="mt-1">Verify at <span className="font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}/verify/{cert.code}</span></p>
        </div>
      </div>
    </div>
  );
}
