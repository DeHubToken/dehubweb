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
    id: 'gemini-2.5-flash',
    name: 'Gemini Flash',
    description: 'Fast & balanced',
    emoji: '⚡'
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini Pro',
    description: 'Best reasoning',
    emoji: '💎'
  },
  {
    id: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'OpenAI efficiency',
    emoji: '🧠'
  },
  {
    id: 'grok-4',
    name: 'Grok 4',
    description: 'xAI flagship model',
    emoji: '🔮'
  }
];

// Helper to get model by ID
export function getChatModelById(id: string): ChatModelOption | undefined {
  return CHAT_MODEL_OPTIONS.find(m => m.id === id);
}

// Default model
export const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';

export type ChatModelKey = typeof CHAT_MODEL_OPTIONS[number]['id'];
