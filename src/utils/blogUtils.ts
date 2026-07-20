/**
 * blogUtils.ts — runtime blog METADATA utilities.
 * ===============================================
 * Article bodies are intentionally NOT bundled: every post here comes from
 * src/data/blog-metadata.generated.ts (emitted by
 * scripts/generate-blog-manifest.mjs at buildStart) with `content: ''`.
 * The single-post page fetches the raw markdown on demand from
 * /blog-content/<slug>.json (`md` field) — see src/pages/docs/BlogPost.tsx.
 *
 * The full-content source of truth lives in src/data/blogSource.ts
 * (generator-only — never import it from runtime code).
 */
import { BlogPost } from '@/types/blog';
import {
  blogPostsMetadata,
  newPostsMetadata,
  latestPostMetadata,
  excludedTitles,
} from '@/data/blog-metadata.generated';

export { excludedTitles };

// Published posts (overrides applied, sorted newest-first by the generator).
export const getPublishedPosts = (): BlogPost[] => blogPostsMetadata;

export const getFeaturedPosts = (): BlogPost[] =>
  blogPostsMetadata.filter(post => post.featured);

export const getPostBySlug = (slug: string): BlogPost | undefined =>
  blogPostsMetadata.find(post => post.slug === slug);

export const getNewPostBySlug = (slug: string): BlogPost | undefined =>
  newPostsMetadata.find(post => post.slug === slug);

// The exact corpus the /docs/blog list renders: published posts + newPosts,
// deduped by title, with the same display-time title/date fix-ups. Shared by
// useBlogData (the list) and the docs SearchContext (the ⌘K index) so search
// results always match what the blog actually shows. Metadata-only logic —
// kept verbatim from the pre-split blogUtils (now blogSource.ts) but running
// on the content-free generated arrays.
export const getAllBlogListPosts = (): BlogPost[] => {
  const originalPosts = blogPostsMetadata.filter(post => !excludedTitles.includes(post.title));
  const combinedPosts = [...originalPosts, ...newPostsMetadata];
  const uniquePosts = Array.from(new Map(combinedPosts.map(post => [post.title, post])).values());

  const updatedPosts = uniquePosts.map(post => {
    if (post.title === 'Entrepreneurial Spirit: Co-Founders Launch TikTok Agency') {
      return { ...post, publishedAt: '2024-01-09T12:00:00.000Z' };
    }
    if (post.title === 'Back in Action: DeHub V2 Trading Resumes on Gate.io') {
      return { ...post, publishedAt: '2023-02-16T12:00:00.000Z' };
    }
    if (post.title === 'Faster and Sleeker: UI Overhaul and 200% Backend Speed Boost') {
      return {
        ...post,
        title: 'Faster and Sleeker: major app upgrade reveals UI Overhaul and 200% Backend Speed Boost',
        publishedAt: '2024-10-28T12:00:00.000Z',
        bannerImage: '/lovable-uploads/e9632af0-07c2-4ca8-9b82-fc255191358b.png',
        bannerImageAlt: 'Screenshot of the new DeHub application UI'
      };
    }
    if (post.title === 'Revolutionizing Access: On-Chain Tradable Subscriptions Launch') {
      return { ...post, publishedAt: '2024-10-30T12:00:00.000Z' };
    }
    if (post.title === 'Feature Spotlight: Ad Tech') {
      return { ...post, featured: false };
    }
    if (post.title.includes('Q1') && post.title.includes('Overview')) {
      return { ...post, featured: false };
    }
    if (post.title === 'MVP App Released & Listed on Google Play Store') {
      return { ...post, featured: false };
    }
    if (post.slug === 'scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025') {
      return {
        ...post,
        title: 'Scaling New Heights: Livepeer Integration for initially 50k+ Concurrent Viewers With Unlimited Viewer abilities as we scale up.'
      };
    }
    if (post.slug === 'dhb-tradable-on-coinbase-soon') {
      return { ...post, title: 'Confirmed! $DHB To Be Available Directly On Coinbase CEX' };
    }
    return post;
  });

  return updatedPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
};

// Latest post across both corpora — used by the docs home hero.
export const getLatestPost = (): BlogPost | undefined => latestPostMetadata;

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};
