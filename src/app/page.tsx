import { getOnboardFormData } from '@/app/actions/assets';
import HomePortalWrapper from '@/components/modules/HomePortalWrapper';
import type { Category, Warehouse } from '@/types/domain';

export const dynamic = 'force-dynamic';

const FALLBACK_WAREHOUSES: Warehouse[] = [
  { id: 'wh-main-01', name: "מחסן מרכזי - אגף א'", code: 'CDB-01', isActive: true },
  { id: 'wh-site-02', name: "אתר בנייה - מכולה ב'", code: 'SCB-02', isActive: true },
  { id: 'wh-van-03', name: 'רכב שירות נייד 05', code: 'MSV-05', isActive: true },
];

const FALLBACK_CATEGORIES: Category[] = [
  { id: 'cat-pow-01', name: 'כלי עבודה חשמליים', slug: 'power-tools', icon: 'zap', displayOrder: 1 },
  { id: 'cat-han-02', name: 'כלי עבודה ידניים', slug: 'hand-tools', icon: 'wrench', displayOrder: 2 },
  { id: 'cat-mea-03', name: 'מכשירי מדידה ולייזר', slug: 'measuring', icon: 'ruler', displayOrder: 3 },
  { id: 'cat-saf-04', name: 'בטיחות וציוד מגן', slug: 'safety', icon: 'shield', displayOrder: 4 },
];

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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center">
      <div className="w-full">
        <HomePortalWrapper categories={categories} warehouses={warehouses} />
      </div>
    </div>
  );
}
