import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Smile, Users, Loader2, ArrowDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TranslatableText } from '../TranslatableText';

const MESSAGES_PER_PAGE = 15;
interface ChatMessage {
  id: string;
  userName: string;
  content: string;
  timestamp: Date;
}

const initialMessages: ChatMessage[] = [
  { id: '1', userName: 'CryptoKing', content: 'DeHub is the future of content creation! 🚀', timestamp: new Date(Date.now() - 60000 * 100) },
  { id: '2', userName: 'GamerGirl99', content: 'Just earned 500 coins watching streams! W2E is insane 💰', timestamp: new Date(Date.now() - 60000 * 99) },
  { id: '3', userName: 'TechWizard', content: 'The UI is so clean, best platform I have used', timestamp: new Date(Date.now() - 60000 * 98) },
  { id: '4', userName: 'MoonHodler', content: 'Staking rewards are incredible here 🔥', timestamp: new Date(Date.now() - 60000 * 97) },
  { id: '5', userName: 'DiamondHands', content: 'DeHub coin to the moon! 🌙', timestamp: new Date(Date.now() - 60000 * 96) },
  { id: '6', userName: 'StreamQueen', content: 'Live streaming quality is unmatched', timestamp: new Date(Date.now() - 60000 * 95) },
  { id: '7', userName: 'CryptoNinja', content: 'Finally a platform that pays creators fairly!', timestamp: new Date(Date.now() - 60000 * 94) },
  { id: '8', userName: 'BlockchainBro', content: 'The decentralized model is genius 🧠', timestamp: new Date(Date.now() - 60000 * 93) },
  { id: '9', userName: 'TokenTitan', content: 'Shorts feature is addicting, so good', timestamp: new Date(Date.now() - 60000 * 92) },
  { id: '10', userName: 'WebThreeWiz', content: 'Watch to Earn is revolutionary! 💎', timestamp: new Date(Date.now() - 60000 * 91) },
  { id: '11', userName: 'AlphaTrader', content: 'DeHub leaderboard competition is fire', timestamp: new Date(Date.now() - 60000 * 90) },
  { id: '12', userName: 'ContentKing', content: 'Made more here in a week than a month elsewhere', timestamp: new Date(Date.now() - 60000 * 89) },
  { id: '13', userName: 'NFTCollector', content: 'The NFT integration is coming soon! 🎨', timestamp: new Date(Date.now() - 60000 * 88) },
  { id: '14', userName: 'DeFiDegen', content: 'Command Centre analytics are so useful', timestamp: new Date(Date.now() - 60000 * 87) },
  { id: '15', userName: 'PixelPunk', content: 'Community here is the best in Web3 🙌', timestamp: new Date(Date.now() - 60000 * 86) },
  { id: '16', userName: 'SatoshiFan', content: 'DeHub solving real problems for creators', timestamp: new Date(Date.now() - 60000 * 85) },
  { id: '17', userName: 'MetaMax', content: 'Just tipped my favorite streamer 100 coins!', timestamp: new Date(Date.now() - 60000 * 84) },
  { id: '18', userName: 'ChainChamp', content: 'The PPV feature is going to be huge', timestamp: new Date(Date.now() - 60000 * 83) },
  { id: '19', userName: 'HodlHero', content: 'Bullish on DeHub forever 📈', timestamp: new Date(Date.now() - 60000 * 82) },
  { id: '20', userName: 'CoinCrusher', content: 'Explore page algorithm is actually good', timestamp: new Date(Date.now() - 60000 * 81) },
  { id: '21', userName: 'ViralVince', content: 'My video just hit 10k views! DeHub delivers', timestamp: new Date(Date.now() - 60000 * 80) },
  { id: '22', userName: 'LunarLad', content: 'Notifications system keeps me engaged', timestamp: new Date(Date.now() - 60000 * 79) },
  { id: '23', userName: 'EthEnthusiast', content: 'Gas fees? What gas fees? DeHub is smooth', timestamp: new Date(Date.now() - 60000 * 78) },
  { id: '24', userName: 'StreamSniper', content: 'Live chat during streams is so fun 🎮', timestamp: new Date(Date.now() - 60000 * 77) },
  { id: '25', userName: 'TokenTycoon', content: 'Bookmarks feature helps me save the best content', timestamp: new Date(Date.now() - 60000 * 76) },
  { id: '26', userName: 'WhaleBait', content: 'Big things coming for DeHub holders! 🐋', timestamp: new Date(Date.now() - 60000 * 75) },
  { id: '27', userName: 'CryptoChef', content: 'Cooking up gains with W2E daily', timestamp: new Date(Date.now() - 60000 * 74) },
  { id: '28', userName: 'RocketRider', content: 'Profile customization is next level', timestamp: new Date(Date.now() - 60000 * 73) },
  { id: '29', userName: 'GemHunter', content: 'Found this gem early, not selling!', timestamp: new Date(Date.now() - 60000 * 72) },
  { id: '30', userName: 'BitBoss', content: 'Messages feature makes collabs easy', timestamp: new Date(Date.now() - 60000 * 71) },
  { id: '31', userName: 'ApeArmy', content: 'Aping into DeHub was my best decision 🦍', timestamp: new Date(Date.now() - 60000 * 70) },
  { id: '32', userName: 'FlowState', content: 'The shorts scroll is so smooth', timestamp: new Date(Date.now() - 60000 * 69) },
  { id: '33', userName: 'VaultViking', content: 'Stacking coins in my vault every day', timestamp: new Date(Date.now() - 60000 * 68) },
  { id: '34', userName: 'NeonNinja', content: 'Dark mode UI is beautiful 🖤', timestamp: new Date(Date.now() - 60000 * 67) },
  { id: '35', userName: 'PumpPatrol', content: 'DeHub pumping while others dump!', timestamp: new Date(Date.now() - 60000 * 66) },
  { id: '36', userName: 'HashHero', content: 'The verified badge system builds trust ✓', timestamp: new Date(Date.now() - 60000 * 65) },
  { id: '37', userName: 'BullBrigade', content: 'Bulls are taking over DeHub! 🐂', timestamp: new Date(Date.now() - 60000 * 64) },
  { id: '38', userName: 'StarStreamer', content: 'Going live in 10, see you there!', timestamp: new Date(Date.now() - 60000 * 63) },
  { id: '39', userName: 'YieldYoda', content: 'Passive income from watching content is genius', timestamp: new Date(Date.now() - 60000 * 62) },
  { id: '40', userName: 'ClickClout', content: 'Engagement metrics are transparent here', timestamp: new Date(Date.now() - 60000 * 61) },
  { id: '41', userName: 'MintMaster', content: 'Cant wait for NFT minting feature! 🎭', timestamp: new Date(Date.now() - 60000 * 60) },
  { id: '42', userName: 'FOMOFighter', content: 'Get in before the masses discover DeHub', timestamp: new Date(Date.now() - 60000 * 59) },
  { id: '43', userName: 'DataDruid', content: 'Analytics in Command Centre are pro-level', timestamp: new Date(Date.now() - 60000 * 58) },
  { id: '44', userName: 'StackSensei', content: 'Stacking sats AND DeHub coins daily', timestamp: new Date(Date.now() - 60000 * 57) },
  { id: '45', userName: 'VibeCheck', content: 'The vibes here are immaculate ✨', timestamp: new Date(Date.now() - 60000 * 56) },
  { id: '46', userName: 'GridGuru', content: 'Image grid layout is perfect for galleries', timestamp: new Date(Date.now() - 60000 * 55) },
  { id: '47', userName: 'LiquidLion', content: 'Liquidity getting deeper every day', timestamp: new Date(Date.now() - 60000 * 54) },
  { id: '48', userName: 'ClipKing', content: 'Clipping live moments is so easy here', timestamp: new Date(Date.now() - 60000 * 53) },
  { id: '49', userName: 'ToTheMoon', content: '100x potential easily! 🚀🚀🚀', timestamp: new Date(Date.now() - 60000 * 52) },
  { id: '50', userName: 'FeedFanatic', content: 'Home feed algorithm knows exactly what I like', timestamp: new Date(Date.now() - 60000 * 51) },
  { id: '51', userName: 'CashCow', content: 'Making money while being entertained 🤑', timestamp: new Date(Date.now() - 60000 * 50) },
  { id: '52', userName: 'PrimeTime', content: 'Prime time for DeHub adoption is NOW', timestamp: new Date(Date.now() - 60000 * 49) },
  { id: '53', userName: 'ReelRuler', content: 'Stories feature keeps content fresh', timestamp: new Date(Date.now() - 60000 * 48) },
  { id: '54', userName: 'GainzGod', content: 'Portfolio up 300% thanks to DeHub 📊', timestamp: new Date(Date.now() - 60000 * 47) },
  { id: '55', userName: 'PeakPerf', content: 'Platform performance is flawless', timestamp: new Date(Date.now() - 60000 * 46) },
  { id: '56', userName: 'TrendyTom', content: 'DeHub trending on crypto Twitter!', timestamp: new Date(Date.now() - 60000 * 45) },
  { id: '57', userName: 'CoreCoder', content: 'Dev team ships updates so fast 💻', timestamp: new Date(Date.now() - 60000 * 44) },
  { id: '58', userName: 'SwipeStyle', content: 'Swiping through shorts for hours', timestamp: new Date(Date.now() - 60000 * 43) },
  { id: '59', userName: 'VaultVIP', content: 'VIP features are worth every coin', timestamp: new Date(Date.now() - 60000 * 42) },
  { id: '60', userName: 'HypeHawk', content: 'The hype is real and deserved!', timestamp: new Date(Date.now() - 60000 * 41) },
  { id: '61', userName: 'StreamSage', content: 'Best streaming tools I have ever used', timestamp: new Date(Date.now() - 60000 * 40) },
  { id: '62', userName: 'BagBuilder', content: 'Building my bag with every view! 💼', timestamp: new Date(Date.now() - 60000 * 39) },
  { id: '63', userName: 'MediaMogul', content: 'DeHub is disrupting social media', timestamp: new Date(Date.now() - 60000 * 38) },
  { id: '64', userName: 'ChartChaser', content: 'Charts looking bullish AF 📈', timestamp: new Date(Date.now() - 60000 * 37) },
  { id: '65', userName: 'FollowFlow', content: 'Who to Follow suggestions are on point', timestamp: new Date(Date.now() - 60000 * 36) },
  { id: '66', userName: 'CoinCollector', content: 'Collected 1000 coins this week!', timestamp: new Date(Date.now() - 60000 * 35) },
  { id: '67', userName: 'BreakoutBoy', content: 'Breakout incoming, load up! 🔥', timestamp: new Date(Date.now() - 60000 * 34) },
  { id: '68', userName: 'GlobalGamer', content: 'Gaming content thriving on DeHub', timestamp: new Date(Date.now() - 60000 * 33) },
  { id: '69', userName: 'ProfitPro', content: 'Turned my hobby into profit here', timestamp: new Date(Date.now() - 60000 * 32) },
  { id: '70', userName: 'TierTop', content: 'Top tier platform, no competition', timestamp: new Date(Date.now() - 60000 * 31) },
  { id: '71', userName: 'EarlyBird', content: 'Early adopters will be rewarded! 🐦', timestamp: new Date(Date.now() - 60000 * 30) },
  { id: '72', userName: 'LiveLegend', content: 'Live streams get so much engagement', timestamp: new Date(Date.now() - 60000 * 29) },
  { id: '73', userName: 'TokenTrail', content: 'Following the DeHub trail to riches', timestamp: new Date(Date.now() - 60000 * 28) },
  { id: '74', userName: 'UpOnly', content: 'DeHub only goes up! ⬆️', timestamp: new Date(Date.now() - 60000 * 27) },
  { id: '75', userName: 'ContentCraft', content: 'Content creation tools are amazing', timestamp: new Date(Date.now() - 60000 * 26) },
  { id: '76', userName: 'MegaMint', content: 'Minting memories on DeHub daily', timestamp: new Date(Date.now() - 60000 * 25) },
  { id: '77', userName: 'RiseRocket', content: 'Rising through the leaderboards! 🏆', timestamp: new Date(Date.now() - 60000 * 24) },
  { id: '78', userName: 'ViewVault', content: 'Every view earns, love this model', timestamp: new Date(Date.now() - 60000 * 23) },
  { id: '79', userName: 'CryptoQueen', content: 'Queens support DeHub! 👑', timestamp: new Date(Date.now() - 60000 * 22) },
  { id: '80', userName: 'BasedBull', content: 'Most based platform in crypto', timestamp: new Date(Date.now() - 60000 * 21) },
  { id: '81', userName: 'TipTop', content: 'Tipping system is so seamless', timestamp: new Date(Date.now() - 60000 * 20) },
  { id: '82', userName: 'WaveWatcher', content: 'Riding the DeHub wave to success 🌊', timestamp: new Date(Date.now() - 60000 * 19) },
  { id: '83', userName: 'GridGains', content: 'Gains on gains with DeHub', timestamp: new Date(Date.now() - 60000 * 18) },
  { id: '84', userName: 'PostPro', content: 'Post creation is intuitive and fast', timestamp: new Date(Date.now() - 60000 * 17) },
  { id: '85', userName: 'HoldStrong', content: 'Holding DeHub strong! 💪', timestamp: new Date(Date.now() - 60000 * 16) },
  { id: '86', userName: 'EngageElite', content: 'Engagement rewards are next level', timestamp: new Date(Date.now() - 60000 * 15) },
  { id: '87', userName: 'FutureFlow', content: 'The future of social is DeHub', timestamp: new Date(Date.now() - 60000 * 14) },
  { id: '88', userName: 'ScrollStar', content: 'Could scroll this feed forever', timestamp: new Date(Date.now() - 60000 * 13) },
  { id: '89', userName: 'ValueVote', content: 'Real value for real creators here', timestamp: new Date(Date.now() - 60000 * 12) },
  { id: '90', userName: 'PeakPump', content: 'Peak pump season incoming! 🎯', timestamp: new Date(Date.now() - 60000 * 11) },
  { id: '91', userName: 'ChatChamp', content: 'This live chat feature is addicting', timestamp: new Date(Date.now() - 60000 * 10) },
  { id: '92', userName: 'StackStar', content: 'Stacking coins like a boss', timestamp: new Date(Date.now() - 60000 * 9) },
  { id: '93', userName: 'GreenGang', content: 'Green candles only for DeHub! 💚', timestamp: new Date(Date.now() - 60000 * 8) },
  { id: '94', userName: 'MediaMint', content: 'Media and crypto combined perfectly', timestamp: new Date(Date.now() - 60000 * 7) },
  { id: '95', userName: 'RankRiser', content: 'Climbing the ranks daily!', timestamp: new Date(Date.now() - 60000 * 6) },
  { id: '96', userName: 'BullMode', content: 'Bull mode activated 🐂', timestamp: new Date(Date.now() - 60000 * 5) },
  { id: '97', userName: 'ViewVibes', content: 'Good vibes and good earnings', timestamp: new Date(Date.now() - 60000 * 4) },
  { id: '98', userName: 'CoinCraze', content: 'The coin system is brilliant', timestamp: new Date(Date.now() - 60000 * 3) },
  { id: '99', userName: 'DeHubDegen', content: 'Proud DeHub degen here! 🦧', timestamp: new Date(Date.now() - 60000 * 2) },
  { id: '100', userName: 'MoonMission', content: 'Mission to the moon starts NOW! 🚀🌙', timestamp: new Date(Date.now() - 60000 * 1) },
];

