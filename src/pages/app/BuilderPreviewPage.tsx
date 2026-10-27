import { useTranslation as _useCopy } from 'react-i18next';
/**
 * Public renderer for a Builder app — /builder/preview/:id
 *
 * Each app lives on its own origin, https://<slug>.dehub.app, so the page
 * frames that address directly: it is a different site from dehub.io, so the
 * app keeps real localStorage without being able to touch dehub.io's. Private
 * apps open only for their owner, through a signed preview address.
 *
 * Until the app host answers (DNS still moving), public apps fall back to the
 * old renderer: fetch the HTML from the Storage mirror into an opaque-origin
 * srcdoc iframe.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEOHead } from '@/components/SEOHead';
import { loadBuilderAppHtml, BUILDER_IFRAME_SANDBOX } from '@/lib/builder/render';
import {
  appHostReachable,
  builderApi,
  resolvePublicApp,
  type BuilderListing,
  type BuilderProject,
} from '@/lib/builder/api';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';
import { useAuth } from '@/contexts/AuthContext';
import { BuilderManageSheet } from '@/components/builder/BuilderManageSheet';

type View = { kind: 'src'; url: string } | { kind: 'doc'; html: string } | { kind: 'unavailable' } | { kind: 'loading' };

/** On its own site the app may keep same-origin (its own storage); dehub.io stays out of reach. */
const OWN_ORIGIN_SANDBOX = `${BUILDER_IFRAME_SANDBOX} allow-same-origin`;

export default function BuilderPreviewPage() {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [owned, setOwned] = useState<{ project: BuilderProject; listing: BuilderListing | null } | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    let owner: { project: BuilderProject; listing: BuilderListing | null } | null = null;
    if (isAuthenticated) {
      owner = await builderApi.get(id).catch(() => null);
    }
    setOwned(owner);

    if (owner?.project.slug) {
      const { url } = await builderApi.previewUrl(id);
      if (await appHostReachable(url)) return setView({ kind: 'src', url: `${url}?v=${owner.project.version}` });
    } else {
      const app = await resolvePublicApp(id).catch(() => null);
      if (app?.url && (await appHostReachable(app.url))) return setView({ kind: 'src', url: `${app.url}?v=${app.version}` });
    }
    const html = await loadBuilderAppHtml(id, owner?.project.version).catch(() => null);
    setView(html ? { kind: 'doc', html } : { kind: 'unavailable' });
  }, [id, isAuthenticated]);

  useEffect(() => {
    setView({ kind: 'loading' });
    load();
  }, [load]);

  const live = view.kind === 'src' || view.kind === 'doc';

  return (
    <div data-theme-page-surface={live ? undefined : true} className="fixed inset-0 z-[1] bg-background text-foreground">
      <SEOHead title={_copy("copy.a06602146802", { defaultValue: "Built with DeHub Builder" })} description={_copy("copy.6be19fadc3c7", { defaultValue: "An app built on DeHub Builder." })} noindex />
      {view.kind === 'src' && (
        <iframe
          title={_copy("copy.0d04bfeb7d64", { defaultValue: "App" })}
          src={view.url}
          sandbox={OWN_ORIGIN_SANDBOX}
          allow="clipboard-write; fullscreen; gamepad; autoplay"
          className="w-full h-full border-0 bg-[#fff]"
        />
      )}
      {view.kind === 'doc' && (
        <iframe
          title={_copy("copy.0d04bfeb7d64", { defaultValue: "App" })}
          srcDoc={view.html}
          sandbox={BUILDER_IFRAME_SANDBOX}
          className="w-full h-full border-0 bg-[#fff]"
        />
      )}
      {!live && (
        <div className="w-full h-full grid place-items-center">
          {view.kind === 'unavailable' ? (
            <p className="text-[#949499] text-sm px-6 text-center">{_copy("copy.5dafc5f5d31b", { defaultValue: "This app is not available yet — it may still be building." })}</p>
          ) : (
            <DeHubPageLoader minHeight="0" />
          )}
        </div>
      )}
      {owned && (
        <>
          <button
            type="button"
            onClick={() => setManageOpen(true)}
            className="fixed top-3 right-3 z-[2] rounded-full bg-black/70 text-white text-sm px-4 py-2 backdrop-blur"
          >
            {t('builder.manage.open')}
          </button>
          <BuilderManageSheet
            open={manageOpen}
            onOpenChange={setManageOpen}
            project={owned.project}
            listing={owned.listing}
            onChanged={load}
          />
        </>
      )}
    </div>
  );
}
