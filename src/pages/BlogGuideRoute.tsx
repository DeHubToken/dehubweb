/**
 * BlogGuideRoute
 * ==============
 * Mounts individual blog posts at the top-level `/guides/<slug>` URL,
 * mirroring the standalone SEO guide pages (e.g. /guides/best-decentralized-social-media).
 *
 * Renders the exact same BlogPost component and DocsLayout wrapper used
 * by `/docs/blog/:slug`, so styling, share images, and blog data all
 * stay identical — only the outward-facing URL changes.
 *
 * Route order in App.tsx keeps hand-built static guide URLs (like
 * /guides/best-decentralized-social-media) matching first; this wrapper
 * only catches the `:slug` fallthrough.
 */

import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import "@/styles/docs-dark.css";

import { LanguageProvider } from "@/contexts/LanguageContext";
import { SearchProvider } from "@/components/search/SearchProvider";
import { DocsLayout } from "@/components/DocsLayout";

const BlogPost = lazy(() => import("./docs/BlogPost"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
  </div>
);

export default function BlogGuideRoute() {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="dehub-docs-theme"
    >
      <LanguageProvider>
        <SearchProvider>
          <Routes>
            <Route element={<DocsLayout />}>
              <Route
                path=":slug"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <BlogPost />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </SearchProvider>
      </LanguageProvider>
    </NextThemesProvider>
  );
}
