/**
 * NewMessageSelector
 * ==================
 * What the + in Messages opens: a direct message, a new group, or a new
 * channel.
 */

import { useTranslation } from 'react-i18next';
import MessageCircle from '@/components/ui/cut-icons/message-envelope';
import Users from '@/components/ui/cut-icons/communities';
import Megaphone from '@/components/ui/cut-icons/advertising';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface NewMessageSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDM: () => void;
  onSelectGroup?: () => void;
  onSelectChannel?: () => void;
}

export function NewMessageSelector({ open, onOpenChange, onSelectDM, onSelectGroup, onSelectChannel }: NewMessageSelectorProps) {
  const { t } = useTranslation();
  const options = [
    {
      key: 'dm',
      icon: MessageCircle,
      title: t('communities.newChat.message', { defaultValue: 'New message' }),
      detail: t('communities.newChat.messageDetail', { defaultValue: 'A private chat with one person' }),
      onSelect: onSelectDM,
    },
    onSelectGroup && {
      key: 'group',
      icon: Users,
      title: t('communities.newChat.newGroup', { defaultValue: 'New group' }),
      detail: t('communities.newChat.groupDetail', { defaultValue: 'Chat with many people, public or private' }),
      onSelect: onSelectGroup,
    },
    onSelectChannel && {
      key: 'channel',
      icon: Megaphone,
      title: t('communities.newChat.newChannel', { defaultValue: 'New channel' }),
      detail: t('communities.newChat.channelDetail', { defaultValue: 'Broadcast to followers, free or paid' }),
      onSelect: onSelectChannel,
    },
  ].filter(Boolean) as { key: string; icon: typeof Users; title: string; detail: string; onSelect: () => void }[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-sm" data-new-message-selector>
        <DialogHeader>
          <DialogTitle className="text-white text-center">{t('communities.newChat.title', { defaultValue: 'Start something' })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-2">
          {options.map(({ key, icon: Icon, title, detail, onSelect }) => (
            <Button
              key={key}
              variant="ghost"
              data-new-message-option={key}
              onClick={() => {
                onOpenChange(false);
                onSelect();
              }}
              className="w-full h-auto p-3.5 flex items-center gap-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl justify-start"
            >
              <div className="w-11 h-11 shrink-0 rounded-xl bg-white/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-white" />
              </div>
              <div className="text-left min-w-0">
                <p className="font-semibold text-white">{title}</p>
                <p className="text-sm text-white/60 whitespace-normal">{detail}</p>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
