import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  TOAST_CLASSES,
  TOAST_FIT_CLASSES,
  TOASTER_COLUMN_CLASSES,
  TITLE_CLASSES,
  CONTENT_CLASSES,
  DESCRIPTION_CLASSES,
  ICON_CLASSES,
  SLOT_BUTTON_CLASSES,
  CLOSE_CLASSES,
} from "@/components/ui/toast-classes";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * The app's single toaster. Every toast in the app is raised through sonner and
 * lands here, so the classes below are the whole look — see ui/toast-classes
 * for why each one is what it is.
 *
 * The glass card is set on the toast alongside the shared layout classes rather
 * than in that file: the surface is this toaster's, while the layout and the
 * type are the contract any toast body is written against.
 *
 * The two desktop-only entries hang off the same `isMobile` that picks the
 * corner, rather than a `md:` variant, so the width and the anchor can never
 * disagree with `position` on the frame the hook resolves.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={["toaster group", isMobile ? "" : TOASTER_COLUMN_CLASSES].join(" ")}
      position={isMobile ? "top-right" : "top-center"}
      duration={3000}
      visibleToasts={3}
      expand={false}
      toastOptions={{
        classNames: {
          // `group` is what ICON_CLASSES selects the loading case from.
          toast: [
            "group toast",
            "bg-white/10 backdrop-blur-xl border border-white/20 text-white",
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
  );
};

export { Toaster, toast };
