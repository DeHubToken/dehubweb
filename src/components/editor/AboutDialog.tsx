import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-black/80 text-white backdrop-blur-[24px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>About the editor</DialogTitle>
          <DialogDescription className="text-white/60">
            An in-browser, WebCodecs-powered video editor built into DeHub.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-white/80">
          <p>
            Multi-track timeline, live preview, transitions, per-clip effects and audio, and direct
            MP4 / WebM export — all client-side. Nothing leaves your browser until you post.
          </p>
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            <p className="font-semibold text-white/90">Credits</p>
            <p className="mt-1">
              Editor architecture inspired by{" "}
              <a
                href="https://github.com/OpenCut-app/OpenCut"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline-offset-2 hover:underline"
              >
                OpenCut
              </a>{" "}
              (MIT). All rendering, muxing and UI code is our own implementation.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
