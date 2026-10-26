/**
 * Scenes: the handful of layouts a stream moves between, one click each.
 *
 * Two kinds. A CARD scene covers the picture with a full-frame card —
 * "Starting soon" with a countdown, "Be right back", "Thanks for watching" —
 * and can mute the mic, so a creator who steps away is not broadcasting the
 * room. A LIVE scene puts a capture layout on air: the camera alone ("Just
 * chatting") or a screen share with the camera in the corner ("Gameplay").
 *
 * The creator's own wording, colour and picture for each card are remembered
 * per browser: a scene set up once should still be there next stream.
 */
import type { ProgramCard } from './program';

export type SceneId = 'starting' | 'chatting' | 'gameplay' | 'brb' | 'ending';
export const SCENE_IDS: readonly SceneId[] = ['starting', 'chatting', 'gameplay', 'brb', 'ending'];

export type SceneLayout = 'camera' | 'screen-bubble';

export interface SceneDef {
  id: SceneId;
  kind: 'card' | 'live';
  layout?: SceneLayout;
  /** Card scenes that mute the mic while they are up. */
  muteMic?: boolean;
  /** Minutes the "Starting soon" countdown runs, 0 for none. */
  countdownMinutes?: number;
}

export const SCENES: Record<SceneId, SceneDef> = {
  starting: { id: 'starting', kind: 'card', muteMic: true, countdownMinutes: 5 },
  chatting: { id: 'chatting', kind: 'live', layout: 'camera' },
  gameplay: { id: 'gameplay', kind: 'live', layout: 'screen-bubble' },
  brb: { id: 'brb', kind: 'card', muteMic: true },
  ending: { id: 'ending', kind: 'card', muteMic: false },
};

/** What the creator changed about a card scene. Missing fields use the defaults. */
export interface SceneCustom {
  title?: string;
  subtitle?: string;
  background?: string;
  /** A data: URL, kept small enough for localStorage. */
  image?: string | null;
  countdownMinutes?: number;
  muteMic?: boolean;
}

export const SCENE_BACKGROUNDS = ['#0b0b0f', '#1e1b4b', '#3b0764', '#052e16', '#7c2d12', '#0c4a6e'];
export const MAX_SCENE_IMAGE_BYTES = 1_500_000;

const STORAGE_KEY = 'dehub.studio.scenes.v1';

export function loadSceneCustoms(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Partial<Record<SceneId, SceneCustom>> {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<Record<SceneId, SceneCustom>> = {};
    for (const id of SCENE_IDS) {
      const c = parsed[id];
      if (c && typeof c === 'object') out[id] = sanitizeCustom(c);
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSceneCustoms(
  customs: Partial<Record<SceneId, SceneCustom>>,
  storage: Pick<Storage, 'setItem'> | null = safeStorage(),
): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(customs));
    return true;
  } catch {
    // Full storage: the picture is the big part, so the caller can retry without it.
    return false;
  }
}

function sanitizeCustom(c: Record<string, unknown>): SceneCustom {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const image = typeof c.image === 'string' && c.image.startsWith('data:image/') ? c.image : null;
  const minutes = Number(c.countdownMinutes);
  return {
    title: str(c.title, 60),
    subtitle: str(c.subtitle, 120),
    background: typeof c.background === 'string' && /^#[0-9a-f]{6}$/i.test(c.background) ? c.background : undefined,
    image,
    countdownMinutes: Number.isFinite(minutes) ? Math.min(60, Math.max(0, Math.round(minutes))) : undefined,
    muteMic: typeof c.muteMic === 'boolean' ? c.muteMic : undefined,
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Whether the scene mutes the mic, after the creator's override. */
export function sceneMutesMic(id: SceneId, custom?: SceneCustom): boolean {
  const def = SCENES[id];
  if (def.kind !== 'card') return false;
  return custom?.muteMic ?? Boolean(def.muteMic);
}

/**
 * The card a scene puts on air. `defaults` carries the translated default
 * wording so this stays free of i18n; `startedAt` anchors the countdown to
 * when the scene went up.
 */
export function cardForScene(
  id: SceneId,
  custom: SceneCustom | undefined,
  defaults: { title: string; subtitle?: string },
  image: CanvasImageSource | null,
  startedAt: number,
): ProgramCard | null {
  const def = SCENES[id];
  if (def.kind !== 'card') return null;
  const minutes = custom?.countdownMinutes ?? def.countdownMinutes ?? 0;
  return {
    title: custom?.title?.trim() || defaults.title,
    subtitle: custom?.subtitle?.trim() || defaults.subtitle,
    background: custom?.background || SCENE_BACKGROUNDS[0],
    image,
    countdownTo: minutes > 0 ? startedAt + minutes * 60_000 : null,
  };
}
