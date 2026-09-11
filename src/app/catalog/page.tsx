import type { Metadata } from 'next';
import { getCatalogData } from '@/app/actions/assets';
import CatalogView from '@/components/modules/CatalogView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tooly - Tools Catalog',
  description: 'Interactive equipment categories and multi-warehouse asset inventory hub.',
};

export default async function CatalogPage() {
  const catalogData = await getCatalogData();

  return <CatalogView initialData={catalogData} />;
}
