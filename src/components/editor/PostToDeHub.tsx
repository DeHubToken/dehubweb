/**
 * "Post to DeHub" flow — renders the timeline via the existing export pipeline,
 * then opens the global PostModal with the resulting video file pre-attached.
 * If the user isn't authenticated, opens the login modal first and resumes after.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Share2, X } from "lucide-react";
import { LiquidGlassBubble2 } from "@/components/ui/liquid-glass-bubble-2";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { PostModal } from "@/features/post";
import { useAuth } from "@/contexts/AuthContext";
import { useEditorStore, selectTimelineDuration } from "@/store/editorStore";
import { exportProject, isExportSupported } from "@/lib/editor/exporter";
import { preserveEditorAssets, uploadEditorAsset } from "@/lib/editor/cloudMedia";


function filesToFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt.files;
}

export function PostToDeHub({ iconOnly = false }: { iconOnly?: boolean }) {
  const auth = useAuth() as { isAuthenticated: boolean; openLoginModal: () => void; walletAddress: string | null };
  const isAuthenticated = !!auth?.isAuthenticated;
  const openLoginModal = auth?.openLoginModal;
  const walletAddress = auth?.walletAddress ?? null;

  const toSnapshot = useEditorStore((s) => s.toSnapshot);
  const media = useEditorStore((s) => s.media);
  const clips = useEditorStore((s) => s.clips);
  const settings = useEditorStore((s) => s.settings);
  const duration = useEditorStore(selectTimelineDuration);


  const [renderOpen, setRenderOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wasAuthRef = useRef(isAuthenticated);

  // If the user signs in after we asked, continue the flow automatically.
  useEffect(() => {
    if (!wasAuthRef.current && isAuthenticated && pending) {
      wasAuthRef.current = true;
      setPending(false);
      void startRender();
    }
    wasAuthRef.current = isAuthenticated;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, pending]);

  const onClick = () => {
    if (duration <= 0) {
      toast.error("Add clips to the timeline first.");
      return;
    }
    if (!isExportSupported()) {
      toast.error("Your browser doesn't support video export. Try Chrome, Edge, Brave, or Arc.");
      return;
    }
    if (!isAuthenticated) {
      setPending(true);
      openLoginModal?.();
      toast("Sign in to post to DeHub. Your video will render after sign-in.");
      return;
    }
    void startRender();
  };

  const startRender = async () => {
    setRenderOpen(true);
    setProgress(0);
    setLabel("Preparing…");
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const { blob, filename } = await exportProject({
        snapshot: toSnapshot(),
        media,
        format: "mp4",
        scale: 1,
        videoBitrate: 8_000_000,
        onProgress: (p, l) => { setProgress(Math.round(p * 100)); setLabel(l); },
        signal: ctl.signal,
      });
      const file = new File([blob], filename, { type: "video/mp4" });
      setFiles(filesToFileList([file]));
      setRenderOpen(false);
      setPostOpen(true);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast("Cancelled");
      } else {
        const msg = e instanceof Error ? e.message : "Render failed";
        toast.error(msg);
        // eslint-disable-next-line no-console
        console.error("Post-to-DeHub render failed:", e);
      }
      setRenderOpen(false);
    } finally {
      abortRef.current = null;
    }
  };

  return (
    <>
      <LiquidGlassBubble2
        label="Post"
        icon={<Share2 className="h-4 w-4" />}
        onClick={onClick}
        iconOnly={iconOnly}
        width={iconOnly ? "40px" : "100px"}
        height="36px"
      />

      <Dialog open={renderOpen} onOpenChange={(v) => { if (!v) abortRef.current?.abort(); setRenderOpen(v); }}>
        <DialogContent className="border-white/10 bg-black/80 text-white backdrop-blur-[24px] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rendering your video…</DialogTitle>
            <DialogDescription className="text-white/60">
              Once it's ready, the post composer will open with the video attached.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Progress value={progress} className="h-2 bg-white/10" />
            <div className="flex items-center justify-between text-xs text-white/70">
              <span>{label || `${settings.width}×${settings.height} · MP4`}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="mr-1 h-4 w-4" /> Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PostModal
        isOpen={postOpen}
        onClose={() => { setPostOpen(false); setFiles(null); }}
        initialFiles={files}
        onFilesProcessed={() => setFiles(null)}
      />
    </>
  );
}
