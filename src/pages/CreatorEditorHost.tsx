/**
 * CreatorEditorHost
 * =================
 * Mounts /creator and /editor together and toggles visibility based on the
 * current pathname. First visit lazy-loads the chunk; subsequent switches are
 * instant with full state preserved (timeline, gallery scroll, etc.).
 *
 * This host owns the page metadata for BOTH routes. Because both pages stay
 * mounted, a Helmet inside either one keeps applying while it is hidden, and
 * whichever mounted last wins: /editor was serving the Creator Studio title.
 * The individual pages therefore declare no metadata of their own.
 */
import React, { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { SEOHead } from "@/components/SEOHead";
import { emitSurfaceSwitch } from "@/hooks/use-surface-switch";
import { useGenerationStore } from "@/store/generationStore";

const CreatorPage = lazyWithRetry(() => import("@/pages/app/CreatorPage"));
const EditorPage = lazyWithRetry(() => import("@/pages/Editor"));

function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white/60 text-sm">
      Loading…
    </div>
  );
}

export default function CreatorEditorHost() {
  const { pathname } = useLocation();
  const isEditor = pathname.startsWith("/editor");
  const isCreator = pathname.startsWith("/creator");

  const [mounted, setMounted] = useState<{ creator: boolean; editor: boolean }>(() => ({
    creator: isCreator,
    editor: isEditor,
  }));

  useEffect(() => {
    setMounted((prev) => {
      const next = { ...prev };
      if (isCreator) next.creator = true;
      if (isEditor) next.editor = true;
      return next;
    });
  }, [isCreator, isEditor]);

  /**
   * Tell both sides to close their overlays when the visible surface changes.
   * Radix portals escape the `display: none` wrapper, so a model picker left
   * open on /creator would otherwise hang over the editor canvas. See
   * use-surface-switch for the full explanation.
   */
  useEffect(() => {
    emitSurfaceSwitch();
  }, [isCreator, isEditor]);

  /**
   * Rejoin any render that was still running when the tab was last closed. The
   * DHB for it is already spent, so silently dropping it costs the creator real
   * money. Runs once here rather than in either page, since both share the
   * queue and either can be the one that loads first.
   */
  useEffect(() => {
    useGenerationStore.getState().resumeInterrupted();
  }, []);

  // Preload the other side after first idle so the first switch is instant.
  useEffect(() => {
    // requestIdleCallback is still missing from Safari's lib.dom typings.
    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    const idle = (cb: () => void) =>
      ric ? ric(cb, { timeout: 2000 }) : window.setTimeout(cb, 800);
    idle(() => setMounted({ creator: true, editor: true }));
  }, []);

  return (
    <>
      {isCreator ? (
        <SEOHead
          title="DeHub Creator — AI Studio, Agents & Video Tools"
          description="Generate images and videos, edit with AI, and publish to DeHub. A complete AI creator studio with metallic liquid glass design."
          url="https://dehub.io/creator"
          jsonLd={{
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "DeHub Creator Studio",
            url: "https://dehub.io/creator",
            applicationCategory: "MultimediaApplication",
            operatingSystem: "Web",
            description:
              "Native AI creator studio for DeHub image, video, music, posters, skills and agents.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }}
        />
      ) : (
        <SEOHead title="DeHub Editor — In-Browser Video Editor" description="Cut, trim, and export videos in your browser. Multi-track timeline, audio waveforms, effects, and one-click publish to DeHub." url="https://dehub.io/editor" />
      )}
      {mounted.creator && (
        <div style={isCreator ? undefined : { display: "none" }}>
          <Suspense fallback={isCreator ? <PageLoader /> : null}>
            <CreatorPage />
          </Suspense>
        </div>
      )}
      {mounted.editor && (
        <div style={isEditor ? undefined : { display: "none" }}>
          <Suspense fallback={isEditor ? <PageLoader /> : null}>
            <EditorPage />
          </Suspense>
        </div>
      )}
    </>
  );
}
