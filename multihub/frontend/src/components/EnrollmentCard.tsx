import Link from 'next/link';
import { CourseThumb, ProgressBar, Badge } from '@/components/ui';
import { Icon } from '@/components/Icon';

/** "My learning" card: thumbnail + progress + resume. */
export function EnrollmentCard({ enrollment }: { enrollment: any }) {
  const c = enrollment.course ?? {};
  const pct = Math.round((enrollment.progress ?? 0) * 100);
  const done = enrollment.status === 'COMPLETED' || pct >= 100;
  return (
    <div className="group card hover:shadow-card transition-shadow flex flex-col">
      <Link href={`/learn/${enrollment.id}`} className="relative block aspect-video bg-gray-100 overflow-hidden">
        <CourseThumb course={c} />
        <span className="absolute inset-0 bg-ink/0 group-hover:bg-ink/50 transition-colors flex items-center justify-center">
          <span className="w-14 h-14 bg-white rounded-full items-center justify-center hidden group-hover:inline-flex shadow-pop">
            <Icon name="play" size={22} className="text-ink ml-0.5" />
          </span>
        </span>
      </Link>
      <div className="p-4 flex flex-col flex-1">
        <Link href={`/learn/${enrollment.id}`} className="font-bold leading-snug line-clamp-2 hover:text-primary">{c.title}</Link>
        <p className="text-xs text-ink-muted mt-1 truncate">{c.creatorName}</p>
        <div className="mt-auto pt-4">
          <ProgressBar value={enrollment.progress ?? 0} />
          {done && <Link href={`/certificate/${enrollment.id}`} className="text-primary font-bold text-xs hover:underline inline-flex items-center gap-1 mt-2"><Icon name="award" size={13} />View certificate</Link>}
          <div className="flex items-center justify-between mt-2 text-xs text-ink-muted">
            <span>{done ? <Badge tone="green">Completed</Badge> : `${pct}% complete`}</span>
            {enrollment.lessonCount > 0 && <span>{enrollment.completedCount ?? 0}/{enrollment.lessonCount} lessons</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
