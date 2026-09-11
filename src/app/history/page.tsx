import type { Metadata } from 'next';
import { getAuditHistory } from '@/app/actions/history';
import HistoryView from '@/components/modules/HistoryView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tooly - Audit History & Movement Ledger',
  description: 'Chronological custody movement ledger, checkout tracking, and warehouse transfer audit log.',
};

export default async function HistoryPage() {
  const historyData = await getAuditHistory();

  return <HistoryView initialData={historyData} />;
}
