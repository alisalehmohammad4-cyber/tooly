import { getOnboardFormData } from '@/app/actions/assets';
import HomePortalWrapper from '@/components/modules/HomePortalWrapper';
import type { Category, Warehouse } from '@/types/domain';

export const dynamic = 'force-dynamic';

import { MOCK_WAREHOUSES, MOCK_CATEGORIES } from '@/lib/mockStore';

const FALLBACK_WAREHOUSES: Warehouse[] = MOCK_WAREHOUSES;
const FALLBACK_CATEGORIES: Category[] = MOCK_CATEGORIES;

export default async function HomePage() {
  let warehouses: Warehouse[] = [];
  let categories: Category[] = [];

  try {
    const formData = await getOnboardFormData();
    warehouses = formData.warehouses;
    categories = formData.categories;
  } catch (err) {
    console.warn('Could not fetch live onboard form data, using fallback items:', err);
  }

  if (!warehouses || warehouses.length === 0 || !categories || categories.length === 0) {
    if (!warehouses || warehouses.length === 0) warehouses = FALLBACK_WAREHOUSES;
    if (!categories || categories.length === 0) categories = FALLBACK_CATEGORIES;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center">
      <div className="w-full">
        <HomePortalWrapper categories={categories} warehouses={warehouses} />
      </div>
    </div>
  );
}
