import { useCallback, useState } from "react";
import { Sparkles, ImageIcon, Film, Mic, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { importFiles as importFilesShared } from "@/lib/editor/importFiles";
import { useEditorQuota } from "@/hooks/use-editor-quota";

type GenKind = "image" | "video" | "audio";

// Default ElevenLabs voice (Aria) — matches the Creator/Assistant default.
const DEFAULT_VOICE_ID = "9BWtsMINqrJLrRacOk9x";

async function urlOrDataUrlToFile(src: string, filename: string, mime: string): Promise<File> {
  const res = await fetch(src);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || mime });
}

interface GeneratePanelProps {
  onImported?: () => void;
}

export function GeneratePanel({ onImported }: GeneratePanelProps) {
  const quota = useEditorQuota();
  const [kind, setKind] = useState<GenKind | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  const reset = useCallback(() => {
    setKind(null);
    setPrompt("");
    setStatus("");
  }, []);

  const importGenerated = useCallback(async (file: File) => {
    await importFilesShared([file], {
      wallet: quota.walletAddress,
      badgeBalance: undefined,
      username: null,
    });
    window.dispatchEvent(new CustomEvent("editor:storage-usage-changed"));
    onImported?.();
  }, [quota.walletAddress, onImported]);

  const generateImage = useCallback(async () => {
    setStatus("Painting frames…");
    const { data, error } = await supabase.functions.invoke("generate-image", {
      body: { prompt, model: "gemini-2.5-flash" },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const url: string | undefined = data?.imageUrl;
    if (!url) throw new Error("No image returned");
    setStatus("Importing…");
    const file = await urlOrDataUrlToFile(url, `generated-${Date.now()}.png`, "image/png");
    await importGenerated(file);
  }, [prompt, importGenerated]);

  const generateVideo = useCallback(async () => {
    setStatus("Queueing render…");
    const { data, error } = await supabase.functions.invoke("generate-video", {
      body: { prompt, model: "kling-v2-master", duration: "5s", aspectRatio: "16:9" },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const predictionId: string | undefined = data?.predictionId;
    const provider: string | undefined = data?.provider;
    const falAppId: string | undefined = data?.falAppId;
    if (!predictionId) throw new Error("No prediction id returned");

    setStatus("Rendering… (1–3 min)");
    const started = Date.now();
    const timeoutMs = 6 * 60 * 1000;
    let videoUrl: string | undefined;
    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 5000));
      const poll = await supabase.functions.invoke("generate-video", {
        body: { predictionId, provider, falAppId },
      });
      if (poll.error) throw poll.error;
      const pd = poll.data;
      if (pd?.status === "succeeded" && pd.videoUrl) {
        videoUrl = pd.videoUrl;
        break;
      }
      if (pd?.status === "failed") {
        throw new Error(pd.error || "Video generation failed");
      }
    }
    if (!videoUrl) throw new Error("Timed out waiting for render");
    setStatus("Importing…");
    const file = await urlOrDataUrlToFile(videoUrl, `generated-${Date.now()}.mp4`, "video/mp4");
    await importGenerated(file);
  }, [prompt, importGenerated]);

  const generateAudio = useCallback(async () => {
    if (prompt.length > 500) throw new Error("Voiceover text is capped at 500 characters");
    setStatus("Synthesising voice…");
    const { data, error } = await supabase.functions.invoke("elevenlabs-tts", {
      body: { text: prompt, voiceId: DEFAULT_VOICE_ID },
    });
    if (error) throw error;
    // Edge function returns raw audio/mpeg — supabase client wraps it as Blob.
    let blob: Blob;
    if (data instanceof Blob) blob = data;
    else if (data instanceof ArrayBuffer) blob = new Blob([data], { type: "audio/mpeg" });
    else throw new Error("Unexpected TTS response");
    setStatus("Importing…");
    const file = new File([blob], `voiceover-${Date.now()}.mp3`, { type: "audio/mpeg" });
    await importGenerated(file);
  }, [prompt, importGenerated]);

  const run = useCallback(async () => {
    if (!prompt.trim() || !kind) return;
    if (quota.overQuota) {
      toast.error("Storage full — remove assets or stake more DHB for a bigger tier.");
      return;
    }
    setBusy(true);
    try {
      if (kind === "image") await generateImage();
      else if (kind === "video") await generateVideo();
      else await generateAudio();
      toast.success(`${kind[0].toUpperCase()}${kind.slice(1)} added to Media`);
      reset();
    } catch (e) {
      console.error("[editor] generation failed", e);
      toast.error(e instanceof Error ? e.message : "Generation failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }, [prompt, kind, quota.overQuota, generateImage, generateVideo, generateAudio, reset]);

  const kinds: { id: GenKind; label: string; icon: typeof ImageIcon; hint: string }[] = [
    { id: "image", label: "Image", icon: ImageIcon, hint: "AI image, instant" },
    { id: "video", label: "Video", icon: Film, hint: "5s clip, 1–3 min" },
    { id: "audio", label: "Voiceover", icon: Mic, hint: "TTS, up to 500 chars" },
  ];

  return (
    <div className="mx-3 mb-2 rounded-xl border border-white/10 bg-white/[0.02] p-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">
        <Sparkles className="h-3 w-3" /> Generate
      </div>

      {!kind ? (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {kinds.map((k) => {
              const Icon = k.icon;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => setKind(k.id)}
                  disabled={quota.overQuota}
                  title={k.hint}
                  className="group flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[9px] uppercase tracking-wide text-white/50 group-hover:text-white/70">
                    {k.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[9px] leading-tight text-white/40">
            Powered by the Creator engine — outputs land in your Media library.
          </p>
        </>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] uppercase tracking-wide text-white/60">
              {kinds.find((k) => k.id === kind)?.label} prompt
            </span>
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-40"
              aria-label="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
            rows={3}
            placeholder={
              kind === "audio"
                ? "Type what the voice should say…"
                : kind === "video"
                  ? "A dolphin surfing at sunset, cinematic…"
                  : "A neon cyberpunk skyline at night…"
            }
            className="w-full resize-none rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={run}
              disabled={busy || !prompt.trim()}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-[11px] font-medium text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {busy ? status || "Working…" : "Generate"}
            </button>
          </div>
          {busy && (
            <p className="px-1 text-[9px] leading-tight text-white/50">
              Keep this panel open — the asset drops into Media when it's ready.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
