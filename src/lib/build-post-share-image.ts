/**
 * buildPostShareImage
 * ===================
 * Draws a 1200×630 share card using the Canvas 2D API.
 * No html2canvas, no DOM capture, no CORS issues.
 */

interface PostShareImageOptions {
  authorName: string;
  authorHandle?: string;
  authorAvatarUrl?: string;
  title?: string;
  content?: string;
  postId: string;
}

/** Word-wrap text to fit within maxWidth, returns array of lines. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  // Split on newlines first
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Load an Image element, resolve with the element or null on failure. */
function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function buildPostShareImage(opts: PostShareImageOptions): Promise<Blob> {
  const W = 1200, H = 630;
  const PAD = 72;
  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Background ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);

  // Subtle top gradient accent
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, 'transparent');
  topGrad.addColorStop(0.5, '#27272a');
  topGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 1);

  // ── DeHub logo (top-left) ────────────────────────────────────────────────────
  const logo = await loadImage('/dehub-header-logo.png');
  if (logo) {
    const logoH = 26;
    const logoW = logoH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, PAD, PAD, logoW, logoH);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText('DeHub', PAD, PAD + 20);
  }

  // ── "dehub.app" label (top-right) ────────────────────────────────────────────
  ctx.fillStyle = '#52525b';
  ctx.font = `500 22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('dehub.app', W - PAD, PAD + 20);
  ctx.textAlign = 'left';

  // ── Avatar ───────────────────────────────────────────────────────────────────
  const AV_Y = PAD + 70;
  const AV_R = 34;
  const AV_CX = PAD + AV_R;
  const AV_CY = AV_Y + AV_R;

  ctx.fillStyle = '#3f3f46';
  ctx.beginPath();
  ctx.arc(AV_CX, AV_CY, AV_R, 0, Math.PI * 2);
  ctx.fill();

  const avatarImg = opts.authorAvatarUrl
    ? await loadImage(opts.authorAvatarUrl, true)
    : null;

  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(AV_CX, AV_CY, AV_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, AV_CX - AV_R, AV_CY - AV_R, AV_R * 2, AV_R * 2);
    ctx.restore();
  } else {
    // Initials fallback
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `600 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.authorName.slice(0, 1).toUpperCase(), AV_CX, AV_CY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Author name + handle ─────────────────────────────────────────────────────
  const TEXT_X = AV_CX + AV_R + 18;
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(opts.authorName, TEXT_X, AV_CY - 4);

  if (opts.authorHandle) {
    const handle = opts.authorHandle.startsWith('@') ? opts.authorHandle : `@${opts.authorHandle}`;
    ctx.fillStyle = '#71717a';
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText(handle, TEXT_X, AV_CY + 22);
  }

  // ── Divider ──────────────────────────────────────────────────────────────────
  const DIV_Y = AV_CY + AV_R + 28;
  ctx.strokeStyle = '#27272a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, DIV_Y);
  ctx.lineTo(W - PAD, DIV_Y);
  ctx.stroke();

  // ── Post content ─────────────────────────────────────────────────────────────
  let contentY = DIV_Y + 44;
  const maxContentBottom = H - PAD - 44; // leave room for footer

  if (opts.title) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 30px ${FONT}`;
    const titleLines = wrapText(ctx, opts.title, W - PAD * 2).slice(0, 2);
    for (const line of titleLines) {
      if (contentY + 36 > maxContentBottom) break;
      ctx.fillText(line, PAD, contentY);
      contentY += 40;
    }
    contentY += 8;
  }

  if (opts.content) {
    ctx.fillStyle = '#d4d4d8';
    ctx.font = `400 24px ${FONT}`;
    const lineH = 36;
    const maxLines = Math.floor((maxContentBottom - contentY) / lineH);
    const lines = wrapText(ctx, opts.content, W - PAD * 2);
    const display = lines.slice(0, maxLines);
    if (lines.length > maxLines && display.length > 0) {
      display[display.length - 1] = display[display.length - 1].replace(/\s*\S+$/, '…');
    }
    for (const line of display) {
      ctx.fillText(line, PAD, contentY);
      contentY += lineH;
    }
  }

  // ── Footer: post URL ─────────────────────────────────────────────────────────
  ctx.fillStyle = '#3f3f46';
  ctx.font = `400 18px ${FONT}`;
  ctx.fillText(`dehub.app/app/post/${opts.postId}`, PAD, H - PAD + 4);

  // DeHub icon bottom-right
  const icon = await loadImage('/dehub-icon.png');
  if (icon) {
    ctx.globalAlpha = 0.25;
    ctx.drawImage(icon, W - PAD - 28, H - PAD - 22, 28, 28);
    ctx.globalAlpha = 1;
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('canvas.toBlob returned null');
  return blob;
}
