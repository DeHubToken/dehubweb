import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock } from 'lucide-react';
import { BlogPost } from '@/types/blog';
import { ShareButtons } from './ShareButtons';
import BackButton from './BackButton';
import { useLanguage } from '@/contexts/LanguageContext';

interface BlogPostHeaderProps {
  post: BlogPost;
  displayDate: string;
  shareUrl: string;
  imageUrl?: string;
}

export const BlogPostHeader: React.FC<BlogPostHeaderProps> = ({ post, displayDate, shareUrl, imageUrl }) => {
  const { t } = useLanguage();

  return (
    <header className="mb-8">
      <BackButton />
      
      <h1 className="text-4xl lg:text-5xl font-bold text-royal-blue mb-6 leading-tight font-exo">
        {post.title}
      </h1>
      
      <div className="flex flex-wrap items-center gap-6 text-royal-blue/70 mb-6">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          <span className="font-exo">{displayDate}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          <span className="font-exo">{post.readingTime} {t('blog.minRead')}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {post.tags.map(tag => (
          <Link
            key={tag}
            to={`/docs/blog?tag=${encodeURIComponent(tag)}`}
            className="bg-sky-blue/10 text-royal-blue px-3 py-1 rounded-full text-sm font-medium hover:bg-sky-blue/20 transition-colors duration-200 cursor-pointer"
          >
            {tag}
          </Link>
        ))}
      </div>

      <div className="mb-8">
        <ShareButtons shareUrl={shareUrl} postTitle={post.title} imageUrl={imageUrl} />
      </div>
    </header>
  );
};
