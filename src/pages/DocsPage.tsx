import { useLocation } from 'react-router-dom';

const DOCS_BASE = 'https://dehubdocs.lovable.app/docs';

const DocsPage = () => {
  const location = useLocation();
  // Strip "/docs" prefix and pass the rest as sub-path
  const subPath = location.pathname.replace(/^\/docs/, '');
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
