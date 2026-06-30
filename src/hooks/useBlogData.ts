
import { useState, useMemo, useLayoutEffect } from 'react';
import { getPublishedPosts, getFeaturedPosts } from '@/utils/blogUtils';
import { BlogPost, BlogTag } from '@/types/blog';
import { newPosts, excludedTitles } from '@/data/newPosts';

export const useBlogData = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  
  useLayoutEffect(() => {
    // Restore scroll position synchronously before paint
    const scrollPosition = sessionStorage.getItem('blogScrollPosition');
    if (scrollPosition) {
      const scrollValue = parseInt(scrollPosition, 10);
      window.scrollTo(0, scrollValue);
      // Clean up after successful restoration
      sessionStorage.removeItem('blogScrollPosition');
    }
  }, []);

  const originalPosts = useMemo(() => {
    const publishedPosts = getPublishedPosts();
    return publishedPosts.filter(post => !excludedTitles.includes(post.title));
  }, []);

  const allPosts = useMemo(() => {
    const combinedPosts = [...originalPosts, ...newPosts];
    // Deduplicate by title to remove the duplicate post
    const uniquePosts = Array.from(new Map(combinedPosts.map(post => [post.title, post])).values());
    
    const updatedPosts = uniquePosts.map(post => {
      if (post.title === 'Entrepreneurial Spirit: Co-Founders Launch TikTok Agency') {
        return {
          ...post,
          publishedAt: '2024-01-09T12:00:00.000Z'
        };
      }
      if (post.title === 'Back in Action: DeHub V2 Trading Resumes on Gate.io') {
        return {
          ...post,
          publishedAt: '2023-02-16T12:00:00.000Z'
        };
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
        return {
          ...post,
          publishedAt: '2024-10-30T12:00:00.000Z'
        };
      }
      if (post.title === 'Feature Spotlight: Ad Tech') {
        return {
          ...post,
          featured: false
        };
      }
      if (post.title.includes('Q1') && post.title.includes('Overview')) {
        return {
          ...post,
          featured: false
        };
      }
      if (post.title === 'MVP App Released & Listed on Google Play Store') {
        return {
          ...post,
          featured: false
        };
      }
      if (post.slug === 'scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025') {
        return {
          ...post,
          title: 'Scaling New Heights: Livepeer Integration for initially 50k+ Concurrent Viewers With Unlimited Viewer abilities as we scale up.'
        };
      }
      if (post.slug === 'dhb-tradable-on-coinbase-soon') {
        return {
          ...post,
          title: 'Confirmed! $DHB To Be Available Directly On Coinbase CEX'
        };
      }
      return post;
    });
    
    return updatedPosts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, [originalPosts]);

  const featuredPosts = useMemo(() => {
    const oldFeatured = getFeaturedPosts().filter(p => !excludedTitles.includes(p.title));
    const newFeatured = newPosts.filter(p => p.featured);
    const combined = [...newFeatured, ...oldFeatured];
    // Deduplicate by title to remove the duplicate post
    const uniquePosts = Array.from(new Map(combined.map(post => [post.title, post])).values());
    
    const updatedPosts = uniquePosts.map(post => {
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
        return {
          ...post,
          publishedAt: '2024-10-30T12:00:00.000Z'
        };
      }
      if (post.slug === 'scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025') {
        return {
          ...post,
          title: 'Scaling New Heights: Livepeer Integration for initially 50k+ Concurrent Viewers With Unlimited Viewer abilities as we scale up.'
        };
      }
      if (post.slug === 'dhb-tradable-on-coinbase-soon') {
        return {
          ...post,
          title: 'Confirmed! $DHB To Be Available Directly On Coinbase CEX'
        };
      }
      return post;
    });
    
    return updatedPosts
      .filter(post => 
        post.title !== 'Feature Spotlight: Ad Tech' && 
        !(post.title.includes('Q1') && post.title.includes('Overview')) && 
        post.title !== 'MVP App Released & Listed on Google Play Store'
      )
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  }, []);

  const allTags = useMemo((): BlogTag[] => {
    const tagCounts: { [key: string]: number } = {};
    allPosts.forEach(post => {
      post.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });
    return Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [allPosts]);

  const filteredPosts = useMemo(() => {
    let posts = allPosts;
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      posts = posts.filter(post => 
        post.title.toLowerCase().includes(lowercasedQuery) || 
        post.excerpt.toLowerCase().includes(lowercasedQuery)
      );
    }
    if (selectedTag) {
      posts = posts.filter(post => 
        post.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
      );
    }
    return posts;
  }, [searchQuery, selectedTag, allPosts]);

  return {
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    allPosts,
    featuredPosts,
    allTags,
    filteredPosts
  };
};
