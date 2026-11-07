import { useTranslation } from 'react-i18next';
import { CHAT_TEXT_SIZES, type ChatTextSize } from '@/lib/chat-text-size';

export function useChatTextSizeOptions(): { value: ChatTextSize; label: string }[] {
  const { t } = useTranslation();
  const labels: Record<ChatTextSize, string> = {
    small: t('chatTextSize.small', 'Small'),
    default: t('chatTextSize.default', 'Default'),
    large: t('chatTextSize.large', 'Large'),
    larger: t('chatTextSize.larger', 'Larger'),
    largest: t('chatTextSize.largest', 'Largest'),
  };
  return CHAT_TEXT_SIZES.map((value) => ({ value, label: labels[value] }));
}
