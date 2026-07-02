/**
 * CreatorEditorHost
 * =================
 * Mounts /creator and /editor together and toggles visibility based on the
 * current pathname. First visit lazy-loads the chunk; subsequent switches are
 * instant with full state preserved (timeline, gallery scroll, etc.).
 */
import React, { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazy-with-retry";
import { SEOHead } from "@/components/SEOHead";

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

  // Preload the other side after first idle so the first switch is instant.
  useEffect(() => {
    const idle = (cb: () => void) =>
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(cb, { timeout: 2000 })
        : setTimeout(cb, 800);
    idle(() => setMounted((p) => ({ creator: true, editor: true })));
  }, []);

  return (
    <>
      {isCreator ? (
        <SEOHead title="DeHub Creator — AI Studio, Agents & Video Tools" description="Generate images and videos, edit with AI, and publish to DeHub. A complete AI creator studio with metallic liquid glass design." url="https://dehub.io/creator" />
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
