import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { publicLocaleVersion, publicPageLanguages } from '@/lib/seo/public-locales';
import type { BlogPost } from '@/types/blog';

type Metadata = Pick<BlogPost, 'title' | 'seoTitle' | 'seoDescription' | 'excerpt' | 'bannerImageAlt'>;
export function useLocalizedBlogMetadata() {
  const { i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const enabled = publicPageLanguages('/docs/blog').includes(lang);
  const { data } = useQuery({
    queryKey: ['blog-metadata-locale', publicLocaleVersion, lang],
    enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<Record<string, Metadata>> => {
      const response = await fetch(`/locale-pages/${publicLocaleVersion}/${lang}/blog-metadata.json`);
      if (!response.ok) throw new Error('Translated article metadata is unavailable');
      return response.json();
    },
  });
  return enabled ? data : undefined;
}
