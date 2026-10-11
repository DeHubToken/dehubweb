import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { PageBody, PageIsland } from '@/components/app/page-kit/PageKit';
import { FeedbackSection } from '@/components/app/stats/FeedbackSection';

export default function FeedbackPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const source = params.get('source');
  return (
    <div className="min-h-full">
      <PageIsland title={t('stats.feedback.title', 'Feedback')} icon={<MessageSquare className="w-5 h-5" />} />
      <PageBody>
        <FeedbackSection source={source === 'converter' || source === 'migration' ? source : undefined} />
      </PageBody>
    </div>
  );
}
