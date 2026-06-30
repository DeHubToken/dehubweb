
import React from 'react';
import SEO from '@/components/SEO';
import { BlogSEOHelper } from '@/components/blog/BlogSEOHelper';
import { BlogHeader } from '@/components/blog/sections/BlogHeader';
import { BlogSearchAndFilter } from '@/components/blog/sections/BlogSearchAndFilter';
import { BlogFeaturedSection } from '@/components/blog/sections/BlogFeaturedSection';
import { BlogAllPostsSection } from '@/components/blog/sections/BlogAllPostsSection';
import { BlogPopularTags } from '@/components/blog/sections/BlogPopularTags';
import { useBlogData } from '@/hooks/useBlogData';
import { useTextHighlight } from '@/hooks/useTextHighlight';

const Blog = () => {
  const {
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    featuredPosts,
    allTags,
    filteredPosts
  } = useBlogData();

  // Initialize text highlighting for blog content
  useTextHighlight();

  return (
    <>
      <SEO 
        title="Community Blog" 
        description="Stay updated with the latest news, insights, and stories from the DeHub ecosystem. Join our community as we build the future of decentralized infrastructure." 
        url="/docs/blog" 
      />
      <BlogSEOHelper />
      <div className="space-y-12">
        <BlogHeader />

        <BlogSearchAndFilter
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          allTags={allTags}
        />

        <BlogFeaturedSection
          featuredPosts={featuredPosts}
          shouldShow={!searchQuery && !selectedTag}
        />

        <BlogAllPostsSection
          filteredPosts={filteredPosts}
          searchQuery={searchQuery}
          selectedTag={selectedTag}
        />

        <BlogPopularTags
          allTags={allTags}
          setSelectedTag={setSelectedTag}
          shouldShow={!searchQuery && !selectedTag}
        />
      </div>
    </>
  );
};

export default Blog;
