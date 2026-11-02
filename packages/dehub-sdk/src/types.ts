/** The signed-in DeHub person, or null when they are signed out. */
export interface DehubUser {
  wallet: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface DehubContext {
  user: DehubUser | null;
  /** Where the app was opened from, e.g. a post or the store. */
  location: Record<string, unknown> | null;
  client: {
    platform: 'web' | 'mobile';
    /** True once the person added your app (they can get your notifications). */
    added: boolean;
    locale?: string;
    theme?: string;
    safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
  };
}

export interface AuthToken {
  /** ES256 JWT: iss https://dehub.io, sub = wallet, aud = your domain. Verify it on your server. */
  token: string;
  /** Milliseconds since epoch. */
  expiresAt: number;
}

export interface ComposePostOptions {
  text?: string;
  /** A link back into your app; it unfurls as your app's card. */
  embedUrl?: string;
}

export interface PayOptions {
  /** DHB to send, paid straight to the wallet that signed your dehub.json. */
  amount: number;
  /** Shown to the person and included in the receipt. Up to 140 characters. */
  memo?: string;
}

export interface PayResult {
  txHash: string;
  chainId: number;
  amount: number;
  /** JWT, typ "payment". Send it to your server and verify it there. */
  receipt: string;
  /** True in test mode (you paying your own app): nothing moved on chain. */
  test?: boolean;
}

export type HapticStyle = 'light' | 'medium' | 'heavy';
