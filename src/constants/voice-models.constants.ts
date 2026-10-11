import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * Voice Preferences Configuration
 * Maps to browser's Web Speech API voices
 */

export interface VoicePreference {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** Voice names to search for in priority order */
  preferredVoiceNames: string[];
  preferFemale: boolean;
}

export const VOICE_PREFERENCES: Record<string, VoicePreference> = {
  female: {
    id: 'female',
    name: 'Female',
    get description() { return _translateCopy("copy.b85e20c546ad", { defaultValue: "Samantha, Zira" }); },  
    emoji: '👩',
    preferredVoiceNames: [
      'Samantha',
      'Microsoft Zira - English (United States)',
    ],
    preferFemale: true,
  },
  male: {
    id: 'male',
    name: 'Male',
    get description() { return _translateCopy("copy.554a0eb5f3de", { defaultValue: "Alex, Daniel" }); },
    emoji: '👨',
    preferredVoiceNames: [
      'Alex',
      'Daniel',
      'Microsoft David - English (United States)',
    ],
    preferFemale: false,
  },
  neutral: {
    id: 'neutral',
    name: 'Neutral',
    get description() { return _translateCopy("copy.eaf77b782bcb", { defaultValue: "System default voice" }); },
    emoji: '🤖',
    preferredVoiceNames: [],
    preferFemale: false,
  },
};

export const VOICE_PREFERENCE_OPTIONS = Object.values(VOICE_PREFERENCES);
export type VoicePreferenceKey = keyof typeof VOICE_PREFERENCES;
