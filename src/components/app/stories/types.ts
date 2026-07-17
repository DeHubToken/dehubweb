/**
 * Story Overlay Types
 * ===================
 * Type definitions for emoji stickers and text overlays on stories.
 */

export type OverlayType = 'emoji' | 'text';

export type TextStyle = 'normal' | 'bold' | 'outlined' | 'background';

export interface StoryOverlay {
  id: string;
  type: OverlayType;
  content: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  scale: number; // 1 = normal size
  rotation: number; // degrees
  style?: {
    color: string;
    backgroundColor?: string;
    textStyle: TextStyle;
  };
}

export const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😛', '🤪', '😎', '🤩', '🥳'],
  'Gestures': ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '👐', '🤲', '🙏', '💪', '🦾', '🖐️', '✋', '👋', '🤚', '🖖', '👊'],
  'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  'Objects': ['🔥', '⭐', '✨', '💫', '🌟', '💥', '💯', '🎉', '🎊', '🎁', '🏆', '🥇', '🎮', '🎯', '🎨', '🎬', '📸', '💰', '💎', '🚀'],
  'Animals': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦋', '🐙'],
  'Food': ['🍕', '🍔', '🍟', '🌭', '🍿', '🧀', '🍩', '🍪', '🎂', '🍰', '🍫', '🍬', '🍭', '☕', '🍺', '🍷', '🍸', '🥤', '🧃', '🍹'],
} as const;

export const TEXT_COLORS = [
  '#FFFFFF',
  '#000000',
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#00C7BE',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#A2845E',
];
