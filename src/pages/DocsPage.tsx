const DOCS_URL = 'https://dehubdocs.lovable.app/docs';

const DocsPage = () => {
  return (
    <div className="fixed inset-0 z-50 bg-black">
      <iframe
        src={DOCS_URL}
        title="DeHub Documentation"
        className="w-full h-full border-0"
        allow="clipboard-write"
        loading="eager"
      />
    </div>
  );
};

export default DocsPage;
