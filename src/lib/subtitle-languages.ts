import { translateCopy as _translateCopy } from '@/i18n/copy';

export interface SubtitleLanguage {
  code: string;
  name: string;
}

// Compact list of common languages for the picker.
export const SUBTITLE_LANGUAGES: SubtitleLanguage[] = [
  { code: 'original', get name() { return _translateCopy('copy.88d759ea02ce', { defaultValue: 'Original' }); } },
  { code: 'en', get name() { return _translateCopy('copy.ba118bf7fc9c', { defaultValue: 'English' }); } },
  { code: 'es', get name() { return _translateCopy('copy.3411059cb8e0', { defaultValue: 'Spanish' }); } },
  { code: 'pt', get name() { return _translateCopy('copy.98b01b890687', { defaultValue: 'Portuguese' }); } },
  { code: 'fr', get name() { return _translateCopy('copy.7458199fe97a', { defaultValue: 'French' }); } },
  { code: 'de', get name() { return _translateCopy('copy.a659b60d246d', { defaultValue: 'German' }); } },
  { code: 'it', get name() { return _translateCopy('copy.fe1d9c7db376', { defaultValue: 'Italian' }); } },
  { code: 'nl', get name() { return _translateCopy('copy.45f16144c18c', { defaultValue: 'Dutch' }); } },
  { code: 'pl', get name() { return _translateCopy('copy.770341d6e89e', { defaultValue: 'Polish' }); } },
  { code: 'ru', get name() { return _translateCopy('copy.5bcc40adf6e0', { defaultValue: 'Russian' }); } },
  { code: 'uk', get name() { return _translateCopy('copy.6f424303fa12', { defaultValue: 'Ukrainian' }); } },
  { code: 'tr', get name() { return _translateCopy('copy.6e7aac65db01', { defaultValue: 'Turkish' }); } },
  { code: 'ar', get name() { return _translateCopy('copy.bafb66f32cd7', { defaultValue: 'Arabic' }); } },
  { code: 'he', get name() { return _translateCopy('copy.33e00df2aac3', { defaultValue: 'Hebrew' }); } },
  { code: 'fa', get name() { return _translateCopy('copy.7428909a1062', { defaultValue: 'Persian' }); } },
  { code: 'hi', get name() { return _translateCopy('copy.63c2dc51d089', { defaultValue: 'Hindi' }); } },
  { code: 'bn', get name() { return _translateCopy('copy.e7f4fe2631bb', { defaultValue: 'Bengali' }); } },
  { code: 'ur', get name() { return _translateCopy('copy.2c6ef73fc9e2', { defaultValue: 'Urdu' }); } },
  { code: 'id', get name() { return _translateCopy('copy.4fe1bb67f3b9', { defaultValue: 'Indonesian' }); } },
  { code: 'ms', get name() { return _translateCopy('copy.cd43b2d3b020', { defaultValue: 'Malay' }); } },
  { code: 'th', get name() { return _translateCopy('copy.ad705ee19c04', { defaultValue: 'Thai' }); } },
  { code: 'vi', get name() { return _translateCopy('copy.f25499e9df5c', { defaultValue: 'Vietnamese' }); } },
  { code: 'tl', get name() { return _translateCopy('copy.e8a6062c5c37', { defaultValue: 'Filipino' }); } },
  { code: 'zh', get name() { return _translateCopy('copy.237635fca547', { defaultValue: 'Chinese (Simplified)' }); } },
  { code: 'zh-TW', get name() { return _translateCopy('copy.086e0a73e924', { defaultValue: 'Chinese (Traditional)' }); } },
  { code: 'ja', get name() { return _translateCopy('copy.be4ee906d3ef', { defaultValue: 'Japanese' }); } },
  { code: 'ko', get name() { return _translateCopy('copy.04656c6fe003', { defaultValue: 'Korean' }); } },
  { code: 'sv', get name() { return _translateCopy('copy.a89a9329d3d4', { defaultValue: 'Swedish' }); } },
  { code: 'no', get name() { return _translateCopy('copy.71f4cf5c7a23', { defaultValue: 'Norwegian' }); } },
  { code: 'da', get name() { return _translateCopy('copy.fe4338ad620c', { defaultValue: 'Danish' }); } },
  { code: 'fi', get name() { return _translateCopy('copy.5710b435f90a', { defaultValue: 'Finnish' }); } },
  { code: 'cs', get name() { return _translateCopy('copy.8b463ea23a7e', { defaultValue: 'Czech' }); } },
  { code: 'el', get name() { return _translateCopy('copy.5c74e5b8100c', { defaultValue: 'Greek' }); } },
  { code: 'ro', get name() { return _translateCopy('copy.096b861df653', { defaultValue: 'Romanian' }); } },
  { code: 'hu', get name() { return _translateCopy('copy.58801e6907f0', { defaultValue: 'Hungarian' }); } },
];

export function detectLocaleLang(): string {
  if (typeof navigator === 'undefined') return 'original';
  const raw = (navigator.language || 'en').toLowerCase();
  if (raw.startsWith('zh-tw') || raw.startsWith('zh-hk')) return 'zh-TW';
  const base = raw.split('-')[0];
  const match = SUBTITLE_LANGUAGES.find((l) => l.code === base);
  return match ? match.code : 'original';
}
