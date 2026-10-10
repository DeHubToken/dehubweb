import { useTranslation as _useCopy } from 'react-i18next';

import React from 'react';
import { ShareButtons } from './ShareButtons';

interface BlogPostFooterProps {
    shareUrl: string;
    postTitle: string;
    imageUrl?: string;
}

export const BlogPostFooter: React.FC<BlogPostFooterProps> = ({ shareUrl, postTitle, imageUrl }) => {
  const { t: _copy } = _useCopy();
    return (
    <footer className="border-t border-gray-200 pt-8">
            <div className="text-center">
                <p className="text-gray-600 mb-4 font-exo">{_copy("copy.52cc67d87de8", { defaultValue: "Enjoyed this article? Share it with your network!" })}</p>
                <ShareButtons shareUrl={shareUrl} postTitle={postTitle} imageUrl={imageUrl} variant="text" />
            </div>
        </footer>
    )
}
