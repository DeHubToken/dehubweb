import { useTranslation } from 'react-i18next';

/** Text in shared JSX and class error boundaries subscribes to language changes. */
export function TranslationText({ name, fallback }: { name: string; fallback: string }) {
  const { t } = useTranslation();
  return <>{t(name, { defaultValue: fallback })}</>;
}
