import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { Users, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cloudDraftEditorStore } from "@/lib/editor/cloudDraftEditorStore";
import { useCloudDraftController } from "@/lib/editor/useCloudDraftController";
import { useCloudProjectPresence } from "@/lib/editor/useCloudProjectPresence";
import { browserCloudProjectSession } from "@/lib/editor/cloudProjectDevice";
import { ensureWalletSession } from "@/lib/wallet-session";
import { Button } from "@/components/ui/button";
export function LiveProjectSession({ projectId }: { projectId: string }) {
  const { walletAddress } = useAuth(),{t}=useTranslation();
  const live = useCloudProjectPresence(walletAddress, projectId, browserCloudProjectSession, ensureWalletSession);
  const edits=useCloudDraftController(walletAddress,projectId,browserCloudProjectSession,cloudDraftEditorStore,live);
  useEffect(() => { const hidden = () => { if (document.hidden) live.leave(); }; document.addEventListener("visibilitychange", hidden); return () => document.removeEventListener("visibilitychange", hidden); }, [walletAddress, projectId]);
  const joined = live.status === "connected", waiting = live.status === "connecting";
  return <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-black px-4 py-1 text-xs text-white/70">
    <Users className="h-3.5 w-3.5" aria-hidden="true" />
    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-white" disabled={waiting} onClick={() => joined ? live.leave() : void live.join()}>{waiting ? "Joining live session…" : joined ? "Leave live session" : "Join live session"}</Button>
    {joined ? <><span role="status">{live.participants.length} connected · Cloud version {live.revision}</span><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Refresh live session" onClick={live.refresh}><RefreshCw className="h-3.5 w-3.5" /></Button><span title={live.participants.map(p => p.wallet).join(", ")} className="hidden truncate text-white/40 sm:block">{live.participants.map(p => `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}${p.connections > 1 ? ` (${p.connections})` : ""}`).join(", ")}</span></> : <span>{live.status === "disconnected" ? "Disconnected. Join again to reconnect." : "Share your presence with this project's editors."}</span>}
    {live.error && <span role="alert" className="w-full text-red-300">{live.error}</span>}
    {joined && <div className="flex w-full flex-wrap items-center gap-2">
      {edits.mode ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-white" onClick={edits.stop}>{t("editor.live.stopEdits")}</Button> : <>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-white" onClick={edits.startReceiving}>{t("editor.live.receiveEdits")}</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-white" onClick={edits.startSharing}>{t("editor.live.shareEdits")}</Button>
      </>}
      {edits.mode && <span role="status">{edits.error?t("editor.live.paused"):edits.status==="waiting"?t("editor.live.waiting"):edits.status==="syncing"?t("editor.live.transferring"):edits.mode==="sharing"?t("editor.live.sharing"):t("editor.live.receiving")}</span>}
      {edits.error && <><span role="alert" className="w-full text-red-300">{edits.error}</span><Button size="sm" variant="ghost" onClick={edits.retry}>{t("editor.live.retryRecovery")}</Button><Button size="sm" variant="ghost" onClick={()=>{void edits.saveCopy().then(saved=>{if(saved)live.leave();});}}>{t("editor.live.personalCopy")}</Button></>}
      {!edits.mode && <span className="text-[10px] text-white/45">{t("editor.live.privateHint")}</span>}
    </div>}
    {edits.copyError && <span role="alert" className="w-full text-red-300">{edits.copyError}</span>}
  </div>;
}
