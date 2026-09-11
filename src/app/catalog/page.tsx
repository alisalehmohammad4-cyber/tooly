import type { Metadata } from 'next';
import { getCatalogData } from '@/app/actions/assets';
import CatalogView from '@/components/modules/CatalogView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tooly | קטלוג ומלאי כלים',
  description: 'קטלוג כלי עבודה, סינון לפי קטגוריות ומעקב מלאי לפי מחסנים ואתרים.',
};

export default async function CatalogPage() {
  const catalogData = await getCatalogData();

  return <CatalogView initialData={catalogData} />;
}
