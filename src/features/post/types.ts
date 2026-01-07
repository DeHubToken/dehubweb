export interface AudioFile {
  blob: Blob;
  url: string;
  duration: number;
}

export interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video' | 'audio';
  duration?: number;
  audio?: AudioFile;
  isMusicVideo?: boolean;
  thumbnail?: string;
}

export type Currency = 'USD' | 'DHB';

export type LiveMode = 'video' | 'townhall' | null;

export interface PostFormState {
  text: string;
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
}

export interface PostFormActions {
  setText: (text: string) => void;
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
  removeMedia: (index: number) => void;
  addAudioToMedia: (index: number, audio: AudioFile) => void;
  removeAudioFromMedia: (index: number) => void;
  toggleMusicVideo: (index: number) => void;
  addThumbnailToMedia: (index: number, thumbnailUrl: string) => void;
  removeThumbnailFromMedia: (index: number) => void;
  handleEnhanceWithAI: (mode?: 'spellcheck' | 'style', style?: string) => Promise<void>;
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
