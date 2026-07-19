
import React, { useRef, useEffect, useLayoutEffect } from 'react';
import SEO from '@/components/SEO';
import { BlogSEOHelper } from '@/components/blog/BlogSEOHelper';
import { BlogHeader } from '@/components/blog/sections/BlogHeader';
import { BlogSearchAndFilter } from '@/components/blog/sections/BlogSearchAndFilter';
import { BlogFeaturedSection } from '@/components/blog/sections/BlogFeaturedSection';
import { BlogAllPostsSection } from '@/components/blog/sections/BlogAllPostsSection';
import { BlogPopularTags } from '@/components/blog/sections/BlogPopularTags';
import { useBlogData } from '@/hooks/useBlogData';
import { useTextHighlight } from '@/hooks/useTextHighlight';
import { useFeedSwallowClip } from '@/hooks/use-feed-swallow-clip';

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

  // Swallow the post feed at the sticky search pill's top edge — on the glass
  // themes content bleeds through the frosted pill as it scrolls, and on every
  // theme it is cut at the pill's rounded top and never re-emerges above it
  // (see the /swallowingpill skill + use-feed-swallow-clip). allThemes because
  // this pill floats 8px below the docs header: on the paper themes an opaque
  // pill alone would let the feed slide past it into that gap and ghost
  // through the semi-transparent docs header above.
  const feedRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(feedRef, '[data-feed-nav-outer] [data-blog-search-nav]', [], { allThemes: true });

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

        {/* Sticky glass search pill. Pins 8px below the 64px docs header
            (top-16 = 64px + 0.5rem) so a tad of breathing space stays between
            the pill and the header as the feed is swallowed at its top edge,
            rather than butting flush against it. The swallow-clip above runs
            on ALL themes here, so the feed is hard-cut at the pill's top
            edge everywhere; the wrapper also carries the docs frosted lag
            guard (index.css [data-docs-open] ::before) that dissolves the
            1-frame compositor flash a hard fling can push into this gap.
            The wrapper itself stays transparent. */}
        <div data-feed-nav-outer className="sticky top-[4.5rem] z-30">
          <BlogSearchAndFilter
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedTag={selectedTag}
            setSelectedTag={setSelectedTag}
            allTags={allTags}
          />
        </div>

        {/* The scroll feed that gets swallowed at the pill's top edge. */}
        <div ref={feedRef} className="space-y-12">
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
      </div>
    </>
  );
};

export default Blog;
