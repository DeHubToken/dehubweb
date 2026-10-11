export type PageBugContext = { page: string; capturedAt: string; device: string; viewport: string; model: string; userAgent: string };

export function pageBugContext(): PageBugContext {
  return {
    // Query strings and hashes can contain messages, searches or login tokens.
    page: `${window.location.origin}${window.location.pathname}`,
    capturedAt: new Date().toISOString(),
    device: navigator.platform || 'Unknown',
    viewport: `${window.innerWidth} × ${window.innerHeight} @${window.devicePixelRatio}`,
    model: 'Not exposed by browser',
    userAgent: navigator.userAgent,
  };
}

export async function enrichPageBugContext(context: PageBugContext): Promise<PageBugContext> {
  type Hints = { getHighEntropyValues: (keys: string[]) => Promise<{ model?: string; platform?: string; platformVersion?: string }> };
  const hints = (navigator as Navigator & { userAgentData?: Hints }).userAgentData;
  try {
    const values = await hints?.getHighEntropyValues(['model', 'platformVersion']);
    return { ...context, model: values?.model || context.model, device: values?.platform ? `${values.platform} ${values.platformVersion || ''}`.trim() : context.device };
  } catch { return context; }
}

export function describePageBug(message: string, context: PageBugContext) {
  return `${message.trim()}\n\nPage: ${context.page}\nReported: ${context.capturedAt}\nDevice / OS: ${context.device}\nModel: ${context.model}\nViewport: ${context.viewport}\nBrowser: ${context.userAgent}`;
}

export async function captureBugScreenshot(): Promise<File | null> {
  // Never automatically publish private conversations, wallet or account screens.
  if (/\/(settings|wallet|dm|chat|messages|assistant|auth|login)(\/|$)/i.test(location.pathname)) return null;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(document.body, {
      width: window.innerWidth, height: window.innerHeight,
      x: window.scrollX, y: window.scrollY,
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      useCORS: true, allowTaint: false, logging: false, imageTimeout: 3000,
      ignoreElements: element => element.matches('[data-quick-actions-ui],[data-vaul-overlay],[data-overlay-content],[data-ai-chat],[role="dialog"],[role="alertdialog"],input,textarea,[contenteditable="true"],[data-private],[data-html2canvas-ignore],iframe'),
    });
    return await new Promise(resolve => canvas.toBlob(blob => resolve(blob ? new File([blob], 'page-screenshot.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.75));
  } catch { return null; }
}
