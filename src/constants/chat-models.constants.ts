import { translateCopy as _translateCopy } from '@/i18n/copy';
/**
 * Chat AI Model Constants
 * ========================
 * Defines available chat AI models for the assistant.
 */

export interface ChatModelOption {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

// Available chat models
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  {
    id: 'auto',
    name: 'Auto',
    get description() { return _translateCopy("copy.4a9fd15a895c", { defaultValue: "DeHub trained model" }); },
    emoji: '✨'
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini Flash',
    get description() { return _translateCopy("copy.98f96a4d8578", { defaultValue: "Fast & free" }); },
    emoji: '⚡'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini Pro',
    get description() { return _translateCopy("copy.6157bb4bd99f", { defaultValue: "Best reasoning $$" }); },
    emoji: '💎'
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    get description() { return _translateCopy("copy.af4707aebdfa", { defaultValue: "OpenAI $" }); },
    emoji: '🧠'
  },
  {
    id: 'grok-4',
    name: 'Grok 4',
    get description() { return _translateCopy("copy.362058144c4a", { defaultValue: "xAI flagship $$$" }); },
    emoji: '🔮'
  }
];

// Helper to get model by ID
export function getChatModelById(id: string): ChatModelOption | undefined {
  return CHAT_MODEL_OPTIONS.find(m => m.id === id);
}

// Default model - AUTO for smart selection
export const DEFAULT_CHAT_MODEL = 'auto';

export type ChatModelKey = typeof CHAT_MODEL_OPTIONS[number]['id'];
