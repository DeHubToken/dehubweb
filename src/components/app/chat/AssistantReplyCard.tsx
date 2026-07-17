/**
 * AssistantReplyCard
 * ==================
 * Local-only @assistant reply rendered inline in chat.
 * Not persisted to the chat API — purely a web-app side effect, similar to BuyAlertCard.
 * Visual layout MUST match ChatMessage exactly (spacing, avatar size, timestamp format)
 * so it sits inline naturally with surrounding messages.
 */
import { Sparkles, CornerDownRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { renderTextWithLinks } from '../TranslatableText';
import assistantAvatar from '@/assets/ai-assistant-avatar.png';

interface AssistantReplyCardProps {
  content: string;
  timestamp: Date;
  replyToName?: string;
}

const formatTime = (date: Date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDate = (date: Date) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

export function AssistantReplyCard({ content, timestamp, replyToName }: AssistantReplyCardProps) {
  return (
    <div className="flex gap-3 py-2 px-4 hover:bg-zinc-800/30 transition-colors group">
      <div className="flex-shrink-0">
        <Avatar className="w-8 h-8">
          <AvatarImage src={assistantAvatar} alt="assistant" />
          <AvatarFallback className="bg-primary/20 text-primary">
            <Sparkles className="w-4 h-4" />
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="flex-1 min-w-0">
        {replyToName && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 mb-0.5">
            <CornerDownRight className="w-3 h-3" />
            <span className="font-medium">{replyToName}</span>
          </div>
        )}

        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-white text-sm truncate">assistant</span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-px rounded bg-primary/20 text-primary border border-primary/30">
            AI
          </span>
        </div>

        <div>
          <p className="text-zinc-300 text-sm break-words whitespace-pre-wrap">
            {renderTextWithLinks(content)}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-zinc-500 text-[10px] whitespace-nowrap">
              {formatDate(timestamp)} {formatTime(timestamp)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
