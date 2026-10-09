import { useEffect } from "react";
import { Users, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCloudProjectPresence } from "@/lib/editor/useCloudProjectPresence";
import { browserCloudProjectSession } from "@/lib/editor/cloudProjectDevice";
import { ensureWalletSession } from "@/lib/wallet-session";
import { Button } from "@/components/ui/button";
export function LiveProjectSession({ projectId }: { projectId: string }) {
  const { walletAddress } = useAuth();
  const live = useCloudProjectPresence(walletAddress, projectId, browserCloudProjectSession, ensureWalletSession);
  useEffect(() => { const hidden = () => { if (document.hidden) live.leave(); }; document.addEventListener("visibilitychange", hidden); return () => document.removeEventListener("visibilitychange", hidden); }, [walletAddress, projectId]);
  const joined = live.status === "connected", waiting = live.status === "connecting";
  return <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-black px-4 py-1 text-xs text-white/70">
    <Users className="h-3.5 w-3.5" aria-hidden="true" />
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-white" disabled={waiting} onClick={() => joined ? live.leave() : void live.join()}>{waiting ? "Joining live session…" : joined ? "Leave live session" : "Join live session"}</Button>
    {joined ? <><span role="status">{live.participants.length} connected · Cloud version {live.revision}</span><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Refresh live session" onClick={live.refresh}><RefreshCw className="h-3.5 w-3.5" /></Button><span title={live.participants.map(p => p.wallet).join(", ")} className="hidden truncate text-white/40 sm:block">{live.participants.map(p => `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}${p.connections > 1 ? ` (${p.connections})` : ""}`).join(", ")}</span></> : <span>{live.status === "disconnected" ? "Disconnected. Join again to reconnect." : "Share your presence with this project's editors."}</span>}
    {live.error && <span role="alert" className="w-full text-red-300">{live.error}</span>}
    {joined && <span className="w-full text-[10px] text-white/45">Use Save to cloud to share timeline changes.</span>}
  </div>;
}
