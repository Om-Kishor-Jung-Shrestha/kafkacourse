'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { PageSpinner } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/format';

/** Public certificate verification — no login needed. */
export default function VerifyCertificatePage() {
  const { code } = useParams<{ code: string }>();
  const [cert, setCert] = useState<any>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => { api.get(`/api/certificates/${encodeURIComponent(code)}`).then(setCert).catch(() => setInvalid(true)); }, [code]);

  if (!cert && !invalid) return <PageSpinner />;
  return (
    <div className="container-x py-16 max-w-xl text-center">
      {invalid ? (
        <>
          <span className="w-16 h-16 bg-red-100 text-error rounded-full inline-flex items-center justify-center"><Icon name="alert" size={32} /></span>
          <h1 className="text-2xl font-bold mt-4">Certificate not found</h1>
          <p className="text-ink-muted mt-2">We couldn&apos;t find a certificate with the number <b>{code}</b>. Check the code and try again.</p>
        </>
      ) : (
        <>
          <span className="w-16 h-16 bg-green-100 text-success rounded-full inline-flex items-center justify-center"><Icon name="checkCircle" size={32} /></span>
          <h1 className="text-2xl font-bold mt-4">Valid certificate</h1>
          <div className="border border-border text-left mt-6 p-6 space-y-3 text-sm">
            <p><span className="text-ink-muted">Awarded to</span><br /><b className="text-lg">{cert.studentName}</b></p>
            <p><span className="text-ink-muted">Course</span><br /><b>{cert.courseTitle}</b></p>
            <p><span className="text-ink-muted">Completed</span><br /><b>{shortDate(cert.completedAt)}</b></p>
            <p><span className="text-ink-muted">Certificate no.</span><br /><b className="tracking-wider">{cert.code}</b></p>
          </div>
        </>
      )}
      <Link href="/" className="btn-outline mt-8">Back to MultiHub</Link>
    </div>
  );
}
