import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { publicPageAsset, publicPagePath, publicLocaleVersion, type PublicPageLocale } from '@/lib/seo/public-locales';

export function usePublicPageLocale(pathname: string) {
  const { i18n } = useTranslation();
  const language = i18n.language || 'en';
  const route = publicPagePath(pathname);
  const asset = publicPageAsset(route, language);
  const query = useQuery({
    queryKey: ['public-page-locale', publicLocaleVersion, route, language],
    enabled: !!asset,
    staleTime: Infinity,
    queryFn: async (): Promise<PublicPageLocale> => {
      const response = await fetch(asset!);
      if (!response.ok) throw new Error('Translated page is unavailable');
      const page = await response.json();
      if (!page.title || !page.description || typeof page.body !== 'string') throw new Error('Invalid translated page');
      return page;
    },
  });
  return { ...query, data: asset ? query.data : undefined, language, route, localized: !!asset };
}
