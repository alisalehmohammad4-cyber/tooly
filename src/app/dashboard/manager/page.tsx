import React from 'react';
import type { Metadata } from 'next';
import { getPlantManagerAnalytics } from '@/app/actions/dashboard';
import ManagerDashboardView from '@/components/modules/ManagerDashboardView';

export const metadata: Metadata = {
  title: 'לוח בקרה ניהולי | Tooly',
  description:
    'ניהול ובקרת ציוד, ניצולת מלאי, התרעות בטיחות ודוחות איחורים למנהל מפעל ופרויקטים',
};

export const dynamic = 'force-dynamic';

export default async function ManagerDashboardPage() {
  const analyticsData = await getPlantManagerAnalytics();

  return <ManagerDashboardView data={analyticsData} />;
}
