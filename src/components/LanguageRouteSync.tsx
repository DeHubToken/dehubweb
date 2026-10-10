import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loadLanguage, SUPPORTED_LANGUAGES } from '@/i18n';
import { publicPageLanguages } from '@/lib/seo/public-locales';

/** Search-result URLs and in-app language changes select the same language. */
export function LanguageRouteSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const pendingUrlLanguage = useRef<string | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('hl')?.toLowerCase();
    if (!requested || !SUPPORTED_LANGUAGES.some(option => option.code === requested)) return;
    pendingUrlLanguage.current = requested;
    let cancelled = false;
    void loadLanguage(requested).then(ok => {
      if (ok && !cancelled) {
        pendingUrlLanguage.current = null;
        try { localStorage.setItem('user-preferred-language', requested); } catch { /* Visit only. */ }
        void i18n.changeLanguage(requested);
      }
    });
    return () => { cancelled = true; pendingUrlLanguage.current = null; };
  }, [location.key, location.search, i18n]);

  useEffect(() => {
    const lang = i18n.language || 'en';
    const languages = publicPageLanguages(location.pathname);
    if (!languages.length) return;
    const params = new URLSearchParams(location.search);
    const requested = params.get('hl');
    // Let a newly visited explicit URL finish selecting its language first.
    if (pendingUrlLanguage.current && pendingUrlLanguage.current !== lang) return;
    const next = languages.includes(lang) ? lang : null;
    if (requested !== next) {
      if (next) params.set('hl', next);
      else params.delete('hl');
      navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
    }
  }, [i18n.language, location.pathname, location.search, location.hash, navigate]);
  return null;
}
