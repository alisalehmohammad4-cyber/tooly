import type { Metadata } from 'next';
import PrintTagsView from '@/components/modules/PrintTagsView';

export const metadata: Metadata = {
  title: 'Tooly - Print Asset Tags',
  description: 'Generate and print high-contrast industrial QR asset tags for Tooly inventory.',
};

export default function PrintTagsPage() {
  return <PrintTagsView />;
}
