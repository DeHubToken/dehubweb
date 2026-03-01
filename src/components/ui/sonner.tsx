import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarCollapse } from "@/contexts/SidebarCollapseContext";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();
  const { isCollapsed } = useSidebarCollapse();

  // In normal desktop mode the main panel is offset by the left sidebar (~231px)
  // and right sidebar (~320px). Shift toast leftward to center over the main panel.
  // In collapsed/fullscreen mode or mobile, center on viewport.
  const isNormalDesktop = !isMobile && !isCollapsed;
  // offset = (leftSidebar - rightSidebar) / 2 ≈ (231 - 320) / 2 ≈ -45px
  // i.e. shift left by ~45px from viewport center
  const desktopStyle = isNormalDesktop
    ? { left: 'calc(50% + ((231px - 320px) / 2))', transform: 'translateX(-50%)' }
    : undefined;

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={`toaster group ${isMobile ? '!left-3 !top-3' : '!top-4'}`}
      style={isMobile ? { right: '12px', width: 'auto' } : desktopStyle ? { ...desktopStyle } : undefined}
      position="top-center"
      duration={3000}
      offset={0}
      toastOptions={{
        classNames: {
          toast: `group toast group-[.toaster]:bg-white/10 group-[.toaster]:backdrop-blur-xl group-[.toaster]:border group-[.toaster]:border-white/20 group-[.toaster]:text-white group-[.toaster]:shadow-[0_8px_32px_rgba(0,0,0,0.4)] group-[.toaster]:rounded-2xl group-[.toaster]:min-w-0 group-[.toaster]:items-center ${isMobile ? 'group-[.toaster]:w-full' : 'group-[.toaster]:w-fit'}`,
          description: "group-[.toast]:text-white/70",
          actionButton: "group-[.toast]:bg-white/20 group-[.toast]:text-white group-[.toast]:hover:bg-white/30",
          cancelButton: "group-[.toast]:bg-white/10 group-[.toast]:text-white/70 group-[.toast]:hover:bg-white/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
