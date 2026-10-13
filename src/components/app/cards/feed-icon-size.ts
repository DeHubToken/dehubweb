// Match the visible silhouettes, accounting for each 32-unit icon's padding.
export const FEED_ICON_SIZE = {
  like: 23.76, comment: 24.64, share: 21.12, bookmark: 23.76, info: 23.76, tip: 23.76, pin: 21.12,
} as const;
export const FEED_ICON_CLASS = {
  like: 'w-[23.76px] h-[23.76px] shrink-0',
  comment: 'w-[24.64px] h-[24.64px] shrink-0',
  share: 'w-[21.12px] h-[21.12px] shrink-0',
  bookmark: 'w-[23.76px] h-[23.76px] shrink-0 scale-x-[1.12]',
  info: 'w-[23.76px] h-[23.76px] shrink-0',
  tip: 'w-[23.76px] h-[23.76px] shrink-0',
  pin: 'w-[21.12px] h-[21.12px] shrink-0',
} as const;

export const COMMENT_ICON_CLASS = {
  like: 'w-[18px] h-[18px] shrink-0',
  comment: 'w-[18.67px] h-[18.67px] shrink-0',
  share: 'w-4 h-4 shrink-0',
  tip: 'w-[18px] h-[18px] shrink-0',
} as const;
