export interface MediaFile {
  file: File;
  preview: string;
  type: 'image' | 'video';
  duration?: number;
}

export type Currency = 'USD' | 'DHB';

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
  isLive: boolean;
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
  setIsLive: (value: boolean) => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleVideoSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  removeMedia: (index: number) => void;
  handleEnhanceWithAI: () => Promise<void>;
  insertFormatting: (format: 'bold' | 'italic' | 'mention') => void;
  handlePost: () => void;
  resetForm: () => void;
}

export interface PostFormComputed {
  hasVideo: boolean;
  hasImage: boolean;
  isShort: boolean;
  destinations: string[];
  canPost: boolean;
}
