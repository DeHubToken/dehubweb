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
    id: 'normal',
    name: 'Normal',
    emoji: '',
    settings: { ...DEFAULT_FILTER_SETTINGS },
  },
  {
    id: 'clarendon',
    name: 'Clarendon',
    emoji: '',
    settings: { brightness: 110, contrast: 120, saturation: 125, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'gingham',
    name: 'Gingham',
    emoji: '',
    settings: { brightness: 105, contrast: 90, saturation: 90, grayscale: 0, sepia: 5, hueRotate: 0, blur: 0 },
  },
  {
    id: 'moon',
    name: 'Moon',
    emoji: '',
    settings: { brightness: 110, contrast: 110, saturation: 100, grayscale: 100, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'lark',
    name: 'Lark',
    emoji: '',
    settings: { brightness: 110, contrast: 90, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'reyes',
    name: 'Reyes',
    emoji: '',
    settings: { brightness: 110, contrast: 85, saturation: 75, grayscale: 0, sepia: 20, hueRotate: 0, blur: 0 },
  },
  {
    id: 'juno',
    name: 'Juno',
    emoji: '',
    settings: { brightness: 105, contrast: 115, saturation: 140, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'slumber',
    name: 'Slumber',
    emoji: '',
    settings: { brightness: 105, contrast: 95, saturation: 65, grayscale: 0, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'crema',
    name: 'Crema',
    emoji: '',
    settings: { brightness: 105, contrast: 95, saturation: 90, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'ludwig',
    name: 'Ludwig',
    emoji: '',
    settings: { brightness: 105, contrast: 105, saturation: 95, grayscale: 0, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'aden',
    name: 'Aden',
    emoji: '',
    settings: { brightness: 115, contrast: 90, saturation: 85, grayscale: 0, sepia: 15, hueRotate: 20, blur: 0 },
  },
  {
    id: 'perpetua',
    name: 'Perpetua',
    emoji: '',
    settings: { brightness: 105, contrast: 100, saturation: 110, grayscale: 0, sepia: 0, hueRotate: -10, blur: 0 },
  },
  {
    id: 'amaro',
    name: 'Amaro',
    emoji: '',
    settings: { brightness: 110, contrast: 90, saturation: 150, grayscale: 0, sepia: 0, hueRotate: -10, blur: 0 },
  },
  {
    id: 'mayfair',
    name: 'Mayfair',
    emoji: '',
    settings: { brightness: 105, contrast: 110, saturation: 110, grayscale: 0, sepia: 5, hueRotate: 0, blur: 0 },
  },
  {
    id: 'rise',
    name: 'Rise',
    emoji: '',
    settings: { brightness: 110, contrast: 90, saturation: 90, grayscale: 0, sepia: 20, hueRotate: 0, blur: 0 },
  },
  {
    id: 'hudson',
    name: 'Hudson',
    emoji: '',
    settings: { brightness: 120, contrast: 90, saturation: 110, grayscale: 0, sepia: 0, hueRotate: -10, blur: 0 },
  },
  {
    id: 'valencia',
    name: 'Valencia',
    emoji: '',
    settings: { brightness: 108, contrast: 108, saturation: 85, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'xpro2',
    name: 'X-Pro II',
    emoji: '',
    settings: { brightness: 100, contrast: 130, saturation: 120, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'sierra',
    name: 'Sierra',
    emoji: '',
    settings: { brightness: 100, contrast: 90, saturation: 80, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'willow',
    name: 'Willow',
    emoji: '',
    settings: { brightness: 105, contrast: 95, saturation: 5, grayscale: 80, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'lofi',
    name: 'Lo-Fi',
    emoji: '',
    settings: { brightness: 100, contrast: 150, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'inkwell',
    name: 'Inkwell',
    emoji: '',
    settings: { brightness: 110, contrast: 110, saturation: 0, grayscale: 100, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'hefe',
    name: 'Hefe',
    emoji: '',
    settings: { brightness: 105, contrast: 100, saturation: 120, grayscale: 0, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'nashville',
    name: 'Nashville',
    emoji: '',
    settings: { brightness: 105, contrast: 120, saturation: 110, grayscale: 0, sepia: 20, hueRotate: -20, blur: 0 },
  },
];
