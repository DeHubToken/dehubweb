import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SearchProvider } from "@/components/search/SearchProvider";
import { DocsChatBot } from "@/components/chat/DocsChatBot";
import { DocsLayout } from "@/components/DocsLayout";
import ComingSoonPage from "@/components/ComingSoonPage";


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

export default function DocsRoutes() {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="dehub-docs-theme">
    <LanguageProvider>
      <SearchProvider>

        <DocsChatBot />
        <Routes>
          <Route path="/" element={<DocsLayout />}>
            <Route index element={wrap(DocsHome)} />
            <Route path="overview" element={wrap(Overview)} />
            <Route path="dapps" element={wrap(Dapp)} />
            <Route path="games" element={wrap(Games)} />
            <Route path="token" element={<ComingSoonPage title="Token Documentation" description="Comprehensive information about DeHub tokens and tokenomics." />} />
            <Route path="token/economics" element={wrap(TokenEconomics)} />
            <Route path="token/utility" element={wrap(TokenUtility)} />
            <Route path="token/where-to-buy" element={wrap(TokenWhereToBuy)} />
            <Route path="token/governance" element={wrap(TokenGovernance)} />
            <Route path="token/stake" element={wrap(TokenStake)} />
            <Route path="token/bridge" element={wrap(TokenBridge)} />
            <Route path="depin" element={wrap(DePIN)} />
            <Route path="e2e-encryption" element={wrap(E2EEncryption)} />
            <Route path="ai-toolkits" element={wrap(AIToolkits)} />
            <Route path="advertising" element={wrap(Advertising)} />
            <Route path="team" element={wrap(Team)} />
            <Route path="security" element={wrap(TokenSecurity)} />
            <Route path="roadmap" element={wrap(Roadmap)} />
            <Route path="contact" element={wrap(Contact)} />
            <Route path="terms" element={wrap(Terms)} />
            <Route path="terms-of-service" element={wrap(TermsOfService)} />
            <Route path="privacy" element={wrap(PrivacyPolicy)} />
            <Route path="brand-assets" element={wrap(BrandAssets)} />
            <Route path="brand-guidelines" element={wrap(BrandGuidelines)} />
            <Route path="quickstart" element={wrap(QuickStart)} />
            <Route path="installation" element={wrap(Installation)} />
            <Route path="endpoints" element={wrap(ApiEndpoints)} />
            <Route path="blog" element={wrap(Blog)} />
            <Route path="blog/:slug" element={wrap(BlogPost)} />
            <Route path="faq" element={wrap(FAQ)} />
            <Route path="donate" element={wrap(Donate)} />
            <Route path="website" element={<ComingSoonPage title="Website Documentation" description="Learn about our website features and capabilities." />} />
            <Route path="app" element={<ComingSoonPage title="App Documentation" description="Mobile and desktop application guides and features." />} />
            <Route path="dehub" element={<ComingSoonPage title="DeHub Platform" description="Complete guide to using the DeHub decentralized platform." />} />
            <Route path="x" element={<ComingSoonPage title="X Integration" description="Social media integration and X platform features." />} />
            <Route path="instagram" element={<ComingSoonPage title="Instagram Integration" description="Instagram connectivity and social features." />} />
            <Route path="architecture" element={<ComingSoonPage title="Architecture" description="System architecture and technical infrastructure details." />} />
            <Route path="configuration" element={<ComingSoonPage title="Configuration" description="Setup and configuration guides for developers." />} />
            <Route path="data-models" element={<ComingSoonPage title="Data Models" description="Database schemas and data structure documentation." />} />
            <Route path="auth" element={<ComingSoonPage title="Authentication" description="Security protocols and authentication methods." />} />
            <Route path="webhooks" element={<ComingSoonPage title="Webhooks" description="Real-time notifications and webhook integration guides." />} />
            <Route path="best-practices" element={<ComingSoonPage title="Best Practices" description="Recommended approaches and coding standards." />} />
            <Route path="troubleshooting" element={<ComingSoonPage title="Troubleshooting" description="Common issues and solutions for developers." />} />
            <Route path="examples" element={<ComingSoonPage title="Examples" description="Code examples and implementation samples." />} />
          </Route>
        </Routes>
      </SearchProvider>
    </LanguageProvider>
    </NextThemesProvider>
  );
}

}
