'use client';
import Link from 'next/link';
import { CourseThumb, Stars, Badge } from '@/components/ui';
import { Icon, HeartFilled } from '@/components/Icon';
import { useCommerce } from '@/lib/commerce';
import { LEVELS, money } from '@/lib/format';

/** Udemy-style catalog card: thumbnail, title, instructor, rating, price, badges, wishlist heart. */
export function CourseCard({ course }: { course: any }) {
  const { inWishlist, toggleWishlist } = useCommerce();
  const saved = inWishlist(course.id);
  const rating = course.averageRating ?? 0;
  const popular = (course.enrollmentCount ?? 0) >= 10;
  const isNew = course.publishedAt && Date.now() - new Date(course.publishedAt).getTime() < 14 * 86400_000;
  return (
    <div className="group relative">
      <Link href={`/courses/${course.slug}`} className="block">
        <div className="aspect-video overflow-hidden border border-border bg-gray-100 relative">
          <div className="w-full h-full group-hover:scale-[1.03] transition-transform duration-300">
            <CourseThumb course={course} />
          </div>
        </div>
        <h3 className="font-bold leading-snug mt-2 line-clamp-2 group-hover:text-primary">{course.title}</h3>
        <p className="text-xs text-ink-muted mt-1 truncate">{course.creatorName}</p>
        <div className="flex items-center gap-1.5 mt-1 text-sm">
          <span className="font-bold text-amber-800">{rating ? rating.toFixed(1) : 'New'}</span>
          {rating > 0 && <Stars value={rating} />}
          {rating > 0 && <span className="text-xs text-ink-muted">({(course.reviewCount ?? 0).toLocaleString()})</span>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-bold">{money(course.priceCents)}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {popular && <Badge tone="teal">Bestseller</Badge>}
          {isNew && <Badge tone="amber">New</Badge>}
          {course.level && <Badge>{LEVELS[course.level] ?? course.level}</Badge>}
        </div>
      </Link>
      <button
        onClick={(e) => { e.preventDefault(); toggleWishlist(course.id); }}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from wishlist' : 'Add to wishlist'}
        className="absolute top-2 right-2 w-9 h-9 rounded-full bg-white/95 shadow-card flex items-center justify-center hover:scale-105 transition-transform"
      >
        {saved ? <HeartFilled size={18} className="text-accent" /> : <Icon name="heart" size={18} />}
      </button>
    </div>
  );
}
