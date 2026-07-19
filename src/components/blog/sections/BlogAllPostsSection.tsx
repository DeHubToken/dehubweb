
import React from 'react';
import { Calendar, X } from 'lucide-react';
import { BlogPost } from '@/types/blog';
import BlogCard from '@/components/blog/BlogCard';

interface BlogAllPostsSectionProps {
  filteredPosts: BlogPost[];
  searchQuery: string;
  selectedTag: string;
  onClearFilter?: () => void;
}

export const BlogAllPostsSection: React.FC<BlogAllPostsSectionProps> = ({
  filteredPosts,
  searchQuery,
  selectedTag,
  onClearFilter
}) => {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Calendar className="w-6 h-6 text-foreground" />
        <h2 className="text-2xl font-bold text-foreground font-exo">
          {searchQuery || selectedTag ? (selectedTag ? `Tagged: ${selectedTag}` : 'Search Results') : 'Latest Posts'}
        </h2>
        {(searchQuery || selectedTag) && (
          <span className="text-muted-foreground font-exo">
            ({filteredPosts.length} post{filteredPosts.length !== 1 ? 's' : ''})
          </span>
        )}
        {(searchQuery || selectedTag) && onClearFilter && (
          <button
            onClick={onClearFilter}
            className="inline-flex items-center gap-1 bg-muted text-foreground px-3 py-1 rounded-full text-sm font-medium hover:bg-muted/80 transition-colors duration-200 font-exo"
          >
            Clear <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredPosts.map(post => (
            <BlogCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <h3 className="text-xl font-semibold text-foreground mb-2 font-exo">No Posts Found</h3>
          <p className="text-muted-foreground font-exo">
            {searchQuery || selectedTag ? 'Try adjusting your search criteria or browse all posts.' : 'Check back soon for new content!'}
          </p>
        </div>
      )}
    </section>
  );
};
