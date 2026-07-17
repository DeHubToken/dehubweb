import { MobileStatusBar } from '../MobileStatusBar';
import { MobileTopBar } from '../MobileTopBar';
import { MobileBottomBar } from '../MobileBottomBar';
import { MockAvatar } from '../MockAvatar';
import { ChevronLeft, Send, Paperclip, Smile, Phone, MoreVertical } from 'lucide-react';

const MOCK_MESSAGES = [
  { id: '1', sender: 'bob_dev', content: 'Hey! Did you see the new governance proposal?', time: '10:23 AM', isMine: false },
  { id: '2', sender: 'me', content: 'Yeah, I was just reading through it. The treasury allocation looks solid.', time: '10:25 AM', isMine: true },
  { id: '3', sender: 'bob_dev', content: 'Right? I think we should vote yes. The dev grants will really help the ecosystem grow.', time: '10:26 AM', isMine: false },
  { id: '4', sender: 'me', content: 'Agreed. I\'ll cast my vote after lunch. How many DHB tokens do you have staked for voting power?', time: '10:28 AM', isMine: true },
  { id: '5', sender: 'bob_dev', content: '25k staked. Should give me decent weight on the vote 💪', time: '10:29 AM', isMine: false },
  { id: '6', sender: 'bob_dev', content: 'Also, check out the new proposal!', time: '10:30 AM', isMine: false },
];

export function ChatScreen() {
  return (
    <div className="min-h-full bg-black flex flex-col">
      <MobileStatusBar />

      {/* Chat header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-white/[0.06] bg-black/80 backdrop-blur-xl">
        <ChevronLeft className="w-5 h-5 text-white flex-shrink-0" />
        <MockAvatar name="bob_dev" size="sm" />
        <div className="flex-1 min-w-0">
          <span className="text-white text-sm font-semibold">bob_dev</span>
          <p className="text-[10px] text-zinc-500">Online</p>
        </div>
        <Phone className="w-4 h-4 text-zinc-400" />
        <MoreVertical className="w-4 h-4 text-zinc-400" />
      </div>

      {/* Messages */}
      <div className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
        {MOCK_MESSAGES.map((msg) => (
          <div key={msg.id} className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                msg.isMine
                  ? 'bg-white/10 border border-white/15 rounded-br-md'
                  : 'bg-white/[0.05] border border-white/[0.08] rounded-bl-md'
              }`}
            >
              <p className="text-[13px] text-zinc-200 leading-relaxed">{msg.content}</p>
              <p className={`text-[9px] mt-1 ${msg.isMine ? 'text-zinc-500 text-right' : 'text-zinc-600'}`}>{msg.time}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 pb-2 pt-2 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-zinc-500 flex-shrink-0" />
          <div className="flex-1 h-9 rounded-full bg-white/[0.06] border border-white/10 px-4 flex items-center">
            <span className="text-zinc-600 text-sm">Message...</span>
          </div>
          <Smile className="w-5 h-5 text-zinc-500 flex-shrink-0" />
          <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
            <Send className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>

      <MobileBottomBar active="messages" />
    </div>
  );
}
