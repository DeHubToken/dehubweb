import { useTranslation as _useCopy } from 'react-i18next';
import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast, useSonner } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { ButtonLoader } from "@/components/app/DeHubLoader";
import {
  TOAST_CLASSES,
  TOAST_FIT_CLASSES,
  TOASTER_COLUMN_CLASSES,
  TOASTER_DESKTOP_WIDTH,
  TITLE_CLASSES,
  CONTENT_CLASSES,
  DESCRIPTION_CLASSES,
  ICON_CLASSES,
  SLOT_BUTTON_CLASSES,
  CLOSE_CLASSES,
} from "@/components/ui/toast-classes";
import { toastLifetimeMs, toastStateKey } from "@/lib/toast-lifetime";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const TOASTER_DURATION_MS = 3000;

/**
 * A second clock on every toast that hover cannot pause and `Infinity` cannot
 * stop; see lib/toast-lifetime for why sonner's own timer is not enough.
 * Restarts whenever the toast changes state, so a loading toast that becomes a
 * success is timed as the success.
 */
function ToastLifetimeGuard() {
  const { toasts } = useSonner();
  const clocks = useRef(new Map<string | number, { key: string; timer: ReturnType<typeof setTimeout> }>());

  useEffect(() => {
    const live = new Set(toasts.map((t) => t.id));
    for (const [id, clock] of clocks.current) {
      if (!live.has(id)) {
        clearTimeout(clock.timer);
        clocks.current.delete(id);
      }
    }
    for (const t of toasts) {
      const key = toastStateKey(t);
      const clock = clocks.current.get(t.id);
      if (clock?.key === key) continue;
      if (clock) clearTimeout(clock.timer);
      const timer = setTimeout(() => {
        clocks.current.delete(t.id);
        // Same callback sonner fires when its own timer runs out, so prompts
        // that snooze on auto-close still do.
        if (t.type !== "loading") t.onAutoClose?.(t);
        toast.dismiss(t.id);
      }, toastLifetimeMs(t, TOASTER_DURATION_MS));
      clocks.current.set(t.id, { key, timer });
    }
  }, [toasts]);

  useEffect(() => {
    const running = clocks.current;
    return () => running.forEach((clock) => clearTimeout(clock.timer));
  }, []);

  return null;
}

/**
 * The app's single toaster. Every toast in the app is raised through sonner and
 * lands here, so the classes below are the whole look — see ui/toast-classes
 * for why each one is what it is.
 *
 * The glass card is set on the toast alongside the shared layout classes rather
 * than in that file: the surface is this toaster's, while the layout and the
 * type are the contract any toast body is written against.
 *
 * The desktop-only entries hang off the same `isMobile` that picks the corner,
 * rather than a `md:` variant, so the width and the anchor can never disagree
 * with `position` on the frame the hook resolves. `--width` is one of them: it
 * sizes the rail the toast is measured against, and sonner's 356px default was
 * wrapping a one-sentence toast onto two lines on a screen with room to spare.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();
  const { t: _copy } = _useCopy();

  return (
    <>
      <ToastLifetimeGuard />
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className={["toaster group", isMobile ? "" : TOASTER_COLUMN_CLASSES].join(" ")}
        position={isMobile ? "top-right" : "top-center"}
        style={isMobile ? undefined : ({ "--width": TOASTER_DESKTOP_WIDTH } as React.CSSProperties)}
        duration={TOASTER_DURATION_MS}
        visibleToasts={3}
        expand
        containerAriaLabel={_copy("copy.788011833a5a", { defaultValue: "Notifications" })}
        icons={{ loading: <ButtonLoader size={16} /> }}
        toastOptions={{
          classNames: {
            // `group` is what ICON_CLASSES selects the loading case from.
            toast: [
              "group toast",
              "bg-zinc-950/70 backdrop-blur-xl border border-white/20 text-white",
              "shadow-[0_8px_32px_rgba(0,0,0,0.4)] rounded-xl",
              TOAST_CLASSES,
              isMobile ? "" : TOAST_FIT_CLASSES,
            ].join(" "),
            title: TITLE_CLASSES,
            content: CONTENT_CLASSES,
            description: DESCRIPTION_CLASSES,
            icon: ICON_CLASSES,
            actionButton: SLOT_BUTTON_CLASSES,
            cancelButton: SLOT_BUTTON_CLASSES,
            closeButton: CLOSE_CLASSES,
            loader: "text-white",
          },
        }}
        {...props}
      />
    </>
  );
};

export { Toaster, toast };
