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

export default async function WarehouseDashboardPage() {
  const operationsData = await getStorekeeperOperations();

  return <WarehouseDashboardView initialData={operationsData} />;
}
