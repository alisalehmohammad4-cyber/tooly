import React from 'react';
import type { Metadata } from 'next';
import { getStorekeeperOperations } from '@/app/actions/dashboard';
import WarehouseDashboardView from '@/components/modules/WarehouseDashboardView';

export const metadata: Metadata = {
  title: 'עמדת מחסנאי ותפעול מלאי | Tooly',
  description:
    'תפעול שוטף, החזרות יומיות, מעקב כלים באיחור והתרעות מלאי קריטי במחסן',
};

export const dynamic = 'force-dynamic';

interface WarehouseDashboardPageProps {
  searchParams?: Promise<{ warehouse?: string; org?: string; organizationId?: string }>;
}

export default async function WarehouseDashboardPage(props: WarehouseDashboardPageProps) {
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
