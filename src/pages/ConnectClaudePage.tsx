import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import ogImage from "@/assets/og-claude.jpg";
import dehubLogo from "@/assets/dehub-logo-white.png";
import dehubIcon from "@/assets/dehub-logo.png";
import anthropicLogo from "@/assets/ai-logos/anthropic.png";

const APP_URL =
  "https://claude.ai/new#settings/customize-connectors/10c6ee66-064b-4d66-b544-139cdc732b0f";
const PAGE_URL = "https://cosmic-echo-hero.lovable.app/connect/claude";
const OG_IMAGE = "https://cosmic-echo-hero.lovable.app" + ogImage;

const steps = [
  {
    title: "Open the DeHub connector in Claude",
    body: "Click the button below. Claude will open directly on the DeHub connector inside Settings → Connectors.",
  },
  {
    title: "Enable the connector",
    body: "Turn DeHub on and approve access. Claude will now be able to browse public DeHub posts, look up profiles and read trending topics.",
  },
  {
    title: "Start a chat and prompt it",
    body: "Open a new conversation and mention DeHub in your message — Claude will call the connector automatically whenever it needs live DeHub context.",
  },
];

const examples = [
  "Give me a briefing of the top posts on DeHub in the last 24 hours.",
  "Search DeHub for posts about Ethereum staking and summarise the sentiment.",
  "Pull the profile @satoshi from DeHub and describe their recent activity.",
  "Draft three reply options to the top DeHub post about AI, in a concise tone.",
];

const faqs = [
  {
    q: "Is the DeHub Claude connector free?",
    a: "Yes. The connector itself is free to add. You need a Claude account on a plan that supports custom connectors (Claude Pro, Team or Enterprise).",
  },
  {
    q: "What can Claude do with DeHub?",
    a: "Through MCP, Claude can browse public DeHub posts, search topics and look up creator profiles. It does not post on your behalf.",
  },
  {
    q: "Do I need a DeHub account to use it?",
    a: "No. Reading public content works without an account. You only need a DeHub account to post, tip or hold DHB.",
  },
  {
    q: "Which Claude models work with the connector?",
    a: "Any Claude model that supports MCP connectors — including the current Claude Sonnet, Opus and Haiku families on Pro and Team plans.",
  },
];

export default function ConnectClaudePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        name: "How to use DeHub inside Claude",
        description:
          "Add the DeHub connector to Claude and let it browse posts, profiles and trends from the DeHub decentralized social network.",
        image: OG_IMAGE,
        totalTime: "PT1M",
        step: steps.map((s, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: s.title,
          text: s.body,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SEOHead
        title="DeHub for Claude — Use DeHub inside Claude (MCP Connector)"
        description="Add DeHub to Claude in one click. Browse posts, look up profiles and pull trending topics from the DeHub decentralized social network directly inside Claude."
        url={PAGE_URL}
        image={OG_IMAGE}
        type="article"
        jsonLd={jsonLd}
      />

      <div className="mx-auto max-w-3xl px-4 py-8 md:py-14">
        <Link
          to="/app"
          className="mb-8 inline-flex items-center gap-2 text-sm text-white/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to DeHub
        </Link>

        <div
          className="mb-8 aspect-[1200/630] w-full overflow-hidden rounded-2xl border border-white/10"
          style={{
            backgroundImage: `url(${ogImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
          aria-hidden="true"
        />

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-[24px]">
          <img src={dehubIcon} alt="DeHub" className="h-4 w-4 object-contain" />
          <span className="text-white/40">×</span>
          <img src={anthropicLogo} alt="Claude" className="h-4 w-4 object-contain" />
          <span className="ml-1 text-[10px] font-black italic tracking-wider text-white">
            MCP LIVE
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
          Use DeHub inside Claude
        </h1>
        <p className="mt-3 text-base text-white/60 md:text-lg">
          DeHub is available as a native Claude connector. Turn it on once and
          Claude can browse DeHub posts, creators and trends live — right from
          your chat.
        </p>

        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/60 px-5 py-3 text-sm font-bold text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-[24px] transition-transform hover:-translate-y-0.5"
        >
          <img src={anthropicLogo} alt="" className="h-4 w-4 object-contain" />
          Open DeHub in Claude
          <ArrowUpRight className="h-4 w-4" />
        </a>

        <div className="mt-10 rounded-2xl border border-white/10 bg-black/60 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-[24px]">
          <div className="flex items-center justify-center gap-5 sm:gap-8">
            <img src={dehubLogo} alt="DeHub" className="h-9 w-auto max-w-[44%] object-contain sm:h-11" />
            <span className="text-xl font-light text-white/35">×</span>
            <img src={anthropicLogo} alt="Claude" className="h-12 w-12 rounded-xl bg-white p-2 object-contain sm:h-14 sm:w-14" />
          </div>
        </div>

        <section className="mt-14">
          <h2 className="text-xl font-bold md:text-2xl">Setup in 3 steps</h2>
          <ol className="mt-6 space-y-4">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-[24px]"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-sm font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold">{s.title}</h3>
                    <p className="mt-1 text-sm text-white/60">{s.body}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-bold md:text-2xl">Prompts to try</h2>
          <ul className="mt-6 space-y-2">
            {examples.map((e) => (
              <li
                key={e}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/80"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-bold md:text-2xl">FAQ</h2>
          <div className="mt-6 space-y-4">
            {faqs.map((f) => (
              <div
                key={f.q}
                className="rounded-2xl border border-white/10 bg-black/60 p-5 backdrop-blur-[24px]"
              >
                <h3 className="text-base font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm text-white/60">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-14 flex flex-wrap gap-3">
          <a
            href={APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/60 px-5 py-3 text-sm font-bold text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-[24px]"
          >
            <img src={anthropicLogo} alt="" className="h-4 w-4 object-contain" />
            Open DeHub in Claude
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <Link
            to="/connect/chatgpt"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
          >
            Prefer ChatGPT? Open the ChatGPT guide
          </Link>
        </div>
      </div>
    </div>
  );
}
