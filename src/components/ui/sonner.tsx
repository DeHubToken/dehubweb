import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();
  const [desktopToastLeft, setDesktopToastLeft] = useState("50%");
  const [desktopToastTop, setDesktopToastTop] = useState("24px");

  useEffect(() => {
    if (isMobile || typeof window === "undefined") return;

    let resizeObserver: ResizeObserver | null = null;

    const isVisible = (element: HTMLElement | null) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const getAnchorElement = () => {
      const loginLogo = Array.from(
        document.querySelectorAll<HTMLElement>('[data-login-logo-anchor="true"]')
      ).find((element) => isVisible(element));
      if (isVisible(loginLogo)) return loginLogo;

      const loginModal = Array.from(
        document.querySelectorAll<HTMLElement>('[data-login-modal="true"]')
      ).find((element) => isVisible(element));
      if (isVisible(loginModal)) return loginModal;

      const openDialog = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"]')
      ).find((element) => isVisible(element));

      if (openDialog) return openDialog;

      return document.querySelector<HTMLElement>("#app-root main");
    };

    const resolveToastAnchor = () => {
      const anchorElement = getAnchorElement();

      if (isVisible(anchorElement)) {
        const rect = anchorElement.getBoundingClientRect();
        const isLogoAnchor = anchorElement.hasAttribute("data-login-logo-anchor");

        return {
          left: `${rect.left + rect.width / 2}px`,
          top: isLogoAnchor ? `${Math.max(24, rect.top - 52)}px` : "24px",
        };
      }

      return {
        left: `${window.innerWidth / 2}px`,
        top: "24px",
      };
    };

    const attachResizeObserver = () => {
      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(() => {
          const { left, top } = resolveToastAnchor();
          setDesktopToastLeft(left);
          setDesktopToastTop(top);
        });
      });

      const elementsToObserve = [
        document.documentElement,
        document.body,
        document.querySelector<HTMLElement>("#app-root"),
        document.querySelector<HTMLElement>("#app-root main"),
        document.querySelector<HTMLElement>('[data-login-logo-anchor="true"]'),
        document.querySelector<HTMLElement>('[data-login-modal="true"]'),
        Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find((element) => isVisible(element)),
      ].filter(Boolean) as HTMLElement[];

      elementsToObserve.forEach((element) => resizeObserver?.observe(element));
    };

    const updateToastAnchor = () => {
      window.requestAnimationFrame(() => {
        const { left, top } = resolveToastAnchor();
        setDesktopToastLeft(left);
        setDesktopToastTop(top);
        attachResizeObserver();
      });
    };

    updateToastAnchor();
    [50, 150, 300, 500].forEach((delay) => window.setTimeout(updateToastAnchor, delay));

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
      resizeObserver?.disconnect();
      observer.disconnect();
    };
  }, [isMobile]);

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-right" : "top-left"}
      duration={3000}
      visibleToasts={3}
      expand={false}
      style={isMobile ? undefined : ({
        left: desktopToastLeft,
        top: desktopToastTop,
        right: "auto",
        transform: "translateX(-50%)",
        width: "fit-content",
        ["--width" as string]: "fit-content",
      } as React.CSSProperties)}
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
