
import React from 'react';
import { useParams } from 'react-router-dom';
import { OptimizedImage } from '@/components/OptimizedImage';
import { mediaImage, mediaImageSrcSet } from '@/lib/media-url';
import BlogContent from '@/components/blog/BlogContent';

interface BlogPostBodyProps {
    bannerImage: string;
    bannerImageAlt: string;
    content: string;
}

export const BlogPostBody: React.FC<BlogPostBodyProps> = ({ bannerImage, bannerImageAlt, content }) => {
    const { slug } = useParams<{ slug: string }>();
    const isFullImagePost = slug === 'bnb-pool-update-recovery-876-bnb-stuck-2022-pool' || slug === '1-million-dollar-raise-completed' || slug === '1-year-review-a-quick-look-back';
    
    return (
        <>
            <div className="mb-8 rounded-2xl overflow-hidden w-full">
                <OptimizedImage 
                  src={mediaImage(bannerImage, { width: 1100 })}
                  srcSet={mediaImageSrcSet(bannerImage, [480, 736, 1100, 1440])}
                  sizes="(min-width: 896px) 896px, 100vw"
                  alt={bannerImageAlt}
                  className={`w-full h-auto ${isFullImagePost ? 'object-cover' : 'object-cover'}`}
                  loading="eager"
                />
            </div>
            <div className="mb-12">
                <BlogContent content={content} />
            </div>
        </>
    )
}
