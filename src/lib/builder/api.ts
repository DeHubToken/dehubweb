/**
 * DeHub Builder client — talks to the builder-api edge function (wallet-native
 * auth via x-wallet-address + x-dehub-token headers) and derives the public
 * preview URL served by builder-serve.
 */
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";
import { ensureFreshToken, refreshTokenSharedDetailed } from "@/lib/api/dehub/core";
import { dehubAuthHeaders } from "@/lib/ai-invoke";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://aigxuutjaqsywioxjefr.supabase.co";

export type BuilderStatus =
  | "queued"
  | "generating"
  | "publishing"
  | "updating"
  | "live"
  | "error";

export interface BuilderProject {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
  status: BuilderStatus;
  status_detail: string | null;
  error: string | null;
  version: number;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface BuilderMessage {
  id: string;
  role: "user" | "agent" | "log";
  content: string;
  created_at: string;
}

export interface BuilderFile {
  path: string;
  content: string;
}

export interface BuilderAllowance {
  used: number;
  limit: number;
  tierName: string;
}

export const BUSY_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "generating",
  "publishing",
  "updating",
]);

/** Canonical public host URL (302-redirects to the Storage object). */
export function builderPreviewUrl(projectId: string, version?: number): string {
  const bust = version ? `?v=${version}` : "";
  return `${SUPABASE_URL}/functions/v1/builder-serve/${projectId}/${bust}`;
}

/** Public Storage directory the generated files live in (trailing slash). */
export function builderStorageBase(projectId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/builder-apps/${projectId}/`;
}

/**
 * A dehub.io link that RENDERS the app for anyone (the raw storage URL serves
 * text/plain, so it can't be opened directly — this route fetches + renders it
 * in a sandboxed iframe). This is what "copy link" / "open" should share.
 */
export function builderShareUrl(projectId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://dehub.io";
  return `${origin}/builder/preview/${projectId}`;
}

export type BuilderModel = "best" | "fast";

interface InvokeOptions {
  action: string;
  projectId?: string;
  prompt?: string;
  content?: string;
  model?: BuilderModel;
}

async function invokeBuilder<T>(body: InvokeOptions, retried = false): Promise<T> {
  // Refresh first, the way every other signed-in AI call does. This sent
  // whatever sat in storage, so a session whose access token had quietly
  // expired got a 401 on every build while the rest of the app still looked
  // signed in. It also refused outright when `dehub_wallet` was missing even
  // with a good token — the token is the identity, the wallet header is only
  // a cross-check.
  await ensureFreshToken().catch(() => {});
  const headers = dehubAuthHeaders();
  if (!headers["x-dehub-token"]) throw new Error(i18n.t("builder.signInRequired"));

  const { data, error } = await supabase.functions.invoke("builder-api", { body, headers });

  if (error) {
    // A token the server has already retired can still look unexpired here.
    // Rotate it once and try again before calling the session dead.
    const status = (error as { context?: Response }).context?.status;
    if (status === 401 && !retried) {
      const refreshed = await refreshTokenSharedDetailed().catch(() => null);
      if (refreshed?.ok) return invokeBuilder<T>(body, true);
    }
    // supabase-js swallows non-2xx response bodies into a generic error;
    // surface the server's message when it is available.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const payload = await ctx.json().catch(() => null);
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message || "Builder request failed");
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function fetchBuilderAllowance(): Promise<{ allowance: BuilderAllowance }> {
  return invokeBuilder({ action: "allowance" });
}

export function listBuilderProjects(): Promise<{ projects: BuilderProject[] }> {
  return invokeBuilder({ action: "list" });
}

export function createBuilderProject(
  prompt: string,
  model: BuilderModel = "best",
): Promise<{ projectId: string; allowance: BuilderAllowance }> {
  return invokeBuilder({ action: "create", prompt, model });
}

export function sendBuilderMessage(
  projectId: string,
  content: string,
  model: BuilderModel = "best",
): Promise<{ ok: boolean; allowance: BuilderAllowance }> {
  return invokeBuilder({ action: "send", projectId, content, model });
}

export function getBuilderProject(projectId: string): Promise<{
  project: BuilderProject;
  messages: BuilderMessage[];
  files: BuilderFile[];
}> {
  return invokeBuilder({ action: "get", projectId });
}

export function removeBuilderProject(projectId: string): Promise<{ ok: boolean }> {
  return invokeBuilder({ action: "remove", projectId });
}
