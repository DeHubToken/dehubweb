import { useState } from "react";
import { Copy, Check, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { toast } from "sonner";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const MCP_URL = `https://${projectRef}.supabase.co/functions/v1/mcp`;

export default function ConnectPage() {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      toast.success("MCP URL copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SEOHead
        title="Connect DeHub to your AI assistant"
        description="Connect ChatGPT, Claude, or any MCP-compatible assistant to DeHub with a single URL."
        url="https://dehub.io/connect"
      />

      <div className="max-w-3xl mx-auto px-4 py-8 md:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight mb-3">
          Connect DeHub to your AI assistant
        </h1>
        <p className="text-white/60 text-base md:text-lg mb-10">
          Give ChatGPT or Claude access to DeHub — browsing posts, searching,
          and looking up profiles — by pasting the URL below into your
          assistant's connector settings.
        </p>

        {/* MCP URL card */}
        <div className="bg-black/60 backdrop-blur-[24px] border border-white/10 rounded-2xl p-5 md:p-6 mb-12">
          <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
            MCP Server URL
          </div>
          <div className="flex items-center gap-3">
            <code className="flex-1 text-sm md:text-base font-mono text-white break-all">
              {MCP_URL}
            </code>
            <Button
              onClick={copyUrl}
              className="rounded-xl shrink-0 bg-white text-black hover:bg-white/90"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-1.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1.5" /> Copy
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ChatGPT */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">ChatGPT</h2>
          <ol className="space-y-3 text-white/80 list-decimal list-inside">
            <li>
              Open{" "}
              <a
                href="https://chatgpt.com/#settings/Connectors/Advanced"
                target="_blank"
                rel="noreferrer"
                className="text-white underline hover:opacity-80"
              >
                ChatGPT connector settings
              </a>{" "}
              and enable Developer mode (read the risk notice shown there).
            </li>
            <li>In the chat composer's "+" menu, turn on Developer mode.</li>
            <li>Click <span className="text-white">Add sources</span>, then <span className="text-white">Connect more</span>.</li>
            <li>Name the connector "DeHub" and paste the MCP URL above.</li>
            <li>Ask ChatGPT to use DeHub — for example, "Show me trending posts on DeHub."</li>
          </ol>
        </section>

        {/* Claude */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Claude</h2>
          <ol className="space-y-3 text-white/80 list-decimal list-inside">
            <li>
              Open{" "}
              <a
                href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                target="_blank"
                rel="noreferrer"
                className="text-white underline hover:opacity-80"
              >
                Claude custom connectors
              </a>
              .
            </li>
            <li>Name the connector "DeHub" and paste the MCP URL above.</li>
            <li>
              Enable the connector from Claude's chat composer, then ask it to
              use DeHub.
            </li>
          </ol>
        </section>

        <p className="text-sm text-white/40">
          Any other MCP-compatible client works the same way — add a custom MCP
          server and paste the URL above.
        </p>
      </div>
    </div>
  );
}
