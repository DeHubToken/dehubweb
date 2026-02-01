import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      duration={3000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-black/60 group-[.toaster]:backdrop-blur-xl group-[.toaster]:saturate-[180%] group-[.toaster]:border group-[.toaster]:border-white/10 group-[.toaster]:text-white group-[.toaster]:shadow-[0_8px_32px_rgba(0,0,0,0.4)] group-[.toaster]:rounded-2xl group-[.toaster]:w-[calc(100vw-32px)] group-[.toaster]:max-w-[320px] group-[.toaster]:mx-auto group-[.toaster]:mb-20 sm:group-[.toaster]:mb-4 group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:text-center group-[.toaster]:justify-center",
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
