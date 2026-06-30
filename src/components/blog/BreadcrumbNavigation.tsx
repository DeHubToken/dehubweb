import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { BlogPost } from '@/types/blog';

interface BreadcrumbNavigationProps {
  currentPost?: BlogPost;
}

export const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({ currentPost }) => {
  const breadcrumbs = [
    { label: 'Home', href: '/docs', icon: Home },
    { label: 'Blog', href: '/docs/blog' },
  ];

  if (currentPost) {
    breadcrumbs.push({ 
      label: currentPost.title.length > 50 
        ? currentPost.title.substring(0, 47) + '...' 
        : currentPost.title, 
      href: `/docs/blog/${currentPost.slug}` 
    });
  }

  // Structured data for breadcrumb navigation
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': breadcrumbs.map((breadcrumb, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': breadcrumb.label,
      'item': `${window.location.origin}${breadcrumb.href}`
    }))
  };

  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(structuredData)}
      </script>
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center space-x-2 text-sm text-royal-blue/70">
          {breadcrumbs.map((breadcrumb, index) => (
            <li key={breadcrumb.href} className="flex items-center">
              {index > 0 && <ChevronRight className="w-4 h-4 mx-2 text-royal-blue/40" />}
              {index === breadcrumbs.length - 1 ? (
                <span className="text-royal-blue font-medium" aria-current="page">
                  {breadcrumb.label}
                </span>
              ) : (
                <Link 
                  to={breadcrumb.href}
                  className="hover:text-royal-blue transition-colors flex items-center"
                >
                  {breadcrumb.icon && <breadcrumb.icon className="w-4 h-4 mr-1" />}
                  {breadcrumb.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
};