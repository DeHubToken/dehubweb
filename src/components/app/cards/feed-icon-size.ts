// Match the visible silhouettes, accounting for each 32-unit icon's padding.
export const FEED_ICON_SIZE = {
  like: 23.76, comment: 24.64, share: 21.12, bookmark: 23.76, info: 23.76, tip: 23.76, pin: 21.12,
} as const;
export const FEED_ICON_CLASS = {
  like: 'w-[23.76px] h-[23.76px] shrink-0',
  comment: 'w-[24.64px] h-[24.64px] shrink-0',
  share: 'w-[21.12px] h-[21.12px] shrink-0',
  bookmark: 'w-[23.76px] h-[23.76px] shrink-0',
  info: 'w-[23.76px] h-[23.76px] shrink-0',
  tip: 'w-[23.76px] h-[23.76px] shrink-0',
  pin: 'w-[21.12px] h-[21.12px] shrink-0',
} as const;
