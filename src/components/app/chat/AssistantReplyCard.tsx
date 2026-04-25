/**
 * AssistantReplyCard
 * ==================
 * Local-only @assistant reply rendered inline in chat.
 * Not persisted to the chat API — purely a web-app side effect, similar to BuyAlertCard.
 */
import { Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { renderTextWithLinks } from '../TranslatableText';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';

interface AssistantReplyCardProps {
  content: string;
  timestamp: Date;
  replyToName?: string;
}

export function AssistantReplyCard({ content, timestamp, replyToName }: AssistantReplyCardProps) {
  const time = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex gap-2 items-start group">
      <Avatar className="w-8 h-8 flex-shrink-0 ring-1 ring-primary/40">
        <AvatarImage src={assistantAvatar} alt="@assistant" />
        <AvatarFallback className="bg-primary/20 text-primary">
          <Sparkles className="w-4 h-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-sm font-semibold text-white truncate">@assistant</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-px rounded bg-primary/20 text-primary border border-primary/30">
            AI
          </span>
          <span className="text-xs text-zinc-500">{time}</span>
        </div>
        {replyToName && (
          <div className="text-xs text-zinc-500 mb-1 truncate">
            replying to <span className="text-zinc-400">@{replyToName}</span>
          </div>
        )}
        <div className="inline-block max-w-full rounded-2xl rounded-tl-sm bg-zinc-800/80 border border-primary/20 px-3 py-2 text-sm text-zinc-100 break-words whitespace-pre-wrap">
          {renderTextWithLinks(content)}
        </div>
      </div>
    </div>
  );
}
