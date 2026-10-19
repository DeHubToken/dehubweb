/**
 * Export journal
 * ==============
 * Reports every video export to the `editor-export-log` edge function: when it
 * starts, how it ends, and the error if it failed. Support reads the journal
 * through the admin panel, so a creator whose download broke can still be
 * handed their video.
 *
 * Fire and forget. Journalling must never slow down or break an export, so
 * every failure here is swallowed.
 */
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/lib/api/dehub/core";
import { useEditorStore } from "@/store/editorStore";
import type { ExportResult } from "./exporter";

export type ExportSurface = "download" | "post" | "agent";

export interface ExportJournalStart {
  surface: ExportSurface;
  format: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
}

function send(body: Record<string, unknown>): void {
  try {
    const token = getAuthToken();
    void supabase.functions.invoke("editor-export-log", {
      body,
      headers: token ? { "x-dehub-token": token } : undefined,
    }).catch(() => undefined);
  } catch { /* journalling is best effort */ }
}

// DOMException is not an Error subclass everywhere, so read the fields directly.
const errorName = (error: unknown) => (error as { name?: unknown } | null)?.name;
const describe = (error: unknown) => {
  const e = error as { name?: unknown; message?: unknown } | null;
  return (typeof e?.message === "string" ? `${String(e.name ?? "Error")}: ${e.message}` : String(error)).slice(0, 2000);
};

export function startExportJournal(start: ExportJournalStart) {
  const exportId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `x_${Date.now()}`;
  const startedAt = Date.now();
  const state = useEditorStore.getState();
  const used = new Set(state.clips.flatMap(c => ("mediaId" in c && c.mediaId ? [c.mediaId] : [])));
  const media = state.media.filter(m => used.has(m.id));
  const base = {
    exportId,
    ...start,
    projectId: state.projectId,
    projectTitle: state.projectTitle,
    mediaIds: media.map(m => m.id),
    mediaNames: media.map(m => m.name),
    page: typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : null,
  };
  send({ ...base, event: "started" });
  const elapsedMs = () => Date.now() - startedAt;
  return {
    exportId,
    succeeded: (result: Pick<ExportResult, "blob" | "videoCodec" | "audioCodec">) =>
      send({ ...base, event: "succeeded", bytes: result.blob.size, videoCodec: result.videoCodec, audioCodec: result.audioCodec, elapsedMs: elapsedMs() }),
    failed: (error: unknown) => {
      const aborted = errorName(error) === "AbortError";
      send({ ...base, event: aborted ? "cancelled" : "failed", error: aborted ? null : describe(error), elapsedMs: elapsedMs() });
    },
    backedUp: (backupAssetId: string) => send({ ...base, event: "backed_up", backupAssetId }),
    backupFailed: (error: unknown) => send({ ...base, event: "backup_failed", error: describe(error) }),
  };
}
