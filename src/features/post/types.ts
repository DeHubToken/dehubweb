import type { FilterSettings, CropSettings } from './types/filters';

export interface AudioFile {
  blob: Blob;
  url: string;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  originalDuration?: number;
}

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
}

export interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'audio';
  duration?: number;
  audio?: AudioFile;
  isMusicVideo?: boolean;
  /** Display URL for thumbnail (blob URL or external) */
  thumbnail?: string;
  /** Blob for uploading thumbnail to backend */
  thumbnailBlob?: Blob;
  /** Whether the thumbnail was auto-generated (vs custom uploaded) */
  isAutoThumbnail?: boolean;
  filterSettings?: FilterSettings;
  filterPresetId?: string;
  cropSettings?: CropSettings;
  trimStart?: number;
  trimEnd?: number;
}

export type Currency = 'USD' | 'DHB';

export type LiveMode = 'video' | 'townhall' | null;

export interface PostFormState {
  text: string;
  description: string;
  showDescription: boolean;
  media: MediaFile[];
  isSubscribersOnly: boolean;
  isPPV: boolean;
  ppvAmount: string;
  ppvCurrency: Currency;
  isWatch2Earn: boolean;
  w2eViews: string;
  w2eComments: string;
  w2eTotal: string;
  w2eCurrency: Currency;
  isTokenGated: boolean;
  tokenContract: string;
  tokenAmount: string;
  liveMode: LiveMode;
  isEnhancing: boolean;
  isPosting: boolean;
  
}

export interface PostFormActions {
  setText: (text: string) => void;
  setDescription: (description: string) => void;
  setShowDescription: (show: boolean) => void;
  setMedia: React.Dispatch<React.SetStateAction<MediaFile[]>>;
  setIsSubscribersOnly: (value: boolean) => void;
  setIsPPV: (value: boolean) => void;
  setPpvAmount: (value: string) => void;
  setPpvCurrency: (value: Currency) => void;
  setIsWatch2Earn: (value: boolean) => void;
  setW2eViews: (value: string) => void;
  setW2eComments: (value: string) => void;
  setW2eTotal: (value: string) => void;
  setW2eCurrency: (value: Currency) => void;
  setIsTokenGated: (value: boolean) => void;
  setTokenContract: (value: string) => void;
  setTokenAmount: (value: string) => void;
  setLiveMode: (value: LiveMode) => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleAudioSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleFileDrop: (files: FileList) => void;
  removeMedia: (index: number) => void;
  addAudioToMedia: (index: number, audio: AudioFile) => void;
  removeAudioFromMedia: (index: number) => void;
  toggleMusicVideo: (index: number) => void;
  addThumbnailToMedia: (index: number, thumbnailUrl: string) => Promise<void>;
  removeThumbnailFromMedia: (index: number) => void;
  applyFilterToMedia: (index: number, settings: FilterSettings, presetId?: string) => void;
  clearFilterFromMedia: (index: number) => void;
  applyCropToMedia: (index: number, settings: CropSettings) => void;
  clearCropFromMedia: (index: number) => void;
  applyTrimToMedia: (index: number, trimStart: number, trimEnd: number) => void;
  handleEnhanceWithAI: (mode?: 'spellcheck' | 'grammar' | 'style', style?: string) => Promise<void>;
  insertFormatting: (format: 'bold' | 'italic' | 'mention') => void;
  handlePost: () => void;
  resetForm: () => void;
}

export interface PostFormComputed {
  hasVideo: boolean;
  hasImage: boolean;
  hasAudio: boolean;
  isShort: boolean;
  destinations: string[];
  canPost: boolean;
}
