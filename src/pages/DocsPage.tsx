import { useLocation } from 'react-router-dom';

const DOCS_BASE = 'https://dehubdocs.lovable.app/docs';

const DocsPage = () => {
  const location = useLocation();
  // Handle both /docs/* and /blog routes
  let subPath = location.pathname.replace(/^\/docs/, '');
  // If accessed via /blog, map to /docs/blog
  if (location.pathname === '/blog') {
    subPath = '/blog';
  }
  const iframeSrc = `${DOCS_BASE}${subPath}${location.hash}`;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <iframe
        src={iframeSrc}
        title="DeHub Documentation"
        className="w-full h-full border-0"
        allow="clipboard-write"
        loading="eager"
      />
    </div>
  );
};

export default DocsPage;
