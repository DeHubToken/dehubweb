// Invite links carry a short tag of the inviter's name: /r/<CODE>?n=<tag>.
//
// X, Telegram, WhatsApp and Facebook keep a link's preview card for days under
// the exact URL that was shared. When a profile is renamed (or a wallet changes
// hands), the bare /r/<CODE> link keeps showing the old name until those caches
// expire. The tag changes with the name, so a renamed inviter shares a URL the
// platforms have never seen and the card is drawn fresh. The landing ignores it.
//
// Mirrored in the app at libs/affiliate.ts (inviteLinkTag); keep both in sync.

/** FNV-1a of the trimmed, lower-cased name, base36, 4 characters. */
export function inviteLinkTag(name: string | null | undefined): string {
  const input = (name ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!input) return "";
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(4, "0").slice(-4);
}

/** `https://riftn.com/r/<CODE>?n=<tag>`, or the bare link when there is no name. */
export function buildInviteUrl(origin: string, code: string, name?: string | null): string {
  const base = `${origin.replace(/\/+$/, "")}/r/${code}`;
  const tag = inviteLinkTag(name);
  return tag ? `${base}?n=${tag}` : base;
}
