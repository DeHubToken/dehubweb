import React from 'react';
import { Link } from 'react-router-dom';
import { BlogPost } from '@/types/blog';
import { OptimizedImage } from '@/components/OptimizedImage';
import { formatDate } from '@/utils/blogUtils';

interface RelatedPostsProps {
  currentPost: BlogPost;
  allPosts: BlogPost[];
}

export const RelatedPosts: React.FC<RelatedPostsProps> = ({ currentPost, allPosts }) => {
  // Find related posts based on tags or recent posts
  const relatedPosts = allPosts
    .filter(post => 
      post.id !== currentPost.id && 
      post.status === 'published' &&
      (post.tags.some(tag => currentPost.tags.includes(tag)) || true)
    )
    .slice(0, 3);

  if (relatedPosts.length === 0) return null;

  return (
    <section className="mt-12 pt-8 border-t border-sky-blue/20">
      <h3 className="text-2xl font-bold text-royal-blue mb-6 font-exo">Related Posts</h3>
      <div className="grid gap-6 md:grid-cols-3">
        {relatedPosts.map((post) => (
          <Link
            key={post.id}
            to={`/guides/${post.slug}`}
            className="group bg-plain-white rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-sky-blue/10"
          >
            <div className="h-20 overflow-hidden">
              <OptimizedImage
                src={post.bannerImage}
                alt={post.bannerImageAlt}
                className="w-full h-full object-cover object-bottom group-hover:scale-105 transition-transform duration-200"
              />
            </div>
            <div className="p-4">
              <h4 className="font-semibold text-royal-blue group-hover:text-middle-blue transition-colors line-clamp-2 mb-2">
                {post.title}
              </h4>
              <p className="text-sm text-royal-blue/70 mb-2 line-clamp-2">
                {post.excerpt}
              </p>
              <div className="text-xs text-royal-blue/50">
                {formatDate(post.publishedAt)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};