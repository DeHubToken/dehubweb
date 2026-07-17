
export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  bannerImage: string;
  bannerImageAlt: string;
  author: {
    name: string;
    avatar?: string;
  };
  publishedAt: string; // ISO date string for manual control
  updatedAt?: string;
  tags: string[];
  readingTime: number; // in minutes
  featured: boolean;
  status?: 'draft' | 'published';
  seoTitle?: string;
  seoDescription?: string;
}

export interface BlogTag {
  name: string;
  count: number;
}
