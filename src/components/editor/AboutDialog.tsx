import { useTranslation as _useCopy } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: Props) {
  const { t: _copy } = _useCopy();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-black/80 text-white backdrop-blur-[24px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{_copy("copy.cf3ad1573bd1", { defaultValue: "About the editor" })}</DialogTitle>
          <DialogDescription className="text-white/60">{_copy("copy.b883ccace14d", { defaultValue: "An in-browser, WebCodecs-powered video editor built into DeHub." })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-white/80">
          <p>{_copy("copy.ba922b2dc556", { defaultValue: "Multi-track timeline, live preview, transitions, per-clip effects and audio, and direct MP4 / WebM export — all client-side. Nothing leaves your browser until you post." })}</p>
          <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            <p className="font-semibold text-white/90">{_copy("copy.2a6b24ad2872", { defaultValue: "Credits" })}</p>
            <p className="mt-1">{_copy("copy.5abca84ba535", { defaultValue: "Editor architecture inspired by" })}{" "}
              <a
                href="https://github.com/OpenCut-app/OpenCut"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline-offset-2 hover:underline"
              >{_copy("copy.b751c9aea6a3", { defaultValue: "OpenCut" })}</a>{" "}{_copy("copy.6879405851e7", { defaultValue: "(MIT). All rendering, muxing and UI code is our own implementation." })}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
