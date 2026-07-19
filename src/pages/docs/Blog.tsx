
import React, { useRef, useEffect, useLayoutEffect } from 'react';
import SEO from '@/components/SEO';
import { BlogSEOHelper } from '@/components/blog/BlogSEOHelper';
import { BlogHeader } from '@/components/blog/sections/BlogHeader';
import { BlogFeaturedSection } from '@/components/blog/sections/BlogFeaturedSection';
import { BlogAllPostsSection } from '@/components/blog/sections/BlogAllPostsSection';
import { BlogPopularTags } from '@/components/blog/sections/BlogPopularTags';
import { useBlogData } from '@/hooks/useBlogData';
import { useTextHighlight } from '@/hooks/useTextHighlight';

const Blog = () => {
  const {
    selectedTag,
    setSelectedTag,
    featuredPosts,
    allTags,
    filteredPosts
  } = useBlogData();

  // Initialize text highlighting for blog content
  useTextHighlight();

  // Scroll behaviour for the list (the single-post page handles its own):
  //  • returning from a post → restore the exact scroll saved on the card click
  //  • any other visit → jump to top. The app scrolls document.body and that
  //    offset survives navigation, so arriving from a scrolled home feed would
  //    otherwise open the blog mid-page.
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem('blogScrollPosition');
    if (saved) {
      window.scrollTo(0, parseInt(saved, 10));
      sessionStorage.removeItem('blogScrollPosition');
    } else {
      window.scrollTo(0, 0);
    }
  }, []);

  // When the tag filter changes while already on the page (e.g. tapping a
  // Popular Tag at the bottom), bring the freshly filtered feed into view.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
  }, [selectedTag]);

  // Post search lives in the docs header search (⌘K / top-right), which
  // indexes every blog post — the old in-page search pill is gone.
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

        <BlogFeaturedSection
          featuredPosts={featuredPosts}
          shouldShow={!selectedTag}
        />

        <BlogAllPostsSection
          filteredPosts={filteredPosts}
          searchQuery=""
          selectedTag={selectedTag}
          onClearFilter={() => setSelectedTag('')}
        />

        <BlogPopularTags
          allTags={allTags}
          setSelectedTag={setSelectedTag}
          shouldShow={!selectedTag}
        />
      </div>
    </>
  );
};

export default Blog;
