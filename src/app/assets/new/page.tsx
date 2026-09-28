import { getOnboardFormData } from '@/app/actions/assets';
import QuickOnboardView from '@/components/modules/QuickOnboardView';
import type { Category, Warehouse } from '@/types/domain';
import { getMockWarehouses, MOCK_CATEGORIES } from '@/lib/mockStore';

export const dynamic = 'force-dynamic';

const FALLBACK_CATEGORIES: Category[] = MOCK_CATEGORIES;

export default async function NewAssetPage() {
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
    if (!warehouses || warehouses.length === 0) warehouses = getMockWarehouses();
    if (!categories || categories.length === 0) categories = FALLBACK_CATEGORIES;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <QuickOnboardView categories={categories} warehouses={warehouses} />
    </main>
  );
}
