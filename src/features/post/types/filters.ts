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

export type AspectRatioOption = '1:1' | '4:5' | '16:9';

export interface CropBox {
  x: number;      // left position as percentage (0-100)
  y: number;      // top position as percentage (0-100)
  width: number;  // width as percentage (0-100)
  height: number; // height as percentage (0-100)
}

export interface CropSettings {
  rotation: number;      // 0, 90, 180, 270
  flipX: boolean;
  flipY: boolean;
  aspectRatio: AspectRatioOption;
  cropBox?: CropBox;
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
    name: 'Marlon',
    emoji: '',
    settings: { ...DEFAULT_FILTER_SETTINGS },
  },
  {
    id: 'clarendon',
    name: 'Cradled',
    emoji: '',
    settings: { brightness: 110, contrast: 120, saturation: 125, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'gingham',
    name: 'Hamging',
    emoji: '',
    settings: { brightness: 105, contrast: 90, saturation: 90, grayscale: 0, sepia: 5, hueRotate: 0, blur: 0 },
  },
  {
    id: 'moon',
    name: 'Mono',
    emoji: '',
    settings: { brightness: 110, contrast: 110, saturation: 100, grayscale: 100, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'lark',
    name: 'Karl',
    emoji: '',
    settings: { brightness: 110, contrast: 90, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'reyes',
    name: 'Seery',
    emoji: '',
    settings: { brightness: 110, contrast: 85, saturation: 75, grayscale: 0, sepia: 20, hueRotate: 0, blur: 0 },
  },
  {
    id: 'juno',
    name: 'Ujon',
    emoji: '',
    settings: { brightness: 105, contrast: 115, saturation: 140, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'slumber',
    name: 'Rumbles',
    emoji: '',
    settings: { brightness: 105, contrast: 95, saturation: 65, grayscale: 0, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'crema',
    name: 'Cream',
    emoji: '',
    settings: { brightness: 105, contrast: 95, saturation: 90, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'ludwig',
    name: 'Guilwd',
    emoji: '',
    settings: { brightness: 105, contrast: 105, saturation: 95, grayscale: 0, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'aden',
    name: 'Dean',
    emoji: '',
    settings: { brightness: 115, contrast: 90, saturation: 85, grayscale: 0, sepia: 15, hueRotate: 20, blur: 0 },
  },
  {
    id: 'perpetua',
    name: 'Reappute',
    emoji: '',
    settings: { brightness: 105, contrast: 100, saturation: 110, grayscale: 0, sepia: 0, hueRotate: -10, blur: 0 },
  },
  {
    id: 'amaro',
    name: 'Aroma',
    emoji: '',
    settings: { brightness: 110, contrast: 90, saturation: 150, grayscale: 0, sepia: 0, hueRotate: -10, blur: 0 },
  },
  {
    id: 'mayfair',
    name: 'Fyraim',
    emoji: '',
    settings: { brightness: 105, contrast: 110, saturation: 110, grayscale: 0, sepia: 5, hueRotate: 0, blur: 0 },
  },
  {
    id: 'rise',
    name: 'Sire',
    emoji: '',
    settings: { brightness: 110, contrast: 90, saturation: 90, grayscale: 0, sepia: 20, hueRotate: 0, blur: 0 },
  },
  {
    id: 'hudson',
    name: 'Shundo',
    emoji: '',
    settings: { brightness: 120, contrast: 90, saturation: 110, grayscale: 0, sepia: 0, hueRotate: -10, blur: 0 },
  },
  {
    id: 'valencia',
    name: 'Valiance',
    emoji: '',
    settings: { brightness: 108, contrast: 108, saturation: 85, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'xpro2',
    name: 'Proxii',
    emoji: '',
    settings: { brightness: 100, contrast: 130, saturation: 120, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'sierra',
    name: 'Raiser',
    emoji: '',
    settings: { brightness: 100, contrast: 90, saturation: 80, grayscale: 0, sepia: 15, hueRotate: 0, blur: 0 },
  },
  {
    id: 'willow',
    name: 'Lowwil',
    emoji: '',
    settings: { brightness: 105, contrast: 95, saturation: 5, grayscale: 80, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'lofi',
    name: 'Foil',
    emoji: '',
    settings: { brightness: 100, contrast: 150, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 0, blur: 0 },
  },
  {
    id: 'inkwell',
    name: 'Wellkin',
    emoji: '',
    settings: { brightness: 110, contrast: 110, saturation: 0, grayscale: 100, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'hefe',
    name: 'Feeh',
    emoji: '',
    settings: { brightness: 105, contrast: 100, saturation: 120, grayscale: 0, sepia: 10, hueRotate: 0, blur: 0 },
  },
  {
    id: 'nashville',
    name: 'Vanilles',
    emoji: '',
    settings: { brightness: 105, contrast: 120, saturation: 110, grayscale: 0, sepia: 20, hueRotate: -20, blur: 0 },
  },
];
