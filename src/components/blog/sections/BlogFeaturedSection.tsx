
import React from 'react';
import { TrendingUp } from 'lucide-react';
import { BlogPost } from '@/types/blog';
import BlogCard from '@/components/blog/BlogCard';

interface BlogFeaturedSectionProps {
  featuredPosts: BlogPost[];
  shouldShow: boolean;
}

export const BlogFeaturedSection: React.FC<BlogFeaturedSectionProps> = ({
  featuredPosts,
  shouldShow
}) => {
  if (!shouldShow || featuredPosts.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-6 h-6 text-foreground" />
        <h2 className="text-2xl font-bold text-foreground font-exo">Featured Posts</h2>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {featuredPosts.slice(0, 2).map(post => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
};
