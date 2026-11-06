'use client';
import Link from 'next/link';
import { CourseCard } from '@/components/CourseCard';
import { EmptyState, PageHeader, PageSpinner } from '@/components/ui';
import { useCommerce } from '@/lib/commerce';
import { useRequireAuth } from '@/lib/hooks';

export default function WishlistPage() {
  const { allowed } = useRequireAuth();
  const { wishlist, ready, inCart, addToCart } = useCommerce();
  if (!allowed || !ready) return <PageSpinner />;

  return (
    <div className="container-x py-10">
      <PageHeader title="Wishlist" subtitle={wishlist.length ? `${wishlist.length} course${wishlist.length === 1 ? '' : 's'} saved for later` : undefined} />
      {wishlist.length === 0 ? (
        <EmptyState icon="heart" title="Your wishlist is empty" text="Tap the heart on any course to save it here." action={<Link href="/courses" className="btn-dark">Browse courses</Link>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-8">
          {wishlist.map((c) => (
            <div key={c.id}>
              <CourseCard course={c} />
              {inCart(c.id)
                ? <Link href="/cart" className="btn-outline w-full mt-3">Go to cart</Link>
                : <button onClick={() => addToCart(c.id)} className="btn-primary w-full mt-3">Add to cart</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
