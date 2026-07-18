/**
 * Public renderer for a Builder app — /app/builder/preview/:id
 *
 * The raw Storage URL serves text/plain (Supabase anti-phishing), so this
 * lightweight, auth-free page fetches the app's HTML and renders it in a
 * sandboxed iframe (opaque origin — isolated from dehub.io). This is the
 * shareable link: anyone can open it and use the app.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { loadBuilderAppHtml, BUILDER_IFRAME_SANDBOX } from '@/lib/builder/render';

export default function BuilderPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setSrcDoc(null);
    setError(null);
    loadBuilderAppHtml(id)
      .then((html) => !cancelled && setSrcDoc(html))
      .catch(() => !cancelled && setError('This app is not available yet — it may still be building.'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="fixed inset-0 bg-[#000]">
      <SEOHead title="Built with DeHub Builder" description="An app built on DeHub Builder." />
      {srcDoc ? (
        <iframe
          title="App"
          srcDoc={srcDoc}
          sandbox={BUILDER_IFRAME_SANDBOX}
          className="w-full h-full border-0 bg-[#fff]"
        />
      ) : (
        <div className="w-full h-full grid place-items-center">
          {error ? (
            <p className="text-[#949499] text-sm px-6 text-center">{error}</p>
          ) : (
            <Loader2 className="w-6 h-6 animate-spin text-[#3f7aff]" />
          )}
        </div>
      )}
    </div>
  );
}
