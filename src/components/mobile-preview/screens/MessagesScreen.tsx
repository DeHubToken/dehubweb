import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { Edit, Search } from 'lucide-react';

const MOCK_CONVERSATIONS = [
  { id: '1', user: 'bob_dev', lastMessage: 'Hey, check out the new proposal!', time: '2m', unread: 3 },
  { id: '2', user: 'crypto_sarah', lastMessage: 'Thanks for the tip! 🙏', time: '15m', unread: 0 },
  { id: '3', user: 'defi_whale', lastMessage: 'Are you joining the AMA later?', time: '1h', unread: 1 },
  { id: '4', user: 'nft_artist', lastMessage: 'Just sent you the artwork files', time: '3h', unread: 0 },
  { id: '5', user: 'dao_voter', lastMessage: 'Vote passed! 🎉', time: '5h', unread: 0 },
  { id: '6', user: 'music_prod', lastMessage: 'New track dropping next week', time: '1d', unread: 0 },
  { id: '7', user: 'web3_dev', lastMessage: 'Smart contract is deployed', time: '2d', unread: 0 },
];

export function MessagesScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />
      <MobileTopBar title="Messages" />

      {/* Search */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[0.06] border border-white/10">
          <Search className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-500 text-sm">Search messages</span>
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 divide-y divide-white/[0.04]">
        {MOCK_CONVERSATIONS.map((conv) => (
          <div key={conv.id} className="flex items-center gap-3 px-4 py-3 active:bg-white/[0.03] transition-colors">
            <MockAvatar name={conv.user} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-white text-sm font-semibold truncate">{conv.user}</span>
                <span className="text-zinc-600 text-xs flex-shrink-0">{conv.time}</span>
              </div>
              <p className={`text-[13px] truncate mt-0.5 ${conv.unread > 0 ? 'text-zinc-300 font-medium' : 'text-zinc-500'}`}>
                {conv.lastMessage}
              </p>
            </div>
            {conv.unread > 0 && (
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] text-white font-bold">{conv.unread}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <MobileBottomBar active="messages" />
    </div>
  );
}
