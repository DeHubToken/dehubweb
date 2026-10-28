import { useTranslation } from 'react-i18next';
import { useState } from "react";
import Copy from "@/components/ui/cut-icons/copy";
import Check from "@/components/ui/cut-icons/check";

import ArrowLeft from "@/components/ui/cut-icons/back";

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { toast } from "sonner";

const MCP_URL = 'https://dehub.io/mcp';
const CLAUDE_CODE = `claude mcp add --transport http dehub ${MCP_URL}`;
const MCP_JSON = JSON.stringify({ mcpServers: { dehub: { url: MCP_URL } } }, null, 2);

function CopyButton({ text, label, done, toastText, failText }: { text: string; label: string; done: string; toastText: string; failText: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(toastText);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(failText);
    }
  };
  return (
    <Button onClick={copy} className="rounded-xl shrink-0 bg-white text-black hover:bg-white/90">
      {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
      {copied ? done : label}
    </Button>
  );
}

export default function ConnectPage() {
  const { t } = useTranslation();
  const g = (key: string) => t(`connectGuide.${key}`);
  const copyProps = { label: g('copy'), done: g('copied'), toastText: g('copiedToast'), failText: g('copyFailed') };
  const steps = (keys: string[]) => (
    <ol className="space-y-3 text-white/80 list-decimal list-inside">
      {keys.map((key) => <li key={key}>{g(key)}</li>)}
    </ol>
  );

  return (
    <div data-glass-page className="min-h-screen bg-black text-white">
      <SEOHead title={g('title')} description={g('desc')} url="https://dehub.io/connect" />

      <div className="max-w-3xl mx-auto px-4 py-8 md:py-14">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-8">
          <ArrowLeft className="w-4 h-4" />{t("copy.76900f1bfd16", { defaultValue: "Back" })}
        </Link>

        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mb-3">{g('title')}</h1>
        <p className="text-white/60 text-base md:text-lg mb-10">{g('desc')}</p>

        {/* MCP URL card */}
        <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-5 md:p-6 mb-3">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-2">{g('urlLabel')}</div>
          <div className="flex items-center gap-3">
            <code className="flex-1 text-sm md:text-base font-mono text-white break-all">{MCP_URL}</code>
            <CopyButton text={MCP_URL} {...copyProps} />
          </div>
        </div>
        <p className="text-sm text-white/50 mb-12">{g('urlNote')}</p>

        {/* What it can do */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">{g('canTitle')}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <h3 className="text-base font-semibold mb-2">{g('publicTitle')}</h3>
              <p className="text-white/60 text-sm">{g('publicBody')}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
              <h3 className="text-base font-semibold mb-2">{g('accountTitle')}</h3>
              <p className="text-white/60 text-sm">{g('accountBody')}</p>
            </div>
          </div>
        </section>

        {/* ChatGPT */}
        <section className="mb-12">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-2xl font-semibold">ChatGPT</h2>
            <a href="https://chatgpt.com/#settings/Connectors" target="_blank" rel="noreferrer" className="text-sm text-white underline hover:opacity-80">{g('openSettings')}</a>
          </div>
          {steps(['chatgpt1', 'chatgpt2', 'chatgpt3', 'chatgpt4', 'chatgpt5'])}
          <Link to="/connect/chatgpt" className="inline-block mt-4 text-sm text-white underline hover:opacity-80">{t("copy.e27b8c5f9d13")}</Link>
        </section>

        {/* Claude */}
        <section className="mb-12">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-2xl font-semibold">Claude</h2>
            <a href="https://claude.ai/customize/connectors?modal=add-custom-connector" target="_blank" rel="noreferrer" className="text-sm text-white underline hover:opacity-80">{g('openSettings')}</a>
          </div>
          {steps(['claude1', 'claude2', 'claude3', 'claude4'])}
          <Link to="/connect/claude" className="inline-block mt-4 text-sm text-white underline hover:opacity-80">{t("copy.f38c9d6a0e24")}</Link>
        </section>

        {/* Developer apps */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-2">{g('devTitle')}</h2>
          <p className="text-white/60 text-sm mb-4">{g('devBody')}</p>
          {[CLAUDE_CODE, MCP_JSON].map((snippet) => (
            <div key={snippet} className="bg-black/60 border border-white/10 rounded-2xl p-4 mb-3 flex items-start gap-3">
              <pre className="flex-1 text-xs md:text-sm font-mono text-white whitespace-pre-wrap break-all">{snippet}</pre>
              <CopyButton text={snippet} {...copyProps} toastText={g('copied')} />
            </div>
          ))}
        </section>

        {/* Linked apps */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 md:p-6 mb-6">
          <h2 className="text-base font-semibold mb-2">{g('manageTitle')}</h2>
          <p className="text-white/60 text-sm mb-4">{g('manageBody')}</p>
          <Link to="/connect/chatgpt" className="inline-flex items-center gap-1.5 text-sm text-white underline hover:opacity-80">{g('manageLink')}</Link>
        </div>

        {/* Posting as an agent needs its own URL */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 md:p-6 mb-12">
          <h2 className="text-base font-semibold mb-2">{g('agentTitle')}</h2>
          <p className="text-white/60 text-sm mb-4">{g('agentBody')}</p>
          <Link to="/app/agents" className="inline-flex items-center gap-1.5 text-sm text-white underline hover:opacity-80">{g('agentLink')}</Link>
        </div>

        {/* Troubleshooting */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">{g('helpTitle')}</h2>
          <ul className="space-y-3 text-white/80 list-disc list-inside">
            {['help1', 'help2', 'help3'].map((key) => <li key={key}>{g(key)}</li>)}
          </ul>
        </section>

        <p className="text-sm text-white/40">{g('other')}</p>
      </div>
    </div>
  );
}
