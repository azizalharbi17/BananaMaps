import type { Metadata } from 'next';
import { Suspense } from 'react';
import DashboardClient from './DashboardClient';

export const metadata: Metadata = {
  title: 'Developer dashboard — BananaMaps',
  description: 'Manage your BananaMaps API keys, usage and plan, and your BananaMaps Embed sites.',
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="dev-container dash-center">
          <div className="dash-spinner" aria-label="Loading" />
        </div>
      }
    >
      <DashboardClient />
    </Suspense>
  );
}
