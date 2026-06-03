import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={`toaster group ${isMobile ? '!left-3 !top-3' : '!top-4 [&>ol]:!w-auto [&>ol]:!items-center [&>ol>li]:!mx-auto'}`}
      style={isMobile ? { right: '12px', width: 'auto' } : { left: '50%', transform: 'translateX(-50%)', width: 'auto' }}
      position="top-center"
      duration={3000}
      offset={0}
      visibleToasts={5}
      expand={true}
      toastOptions={{
        classNames: {
          toast: `group toast group-[.toaster]:flex group-[.toaster]:flex-row group-[.toaster]:gap-3 group-[.toaster]:bg-white/10 group-[.toaster]:backdrop-blur-xl group-[.toaster]:border group-[.toaster]:border-white/20 group-[.toaster]:text-white group-[.toaster]:shadow-[0_8px_32px_rgba(0,0,0,0.4)] group-[.toaster]:rounded-2xl group-[.toaster]:min-w-0 group-[.toaster]:items-center ${isMobile ? 'group-[.toaster]:w-full' : 'group-[.toaster]:w-fit'}`,
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
