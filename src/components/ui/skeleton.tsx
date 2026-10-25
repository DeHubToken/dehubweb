import { cn } from "@/lib/utils";
import '@/styles/skeleton.css';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} data-skeleton className={cn("theme-skeleton rounded-md", className)} />;
}

export { Skeleton };
