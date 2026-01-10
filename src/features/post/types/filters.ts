export interface FilterSettings {
  brightness: number;    // 0-200 (100 = normal)
  contrast: number;      // 0-200 (100 = normal)
  saturation: number;    // 0-200 (100 = normal)
  grayscale: number;     // 0-100
  sepia: number;         // 0-100
  hueRotate: number;     // -180 to 180
  blur: number;          // 0-10
}

export interface FilterPreset {
  id: string;
  name: string;
  emoji: string;
  settings: FilterSettings;
}

export type AspectRatioOption = '1:1' | '4:5' | '16:9' | 'free';

export interface CropSettings {
  rotation: number;      // 0, 90, 180, 270
  flipX: boolean;
  flipY: boolean;
  aspectRatio: AspectRatioOption;
}

export const DEFAULT_FILTER_SETTINGS: FilterSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
  blur: 0,
};

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'none',
    name: 'None',
    emoji: '✨',
    settings: { ...DEFAULT_FILTER_SETTINGS },
  },
  {
    id: 'genesis',
    name: 'Genesis',
    emoji: '🌅',
    settings: { brightness: 110, contrast: 100, saturation: 120, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'lunar',
    name: 'Lunar',
    emoji: '🌙',
    settings: { brightness: 110, contrast: 110, saturation: 100, grayscale: 100, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'vivid',
    name: 'Vivid',
    emoji: '💎',
    settings: { brightness: 105, contrast: 115, saturation: 140, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'mint',
    name: 'Mint',
    emoji: '🌿',
    settings: { brightness: 105, contrast: 100, saturation: 90, grayscale: 0, sepia: 0, hueRotate: 15, blur: 0 },
  },
  {
    id: 'alpha',
    name: 'Alpha',
    emoji: '🔥',
    settings: { brightness: 95, contrast: 140, saturation: 120, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'hodl',
    name: 'Hodl',
    emoji: '💰',
    settings: { brightness: 110, contrast: 100, saturation: 110, grayscale: 0, sepia: 25, hueRotate: 0, blur: 0 },
  },
  {
    id: 'whale',
    name: 'Whale',
    emoji: '🐋',
    settings: { brightness: 105, contrast: 100, saturation: 90, grayscale: 0, sepia: 0, hueRotate: -20, blur: 0 },
  },
  {
    id: 'degen',
    name: 'Degen',
    emoji: '🎰',
    settings: { brightness: 100, contrast: 130, saturation: 150, grayscale: 0, sepia: 0, hueRotate: 10, blur: 0 },
  },
  {
    id: 'diamond',
    name: 'Diamond',
    emoji: '💠',
    settings: { brightness: 110, contrast: 120, saturation: 95, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    emoji: '🌇',
    settings: { brightness: 110, contrast: 100, saturation: 120, grayscale: 0, sepia: 10, hueRotate: -15, blur: 0 },
  },
  {
    id: 'noir',
    name: 'Noir',
    emoji: '🖤',
    settings: { brightness: 105, contrast: 125, saturation: 100, grayscale: 100, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'haze',
    name: 'Haze',
    emoji: '🌫️',
    settings: { brightness: 115, contrast: 85, saturation: 75, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'aura',
    name: 'Aura',
    emoji: '🔮',
    settings: { brightness: 105, contrast: 100, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 30, blur: 0 },
  },
  {
    id: 'retro',
    name: 'Retro',
    emoji: '📼',
    settings: { brightness: 110, contrast: 90, saturation: 80, grayscale: 0, sepia: 20, hueRotate: 0, blur: 0 },
  },
  {
    id: 'neon',
    name: 'Neon',
    emoji: '💜',
    settings: { brightness: 110, contrast: 120, saturation: 160, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'frost',
    name: 'Frost',
    emoji: '❄️',
    settings: { brightness: 115, contrast: 100, saturation: 85, grayscale: 0, sepia: 0, hueRotate: -30, blur: 0 },
  },
  {
    id: 'ember',
    name: 'Ember',
    emoji: '🔶',
    settings: { brightness: 100, contrast: 100, saturation: 130, grayscale: 0, sepia: 15, hueRotate: -25, blur: 0 },
  },
  {
    id: 'stealth',
    name: 'Stealth',
    emoji: '🥷',
    settings: { brightness: 90, contrast: 110, saturation: 70, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'pop',
    name: 'Pop',
    emoji: '🎨',
    settings: { brightness: 110, contrast: 110, saturation: 135, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
];
