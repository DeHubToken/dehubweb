
import React from 'react';
import { BlogBanner } from '@/components/blog/BlogBanner';
import BlogContent from '@/components/blog/BlogContent';

interface BlogPostBodyProps {
    bannerImage: string;
    bannerImageAlt: string;
    content: string;
}

export const BlogPostBody: React.FC<BlogPostBodyProps> = ({ bannerImage, bannerImageAlt, content }) => {
    
    return (
        <>
            <BlogBanner
                  src={bannerImage}
                  width={1100}
                  widths={[480, 736, 1100, 1440]}
                  sizes="(min-width: 896px) 896px, 100vw"
                  alt={bannerImageAlt}
                  loading="eager"
                  fetchPriority="high"
                  className="mb-8 rounded-2xl"
                />
            <div className="mb-12">
                <BlogContent content={content} />
            </div>
        </>
    )
}
