import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export const BlogHeader: React.FC = () => {
  const { t } = useLanguage();

  return <>
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold text-foreground leading-tight font-exo">
          DeHub
          <span className="block bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">{t('blog.communityBlog')}</span>
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-exo">
          {t('blog.blogSubtitle')}
        </p>
      </div>
    </>;
};
