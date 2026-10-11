import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Public renderer for a Builder app — /builder/preview/:id
 *
 * The raw Storage URL serves text/plain (Supabase anti-phishing), so this
 * lightweight, auth-free page fetches the app's HTML and renders it in a
 * sandboxed iframe (opaque origin — isolated from dehub.io). This is the
 * shareable link: anyone can open it and use the app.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { loadBuilderAppHtml, BUILDER_IFRAME_SANDBOX } from '@/lib/builder/render';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';

export default function BuilderPreviewPage() {
  const { t: _copy } = _useCopy();
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
    <div data-theme-page-surface={srcDoc ? undefined : true} className="fixed inset-0 z-[1] bg-background text-foreground">
      <SEOHead title={_copy("copy.a06602146802", { defaultValue: "Built with DeHub Builder" })} description={_copy("copy.6be19fadc3c7", { defaultValue: "An app built on DeHub Builder." })} noindex />
      {srcDoc ? (
        <iframe
          title={_copy("copy.0d04bfeb7d64", { defaultValue: "App" })}
          srcDoc={srcDoc}
          sandbox={BUILDER_IFRAME_SANDBOX}
          className="w-full h-full border-0 bg-[#fff]"
        />
      ) : (
        <div className="w-full h-full grid place-items-center">
          {error ? (
            <p className="text-[#949499] text-sm px-6 text-center">{error}</p>
          ) : (
            <DeHubPageLoader minHeight="0" />
          )}
        </div>
      )}
    </div>
  );
}
