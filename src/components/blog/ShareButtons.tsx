
import React from 'react';
import { Twitter, Facebook, Linkedin, Share2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ShareButtonsProps {
  shareUrl: string;
  postTitle: string;
  imageUrl?: string;
  variant?: 'icons' | 'text';
}

export const ShareButtons: React.FC<ShareButtonsProps> = ({ shareUrl, postTitle, imageUrl, variant = 'icons' }) => {
  const { toast } = useToast();

  const handleShare = (platform: string) => {
    let url = '';
    const title = encodeURIComponent(postTitle);
    const shareUrlEncoded = encodeURIComponent(shareUrl);
    
    switch (platform) {
      case 'twitter':
        // Twitter relies on Open Graph tags, but we can include the image URL as a fallback
        url = `https://twitter.com/intent/tweet?text=${title}&url=${shareUrlEncoded}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${shareUrlEncoded}`;
        break;
      case 'linkedin':
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrlEncoded}`;
        break;
      case 'telegram':
        url = `https://t.me/share/url?url=${shareUrlEncoded}&text=${title}`;
        break;
      case 'copy':
        navigator.clipboard.writeText(shareUrl);
        toast({
          title: "Link Copied",
          description: "Blog post link copied to clipboard"
        });
        return;
    }
    
    if (url) {
      window.open(url, '_blank', 'width=600,height=400');
    }
  };

  if (variant === 'text') {
      return (
        <div className="flex justify-center gap-4">
            <button
              onClick={() => handleShare('twitter')}
              className="px-6 py-3 border border-sky-blue text-royal-blue rounded-lg hover:bg-sky-blue/10 transition-all duration-200 font-exo"
            >
              Share on Twitter
            </button>
            <button
              onClick={() => handleShare('linkedin')}
              className="px-6 py-3 border border-sky-blue text-royal-blue rounded-lg hover:bg-sky-blue/10 transition-all duration-200 font-exo"
            >
              Share on LinkedIn
            </button>
            <button
              onClick={() => handleShare('telegram')}
              className="px-6 py-3 border border-sky-blue text-royal-blue rounded-lg hover:bg-sky-blue/10 transition-all duration-200 font-exo"
            >
              Share on Telegram
            </button>
        </div>
      )
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-royal-blue/70 font-semibold font-exo">Share:</span>
      <button
        onClick={() => handleShare('twitter')}
        className="p-2 rounded-lg bg-sky-blue/10 text-royal-blue hover:bg-sky-blue/20 transition-colors duration-200"
        aria-label="Share on Twitter"
      >
        <Twitter className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleShare('facebook')}
        className="p-2 rounded-lg bg-sky-blue/10 text-royal-blue hover:bg-sky-blue/20 transition-colors duration-200"
        aria-label="Share on Facebook"
      >
        <Facebook className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleShare('linkedin')}
        className="p-2 rounded-lg bg-sky-blue/10 text-royal-blue hover:bg-sky-blue/20 transition-colors duration-200"
        aria-label="Share on LinkedIn"
      >
        <Linkedin className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleShare('telegram')}
        className="p-2 rounded-lg bg-sky-blue/10 text-royal-blue hover:bg-sky-blue/20 transition-colors duration-200"
        aria-label="Share on Telegram"
      >
        <Send className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleShare('copy')}
        className="p-2 rounded-lg bg-sky-blue/10 text-royal-blue hover:bg-sky-blue/20 transition-colors duration-200"
        aria-label="Copy link"
      >
        <Share2 className="w-4 h-4" />
      </button>
    </div>
  );
};
