/**
 * Chat AI Model Constants
 * ========================
 * Defines available chat AI models for the assistant.
 * Supports both built-in Lovable AI models and external Grok (xAI) models.
 */

export type ChatModelProvider = 'lovable' | 'grok';

export interface ChatModelOption {
  id: string;
  provider: ChatModelProvider;
  name: string;
  description: string;
  emoji: string;
}

export interface ChatProviderInfo {
  name: string;
  emoji: string;
  requiresKey: boolean;
  description: string;
}

// Provider information
export const CHAT_AI_PROVIDERS: Record<ChatModelProvider, ChatProviderInfo> = {
  lovable: {
    name: 'DeHub AI',
    emoji: '⚡',
    requiresKey: false,
    description: 'No API key needed'
  },
  grok: {
    name: 'Grok (xAI)',
    emoji: '🤖',
    requiresKey: true,
    description: 'Requires API key'
  }
};

// Available chat models
export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  // Lovable AI models (no API key required)
  {
    id: 'gemini-2.5-flash',
    provider: 'lovable',
    name: 'Gemini Flash',
    description: 'Fast & balanced',
    emoji: '⚡'
  },
  {
    id: 'gemini-2.5-pro',
    provider: 'lovable',
    name: 'Gemini Pro',
    description: 'Best reasoning',
    emoji: '💎'
  },
  {
    id: 'gpt-5-mini',
    provider: 'lovable',
    name: 'GPT-5 Mini',
    description: 'OpenAI efficiency',
    emoji: '🧠'
  },
  // Grok models (requires xAI API key)
  {
    id: 'grok-3',
    provider: 'grok',
    name: 'Grok 3',
    description: 'Latest xAI model',
    emoji: '🔮'
  },
  {
    id: 'grok-3-mini',
    provider: 'grok',
    name: 'Grok 3 Mini',
    description: 'Fast & efficient',
    emoji: '⚡'
  }
];

// Helper to get model by ID
export function getChatModelById(id: string): ChatModelOption | undefined {
  return CHAT_MODEL_OPTIONS.find(m => m.id === id);
}

// Helper to check if a model requires an API key
export function modelRequiresApiKey(modelId: string): boolean {
  const model = getChatModelById(modelId);
  if (!model) return false;
  return CHAT_AI_PROVIDERS[model.provider].requiresKey;
}

// Default model (always available)
export const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';

export type ChatModelKey = typeof CHAT_MODEL_OPTIONS[number]['id'];
