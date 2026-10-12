interface FileShareApi {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
}

/** Prepare the exported file now; open the device picker only on the later click. */
export function prepareFileShare(blob: Blob, filename: string, api: FileShareApi | undefined = typeof navigator === "undefined" ? undefined : navigator): (() => Promise<boolean>) | null {
  if (!api?.canShare || !api.share || typeof File === "undefined") return null;
  const file = new File([blob], filename, { type: blob.type });
  const data: ShareData = { files: [file], title: filename };
  try { if (!api.canShare(data)) return null; } catch { return null; }
  const share = api.share.bind(api);
  let busy = false;
  return async () => {
    if (busy) return false;
    busy = true;
    try { await share(data); return true; }
    catch (error) { if ((error as { name?: string })?.name === "AbortError") return false; throw error; }
    finally { busy = false; }
  };
}
