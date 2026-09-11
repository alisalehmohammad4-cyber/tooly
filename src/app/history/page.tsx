import type { Metadata } from 'next';
import { getAuditHistory } from '@/app/actions/history';
import HistoryView from '@/components/modules/HistoryView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tooly | יומן תנועות וביקורת',
  description: 'יומן מעקב תנועות ציוד, היסטוריית ניפוקים, החזרות וחתימות עובדים.',
};

export default async function HistoryPage() {
  const historyData = await getAuditHistory();

  return <HistoryView initialData={historyData} />;
}
