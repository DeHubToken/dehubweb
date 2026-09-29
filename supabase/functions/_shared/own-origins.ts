// Which browser origins count as DeHub's own web app.
//
// Used by client-logs to drop errors from other sites running a copy of the
// web build. It is deliberately narrower than "anything on the preview zone":
// every remix of the project is served from the same zone, so preview hosts are
// anchored to this project's id and its published subdomain. The preview host
// shapes mirror the ones src/integrations/supabase/previewAuthStorage.ts
// recognises.
//
// Not a security boundary. A non-browser caller can send any Origin it likes;
// this only keeps honest browsers on foreign hosts out of our data.
//
// get-rpc-endpoints keeps its own, stricter list on purpose: it guards a paid
// RPC key, and widening it to previews and LAN hosts is a separate decision.

const DEHUB_HOST = /(?:^|\.)dehub\.(?:io|net)$/;

const PROJECT_PREVIEW_HOST =
  /^(?:(?:id-preview(?:-[a-z0-9]+)?|project)--)?7d59b29a-7055-4e27-94fd-0c2253be10ad(?:-dev)?\.(?:lovable\.app|lovableproject(?:-dev)?\.com)$/;

const PUBLISHED_PREVIEW_HOST = /^(?:preview--)?cosmic-echo-hero\.lovable\.app$/;

// URL.hostname keeps the brackets on an IPv6 literal.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** 10/8, 172.16/12 and 192.168/16, for testing a dev server from a phone on the LAN. */
function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * True when a request's Origin header belongs to DeHub, or when there is no
 * web origin to judge: a missing header, the opaque `null` origin, and
 * non-http(s) schemes all pass, since that is what native apps send.
 */
export function isOwnOrigin(originHeader: string | null): boolean {
  if (!originHeader) return true;
  let url: URL;
  try {
    url = new URL(originHeader);
  } catch {
    return true;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const host = url.hostname;
  return (
    DEHUB_HOST.test(host) ||
    PROJECT_PREVIEW_HOST.test(host) ||
    PUBLISHED_PREVIEW_HOST.test(host) ||
    LOOPBACK_HOSTS.has(host) ||
    isPrivateIPv4(host)
  );
}
