import type { Metadata } from 'next';
import { getCatalogData } from '@/app/actions/assets';
import CatalogView from '@/components/modules/CatalogView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tooly | קטלוג ומלאי כלים',
  description: 'קטלוג כלי עבודה, סינון לפי קטגוריות ומעקב מלאי לפי מחסנים ואתרים.',
};

interface CatalogPageProps {
  searchParams?: Promise<{ warehouse?: string }>;
}

export default async function CatalogPage(props: CatalogPageProps) {
  const searchParams = await props.searchParams;
  const warehouseId = searchParams?.warehouse;
  const catalogData = await getCatalogData(warehouseId);

  return <CatalogView key={warehouseId || 'all'} initialData={catalogData} />;
}


