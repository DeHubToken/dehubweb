import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import googlePlayBadge from "@/assets/google-play-badge.png";

export function DevelopmentNoticeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Check if user has already seen the notice this session
    const hasSeenNotice = sessionStorage.getItem("dev-notice-seen");
    if (!hasSeenNotice) {
      setOpen(true);
    }
  }, []);

  const handleClose = () => {
    sessionStorage.setItem("dev-notice-seen", "true");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Under Development</DialogTitle>
          <DialogDescription className="text-center pt-2">
            This webapp is currently under development. Download DeHub on Google Play today for the full experience. Apple listings coming soon!
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 pt-4">
          <a
            href="https://play.google.com/store/apps/details?id=io.dehub.mobile&hl"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-transform hover:scale-105"
          >
            <img
              src={googlePlayBadge}
              alt="Get it on Google Play"
              className="h-12"
            />
          </a>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-muted-foreground"
          >
            Continue to webapp
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
