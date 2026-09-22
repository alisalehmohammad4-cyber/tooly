import React from 'react';
import type { Metadata } from 'next';
import { getStorekeeperOperations } from '@/app/actions/dashboard';
import WarehouseDashboardView from '@/components/modules/WarehouseDashboardView';

export const metadata: Metadata = {
  title: 'מרכז תפעול ראשי ולוגיסטיקה ארגונית | Tooly',
  description:
    'ניהול צי כלי עבודה, מעקב שינוע שטח, בקרת תיקונים ומעבדות שירות, ואישור דרישות אתרים',
};

export const dynamic = 'force-dynamic';

interface ChiefDashboardPageProps {
  searchParams?: Promise<{ warehouse?: string; org?: string; organizationId?: string }>;
}

export default async function ChiefDashboardPage(props: ChiefDashboardPageProps) {
  const searchParams = await props.searchParams;
  const warehouseId = searchParams?.warehouse;
  const orgParam = searchParams?.org || searchParams?.organizationId;
  const operationsData = await getStorekeeperOperations(warehouseId, orgParam);

  return (
    <WarehouseDashboardView
      key={`${orgParam || 'session'}_${warehouseId || 'all'}`}
      initialData={operationsData}
      warehouses={operationsData.warehouses}
    />
  );
}
