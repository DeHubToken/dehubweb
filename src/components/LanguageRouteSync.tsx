import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loadLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { publicPageLanguages } from '@/lib/seo/public-locales';

/** Search-result URLs and in-app language changes select the same language. */
export function LanguageRouteSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const subscribeLanguage = useCallback((changed: () => void) => {
    i18n.on('languageChanged', changed);
    return () => { i18n.off('languageChanged', changed); };
  }, [i18n]);
  const language = useSyncExternalStore(subscribeLanguage, () => i18n.language || 'en', () => 'en');
  const pendingUrlLanguage = useRef<string | null>(null);
  const languageAtRequest = useRef(i18n.language);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('hl')?.toLowerCase();
    if (!requested || !SUPPORTED_LANGUAGES.some(option => option.code === requested)) return;
    pendingUrlLanguage.current = requested;
    languageAtRequest.current = i18n.language;
    let cancelled = false;
    void loadLanguage(requested).then(ok => {
      if (ok && !cancelled && (i18n.language === languageAtRequest.current || i18n.language === requested)) {
        pendingUrlLanguage.current = null;
        try { localStorage.setItem('user-preferred-language', requested); } catch { /* Visit only. */ }
        void i18n.changeLanguage(requested);
      }
    }).finally(() => { if (!cancelled) pendingUrlLanguage.current = null; });
    return () => { cancelled = true; pendingUrlLanguage.current = null; };
  }, [location.key, location.search, i18n]);

  useEffect(() => {
    const lang = language;
    const languages = publicPageLanguages(location.pathname);
    if (!languages.length) return;
    const params = new URLSearchParams(location.search);
    const requested = params.get('hl');
    // Let a newly visited explicit URL finish selecting its language first.
    if (pendingUrlLanguage.current && pendingUrlLanguage.current !== lang) {
      if (lang === languageAtRequest.current) return;
      pendingUrlLanguage.current = null;
    }
    const next = languages.includes(lang) ? lang : null;
    if (requested !== next) {
      if (next) params.set('hl', next);
      else params.delete('hl');
      navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
    }
  }, [language, location.pathname, location.search, location.hash, navigate]);
  return null;
}
