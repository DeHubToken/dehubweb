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
  { id: 'none', name: 'Normal', emoji: '🎙️', description: 'No effect' },
  { id: 'deep', name: 'Deep', emoji: '🔊', description: 'Lower pitch' },
  { id: 'chipmunk', name: 'Chipmunk', emoji: '🐿️', description: 'Higher pitch' },
  { id: 'robot', name: 'Robot', emoji: '🤖', description: 'Robotic tone' },
  { id: 'echo', name: 'Echo', emoji: '🏔️', description: 'Cave echo' },
  { id: 'radio', name: 'Radio', emoji: '📻', description: 'AM radio' },
];

export type VoiceEffectId = typeof VOICE_EFFECTS[number]['id'];
