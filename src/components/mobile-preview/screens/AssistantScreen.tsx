import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { Sparkles, Send, Plus } from 'lucide-react';

const mockMessages = (t: TFunction) => [
  { id: '1', role: 'user', content: t('mobilePreview.assistant.question1') },
  { id: '2', role: 'assistant', content: t('mobilePreview.assistant.answer1') },
  { id: '3', role: 'user', content: t('mobilePreview.assistant.question2') },
  { id: '4', role: 'assistant', content: t('mobilePreview.assistant.answer2') },
];

export function AssistantScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title="AI Assistant" showAvatar={false} showNotification={false} />

      {/* Messages */}
      <div className="flex-1 px-4 py-3 space-y-4 overflow-y-auto">
        {mockMessages(t).map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-white/10 border border-white/15 rounded-br-md'
                  : 'bg-white/[0.04] border border-white/[0.06] rounded-bl-md'
              }`}
            >
              <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-line">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 pb-2 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-10 rounded-xl bg-white/[0.06] border border-white/10 px-4 flex items-center">
            <span className="text-zinc-600 text-sm">Ask anything...</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
            <Send className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      <MobileBottomBar active="ai" />
    </div>
  );
}
