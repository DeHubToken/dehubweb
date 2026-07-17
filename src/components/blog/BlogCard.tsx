import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import { BlogPost } from '@/types/blog';
import { formatDate } from '@/utils/blogUtils';

interface BlogCardProps {
  post: BlogPost;
  featured?: boolean;
}

const generateExcerpt = (content: string, fallback: string) => {
    if (!content) return fallback;
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (
            trimmedLine === '' ||
            trimmedLine.startsWith('#') ||
            trimmedLine.toLowerCase().startsWith('<h') || // Skip HTML headings
            trimmedLine.startsWith('- ') ||
            trimmedLine.startsWith('• ') ||
            /^\d+\./.test(trimmedLine) ||
            trimmedLine.startsWith('![')
        ) {
            continue;
        }
        
        // Strip HTML tags and markdown
        const plainText = trimmedLine
            .replace(/<[^>]+>/g, '') 
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
            .trim();

        if (plainText === '') {
            continue; // Skip if line becomes empty after stripping tags
        }
            
        const maxLength = 150;
        if (plainText.length > maxLength) {
            const truncated = plainText.substring(0, maxLength);
            const lastSpace = truncated.lastIndexOf(' ');
            if (lastSpace > 0) {
                return truncated.substring(0, lastSpace) + '...';
            }
            return truncated + '...';
        }
        return plainText;
    }
    return fallback;
};

const BlogCard: React.FC<BlogCardProps> = ({ post, featured = false }) => {
  const excerpt = generateExcerpt(post.content, post.excerpt);

  const displayDate =
    post.title === 'Dream Big: The $1M Home Crypto Raffle by DeHub'
      ? 'July 11, 2022'
      : formatDate(post.publishedAt);

  const isRafflePost = post.slug === 'dream-big-the-1m-home-crypto-raffle-by-dehub---a-dehub-milestone-from-q3-2022';
  const raffleBanner = '/lovable-uploads/729af303-1246-44ed-a598-005275581b6c.png';
  
  const isCoinbasePost = post.slug === 'dhb-tradable-on-coinbase-soon';
  const coinbaseBanner = '/lovable-uploads/c238e114-80c3-42ac-9e7a-d4617111466c.png';

  const isLivepeerPost = post.slug === 'scaling-new-heights-livepeer-integration-for-50k-concurrent-viewers---a-dehub-milestone-from-q1-2025';
  const livepeerBanner = '/lovable-uploads/6ad34788-b3fe-4094-bf1b-e930af8eaf62.png';

  const isAgencyPost = post.title === 'Leading the Way: DeHub founder\'s agency Becomes UK #1 with 1,000 Streamers';
  const agencyBanner = '/lovable-uploads/dca94998-40bc-49d9-bfea-370c55c587fd.png';

  const handleLinkClick = () => {
    // Save current scroll position when clicking on a blog card
    sessionStorage.setItem('blogScrollPosition', window.scrollY.toString());
  };

  const getBannerImage = () => {
    if (isRafflePost) return raffleBanner;
    if (isCoinbasePost) return coinbaseBanner;
    if (isLivepeerPost) return livepeerBanner;
    if (isAgencyPost) return agencyBanner;
    return post.bannerImage;
  };

  return (
    <article className={`group bg-card rounded-xl border border-border hover:border-primary/40 transition-all duration-200 hover:shadow-lg overflow-hidden ${featured ? 'lg:col-span-2' : ''}`}>
      <Link to={`/guides/${post.slug}`} className="block" onClick={handleLinkClick}>
        <div className="relative">
          <img
            src={getBannerImage()}
            alt={post.bannerImageAlt}
            className={`w-full object-cover transition-transform duration-200 group-hover:scale-105 ${featured ? 'h-48' : 'h-40'}`}
          />
          {post.featured && (
          <span className="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
            Featured
          </span>
          )}
        </div>

        <div className={`px-6 pt-6 ${featured ? 'lg:px-8 lg:pt-8' : ''}`}>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{displayDate}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{post.readingTime} min read</span>
            </div>
          </div>

          <h2 className={`font-bold text-foreground mb-3 group-hover:text-muted-foreground transition-colors duration-200 font-exo ${featured ? 'text-2xl lg:text-3xl' : 'text-xl'}`}>
            {post.title}
          </h2>

          <p className={`text-muted-foreground font-exo ${featured ? 'text-lg' : 'text-base'}`}>
            {excerpt}
          </p>
        </div>

        {/* Tag pills + Read More sit OUTSIDE the card's post-link so the tags can
            be their own filter links without nesting anchors. */}
      </Link>

      <div className={`px-6 pb-6 pt-4 ${featured ? 'lg:px-8 lg:pb-8' : ''}`}>
        <div className="flex flex-wrap gap-2 mb-4">
          {post.tags.slice(0, 3).map(tag => (
            <Link
              key={tag}
              to={`/docs/blog?tag=${encodeURIComponent(tag)}`}
              className="bg-muted text-foreground px-3 py-1 rounded-full text-sm font-medium hover:bg-muted/60 transition-colors duration-200 cursor-pointer"
            >
              {tag}
            </Link>
          ))}
          {post.tags.length > 3 && (
            <span className="text-muted-foreground text-sm self-center">
              +{post.tags.length - 3} more
            </span>
          )}
        </div>

        <Link
          to={`/guides/${post.slug}`}
          onClick={handleLinkClick}
          className="inline-flex items-center text-foreground hover:text-muted-foreground transition-colors duration-200 font-semibold"
        >
          Read More
          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-200" />
        </Link>
      </div>
    </article>
  );
};

export default BlogCard;
