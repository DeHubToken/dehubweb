
import React, { useLayoutEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getPostBySlug, formatDate } from '@/utils/blogUtils';
import SEO from '@/components/SEO';
import { BlogSEOHelper } from '@/components/blog/BlogSEOHelper';
import { BlogPostHeader } from '@/components/blog/BlogPostHeader';
import { BlogPostBody } from '@/components/blog/BlogPostBody';
import { BlogPostFooter } from '@/components/blog/BlogPostFooter';
import { RelatedPosts } from '@/components/blog/RelatedPosts';
import { BreadcrumbNavigation } from '@/components/blog/BreadcrumbNavigation';
import { raffleContent } from '@/data/raffleContent';
import { getNewPostBySlug, excludedTitles } from '@/data/newPosts';
import { useBlogData } from '@/hooks/useBlogData';
import { useLanguage } from '@/contexts/LanguageContext';
import { getBlogShareImageUrl } from '@/lib/blogShareImage';

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { allPosts } = useBlogData();
  const { t } = useLanguage();
  
  let post = slug ? getNewPostBySlug(slug) || getPostBySlug(slug) : null;

  if (post && excludedTitles.includes(post.title)) {
    post = null;
  }

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!post) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold text-royal-blue mb-4 font-exo">{t('blog.postNotFound')}</h1>
        <p className="text-royal-blue/70 mb-6 font-exo">{t('blog.postNotFoundDesc')}</p>
        <Link 
          to="/docs/blog" 
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-royal-blue to-middle-blue text-plain-white font-semibold rounded-lg hover:from-royal-blue/90 hover:to-middle-blue/90 transition-all duration-200 font-exo"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('blog.backToBlog')}
        </Link>
      </div>
    );
  }

  const isRafflePost = post.slug === 'dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022';
  
  const raffleBanner = '/lovable-uploads/729af303-1246-44ed-a598-005275581b6c.png';
  const bannerImage = isRafflePost ? raffleBanner : post.bannerImage;
  const content = isRafflePost ? raffleContent : post.content;

  // Canonical URL for a blog post is now `/guides/<slug>`. The legacy
  // `/docs/blog/<slug>` route still resolves the same content for
  // backward-compat, but share links + og:url + canonical all point at
  // the new top-level URL so SEO consolidates there.
  const shareUrl = `https://dehub.io/guides/${post.slug}`;
  const fullImageUrl = bannerImage ? (bannerImage.startsWith('http') ? bannerImage : `${window.location.origin}${bannerImage}`) : null;
  const shareImage = getBlogShareImageUrl({
    slug: post.slug,
    title: post.title,
    author: post.author.name,
    date: formatDate(post.publishedAt),
    banner: fullImageUrl,
  });

  const displayDate =
    post.title === 'Dream Big: The $1M Home Crypto Raffle by DeHub'
      ? 'July 11, 2022'
      : formatDate(post.publishedAt);

  return (
    <>
      <SEO
        title={post.seoTitle || post.title}
        description={post.seoDescription || post.excerpt}
        image={shareImage}
        url={`/guides/${post.slug}`}
        type="article"
        publishedTime={post.publishedAt}
        authorName={post.author.name}
        tags={post.tags}
      />
      <BlogSEOHelper />
      <div className="max-w-4xl mx-auto">
        <BreadcrumbNavigation currentPost={post} />
        {/* data-docs-reading-panel: on the canvas themes this whole article
            becomes ONE liquid-glass reading sheet (see docs-glass.css) — the raw
            prose body has no card wrapper, so this keeps it legible over the
            animated background while staying a single backdrop-filter layer. */}
        <article data-docs-reading-panel>
          <BlogPostHeader 
            post={post} 
            displayDate={displayDate} 
            shareUrl={shareUrl} 
            imageUrl={fullImageUrl || undefined}
          />
          <BlogPostBody bannerImage={bannerImage} bannerImageAlt={post.bannerImageAlt} content={content} />
          <BlogPostFooter 
            shareUrl={shareUrl} 
            postTitle={post.title} 
            imageUrl={fullImageUrl || undefined}
          />
          <RelatedPosts currentPost={post} allPosts={allPosts} />
        </article>
      </div>
    </>
  );
};

export default BlogPost;
