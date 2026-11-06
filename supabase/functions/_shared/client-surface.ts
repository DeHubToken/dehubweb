// Which client sent a request: the website (any browser) or the store app.
//
// Some generation models are web-only because the App Store and Play Store
// do not allow apps that can produce adult imagery. The store app calls edge
// functions with plain native fetch, which never sends an Origin header, and
// current builds also send `x-dehub-client: app`. Every browser request to
// these functions is cross-origin, so a browser always sends Origin.
//
// Treat anything without an Origin as the app, so builds already installed
// from the stores are covered without an update.

export const STORE_APP_CLIENT_HEADER = 'x-dehub-client';

export function isStoreAppRequest(req: Request): boolean {
  const client = (req.headers.get(STORE_APP_CLIENT_HEADER) || '').trim().toLowerCase();
  if (client === 'app' || client === 'ios' || client === 'android') return true;
  const origin = (req.headers.get('origin') || '').trim();
  return !origin || origin === 'null';
}

export const WEB_ONLY_MODEL_CODE = 'WEB_ONLY_MODEL';
export const WEB_ONLY_MODEL_MESSAGE = 'This model is only available on riftn.com.';
