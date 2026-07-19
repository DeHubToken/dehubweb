/**
 * DocsSurface
 * ===========
 * The single, persistent full-page "docs" surface. It unifies what used to be
 * two separate route trees:
 *
 *   • DocsRoutes    — mounted for /docs/*   (docs pages + the /docs/blog list)
 *   • BlogGuideRoute — mounted for /guides/* (individual blog posts)
 *
 * Each of those mounted its OWN NextThemesProvider + LanguageProvider +
 * SearchProvider (which rebuilds a Fuse.js index over the whole content map)
 * and its OWN DocsLayout (the sidebar / header). So clicking a blog card
 * (/docs/blog → /guides/<slug>) tore the entire surface down and rebuilt it —
 * the sidebar re-rendered, the search index re-built, and the WebGL background
 * flickered pause→resume→pause — on every single click on and off a post.
 *
 * Now the providers and DocsLayout mount ONCE here and stay mounted across the
 * whole surface. DocsLayout is a layout route, so navigating between the blog
 * list, a blog post (/docs/blog/<slug> OR the canonical /guides/<slug>), and
 * any docs page only swaps the reading column in its <Outlet> — the side panels
 * never remount.
 *
 * App.tsx anchors this component under a single pathless parent route matching
 * /docs, /docs/*, and /guides/* so React keeps it mounted across the
 * /docs ↔ /guides boundary (the sibling static /guides/... pages outrank the
 * splat and are handled by their own routes).
 */
