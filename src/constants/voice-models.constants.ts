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
  /** Whether to prefer female voices when searching */
  preferFemale: boolean;
}

export const VOICE_PREFERENCES: Record<string, VoicePreference> = {
  female: {
    id: 'female',
    name: 'Female',
    description: 'Samantha, Zira',
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
    description: 'Alex, Daniel',
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
    description: 'System default voice',
    emoji: '🤖',
    preferredVoiceNames: [],
    preferFemale: false,
  },
};

export const VOICE_PREFERENCE_OPTIONS = Object.values(VOICE_PREFERENCES);
export type VoicePreferenceKey = keyof typeof VOICE_PREFERENCES;
