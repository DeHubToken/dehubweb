
import React, { useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { BlogSEOHelper } from '@/components/blog/BlogSEOHelper';
import { BlogHeader } from '@/components/blog/sections/BlogHeader';
import { BlogFeaturedSection } from '@/components/blog/sections/BlogFeaturedSection';
import { BlogAllPostsSection } from '@/components/blog/sections/BlogAllPostsSection';
import { BlogPopularTags } from '@/components/blog/sections/BlogPopularTags';
import { useBlogData } from '@/hooks/useBlogData';
import { useTextHighlight } from '@/hooks/useTextHighlight';
import { scrollDocumentTo } from '@/lib/document-scroll';

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
      scrollDocumentTo(parseInt(saved, 10));
      sessionStorage.removeItem('blogScrollPosition');
    } else {
      scrollDocumentTo(0);
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
    scrollDocumentTo(0);
  }, [selectedTag]);

  // The Featured row shows the top two featured posts (only when no tag is
  // picked), so leave those out of the list below to avoid showing them twice.
  const shownFeatured = useMemo(
    () => (selectedTag ? [] : featuredPosts.slice(0, 2)),
    [featuredPosts, selectedTag]
  );
  const listPosts = useMemo(() => {
    if (!shownFeatured.length) return filteredPosts;
    const featuredSlugs = new Set(shownFeatured.map(post => post.slug));
    return filteredPosts.filter(post => !featuredSlugs.has(post.slug));
  }, [filteredPosts, shownFeatured]);

  // Post search lives in the docs header search (⌘K / top-right), which
  // indexes every blog post — the old in-page search pill is gone.
  return (
    <>
      <BlogSEOHelper />
      <div className="space-y-12">
        <BlogHeader />

        <BlogFeaturedSection
          featuredPosts={shownFeatured}
          shouldShow={!selectedTag}
        />

        <BlogAllPostsSection
          filteredPosts={listPosts}
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