import { Suspense, lazy, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import "@/styles/docs-dark.css";
import "@/styles/docs-glass.css";

import { LanguageProvider } from "@/contexts/LanguageContext";
import { SearchProvider } from "@/components/search/SearchProvider";
import { DocsChatBot } from "@/components/chat/DocsChatBot";
import { DocsLayout } from "@/components/DocsLayout";
import ComingSoonPage from "@/components/ComingSoonPage";
import { useAppTheme } from "@/contexts/ThemeContext";
import { getDocsForcedTheme } from "@/lib/docs-theme";
import { setBackgroundPaused, scheduleBackgroundResume } from "@/lib/background-gate";

const DocsHome = lazy(() => import("./docs/DocsHome"));
const Overview = lazy(() => import("./docs/Overview"));
const DePIN = lazy(() => import("./docs/DePIN"));
const E2EEncryption = lazy(() => import("./docs/E2EEncryption"));
const AIToolkits = lazy(() => import("./docs/AIToolkits"));
const Advertising = lazy(() => import("./docs/Advertising"));
const QuickStart = lazy(() => import("./docs/QuickStart"));
const Installation = lazy(() => import("./docs/Installation"));
const ApiEndpoints = lazy(() => import("./docs/ApiEndpoints"));
const Team = lazy(() => import("./docs/Team"));
const BrandGuidelines = lazy(() => import("./docs/BrandGuidelines"));
const BrandAssets = lazy(() => import("./docs/BrandAssets"));
const FeaturedIn = lazy(() => import("./docs/FeaturedIn"));
const Dapp = lazy(() => import("./docs/Dapp"));
const Games = lazy(() => import("./docs/Games"));
const TokenEconomics = lazy(() => import("./docs/TokenEconomics"));
const TokenUtility = lazy(() => import("./docs/TokenUtility"));
const TokenWhereToBuy = lazy(() => import("./docs/TokenWhereToBuy"));
const TokenGovernance = lazy(() => import("./docs/TokenGovernance"));
const TokenSecurity = lazy(() => import("./docs/TokenSecurity"));
const Terms = lazy(() => import("./docs/Terms"));
const TermsOfService = lazy(() => import("./docs/TermsOfService"));
const Contact = lazy(() => import("./docs/Contact"));
const PrivacyPolicy = lazy(() => import("./docs/PrivacyPolicy"));
const TokenStake = lazy(() => import("./docs/TokenStake"));
const TokenBridge = lazy(() => import("./docs/TokenBridge"));
const Roadmap = lazy(() => import("./docs/Roadmap"));
const Blog = lazy(() => import("./docs/Blog"));
const BlogPost = lazy(() => import("./docs/BlogPost"));
const FAQ = lazy(() => import("./docs/FAQ"));
const Donate = lazy(() => import("./docs/Donate"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="flex flex-col items-center space-y-4">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-600 rounded-full animate-spin"></div>
      <p className="text-gray-700 text-sm">Loading...</p>
    </div>
  </div>
);

const wrap = (El: React.ComponentType) => (
  <Suspense fallback={<PageLoader />}>
    <El />
  </Suspense>
);

export default function DocsSurface() {
  const { theme: appTheme } = useAppTheme();
  const forcedTheme = getDocsForcedTheme(appTheme);

  // next-themes writes `.dark`/`.light` on <html> and does not clean it up on
  // unmount. The app itself keys on `data-theme`, not `.dark`, so a stale docs
  // class must not leak back into the app when navigating docs → app.
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("dark", "light");
    };
  }, []);

  // Pause the persistent WebGL background while this surface is open. Docs
  // composites heavy backdrop-blur glass over the canvas, so a frozen frame
  // underneath is imperceptible — but running the fbm/particle shaders at full
  // rate under that blur is a GPU fill-rate spike that can hang/crash weak
  // machines. Mark the surface for CSS too.
  //
  // On CLOSE, don't resume synchronously: that spike would land right on the
  // app panels sliding back in and freeze slow PCs. Defer it past the slide-in
  // (see scheduleBackgroundResume) so the side panels come back fluidly first.
  useEffect(() => {
    setBackgroundPaused(true);
    document.documentElement.dataset.docsOpen = "true";
    return () => {
      delete document.documentElement.dataset.docsOpen;
      scheduleBackgroundResume();
    };
  }, []);

  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="dehub-docs-theme" forcedTheme={forcedTheme}>
    <LanguageProvider>
      <SearchProvider>

        <DocsChatBot />
        <Routes>
          <Route element={<DocsLayout />}>
            {/* Docs pages */}
            <Route path="/docs" element={wrap(DocsHome)} />
            <Route path="/docs/overview" element={wrap(Overview)} />
            <Route path="/docs/dapps" element={wrap(Dapp)} />
            <Route path="/docs/games" element={wrap(Games)} />
            <Route path="/docs/token" element={<ComingSoonPage title="Token Documentation" description="Comprehensive information about DeHub tokens and tokenomics." />} />
            <Route path="/docs/token/economics" element={wrap(TokenEconomics)} />
            <Route path="/docs/token/utility" element={wrap(TokenUtility)} />
            <Route path="/docs/token/where-to-buy" element={wrap(TokenWhereToBuy)} />
            <Route path="/docs/token/governance" element={wrap(TokenGovernance)} />
            <Route path="/docs/token/stake" element={wrap(TokenStake)} />
            <Route path="/docs/token/bridge" element={wrap(TokenBridge)} />
            <Route path="/docs/depin" element={wrap(DePIN)} />
            <Route path="/docs/e2e-encryption" element={wrap(E2EEncryption)} />
            <Route path="/docs/ai-toolkits" element={wrap(AIToolkits)} />
            <Route path="/docs/advertising" element={wrap(Advertising)} />
            <Route path="/docs/team" element={wrap(Team)} />
            <Route path="/docs/security" element={wrap(TokenSecurity)} />
            <Route path="/docs/roadmap" element={wrap(Roadmap)} />
            <Route path="/docs/contact" element={wrap(Contact)} />
            <Route path="/docs/terms" element={wrap(Terms)} />
            <Route path="/docs/terms-of-service" element={wrap(TermsOfService)} />
            <Route path="/docs/privacy" element={wrap(PrivacyPolicy)} />
            <Route path="/docs/brand-assets" element={wrap(BrandAssets)} />
            <Route path="/docs/featured-in" element={wrap(FeaturedIn)} />
            <Route path="/docs/brand-guidelines" element={wrap(BrandGuidelines)} />
            <Route path="/docs/quickstart" element={wrap(QuickStart)} />
            <Route path="/docs/installation" element={wrap(Installation)} />
            <Route path="/docs/endpoints" element={wrap(ApiEndpoints)} />
            <Route path="/docs/blog" element={wrap(Blog)} />
            {/* Blog posts share ONE BlogPost mount across both URLs. The card
                links use the canonical /guides/<slug>; /docs/blog/<slug> stays
                a valid in-app alias. Both sit under the same DocsLayout as the
                /docs/blog list, so list ↔ post never remounts the sidebar. */}
            <Route path="/docs/blog/:slug" element={wrap(BlogPost)} />
            <Route path="/guides/:slug" element={wrap(BlogPost)} />
            <Route path="/docs/faq" element={wrap(FAQ)} />
            <Route path="/docs/donate" element={wrap(Donate)} />
            <Route path="/docs/website" element={<ComingSoonPage title="Website Documentation" description="Learn about our website features and capabilities." />} />
            <Route path="/docs/app" element={<ComingSoonPage title="App Documentation" description="Mobile and desktop application guides and features." />} />
            <Route path="/docs/dehub" element={<ComingSoonPage title="DeHub Platform" description="Complete guide to using the DeHub decentralized platform." />} />
            <Route path="/docs/x" element={<ComingSoonPage title="X Integration" description="Social media integration and X platform features." />} />
            <Route path="/docs/instagram" element={<ComingSoonPage title="Instagram Integration" description="Instagram connectivity and social features." />} />
            <Route path="/docs/architecture" element={<ComingSoonPage title="Architecture" description="System architecture and technical infrastructure details." />} />
            <Route path="/docs/configuration" element={<ComingSoonPage title="Configuration" description="Setup and configuration guides for developers." />} />
            <Route path="/docs/data-models" element={<ComingSoonPage title="Data Models" description="Database schemas and data structure documentation." />} />
            <Route path="/docs/auth" element={<ComingSoonPage title="Authentication" description="Security protocols and authentication methods." />} />
            <Route path="/docs/webhooks" element={<ComingSoonPage title="Webhooks" description="Real-time notifications and webhook integration guides." />} />
            <Route path="/docs/best-practices" element={<ComingSoonPage title="Best Practices" description="Recommended approaches and coding standards." />} />
            <Route path="/docs/troubleshooting" element={<ComingSoonPage title="Troubleshooting" description="Common issues and solutions for developers." />} />
            <Route path="/docs/examples" element={<ComingSoonPage title="Examples" description="Code examples and implementation samples." />} />
          </Route>
        </Routes>
      </SearchProvider>
    </LanguageProvider>
    </NextThemesProvider>
  );
}
