/**
 * Mobile/tablet bottom bar.
 * - <md: full action row (Home, Media, Inspect, Save, Export, Post).
 * - md..xl: only Media + Inspect panel openers.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImagePlus, SlidersHorizontal, Home, Save, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MediaPanel } from "@/components/editor/MediaPanel";
import { Inspector } from "@/components/editor/Inspector";
import { ExportDialog } from "@/components/editor/ExportDialog";
import { PostToDeHub } from "@/components/editor/PostToDeHub";

export function MobileBottomBar() {
  const [open, setOpen] = useState<null | "media" | "inspector">(null);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen("inspector");
    window.addEventListener("editor:open-inspector", handler);
    return () => window.removeEventListener("editor:open-inspector", handler);
  }, []);

  const btn =
    "h-10 w-10 shrink-0 rounded-md p-0 text-white/80 hover:bg-white/10 hover:text-white flex items-center justify-center";

  return (
    <>
      {/* Mobile-only full action bar */}
      <nav
        className="flex h-14 shrink-0 items-center justify-around gap-1 border-t border-white/10 bg-black/70 px-2 backdrop-blur-[24px] md:hidden"
        aria-label="Editor actions"
      >
        <Button asChild size="sm" variant="ghost" className={btn} aria-label="Home">
          <Link to="/">
            <Home className="h-4 w-4" />
          </Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen("media")} className={btn} aria-label="Media">
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen("inspector")} className={btn} aria-label="Edit">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => toast.success("Project autosaved.")} className={btn} aria-label="Save">
          <Save className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)} className={btn} aria-label="Export">
          <Download className="h-4 w-4" />
        </Button>
        <PostToDeHub iconOnly />
      </nav>

      {/* md..xl tablet bar: just panel openers */}
      <nav
        className="hidden h-12 shrink-0 items-center justify-around gap-1 border-t border-white/10 bg-black/70 px-2 backdrop-blur-[24px] md:flex xl:hidden"
        aria-label="Editor panels"
      >
        <Button size="sm" variant="ghost" onClick={() => setOpen("media")}
          className="h-9 flex-1 rounded-md text-white/80 hover:bg-white/10 hover:text-white">
          <ImagePlus className="mr-1.5 h-4 w-4" /> Media
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen("inspector")}
          className="h-9 flex-1 rounded-md text-white/80 hover:bg-white/10 hover:text-white">
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

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </>
  );
}
