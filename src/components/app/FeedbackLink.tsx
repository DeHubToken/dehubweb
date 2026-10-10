import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function FeedbackLink({ source }: { source: 'converter' | 'migration' }) {
  const { t } = useTranslation();
  return (
    <Link to={`/feedback?source=${source}`} className="self-start text-xs text-zinc-400 underline underline-offset-4 hover:text-white">
      {t('stats.feedback.title', 'Feedback')}
    </Link>
  );
}
