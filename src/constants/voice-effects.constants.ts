import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * Voice Effects Configuration for Stages
 * Uses Web Audio API nodes to process mic audio in real-time
 */

export interface VoiceEffectConfig {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

export const VOICE_EFFECTS: VoiceEffectConfig[] = [
  { id: 'none', name: 'Normal', emoji: '🎙️', get description() { return _translateCopy("copy.75c47aa81c26", { defaultValue: "No effect" }); } },
  { id: 'deep', name: 'Anonymous', emoji: '🕶️', get description() { return _translateCopy("copy.4ec0665185ea", { defaultValue: "Deep, disguised — hacker vibes" }); } },
  { id: 'chipmunk', name: 'Chipmunk', emoji: '🐿️', get description() { return _translateCopy("copy.7c7a9940551c", { defaultValue: "High, squeaky pitch" }); } },
  { id: 'robot', name: 'Robot', emoji: '🤖', get description() { return _translateCopy("copy.0752ced64857", { defaultValue: "Metallic ring-mod" }); } },
  { id: 'echo', name: 'Echo', emoji: '🏔️', get description() { return _translateCopy("copy.2301f1deb72d", { defaultValue: "Cave echo" }); } },
  { id: 'radio', name: 'Radio', emoji: '📻', get description() { return _translateCopy("copy.0790fd535ad1", { defaultValue: "AM radio" }); } },
];

export type VoiceEffectId = typeof VOICE_EFFECTS[number]['id'];
