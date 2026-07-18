/**
 * DeHub Builder client — talks to the builder-api edge function (wallet-native
 * auth via x-wallet-address + x-dehub-token headers) and derives the public
 * preview URL served by builder-serve.
 */
import { supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "@/lib/api/dehub/core";

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

export function builderPreviewUrl(projectId: string, version?: number): string {
  const bust = version ? `?v=${version}` : "";
  return `${SUPABASE_URL}/functions/v1/builder-serve/${projectId}/${bust}`;
}

interface InvokeOptions {
  action: string;
  projectId?: string;
  prompt?: string;
  content?: string;
}

async function invokeBuilder<T>(body: InvokeOptions): Promise<T> {
  const token = getAuthToken();
  const wallet = localStorage.getItem("dehub_wallet")?.toLowerCase();
  if (!token || !wallet) throw new Error("Sign in to use the Builder.");

  const { data, error } = await supabase.functions.invoke("builder-api", {
    body,
    headers: {
      "x-wallet-address": wallet,
      "x-dehub-token": token,
    },
  });

  if (error) {
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
): Promise<{ projectId: string; allowance: BuilderAllowance }> {
  return invokeBuilder({ action: "create", prompt });
}

export function sendBuilderMessage(
  projectId: string,
  content: string,
): Promise<{ ok: boolean; allowance: BuilderAllowance }> {
  return invokeBuilder({ action: "send", projectId, content });
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
