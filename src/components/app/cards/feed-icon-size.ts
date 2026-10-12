// Match the visible silhouettes, accounting for each 32-unit icon's padding.
export const FEED_ICON_SIZE = {
  like: 27, comment: 28, share: 24, bookmark: 27, info: 27, tip: 27, pin: 24,
} as const;
export const FEED_ICON_CLASS = {
  like: 'w-[27px] h-[27px] shrink-0',
  comment: 'w-[28px] h-[28px] shrink-0',
  share: 'w-[24px] h-[24px] shrink-0',
  bookmark: 'w-[27px] h-[27px] shrink-0',
  info: 'w-[27px] h-[27px] shrink-0',
  tip: 'w-[27px] h-[27px] shrink-0',
  pin: 'w-[24px] h-[24px] shrink-0',
} as const;
