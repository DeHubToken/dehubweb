/**
 * Chat text size (Settings → Appearance). Same choice as the Aa button inside
 * a chat; both write lib/chat-text-size.
 */
import { useTranslation } from 'react-i18next';
import Chat from '@/components/ui/cut-icons/chat';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import { isChatTextSize, setChatTextSize, useChatTextSize } from '@/lib/chat-text-size';
import { useChatTextSizeOptions } from '@/hooks/use-chat-text-size-options';

export function ChatTextSizeSetting() {
  const { t } = useTranslation();
  const size = useChatTextSize();
  const options = useChatTextSizeOptions();
  const title = t('settings.chatTextSize', 'Chat text size');

  return (
    <SettingsRow
      icon={<Chat />}
      anchor="chat-text-size"
      title={title}
      description={t('settings.chatTextSizeDesc', 'Bigger or smaller messages in every chat. Adds to your phone or browser text size.')}
      action={
        <SettingDrawerSelect
          value={size}
          onValueChange={(value) => { if (isChatTextSize(value)) setChatTextSize(value); }}
          title={title}
          options={options.map((o) => ({ value: o.value, label: o.label }))}
        />
      }
    />
  );
}