export function SidebarChat() {
  const [displayedMessages, setDisplayedMessages] = useState<ChatMessage[]>(() => 
    initialMessages.slice(-MESSAGES_PER_PAGE)
  );
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialMessages.length > MESSAGES_PER_PAGE);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  // Calculate how many messages are loaded
  const loadedCount = displayedMessages.length;

  // Scroll to bottom only on initial mount and new messages
  useEffect(() => {
    if (isInitialMount.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'nearest' });
      isInitialMount.current = false;
    }
  }, []);

  // Load more messages when scrolling to top
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Check if user has scrolled up (show jump to latest button)
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowJumpToLatest(distanceFromBottom > 100);

    if (isLoadingMore || !hasMore) return;

    if (container.scrollTop < 50) {
      setIsLoadingMore(true);
      const previousHeight = container.scrollHeight;
      
      setTimeout(() => {
        const currentIndex = initialMessages.length - loadedCount;
        const newStartIndex = Math.max(0, currentIndex - MESSAGES_PER_PAGE);
        const newMessages = initialMessages.slice(newStartIndex, currentIndex);
        
        if (newMessages.length > 0) {
          setDisplayedMessages(prev => [...newMessages, ...prev]);
          setHasMore(newStartIndex > 0);
          
          // Maintain scroll position
          requestAnimationFrame(() => {
            if (container) {
              container.scrollTop = container.scrollHeight - previousHeight;
            }
          });
        }
        setIsLoadingMore(false);
      }, 300);
    }
  }, [isLoadingMore, hasMore, loadedCount]);

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleSend = () => {
    if (!newMessage.trim()) return;
    
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      userName: 'You',
      content: newMessage.trim(),
      timestamp: new Date(),
    };
    setDisplayedMessages(prev => [...prev, newMsg]);
    setNewMessage('');
    
    // Scroll to bottom for new message
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded">LIVE</span>
        <span className="text-zinc-400 text-xs flex items-center gap-1">
          <Users className="w-3 h-3" /> 2.3k online
        </span>
      </div>

      {/* Messages */}
      <div className="relative flex-1">
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto py-2 space-y-2"
        >
          {isLoadingMore && (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            </div>
          )}
          {displayedMessages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2">
              <Avatar className="w-6 h-6 flex-shrink-0">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userName}`} />
                <AvatarFallback className="bg-zinc-700 text-white text-[10px]">
                  {msg.userName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white">{msg.userName}</span>
                <TranslatableText text={msg.content} className="text-xs text-zinc-300 break-words" as="p" />
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Jump to latest button */}
        {showJumpToLatest && (
          <Button
            onClick={jumpToLatest}
            size="sm"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg z-10 rounded-full px-3 py-1 h-7 text-xs gap-1"
          >
            <ArrowDown className="w-3 h-3" />
            Jump to latest
          </Button>
        )}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
        <Input
          placeholder="Say something..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 h-8 bg-zinc-800 border-zinc-700 text-white text-xs placeholder:text-zinc-500 rounded-lg"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white"
          onClick={handleSend}
          disabled={!newMessage.trim()}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
