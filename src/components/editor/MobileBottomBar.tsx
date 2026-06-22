/**
 * Mobile/tablet bottom bar: surfaces Media & Inspector panels via slide-up sheets
 * so every editor capability is reachable below the lg breakpoint.
 */
import { useEffect, useState } from "react";
import { ImagePlus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPanel } from "@/components/editor/MediaPanel";
import { Inspector } from "@/components/editor/Inspector";

export function MobileBottomBar() {
  const [open, setOpen] = useState<null | "media" | "inspector">(null);

  useEffect(() => {
    const handler = () => setOpen("inspector");
    window.addEventListener("editor:open-inspector", handler);
    return () => window.removeEventListener("editor:open-inspector", handler);
  }, []);

  return (
    <>
      <nav
        className="flex h-12 shrink-0 items-center justify-around gap-1 border-t border-white/10 bg-black/70 px-2 backdrop-blur-[24px] lg:hidden"
        aria-label="Editor panels"
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen("media")}
          className="h-9 flex-1 rounded-md text-white/80 hover:bg-white/10 hover:text-white"
        >
          <ImagePlus className="mr-1.5 h-4 w-4" /> Media
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen("inspector")}
          className="h-9 flex-1 rounded-md text-white/80 hover:bg-white/10 hover:text-white"
        >
          <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Inspect
        </Button>
      </nav>

      <Sheet open={open === "media"} onOpenChange={(v) => setOpen(v ? "media" : null)}>
        <SheetContent
          side="bottom"
          className="h-[75vh] border-white/10 bg-black/80 p-0 text-white backdrop-blur-[24px]"
        >
          <SheetHeader className="px-3 py-2">
            <SheetTitle className="text-sm text-white/80">Media</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(75vh-3rem)]">
            <MediaPanel />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={open === "inspector"} onOpenChange={(v) => setOpen(v ? "inspector" : null)}>
        <SheetContent
          side="bottom"
          className="h-[75vh] border-white/10 bg-black/80 p-0 text-white backdrop-blur-[24px]"
        >
          <SheetHeader className="px-3 py-2">
            <SheetTitle className="text-sm text-white/80">Inspector</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(75vh-3rem)]">
            <Inspector />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
