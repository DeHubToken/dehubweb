import { openDB } from "idb";
import { cloudProjectApi } from "./cloudProjectApi";
import { cloudProjectSession, type CloudProjectLink } from "./cloudProjectSession";
import { getMedia, putMedia } from "./mediaStore";
import { saveProject } from "./projectStore";
import { toMediaItem, useEditorStore } from "@/store/editorStore";
import type { CloudProjectMedia } from "./cloudProjectFormat";

let linkDatabase: ReturnType<typeof openDB> | undefined;
const links = () => linkDatabase ??= openDB("dehub-editor-cloud-links", 1, { upgrade(db) { db.createObjectStore("links"); } });
function extension(name: string, mime: string): string {
  return /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toLowerCase()
    || ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "video/webm": "webm", "video/quicktime": "mov", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a" }[mime]) || "mp4";
}
export function browserCloudProjectSession(address: string, check: () => void) {
  const wallet = address.toLowerCase(), api = cloudProjectApi(wallet);
  const key = (id: string) => `${wallet}:${id}`;
  return { api, uuid: () => crypto.randomUUID(), session: cloudProjectSession({ wallet, check, api, uuid: () => crypto.randomUUID(), saveLocal: saveProject,
    readLink: async id => ((await (await links()).get("links", key(id))) ?? null) as CloudProjectLink | null,
    writeLink: async (id, link) => { await (await links()).put("links", link, key(id)); },
    upload: async (localId, cloudId, guard) => {
      const local = await getMedia(localId); guard();
      const live = useEditorStore.getState().media.find(media => media.id === localId);
      if (!local && !live) throw new Error("A project source is missing from this device");
      const meta = local || live!;
      let blob = local?.blob;
      if (!blob) { const response = await fetch(live!.url); guard(); if (!response.ok) throw new Error("A project source could not be downloaded"); blob = await response.blob(); guard(); }
      if (!blob.size) throw new Error("A project source is empty");
      const slot = await api.prepareMedia(cloudId, blob.size, extension(meta.name, meta.mimeType)); guard();
      const response = await fetch(slot.signedUrl, { method: "PUT", headers: { "Content-Type": meta.mimeType || "application/octet-stream", "x-upsert": "false" }, body: blob }); guard();
      if (!response.ok) throw new Error("A project source could not be uploaded");
      const source: CloudProjectMedia = { id: cloudId, storagePath: slot.path, name: meta.name, kind: meta.kind, mimeType: meta.mimeType, size: blob.size, provenance: meta.provenance };
      for (const field of ["width", "height", "duration"] as const) if ((meta[field] || 0) > 0) source[field] = meta[field];
      return source;
    },
    hydrate: async (source, guard, sourceOwner = wallet) => {
      let local = await getMedia(source.id); guard();
      if (!local || local.blob.size !== source.size) {
        const url = await api.sourceUrl(source.storagePath, sourceOwner); guard();
        const response = await fetch(url); guard();
        if (!response.ok) throw new Error("A saved project source is unavailable");
        const blob = await response.blob(); guard();
        if (blob.size !== source.size) throw new Error("A saved project source is incomplete");
        const { storagePath: _path, ...meta } = source;
        local = { ...meta, blob, createdAt: Date.now() }; await putMedia(local); guard();
      }
      const current = useEditorStore.getState().media.find(media => media.id === source.id);
      if (!current) useEditorStore.getState().addMedia(toMediaItem(local));
    },
  }) };
}
