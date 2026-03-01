import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';

const DOCS_BASE = 'https://dehubdocs.lovable.app/docs';

const DocsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Strip "/docs" prefix and pass the rest as sub-path
  const subPath = location.pathname.replace(/^\/docs/, '');
  const iframeSrc = `${DOCS_BASE}${subPath}${location.hash}`;

  // Listen for route change messages from the docs iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Accept from dehubdocs production and preview origins
      if (!event.origin.includes('dehubdocs')) return;
      if (event.data?.type === 'docs-route-change' && typeof event.data.path === 'string') {
        // Convert /docs/overview -> /docs/overview in parent
        const docsPath = event.data.path; // e.g. "/docs/overview"
        const parentPath = docsPath.startsWith('/docs') ? docsPath : `/docs${docsPath}`;
        // Only update if different from current
        if (parentPath !== location.pathname) {
          navigate(parentPath, { replace: true });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [location.pathname, navigate]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <iframe
        ref={iframeRef}
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
