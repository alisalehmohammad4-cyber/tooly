import type { Metadata } from 'next';
import { getAuditHistory } from '@/app/actions/history';
import HistoryView from '@/components/modules/HistoryView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tooly | יומן תנועות וביקורת',
  description: 'יומן מעקב תנועות ציוד, היסטוריית ניפוקים, החזרות וחתימות עובדים.',
};

interface HistoryPageProps {
  searchParams?: Promise<{ org?: string; organizationId?: string }>;
}

export default async function HistoryPage(props: HistoryPageProps) {
  const searchParams = await props.searchParams;
  const orgParam = searchParams?.org || searchParams?.organizationId;
  const historyData = await getAuditHistory(undefined, orgParam);

  return <HistoryView key={orgParam || 'session'} initialData={historyData} />;
}
