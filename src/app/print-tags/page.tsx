import type { Metadata } from 'next';
import PrintTagsView from '@/components/modules/PrintTagsView';

export const metadata: Metadata = {
  title: 'Tooly | הדפסת תגיות ברקוד',
  description: 'הפקה והדפסה של גיליונות מדבקות ברקוד QR לכלים וציוד.',
};

export default function PrintTagsPage() {
  return <PrintTagsView />;
}
