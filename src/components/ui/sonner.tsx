import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();
  const [desktopToastLeft, setDesktopToastLeft] = useState("50%");

  useEffect(() => {
    if (isMobile || typeof window === "undefined") return;

    const resolveToastAnchor = () => {
      const openDialog = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')
      ).find((element) => element.offsetParent !== null);

      if (openDialog) {
        const rect = openDialog.getBoundingClientRect();
        return `${rect.left + rect.width / 2}px`;
      }

      const mainContent = document.querySelector<HTMLElement>("#app-root main");
      if (mainContent) {
        const rect = mainContent.getBoundingClientRect();
        return `${rect.left + rect.width / 2}px`;
      }

      return `${window.innerWidth / 2}px`;
    };

    const updateToastAnchor = () => {
      window.requestAnimationFrame(() => {
        setDesktopToastLeft(resolveToastAnchor());
      });
    };

    updateToastAnchor();

    window.addEventListener("resize", updateToastAnchor);

    const observer = new MutationObserver(updateToastAnchor);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state"],
    });

    return () => {
      window.removeEventListener("resize", updateToastAnchor);
      observer.disconnect();
    };
  }, [isMobile]);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-right" : "top-center"}
      duration={3000}
      visibleToasts={3}
      expand={false}
      style={isMobile ? undefined : ({ width: "auto", left: desktopToastLeft, right: "auto" } as React.CSSProperties)}
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-white/10 group-[.toaster]:backdrop-blur-xl group-[.toaster]:border group-[.toaster]:border-white/20 group-[.toaster]:text-white group-[.toaster]:shadow-[0_8px_32px_rgba(0,0,0,0.4)] group-[.toaster]:rounded-2xl group-[.toaster]:!w-fit group-[.toaster]:!min-w-0 group-[.toaster]:!max-w-[90vw] group-[.toaster]:whitespace-nowrap",
          title: "!w-fit whitespace-nowrap",
          description: "group-[.toast]:text-white/70 whitespace-nowrap",
          actionButton: "group-[.toast]:bg-white/20 group-[.toast]:text-white group-[.toast]:hover:bg-white/30",
          cancelButton: "group-[.toast]:bg-white/10 group-[.toast]:text-white/70 group-[.toast]:hover:bg-white/20",
        },
      }}
      {...props}
    />

  );
};

export { Toaster, toast };
