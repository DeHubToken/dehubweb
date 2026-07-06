import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import ogImage from "@/assets/og-chatgpt.jpg";
import dehubLogo from "@/assets/dehub-logo-white.png";
import openaiLogo from "@/assets/ai-logos/openai.png";

const APP_URL =
  "https://chatgpt.com/apps#settings/Connectors?connector=asdk_app_6a4962fb2cdc8191afcda7ca74b6082c";
const PAGE_URL = "https://cosmic-echo-hero.lovable.app/connect/chatgpt";
const OG_IMAGE =
  "https://cosmic-echo-hero.lovable.app" + ogImage;

const steps = [
  {
    title: "Open the DeHub connector in ChatGPT",
    body: "Click the button below. ChatGPT will jump straight to the DeHub connector inside your Settings → Connectors panel.",
  },
  {
    title: "Enable the connector",
    body: "Toggle DeHub on and approve the requested access. This lets ChatGPT read public DeHub posts, profiles and trending topics on your behalf.",
  },
  {
    title: "Start a new chat and use it",
    body: "Open a new chat, mention DeHub in your prompt (e.g. \"Summarise today's trending posts on DeHub\") and ChatGPT will call the connector automatically.",
  },
];

const examples = [
  "Summarise the top 10 trending posts on DeHub right now.",
  "Find posts on DeHub about Bitcoin from the last 24 hours and give me a bullet-point digest.",
  "Look up the DeHub profile @satoshi and tell me what they've posted this week.",
  "Draft a reply to the top post on DeHub in my voice.",
];

const faqs = [
  {
    q: "Is DeHub free to use inside ChatGPT?",
    a: "Yes. The DeHub ChatGPT app is free. You only need an active ChatGPT account that supports connectors (available on ChatGPT Plus, Pro, Team and Enterprise).",
  },
  {
    q: "What can the DeHub connector do?",
    a: "It exposes DeHub's public data via the Model Context Protocol (MCP): browsing posts, searching topics, and looking up creator profiles. It does not post on your behalf.",
  },
  {
    q: "Do I need a DeHub account?",
    a: "No account is required to read public content through the connector. A DeHub account is only needed if you want to post, tip or hold DHB.",
  },
  {
    q: "Which ChatGPT models support this?",
    a: "Any ChatGPT model that supports Apps / Connectors — currently GPT-5 and GPT-4.1 class models on Plus, Pro, Team and Enterprise plans.",
  },
];

export default function ConnectChatGPTPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        name: "How to use DeHub inside ChatGPT",
        description:
          "Add the DeHub connector to ChatGPT and let GPT browse posts, profiles and trends from the DeHub social network.",
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
        title="DeHub for ChatGPT — Use DeHub inside ChatGPT (MCP Connector)"
        description="Add DeHub to ChatGPT in one click. Browse posts, look up profiles and pull trending topics from the DeHub decentralized social network directly inside ChatGPT."
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

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-[24px]">
          <img src={dehubLogo} alt="DeHub" className="h-4 w-4 object-contain" />
          <span className="text-white/40">×</span>
          <img src={openaiLogo} alt="ChatGPT" className="h-4 w-4 object-contain" />
          <span className="ml-1 text-[10px] font-black italic tracking-wider text-white">
            MCP LIVE
          </span>
        </div>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-5xl">
          Use DeHub inside ChatGPT
        </h1>
        <p className="mt-3 text-base text-white/60 md:text-lg">
          DeHub is available as a native ChatGPT app. Enable the connector once
          and ask ChatGPT anything about DeHub posts, creators and trends —
          right from the chat box.
        </p>

        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/60 px-5 py-3 text-sm font-bold text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-[24px] transition-transform hover:-translate-y-0.5"
        >
          <img src={openaiLogo} alt="" className="h-4 w-4 object-contain" />
          Open DeHub in ChatGPT
          <ArrowUpRight className="h-4 w-4" />
        </a>

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
            className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold text-black"
            style={{ backgroundColor: "#10a37f" }}
          >
            Open DeHub in ChatGPT
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <Link
            to="/connect/claude"
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
          >
            Prefer Claude? Open the Claude guide
          </Link>
        </div>
      </div>
    </div>
  );
}
