import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Users, Settings, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage, Message } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface PublicChatProps {
  onBack: () => void;
  liveCount?: string;
}

// Mock initial messages - 100 bullish DeHub messages with GIFs
const INITIAL_MESSAGES: Message[] = [
  { id: '1', userId: 'system', userName: 'DeHub Bot', content: 'Welcome to the Public Chat! Be respectful and have fun. 🎉', timestamp: new Date(Date.now() - 60000 * 100), type: 'text' },
  { id: '2', userId: 'user1', userName: 'CryptoKing', content: 'DeHub is the future of content creation! 🚀', timestamp: new Date(Date.now() - 60000 * 99), type: 'text' },
  { id: '3', userId: 'user2', userName: 'GamerGirl99', content: 'Just earned 500 coins watching streams! W2E is insane 💰', timestamp: new Date(Date.now() - 60000 * 98), type: 'text' },
  { id: '4', userId: 'user3', userName: 'TechWizard', content: '', timestamp: new Date(Date.now() - 60000 * 97), type: 'gif', imageUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' },
  { id: '5', userId: 'user4', userName: 'MoonHodler', content: 'Staking rewards are incredible here 🔥', timestamp: new Date(Date.now() - 60000 * 96), type: 'text' },
  { id: '6', userId: 'user5', userName: 'DiamondHands', content: 'DeHub coin to the moon! 🌙', timestamp: new Date(Date.now() - 60000 * 95), type: 'text' },
  { id: '7', userId: 'user6', userName: 'StreamQueen', content: 'Live streaming quality is unmatched', timestamp: new Date(Date.now() - 60000 * 94), type: 'text' },
  { id: '8', userId: 'user7', userName: 'CryptoNinja', content: '', timestamp: new Date(Date.now() - 60000 * 93), type: 'gif', imageUrl: 'https://media.giphy.com/media/trN9ht5RlE3Dcwavg2/giphy.gif' },
  { id: '9', userId: 'user8', userName: 'BlockchainBro', content: 'The decentralized model is genius 🧠', timestamp: new Date(Date.now() - 60000 * 92), type: 'text' },
  { id: '10', userId: 'user9', userName: 'TokenTitan', content: 'Shorts feature is addicting, so good', timestamp: new Date(Date.now() - 60000 * 91), type: 'text' },
  { id: '11', userId: 'user10', userName: 'WebThreeWiz', content: 'Watch to Earn is revolutionary! 💎', timestamp: new Date(Date.now() - 60000 * 90), type: 'text' },
  { id: '12', userId: 'user11', userName: 'AlphaTrader', content: '', timestamp: new Date(Date.now() - 60000 * 89), type: 'gif', imageUrl: 'https://media.giphy.com/media/5efT9uLuaVRrW/giphy.gif' },
  { id: '13', userId: 'user12', userName: 'ContentKing', content: 'Made more here in a week than a month elsewhere', timestamp: new Date(Date.now() - 60000 * 88), type: 'text' },
  { id: '14', userId: 'user13', userName: 'NFTCollector', content: 'The NFT integration is coming soon! 🎨', timestamp: new Date(Date.now() - 60000 * 87), type: 'text' },
  { id: '15', userId: 'user14', userName: 'DeFiDegen', content: 'Command Centre analytics are so useful', timestamp: new Date(Date.now() - 60000 * 86), type: 'text' },
  { id: '16', userId: 'user15', userName: 'PixelPunk', content: 'Community here is the best in Web3 🙌', timestamp: new Date(Date.now() - 60000 * 85), type: 'text' },
  { id: '17', userId: 'user16', userName: 'SatoshiFan', content: '', timestamp: new Date(Date.now() - 60000 * 84), type: 'gif', imageUrl: 'https://media.giphy.com/media/DhstvI3zZ598Nb1rFf/giphy.gif' },
  { id: '18', userId: 'user17', userName: 'MetaMax', content: 'Just tipped my favorite streamer 100 coins!', timestamp: new Date(Date.now() - 60000 * 83), type: 'text' },
  { id: '19', userId: 'user18', userName: 'ChainChamp', content: 'The PPV feature is going to be huge', timestamp: new Date(Date.now() - 60000 * 82), type: 'text' },
  { id: '20', userId: 'user19', userName: 'HodlHero', content: 'Bullish on DeHub forever 📈', timestamp: new Date(Date.now() - 60000 * 81), type: 'text' },
  { id: '21', userId: 'user20', userName: 'CoinCrusher', content: 'Explore page algorithm is actually good', timestamp: new Date(Date.now() - 60000 * 80), type: 'text' },
  { id: '22', userId: 'user21', userName: 'ViralVince', content: '', timestamp: new Date(Date.now() - 60000 * 79), type: 'gif', imageUrl: 'https://media.giphy.com/media/mi6DsSSNKDbUY/giphy.gif' },
  { id: '23', userId: 'user22', userName: 'LunarLad', content: 'Notifications system keeps me engaged', timestamp: new Date(Date.now() - 60000 * 78), type: 'text' },
  { id: '24', userId: 'user23', userName: 'EthEnthusiast', content: 'Gas fees? What gas fees? DeHub is smooth', timestamp: new Date(Date.now() - 60000 * 77), type: 'text' },
  { id: '25', userId: 'user24', userName: 'StreamSniper', content: 'Live chat during streams is so fun 🎮', timestamp: new Date(Date.now() - 60000 * 76), type: 'text' },
  { id: '26', userId: 'user25', userName: 'TokenTycoon', content: 'Bookmarks feature helps me save the best content', timestamp: new Date(Date.now() - 60000 * 75), type: 'text' },
  { id: '27', userId: 'user26', userName: 'WhaleBait', content: '', timestamp: new Date(Date.now() - 60000 * 74), type: 'gif', imageUrl: 'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif' },
  { id: '28', userId: 'user27', userName: 'CryptoChef', content: 'Cooking up gains with W2E daily', timestamp: new Date(Date.now() - 60000 * 73), type: 'text' },
  { id: '29', userId: 'user28', userName: 'RocketRider', content: 'Profile customization is next level', timestamp: new Date(Date.now() - 60000 * 72), type: 'text' },
  { id: '30', userId: 'user29', userName: 'GemHunter', content: 'Found this gem early, not selling!', timestamp: new Date(Date.now() - 60000 * 71), type: 'text' },
  { id: '31', userId: 'user30', userName: 'BitBoss', content: 'Messages feature makes collabs easy', timestamp: new Date(Date.now() - 60000 * 70), type: 'text' },
  { id: '32', userId: 'user31', userName: 'ApeArmy', content: '', timestamp: new Date(Date.now() - 60000 * 69), type: 'gif', imageUrl: 'https://media.giphy.com/media/Ogak8XuKHLs6PYcqlp/giphy.gif' },
  { id: '33', userId: 'user32', userName: 'FlowState', content: 'The shorts scroll is so smooth', timestamp: new Date(Date.now() - 60000 * 68), type: 'text' },
  { id: '34', userId: 'user33', userName: 'VaultViking', content: 'Stacking coins in my vault every day', timestamp: new Date(Date.now() - 60000 * 67), type: 'text' },
  { id: '35', userId: 'user34', userName: 'NeonNinja', content: 'Dark mode UI is beautiful 🖤', timestamp: new Date(Date.now() - 60000 * 66), type: 'text' },
  { id: '36', userId: 'user35', userName: 'PumpPatrol', content: 'DeHub pumping while others dump!', timestamp: new Date(Date.now() - 60000 * 65), type: 'text' },
  { id: '37', userId: 'user36', userName: 'HashHero', content: '', timestamp: new Date(Date.now() - 60000 * 64), type: 'gif', imageUrl: 'https://media.giphy.com/media/l46CyJmS9KUbokzsI/giphy.gif' },
  { id: '38', userId: 'user37', userName: 'BullBrigade', content: 'Bulls are taking over DeHub! 🐂', timestamp: new Date(Date.now() - 60000 * 63), type: 'text' },
  { id: '39', userId: 'user38', userName: 'StarStreamer', content: 'Going live in 10, see you there!', timestamp: new Date(Date.now() - 60000 * 62), type: 'text' },
  { id: '40', userId: 'user39', userName: 'YieldYoda', content: 'Passive income from watching content is genius', timestamp: new Date(Date.now() - 60000 * 61), type: 'text' },
  { id: '41', userId: 'user40', userName: 'ClickClout', content: 'Engagement metrics are transparent here', timestamp: new Date(Date.now() - 60000 * 60), type: 'text' },
  { id: '42', userId: 'user41', userName: 'MintMaster', content: '', timestamp: new Date(Date.now() - 60000 * 59), type: 'gif', imageUrl: 'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif' },
  { id: '43', userId: 'user42', userName: 'FOMOFighter', content: 'Get in before the masses discover DeHub', timestamp: new Date(Date.now() - 60000 * 58), type: 'text' },
  { id: '44', userId: 'user43', userName: 'DataDruid', content: 'Analytics in Command Centre are pro-level', timestamp: new Date(Date.now() - 60000 * 57), type: 'text' },
  { id: '45', userId: 'user44', userName: 'StackSensei', content: 'Stacking sats AND DeHub coins daily', timestamp: new Date(Date.now() - 60000 * 56), type: 'text' },
  { id: '46', userId: 'user45', userName: 'VibeCheck', content: 'The vibes here are immaculate ✨', timestamp: new Date(Date.now() - 60000 * 55), type: 'text' },
  { id: '47', userId: 'user46', userName: 'GridGuru', content: '', timestamp: new Date(Date.now() - 60000 * 54), type: 'gif', imageUrl: 'https://media.giphy.com/media/QMHoU66sBXqqLqYvGO/giphy.gif' },
  { id: '48', userId: 'user47', userName: 'LiquidLion', content: 'Liquidity getting deeper every day', timestamp: new Date(Date.now() - 60000 * 53), type: 'text' },
  { id: '49', userId: 'user48', userName: 'ClipKing', content: 'Clipping live moments is so easy here', timestamp: new Date(Date.now() - 60000 * 52), type: 'text' },
  { id: '50', userId: 'user49', userName: 'ToTheMoon', content: '100x potential easily! 🚀🚀🚀', timestamp: new Date(Date.now() - 60000 * 51), type: 'text' },
  { id: '51', userId: 'user50', userName: 'FeedFanatic', content: 'Home feed algorithm knows exactly what I like', timestamp: new Date(Date.now() - 60000 * 50), type: 'text' },
  { id: '52', userId: 'user51', userName: 'CashCow', content: '', timestamp: new Date(Date.now() - 60000 * 49), type: 'gif', imageUrl: 'https://media.giphy.com/media/67ThRZlYBvibtdF9JH/giphy.gif' },
  { id: '53', userId: 'user52', userName: 'PrimeTime', content: 'Prime time for DeHub adoption is NOW', timestamp: new Date(Date.now() - 60000 * 48), type: 'text' },
  { id: '54', userId: 'user53', userName: 'ReelRuler', content: 'Stories feature keeps content fresh', timestamp: new Date(Date.now() - 60000 * 47), type: 'text' },
  { id: '55', userId: 'user54', userName: 'GainzGod', content: 'Portfolio up 300% thanks to DeHub 📊', timestamp: new Date(Date.now() - 60000 * 46), type: 'text' },
  { id: '56', userId: 'user55', userName: 'PeakPerf', content: 'Platform performance is flawless', timestamp: new Date(Date.now() - 60000 * 45), type: 'text' },
  { id: '57', userId: 'user56', userName: 'TrendyTom', content: '', timestamp: new Date(Date.now() - 60000 * 44), type: 'gif', imageUrl: 'https://media.giphy.com/media/8UGGp7rQvfhe63HrFq/giphy.gif' },
  { id: '58', userId: 'user57', userName: 'CoreCoder', content: 'Dev team ships updates so fast 💻', timestamp: new Date(Date.now() - 60000 * 43), type: 'text' },
  { id: '59', userId: 'user58', userName: 'SwipeStyle', content: 'Swiping through shorts for hours', timestamp: new Date(Date.now() - 60000 * 42), type: 'text' },
  { id: '60', userId: 'user59', userName: 'VaultVIP', content: 'VIP features are worth every coin', timestamp: new Date(Date.now() - 60000 * 41), type: 'text' },
  { id: '61', userId: 'user60', userName: 'HypeHawk', content: 'The hype is real and deserved!', timestamp: new Date(Date.now() - 60000 * 40), type: 'text' },
  { id: '62', userId: 'user61', userName: 'StreamSage', content: '', timestamp: new Date(Date.now() - 60000 * 39), type: 'gif', imageUrl: 'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif' },
  { id: '63', userId: 'user62', userName: 'BagBuilder', content: 'Building my bag with every view! 💼', timestamp: new Date(Date.now() - 60000 * 38), type: 'text' },
  { id: '64', userId: 'user63', userName: 'MediaMogul', content: 'DeHub is disrupting social media', timestamp: new Date(Date.now() - 60000 * 37), type: 'text' },
  { id: '65', userId: 'user64', userName: 'ChartChaser', content: 'Charts looking bullish AF 📈', timestamp: new Date(Date.now() - 60000 * 36), type: 'text' },
  { id: '66', userId: 'user65', userName: 'FollowFlow', content: 'Who to Follow suggestions are on point', timestamp: new Date(Date.now() - 60000 * 35), type: 'text' },
  { id: '67', userId: 'user66', userName: 'CoinCollector', content: '', timestamp: new Date(Date.now() - 60000 * 34), type: 'gif', imageUrl: 'https://media.giphy.com/media/KzDqC8LvVC4lshCsGJ/giphy.gif' },
  { id: '68', userId: 'user67', userName: 'BreakoutBoy', content: 'Breakout incoming, load up! 🔥', timestamp: new Date(Date.now() - 60000 * 33), type: 'text' },
  { id: '69', userId: 'user68', userName: 'GlobalGamer', content: 'Gaming content thriving on DeHub', timestamp: new Date(Date.now() - 60000 * 32), type: 'text' },
  { id: '70', userId: 'user69', userName: 'ProfitPro', content: 'Turned my hobby into profit here', timestamp: new Date(Date.now() - 60000 * 31), type: 'text' },
  { id: '71', userId: 'user70', userName: 'TierTop', content: 'Top tier platform, no competition', timestamp: new Date(Date.now() - 60000 * 30), type: 'text' },
  { id: '72', userId: 'user71', userName: 'EarlyBird', content: '', timestamp: new Date(Date.now() - 60000 * 29), type: 'gif', imageUrl: 'https://media.giphy.com/media/lptjRBxFKCJmFoibP3/giphy.gif' },
  { id: '73', userId: 'user72', userName: 'LiveLegend', content: 'Live streams get so much engagement', timestamp: new Date(Date.now() - 60000 * 28), type: 'text' },
  { id: '74', userId: 'user73', userName: 'TokenTrail', content: 'Following the DeHub trail to riches', timestamp: new Date(Date.now() - 60000 * 27), type: 'text' },
  { id: '75', userId: 'user74', userName: 'UpOnly', content: 'DeHub only goes up! ⬆️', timestamp: new Date(Date.now() - 60000 * 26), type: 'text' },
  { id: '76', userId: 'user75', userName: 'ContentCraft', content: 'Content creation tools are amazing', timestamp: new Date(Date.now() - 60000 * 25), type: 'text' },
  { id: '77', userId: 'user76', userName: 'MegaMint', content: '', timestamp: new Date(Date.now() - 60000 * 24), type: 'gif', imageUrl: 'https://media.giphy.com/media/xUPGGDNsLvqsBOhuU0/giphy.gif' },
  { id: '78', userId: 'user77', userName: 'RiseRocket', content: 'Rising through the leaderboards! 🏆', timestamp: new Date(Date.now() - 60000 * 23), type: 'text' },
  { id: '79', userId: 'user78', userName: 'ViewVault', content: 'Every view earns, love this model', timestamp: new Date(Date.now() - 60000 * 22), type: 'text' },
  { id: '80', userId: 'user79', userName: 'CryptoQueen', content: 'Queens support DeHub! 👑', timestamp: new Date(Date.now() - 60000 * 21), type: 'text' },
  { id: '81', userId: 'user80', userName: 'BasedBull', content: 'Most based platform in crypto', timestamp: new Date(Date.now() - 60000 * 20), type: 'text' },
  { id: '82', userId: 'user81', userName: 'TipTop', content: '', timestamp: new Date(Date.now() - 60000 * 19), type: 'gif', imageUrl: 'https://media.giphy.com/media/l1J9EdzfOSgfyueLm/giphy.gif' },
  { id: '83', userId: 'user82', userName: 'WaveWatcher', content: 'Riding the DeHub wave to success 🌊', timestamp: new Date(Date.now() - 60000 * 18), type: 'text' },
  { id: '84', userId: 'user83', userName: 'GridGains', content: 'Gains on gains with DeHub', timestamp: new Date(Date.now() - 60000 * 17), type: 'text' },
  { id: '85', userId: 'user84', userName: 'PostPro', content: 'Post creation is intuitive and fast', timestamp: new Date(Date.now() - 60000 * 16), type: 'text' },
  { id: '86', userId: 'user85', userName: 'HoldStrong', content: 'Holding DeHub strong! 💪', timestamp: new Date(Date.now() - 60000 * 15), type: 'text' },
  { id: '87', userId: 'user86', userName: 'EngageElite', content: '', timestamp: new Date(Date.now() - 60000 * 14), type: 'gif', imageUrl: 'https://media.giphy.com/media/3oKIPa2TdahY8LAAxy/giphy.gif' },
  { id: '88', userId: 'user87', userName: 'FutureFlow', content: 'The future of social is DeHub', timestamp: new Date(Date.now() - 60000 * 13), type: 'text' },
  { id: '89', userId: 'user88', userName: 'ScrollStar', content: 'Could scroll this feed forever', timestamp: new Date(Date.now() - 60000 * 12), type: 'text' },
  { id: '90', userId: 'user89', userName: 'ValueVote', content: 'Real value for real creators here', timestamp: new Date(Date.now() - 60000 * 11), type: 'text' },
  { id: '91', userId: 'user90', userName: 'PeakPump', content: 'Peak pump season incoming! 🎯', timestamp: new Date(Date.now() - 60000 * 10), type: 'text' },
  { id: '92', userId: 'user91', userName: 'ChatChamp', content: '', timestamp: new Date(Date.now() - 60000 * 9), type: 'gif', imageUrl: 'https://media.giphy.com/media/U4DswrBiaz0p67ZweH/giphy.gif' },
  { id: '93', userId: 'user92', userName: 'StackStar', content: 'Stacking coins like a boss', timestamp: new Date(Date.now() - 60000 * 8), type: 'text' },
  { id: '94', userId: 'user93', userName: 'GreenGang', content: 'Green candles only for DeHub! 💚', timestamp: new Date(Date.now() - 60000 * 7), type: 'text' },
  { id: '95', userId: 'user94', userName: 'MediaMint', content: 'Media and crypto combined perfectly', timestamp: new Date(Date.now() - 60000 * 6), type: 'text' },
  { id: '96', userId: 'user95', userName: 'RankRiser', content: 'Climbing the ranks daily!', timestamp: new Date(Date.now() - 60000 * 5), type: 'text' },
  { id: '97', userId: 'user96', userName: 'BullMode', content: '', timestamp: new Date(Date.now() - 60000 * 4), type: 'gif', imageUrl: 'https://media.giphy.com/media/Y2ZUWLrTy63j9T6qrK/giphy.gif' },
  { id: '98', userId: 'user97', userName: 'ViewVibes', content: 'Good vibes and good earnings', timestamp: new Date(Date.now() - 60000 * 3), type: 'text' },
  { id: '99', userId: 'user98', userName: 'CoinCraze', content: 'The coin system is brilliant', timestamp: new Date(Date.now() - 60000 * 2), type: 'text' },
  { id: '100', userId: 'user99', userName: 'DeHubDegen', content: 'Proud DeHub degen here! 🦧', timestamp: new Date(Date.now() - 60000 * 1.5), type: 'text' },
  { id: '101', userId: 'user100', userName: 'MoonMission', content: '', timestamp: new Date(Date.now() - 60000 * 1), type: 'gif', imageUrl: 'https://media.giphy.com/media/oNFP9kltPi7fp8TUAV/giphy.gif' },
];

export function PublicChat({ onBack, liveCount = '2.3k' }: PublicChatProps) {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const handleSendMessage = (content: string, type: 'text' | 'image' | 'gif', imageUrl?: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      userId: 'currentUser',
      userName: 'You',
      content,
      timestamp: new Date(),
      type,
      imageUrl,
    };
    
    setMessages(prev => [...prev, newMessage]);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
            onClick={onBack}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white">Public Chat</h2>
              <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">LIVE</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-500 text-xs">
              <Users className="w-3 h-3" />
              <span>{liveCount} online</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-white"
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="py-2">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      
      {/* Input Area */}
      <ChatInput onSendMessage={handleSendMessage} />
    </div>
  );
}
