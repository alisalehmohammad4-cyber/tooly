import React from 'react';
import type { Metadata } from 'next';
import SuperAdminDashboardView from '@/components/modules/SuperAdminDashboardView';

export const metadata: Metadata = {
  title: 'Tooly Master Portal - בקרת מערכת ראשית | SuperAdmin',
  description: 'ניהול על, אישור ארגונים חדשים ובקרת פעילות גלובלית ב-Tooly',
};

export const dynamic = 'force-dynamic';

export default function SuperAdminPage() {
  return <SuperAdminDashboardView />;
}
