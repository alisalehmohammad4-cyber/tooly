import { getOnboardFormData } from '@/app/actions/assets';
import QuickOnboardView from '@/components/modules/QuickOnboardView';
import type { Category, Warehouse } from '@/types/domain';

export const dynamic = 'force-dynamic';

const FALLBACK_WAREHOUSES: Warehouse[] = [
  { id: 'wh-main-01', name: 'Central Depot - Bay A', code: 'CDB-01', isActive: true },
  { id: 'wh-site-02', name: 'Site Container Bravo', code: 'SCB-02', isActive: true },
  { id: 'wh-van-03', name: 'Mobile Service Van 05', code: 'MSV-05', isActive: true },
];

const FALLBACK_CATEGORIES: Category[] = [
  { id: 'cat-pow-01', name: 'Power Tools', slug: 'power-tools', icon: 'zap', displayOrder: 1 },
  { id: 'cat-han-02', name: 'Hand Tools', slug: 'hand-tools', icon: 'wrench', displayOrder: 2 },
  { id: 'cat-mea-03', name: 'Measuring', slug: 'measuring', icon: 'ruler', displayOrder: 3 },
  { id: 'cat-saf-04', name: 'Safety & PPE', slug: 'safety', icon: 'shield', displayOrder: 4 },
];

export default async function HomePage() {
  let warehouses: Warehouse[] = [];
  let categories: Category[] = [];
  let isFallbackMode = false;

  try {
    const formData = await getOnboardFormData();
    warehouses = formData.warehouses;
    categories = formData.categories;
  } catch (err) {
    console.warn('Could not fetch live onboard form data, using fallback items:', err);
  }

  if (!warehouses || warehouses.length === 0 || !categories || categories.length === 0) {
    isFallbackMode = true;
    if (!warehouses || warehouses.length === 0) warehouses = FALLBACK_WAREHOUSES;
    if (!categories || categories.length === 0) categories = FALLBACK_CATEGORIES;
  }

  return (
    <div className="min-h-screen bg-slate-50/50 text-blue-950 flex flex-col items-center">
      {isFallbackMode && (
        <aside
          aria-label="Demo environment notification"
          className="w-full max-w-lg mx-auto px-4 pt-2.5 pb-0.5"
        >
          <div className="px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold flex items-center justify-between shadow-sm">
            <span>
              ℹ️ <strong className="text-blue-950">Field Standby:</strong> Demo warehouses and categories loaded. Connect Supabase credentials to sync live database assets.
            </span>
          </div>
        </aside>
      )}

      <div className="w-full">
        <QuickOnboardView categories={categories} warehouses={warehouses} />
      </div>
    </div>
  );
}
