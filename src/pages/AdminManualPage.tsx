import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import manualHtml from "@/content/godmode-manual.html?raw";

const PAGE_URL = "https://dehub.io/admin-manual";
const OG_IMAGE = "https://dehub.io/og/admin-manual.jpg";

/**
 * The moderation handbook, published.
 *
 * DeHub is community owned and community run, so the rules its moderators work
 * to are not an internal document — anyone whose post was hidden can read
 * exactly what the person who hid it was told to do, and hold them to it. The
 * same file is served inside the moderation panel at godmode.dehub.io/manual;
 * this is that page, at an address that does not need a login.
 *
 * Rendered in an iframe rather than inlined, for the same reason as the panel:
 * the handbook is a finished design carrying its own `:root` palette, its own
 * type and a `body` background, and dehubweb is a heavily themed app whose
 * variables it would otherwise overwrite. `srcdoc` keeps it exact and keeps it
 * sealed off from the theme system.
 */
const AdminManualPage = () => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "The DeHub Moderation Handbook",
    description:
      "The rules DeHub moderators work to, published in full: what gets banned, what gets marked mature, and what never gets touched.",
    url: PAGE_URL,
    image: OG_IMAGE,
    inLanguage: "en",
    isAccessibleForFree: true,
    publisher: {
      "@type": "Organization",
      name: "DeHub",
      url: "https://dehub.io",
    },
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#08080b]">
      <SEOHead
        title="The DeHub Moderation Handbook"
        description="The rules our moderators work to, published in full. Only malicious actors get banned, adult content gets marked mature rather than deleted, and everything else is left to the community."
        url={PAGE_URL}
        image={OG_IMAGE}
        type="article"
        jsonLd={jsonLd}
      />

      <header className="flex items-center gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <Link
          to="/app"
          className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/55 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to DeHub
        </Link>
      </header>

      <iframe
        srcDoc={manualHtml}
        title="The DeHub moderation handbook"
        className="min-h-0 w-full flex-1 border-0 bg-[#08080b]"
      />
    </div>
  );
};

export default AdminManualPage;
