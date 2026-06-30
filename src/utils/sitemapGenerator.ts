import { getNewPostBySlug } from '@/data/newPosts';
import { blogPosts } from '@/data/blogPosts';
import { getPostBySlug } from './blogUtils';

export const generateSitemap = (): string => {
  const baseUrl = 'https://dehub.io';
  const currentDate = new Date().toISOString();
  
  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/docs', priority: '0.9', changefreq: 'weekly' },
    { url: '/docs/blog', priority: '0.9', changefreq: 'daily' },
    { url: '/docs/overview', priority: '0.8', changefreq: 'weekly' },
    { url: '/docs/quick-start', priority: '0.8', changefreq: 'weekly' },
    { url: '/docs/installation', priority: '0.7', changefreq: 'weekly' },
    { url: '/docs/token-economics', priority: '0.7', changefreq: 'monthly' },
    { url: '/docs/advertising', priority: '0.7', changefreq: 'weekly' },
    { url: '/docs/team', priority: '0.6', changefreq: 'monthly' },
    { url: '/docs/roadmap', priority: '0.6', changefreq: 'monthly' },
    { url: '/docs/faq', priority: '0.6', changefreq: 'monthly' },
    { url: '/docs/contact', priority: '0.5', changefreq: 'monthly' }
  ];

  // Get all blog posts from both sources
  const allPosts = [...blogPosts];
  
  // Add new posts
  const newPostSlugs = [
    'leading-the-way-dehub-founders-official-tiktok-partner-agency-becomes-uk-1-with-1000-streamers',
    'strategic-shift-discontinuing-ethereum-mainnet-support-for-dhb',
    'off-ramp-service-revealed-dehub-card-coming-soon',
    'dehub-flagship-game-launch-partner-airdrop',
    'interactive-streaming-on-chain-live-streams-with-animated-tip',
    'award-winning-innovation-dehub-wins-corporate-livewire-tech-innovator-award',
    'tokenised-uploads-seamless-content-sharing-with-smart-contract-integration',
    'dubai-crypto-event-dehub-co-founder-speaks-at-mena-summit',
    '2022-wrap-up'
  ];
  
  newPostSlugs.forEach(slug => {
    const newPost = getNewPostBySlug(slug);
    if (newPost) {
      allPosts.push(newPost);
    }
  });
  
  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">`;

  // Add static pages
  staticPages.forEach(page => {
    sitemap += `
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  });

  // Add blog posts
  allPosts.forEach(post => {
    const postDate = new Date(post.publishedAt).toISOString();
    const postAge = Date.now() - new Date(post.publishedAt).getTime();
    const isRecent = postAge < 30 * 24 * 60 * 60 * 1000; // 30 days
    const priority = isRecent ? '0.8' : '0.6';
    const changefreq = isRecent ? 'weekly' : 'monthly';

    sitemap += `
  <url>
    <loc>${baseUrl}/docs/blog/${post.slug}</loc>
    <lastmod>${postDate}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>`;
    
    if (post.bannerImage) {
      const imageUrl = post.bannerImage.startsWith('http') 
        ? post.bannerImage 
        : `${baseUrl}${post.bannerImage}`;
      
      sitemap += `
    <image:image>
      <image:loc>${imageUrl}</image:loc>
      <image:title>${post.bannerImageAlt || post.title}</image:title>
    </image:image>`;
    }
    
    sitemap += `
  </url>`;
  });

  sitemap += `
</urlset>`;

  return sitemap;
};

export const downloadSitemap = () => {
  const sitemapContent = generateSitemap();
  const blob = new Blob([sitemapContent], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sitemap.xml';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};