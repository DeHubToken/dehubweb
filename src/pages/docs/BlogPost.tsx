
import React, { useLayoutEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getPostBySlug, getNewPostBySlug, excludedTitles, formatDate } from '@/utils/blogUtils';
import { SEOHead } from '@/components/SEOHead';
import { BlogSEOHelper } from '@/components/blog/BlogSEOHelper';
import { BlogPostHeader } from '@/components/blog/BlogPostHeader';
import { BlogPostBody } from '@/components/blog/BlogPostBody';
import { BlogPostFooter } from '@/components/blog/BlogPostFooter';
import { RelatedPosts } from '@/components/blog/RelatedPosts';
import { BreadcrumbNavigation } from '@/components/blog/BreadcrumbNavigation';
import { OptimizedImage } from '@/components/OptimizedImage';
import { useBlogData } from '@/hooks/useBlogData';
import { useLanguage } from '@/contexts/LanguageContext';
import { getBlogShareImageUrl } from '@/lib/blogShareImage';
import { scrollDocumentTo } from '@/lib/document-scroll';

// Subtle loading placeholder while the article markdown streams in — the docs
// light background is textured, so translucent bg-muted bars (no flat paint).
const BodyShimmer = () => (
  <div className="mb-12 space-y-8" aria-hidden="true">
    {[0, 1, 2].map(block => (
      <div key={block} className="space-y-3">
        <div className="h-4 w-11/12 rounded-full bg-muted/50 animate-pulse" />
        <div className="h-4 w-full rounded-full bg-muted/50 animate-pulse" />
        <div className="h-4 w-4/5 rounded-full bg-muted/50 animate-pulse" />
      </div>
    ))}
  </div>
);

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
    scrollDocumentTo(0);
  }, [slug]);


  // Article bodies are no longer bundled — post metadata renders instantly
  // from src/data/blog-metadata.generated.ts while the RAW MARKDOWN (`md`
  // field — BlogContent parses markdown + [TEAM_SECTION_*] markers, never
  // feed it the SEO `html` field) is fetched from the same per-slug JSON the
  // SEO pipelines consume.
  const {
    data: fetchedBody,
    isError: bodyFailed,
    refetch: refetchBody,
  } = useQuery({
    queryKey: ['blog-body', slug],
    enabled: !!post,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/blog-content/${encodeURIComponent(post!.slug)}.json`);
      if (!res.ok) throw new Error(`blog body fetch failed: ${res.status}`);
      const json = await res.json();
      if (typeof json?.md !== 'string') throw new Error('blog body payload missing md');
      return json.md as string;
    },
  });

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

  const bannerImage = post.bannerImage;
  const content = fetchedBody;

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
      {/* SEOHead writes the head imperatively, so the post's real seoTitle/
          seoDescription overwrite DocsSEO's slug-derived fallback once the post
          loads. The old <SEO> here rode react-helmet-async, which renders
          nothing in this app — every post kept the generic docs title. */}
      <SEOHead
        title={post.seoTitle || post.title}
        description={post.seoDescription || post.excerpt}
        image={shareImage}
        url={shareUrl}
        type="article"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.seoTitle || post.title,
          description: post.seoDescription || post.excerpt,
          image: shareImage,
          datePublished: post.publishedAt,
          author: { '@type': 'Person', name: post.author.name },
          publisher: { '@type': 'Organization', name: 'DeHub', url: 'https://dehub.io' },
          mainEntityOfPage: { '@type': 'WebPage', '@id': shareUrl },
        }}
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
          {content !== undefined ? (
            <BlogPostBody bannerImage={bannerImage} bannerImageAlt={post.bannerImageAlt} content={content} />
          ) : (
            <>
              {/* Banner still renders instantly from bundled metadata */}
              <div className="mb-8 rounded-2xl overflow-hidden w-full">
                <OptimizedImage
                  src={bannerImage}
                  alt={post.bannerImageAlt}
                  className="w-full h-auto object-cover"
                  loading="eager"
                />
              </div>
              {bodyFailed ? (
                <div className="mb-12 rounded-2xl border border-border bg-muted/30 px-6 py-10 text-center">
                  <p className="mb-4 text-royal-blue/70 font-exo">Couldn't load this article.</p>
                  <button
                    type="button"
                    onClick={() => refetchBody()}
                    className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-royal-blue to-middle-blue text-plain-white font-semibold rounded-lg hover:from-royal-blue/90 hover:to-middle-blue/90 transition-all duration-200 font-exo"
                  >
                    <RotateCw className="w-4 h-4 mr-2" />
                    Retry
                  </button>
                </div>
              ) : (
                <BodyShimmer />
              )}
            </>
          )}
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
