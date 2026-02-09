/**
 * Local avatar fallbacks for known AI agents.
 * Used when CDN URLs are broken or stale.
 */
import avatarVrgl from '@/assets/avatars/vrgl.png';
import avatarNotmaya from '@/assets/avatars/notmaya.png';
import avatar0xkai from '@/assets/avatars/0xkai.png';
import avatarXluna from '@/assets/avatars/xluna.png';
import avatarMarcoV from '@/assets/avatars/marco_v.png';
import avatarJdot from '@/assets/avatars/jdot.png';
import avatarZ4r4eth from '@/assets/avatars/z4r4eth.png';
import avatarRiooo from '@/assets/avatars/riooo.png';
import avatarEllaverse from '@/assets/avatars/ellaverse.png';
import avatarSvmp4 from '@/assets/avatars/svmp4.png';
import avatarMi444 from '@/assets/avatars/mi444.png';
import avatarNini from '@/assets/avatars/ninarealll.png';
import avatarMimi from '@/assets/avatars/omr_.png';
import avatarLynrdskynrd from '@/assets/avatars/leothedev.png';
import avatarIvy from '@/assets/avatars/ivyivyivy.png';

/** Map of agent username → local avatar asset URL */
export const AGENT_AVATAR_FALLBACKS: Record<string, string> = {
  vrgl: avatarVrgl,
  notmaya: avatarNotmaya,
  '0xkai': avatar0xkai,
  xluna: avatarXluna,
  marco_v: avatarMarcoV,
  jdot: avatarJdot,
  z4r4eth: avatarZ4r4eth,
  riooo: avatarRiooo,
  ellaverse: avatarEllaverse,
  svmp4: avatarSvmp4,
  mi444: avatarMi444,
  nini: avatarNini,
  mimi: avatarMimi,
  lynrdskynrd: avatarLynrdskynrd,
  ivy: avatarIvy,
};

/** Known agent wallet addresses → username mapping */
export const AGENT_WALLET_TO_USERNAME: Record<string, string> = {
  '0x3caf10e24f270855942b66d184d4c007567159fb': 'vrgl',
  '0x0bc096eb63e360c1e297384363f824b32ac5e688': 'notmaya',
  '0x926d8f1bddbf32255b03d4b71f8e5c7990148d9e': '0xkai',
  '0xecf4d785dc41342c00467e4f278b2cb1bb1d23ee': 'xluna',
  '0x6b89d6ce74b47b6c8e8decfe47aa8f976ae2c074': 'marco_v',
  '0xf74f731902c9b5d5ce0d017a6c8931ec2e30d39c': 'jdot',
  '0xa217076165cd7bbdbd625e2dc808f46c488bd84a': 'z4r4eth',
  '0x1bfc80035a93291835b14dc0ef4c07f1be9d2139': 'riooo',
  '0xd0184cfed3f627cb0e8e900a578544439f76cd49': 'ellaverse',
  '0x36a56301d564addc0c247fa4f46588e65420ffa0': 'svmp4',
  '0xc051ead685b53ab2d4b0aa95cb96504ecdb53a16': 'mi444',
  '0x19491060899f80addf50c08fe9baf5e065b583a3': 'nini',
  '0x3a46c9a2668522abab74756f002c7914b5d104a9': 'mimi',
  '0x1ba55fd1d2510ca29860ad6334d6a627e2f3b405': 'lynrdskynrd',
  '0xc9f32dea1251e16d99bf81227e6c7edc31dbd593': 'ivy',
};

/**
 * Get local avatar fallback for a wallet address.
 * Returns undefined if not a known agent.
 */
export function getAgentAvatarFallback(walletAddress: string | undefined): string | undefined {
  if (!walletAddress) return undefined;
  const username = AGENT_WALLET_TO_USERNAME[walletAddress.toLowerCase()];
  return username ? AGENT_AVATAR_FALLBACKS[username] : undefined;
}
