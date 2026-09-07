import { DEHUB_LOGO_DATA_URI } from "./logo.ts";

export interface InviteImageOptions {
  code: string;
  name: string;
  username: string | null;
  avatarDataUri: string | null;
  bannerDataUri: string | null;
  badgeDataUri: string | null;
  qrPath: string;
  qrCount: number;
  width: number;
  height: number;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

// Declare the text's extent with SVG textLength so browser previews and resvg
// place the badge at the same position, independent of installed fallback fonts.
// Wide and narrow glyphs receive different space; long identities shrink first,
// then ellipsize instead of escaping their column.
export function fitInviteText(value: string, maxWidth: number, preferredSize: number, minSize: number) {
  const units = (text: string) => Array.from(text).reduce((width, char) => {
    if (/\s/.test(char)) return width + 0.28;
    if (/[ilI1.,'!:;|]/.test(char)) return width + 0.28;
    if (/[MW@mw]/.test(char)) return width + 0.9;
    if (/[A-Z0-9]/.test(char)) return width + 0.65;
    if (/[a-z_\-/]/.test(char)) return width + 0.55;
    if (/\p{Mark}/u.test(char)) return width;
    return width + 1;
  }, 0);
  const normalized = value.replace(/\s+/g, " ").trim();
  const fontSize = Math.max(minSize, Math.min(preferredSize, maxWidth / Math.max(units(normalized), 1)));
  const chars = Array.from(normalized);
  let text = normalized;
  while (units(text) * fontSize > maxWidth && chars.length) {
    chars.pop();
    text = `${chars.join("").trimEnd()}…`;
  }
  return { text, fontSize, width: Math.min(maxWidth, units(text) * fontSize) };
}

export function buildInviteSvg(opts: InviteImageOptions): string {
  const hasIdentity = Boolean(opts.code);
  const name = fitInviteText(opts.name, opts.badgeDataUri ? 708 : 770, 78, 44);
  const handle = fitInviteText(opts.username ? `@${opts.username.replace(/^@+/, "")}` : "", 770, 36, 28);
  // All supported codes (up to 40 characters) remain complete and legible.
  const link = hasIdentity ? `dehub.io/r/${opts.code}` : "dehub.io";
  const linkText = fitInviteText(link, 853, 36, 18);
  const qrSize = 178;
  const qrQuietModules = 4;
  const qrScale = qrSize / (opts.qrCount + qrQuietModules * 2);
  const qrInset = qrQuietModules * qrScale;
  const fitted = (value: ReturnType<typeof fitInviteText>) =>
    `font-size="${value.fontSize}" textLength="${value.width}" lengthAdjust="spacingAndGlyphs"`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}" font-family="Inter, Arial, sans-serif">
  <rect width="100%" height="100%" fill="#101113"/>
  <svg width="${opts.width}" height="${opts.height}" viewBox="0 0 1200 630" preserveAspectRatio="xMidYMid meet">
    <defs>
      <clipPath id="avatarClip"><rect x="64" y="171" width="246" height="246" rx="28"/></clipPath>
      <clipPath id="bgClip"><rect width="1200" height="630"/></clipPath>
      <filter id="bgBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="20"/></filter>
    </defs>
    <rect width="1200" height="630" fill="#101113"/>
    ${opts.bannerDataUri ? `<g clip-path="url(#bgClip)"><image href="${escapeXml(opts.bannerDataUri)}" width="1200" height="630" preserveAspectRatio="xMidYMid slice" filter="url(#bgBlur)" opacity="0.26"/></g>` : ""}
    <rect width="1200" height="630" fill="#090a0b" opacity="0.64"/>
    <image href="${DEHUB_LOGO_DATA_URI}" x="64" y="52" width="206" height="${206 / (1752 / 417)}" preserveAspectRatio="xMidYMid meet"/>
    ${opts.avatarDataUri ? `<image href="${escapeXml(opts.avatarDataUri)}" x="64" y="171" width="246" height="246" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)"/>` : `
    <rect x="64" y="171" width="246" height="246" rx="28" fill="#25272c"/>
    <text x="187" y="330" fill="#fff" font-size="112" font-weight="700" text-anchor="middle">${escapeXml(Array.from(hasIdentity ? opts.name : "DeHub")[0]?.toUpperCase() || "D")}</text>`}
    <text x="366" y="219" fill="#fff" font-weight="700" ${fitted(name)}>${escapeXml(name.text)}</text>
    ${opts.badgeDataUri ? `<image href="${escapeXml(opts.badgeDataUri)}" x="${366 + name.width + 16}" y="158" width="40" height="40" preserveAspectRatio="xMidYMid meet"/>` : ""}
    ${handle.text ? `<text x="366" y="271" fill="#bdc0c5" ${fitted(handle)}>${escapeXml(handle.text)}</text>` : ""}
    <text x="366" y="365" fill="#fff" font-size="56" font-weight="700">${hasIdentity ? "Join me on DeHub." : "You’re invited."}</text>
    <path d="M64 464H917" stroke="#56595e"/>
    <text x="64" y="531" fill="#bdc0c5" font-size="33">Your invitation</text>
    <text x="64" y="578" fill="#fff" font-weight="700" ${fitted(linkText)}>${escapeXml(linkText.text)}</text>
    <g transform="translate(958 384)">
      <rect width="178" height="178" rx="8" fill="#fff"/>
      <path d="${opts.qrPath}" transform="translate(${qrInset} ${qrInset}) scale(${qrScale})" fill="#0a0a0b" shape-rendering="crispEdges"/>
    </g>
    <text x="1047" y="600" fill="#fff" font-size="28" text-anchor="middle">Scan to join</text>
  </svg>
</svg>`;
}
