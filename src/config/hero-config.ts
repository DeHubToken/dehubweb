// Hero configuration - centralized config for buzzwords, colors, and timings

export const BUZZWORDS = [
  'DECENTRALIZED MEDIA',
  'CENSORSHIP-RESISTANCE',
  'USER OWNED',
  'FREE SPEECH',
  'DATA OWNERSHIP',
  'INSTANT PAYOUTS',
  'PPV',
  'W2E',
  'COMMUNITY FIRST',
  'DEPIN',
  'WEB3',
  'NFT',
  'REVENUE SHARE',
  'HODL',
  'STAKE',
  'NO KYC',
  'LIBERTY',
  'CENSORSHIP RESISTANT',
  'SOCIALFI',
  'PLAY2EARN',
  'P2E',
  'P2P',
  'PEER TO PEER',
  'NON CUSTODIAL',
  'DAO',
  'DEFI',
  'LIVESTREAM',
  'ENCRYPTED',
  'PRIVATE',
  'FTV',
  'FUTUROV',
  'OPEN SOURCE',
  'MCA',
  'MCP',
  'AI',
  'OAK SHORE',
  'LCS',
  'BUZZWORDS',
  'RESISTANCE',
  'FREEDOM',
  'HUMANITY'
];

export const FEATURED_BUZZWORDS = [
  'DECENTRALIZED MEDIA',
  'FREE SPEECH',
  'WEB3',
  'DEPIN',
  'SOCIALFI',
  'AIRDROPS',
  'W2E',
  'HODL'
];

export const SOCIAL_LINKS = [
  { icon: "send", url: "https://t.me/dehub_dhb", label: "Telegram" },
  { icon: "music", url: "https://tiktok.com/@dehub_official", label: "TikTok" },
  { icon: "instagram", url: "https://instagram.com/dehub_official", label: "Instagram" },
  { icon: "twitter", url: "https://x.com/dehub_official", label: "Twitter" },
  { icon: "scroll", url: "https://dehub.io/docs", label: "Documentation" },
];

// Animation timings
export const TIMING = {
  GLITCH_INTERVAL: 5000,
  GLITCH_DURATION: 300,
  BUZZWORD_LOAD_DELAY: 4200,
  BUZZWORD_STAGGER: 80,
  SHOOTING_STAR_INTERVAL: 8,
  SHOOTING_STAR_DURATION: 0.7,
};

// Glitch characters for text corruption
export const GLITCH_CHARS = ['█', '▓', '▒', '░', '@', '#', '$', '%', '&', '0', '1'];

// Nebula configuration
export const NEBULA_CONFIG = {
  PARTICLE_COUNT: 20000,
  PARTICLE_SIZE: 0.02,
  SPREAD: 20,
  MIN_DISTANCE_FROM_CENTER: 3,
};

// Shooting star configuration
export const SHOOTING_STAR_CONFIG = {
  COUNT: 5,
  TAIL_POINT_COUNT: 25,
  MIN_STARS_PER_EVENT: 3,
  MAX_STARS_PER_EVENT: 5,
};

// Artifact configuration
export const ARTIFACT_CONFIG = {
  RADIUS: 1.875,
  DETAIL: 20,
  LOGO_SIZE: 0.75,
  LOGO_OPACITY: 0.5,
};
