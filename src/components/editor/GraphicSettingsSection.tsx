import type { ReactNode } from "react";
export function GraphicSettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <details className="rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-xs font-medium text-white/75">{title}</summary><div className="mt-3 space-y-3">{children}</div></details>;
}
