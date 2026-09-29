/**
 * Farcaster compatibility for the mini app host.
 * ==============================================
 * An app built for Farcaster talks to its host through
 * `@farcaster/miniapp-sdk`, over Comlink on postMessage. This answers that
 * protocol with Farcaster's own host library, mapped onto what DeHub can do,
 * so a Farcaster mini app runs here unchanged: its splash clears on ready(),
 * composeCast opens the DeHub composer, openUrl and close work.
 *
 * What cannot map, and what it does instead:
 *
 *   - Identity. DeHub users are not Farcaster users and have no FID, and the
 *     SDK's `user.fid` is required. We hand over a NEGATIVE number derived
 *     from the wallet: stable per user, and never a real FID, so an app can
 *     neither collide two users nor mistake ours for somebody on Farcaster.
 *     Context is unauthenticated in Farcaster too; apps must not trust it.
 *   - Sign In with Farcaster / Quick Auth need a Farcaster custody key, which
 *     we do not hold. signIn is rejected as if the user declined, which every
 *     app already handles. Apps that want identity use `dehub.auth.getToken()`.
 *   - Wallet, tokens, notifications: not in this phase. They reject cleanly.
 *
 * Runs beside host-bridge.ts on the same frame; the two protocols never
 * overlap (ours is namespaced, Comlink's is not), and both are held to the
 * app's origin.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { AddMiniApp, SignIn, exposeToIframe } from '@farcaster/miniapp-host';
import type { MiniAppHost, MiniAppHostCapability } from '@farcaster/miniapp-host';
import { cleanEmbedUrl, cleanExternalUrl, composeText, syntheticFid, type MiniAppContext } from './protocol';

const CAPABILITIES: MiniAppHostCapability[] = [
  'actions.ready',
  'actions.openUrl',
  'actions.close',
  'actions.composeCast',
  'actions.viewProfile',
  'actions.viewCast',
  'actions.openMiniApp',
  'haptics.impactOccurred',
  'haptics.notificationOccurred',
  'haptics.selectionChanged',
];

export interface FarcasterHostOptions {
  appUrl: URL | null;
  context: MiniAppContext;
  onReady: () => void;
  onClose: () => void;
  onCompose: (text: string) => void;
}

const unsupported = () => {
  throw new Error('Not supported on DeHub yet.');
};

export function useFarcasterHost(frame: RefObject<HTMLIFrameElement>, options: FarcasterHostOptions): void {
  const opts = useRef(options);
  opts.current = options;
  const origin = options.appUrl?.origin ?? null;
  const host = options.appUrl?.hostname ?? null;
  // The host library copies the handlers once, so context is a value, not a
  // getter: re-expose when the person in it changes (sign in, sign out).
  const who = options.context.user?.wallet ?? '';

  useEffect(() => {
    const iframe = frame.current;
    if (!iframe || !origin || !host) return;
    const vibrate = () => {
      navigator.vibrate?.(10);
    };

    const sdk = {
      context: (() => {
        const c = opts.current.context;
        return {
          user: c.user
            ? {
                fid: syntheticFid(c.user.wallet),
                username: c.user.handle ?? undefined,
                displayName: c.user.displayName ?? undefined,
                pfpUrl: c.user.avatarUrl ?? undefined,
              }
            : { fid: 0 },
          client: {
            platformType: 'web' as const,
            clientFid: 0,
            added: false,
            safeAreaInsets: c.client.safeAreaInsets,
          },
          location: { type: 'launcher' as const },
          features: { haptics: false, cameraAndMicrophoneAccess: false },
        };
      })(),
      ready: async () => {
        opts.current.onReady();
      },
      close: () => opts.current.onClose(),
      openUrl: (url: string) => {
        const safe = cleanExternalUrl(url);
        if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
      },
      composeCast: async (o: { text?: string; embeds?: string[] }) => {
        const embed = (o.embeds ?? []).map((e) => cleanEmbedUrl(e, host)).find(Boolean);
        opts.current.onCompose(composeText({ text: o.text, embedUrl: embed ?? undefined }, host));
        return { cast: null };
      },
      viewProfile: async ({ fid }: { fid: number }) => {
        if (Number.isInteger(fid) && fid > 0) window.open(`https://farcaster.xyz/~/profiles/${fid}`, '_blank', 'noopener,noreferrer');
      },
      viewCast: async ({ hash }: { hash: string }) => {
        if (/^0x[0-9a-f]{8,64}$/i.test(hash)) window.open(`https://farcaster.xyz/~/conversations/${hash}`, '_blank', 'noopener,noreferrer');
      },
      openMiniApp: async ({ url }: { url: string }) => {
        const safe = cleanExternalUrl(url);
        if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
      },
      signIn: async () => {
        throw new SignIn.RejectedByUser();
      },
      addFrame: async () => {
        throw new AddMiniApp.RejectedByUser();
      },
      addMiniApp: async () => {
        throw new AddMiniApp.RejectedByUser();
      },
      impactOccurred: async () => vibrate(),
      notificationOccurred: async () => vibrate(),
      selectionChanged: async () => vibrate(),
      getCapabilities: async () => CAPABILITIES,
      getChains: async () => [],
      setPrimaryButton: () => {},
      updateBackState: async () => {},
      eip6963RequestProvider: () => {},
      ethProviderRequest: unsupported,
      signManifest: unsupported,
      viewToken: unsupported,
      sendToken: unsupported,
      swapToken: unsupported,
      requestCameraAndMicrophoneAccess: unsupported,
    } as unknown as Omit<MiniAppHost, 'ethProviderRequestV2'>;

    const { cleanup } = exposeToIframe({ iframe, sdk, miniAppOrigin: origin });
    return cleanup;
  }, [frame, origin, host, who]);
}
