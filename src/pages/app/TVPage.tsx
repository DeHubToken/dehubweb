/**
 * TV Page
 * =======
 * Dedicated page for browsing all TV channels.
 * 
 * @module pages/app/TVPage
 */

import { PageHeader } from '@/components/app/PageHeader';
import { LiveTVSection } from '@/components/app/tv';

export default function TVPage() {
  return (
    <div className="min-h-screen">
      <PageHeader title="TV" />
      <div className="p-2 sm:p-3">
        <LiveTVSection />
      </div>
    </div>
  );
}
