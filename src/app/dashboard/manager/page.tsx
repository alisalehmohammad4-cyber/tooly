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

interface ManagerDashboardPageProps {
  searchParams?: Promise<{ org?: string; organizationId?: string }>;
}

export default async function ManagerDashboardPage(props: ManagerDashboardPageProps) {
  const searchParams = await props.searchParams;
  const orgParam = searchParams?.org || searchParams?.organizationId;
  const analyticsData = await getPlantManagerAnalytics(orgParam);

  return <ManagerDashboardView key={orgParam || 'session'} data={analyticsData} />;
}
