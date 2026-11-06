import { redirect } from 'next/navigation';

// Legacy route: search now lives in the catalog (/courses?q=...).
export default async function SearchRedirect({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/courses?q=${encodeURIComponent(q)}` : '/courses');
}
