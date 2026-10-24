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
  { id: 'none', get name() { return _translateCopy("copy.a7248eeb45eb", { defaultValue: "Normal" }); }, emoji: '🎙️', get description() { return _translateCopy("copy.75c47aa81c26", { defaultValue: "No effect" }); } },
  { id: 'deep', get name() { return _translateCopy("copy.e7a8aa2df7e5", { defaultValue: "Anonymous" }); }, emoji: '🕶️', get description() { return _translateCopy("copy.4ec0665185ea", { defaultValue: "Deep, disguised — hacker vibes" }); } },
  { id: 'chipmunk', get name() { return _translateCopy("copy.04ca704f3efc", { defaultValue: "Chipmunk" }); }, emoji: '🐿️', get description() { return _translateCopy("copy.7c7a9940551c", { defaultValue: "High, squeaky pitch" }); } },
  { id: 'robot', get name() { return _translateCopy("copy.3bf6b51b7b6c", { defaultValue: "Robot" }); }, emoji: '🤖', get description() { return _translateCopy("copy.0752ced64857", { defaultValue: "Metallic ring-mod" }); } },
  { id: 'echo', get name() { return _translateCopy("copy.8335e4c92c40", { defaultValue: "Echo" }); }, emoji: '🏔️', get description() { return _translateCopy("copy.2301f1deb72d", { defaultValue: "Cave echo" }); } },
  { id: 'radio', get name() { return _translateCopy("copy.2a7dfeb2f2b0", { defaultValue: "Radio" }); }, emoji: '📻', get description() { return _translateCopy("copy.0790fd535ad1", { defaultValue: "AM radio" }); } },
];

export type VoiceEffectId = typeof VOICE_EFFECTS[number]['id'];
