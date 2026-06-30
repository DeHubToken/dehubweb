
import React from 'react';
import { ShareButtons } from './ShareButtons';

interface BlogPostFooterProps {
    shareUrl: string;
    postTitle: string;
    imageUrl?: string;
}

export const BlogPostFooter: React.FC<BlogPostFooterProps> = ({ shareUrl, postTitle, imageUrl }) => {
    return (
    <footer className="border-t border-gray-200 pt-8">
            <div className="text-center">
                <p className="text-gray-600 mb-4 font-exo">
                    Enjoyed this article? Share it with your network!
                </p>
                <ShareButtons shareUrl={shareUrl} postTitle={postTitle} imageUrl={imageUrl} variant="text" />
            </div>
        </footer>
    )
}
