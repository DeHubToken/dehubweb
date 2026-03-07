/**
 * Glossary Page
 * =============
 * Explains all UI elements, icons, buttons and features of the app.
 * Native-feeling page rendered inside the app layout.
 */

import { useTranslation } from 'react-i18next';
import glossaryIcon from '@/assets/glossary-icon.png';
import dhbCoinIcon from '@/assets/dehub-coin.png';
import { BADGE_LEVELS, getBadgeUrl } from '@/lib/staking-badges';
import {
  ThumbsUp, ThumbsDown, Languages, Eye, MessageSquare, Share2, Ticket,
  Bookmark, Bell, Send, Heart, Flag, MoreHorizontal,
  Sparkles, Trophy, Wallet, ShieldCheck, Lightbulb, Radio,
  Video, Image, Coins, Users, Star, Lock, Unlock,
  ArrowUpDown, Zap, BookOpen, Search, Settings, Home,
  Play, Mic, Volume2, Crown, Gift, TrendingUp,
  Clock, CheckCircle2,
  Copy, ExternalLink, RotateCcw, Pencil, Trash2,
  ChevronUp, ChevronDown, Pin, AtSign, Hash,
} from 'lucide-react';

interface GlossaryEntry {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface GlossarySection {
  title: string;
  entries: GlossaryEntry[];
}

function GlossaryCard({ icon, title, description }: GlossaryEntry) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.08] flex items-center justify-center text-zinc-300">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-white mb-0.5">{title}</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function SectionBlock({ title, entries }: GlossarySection) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
        <div className="w-1 h-5 rounded-full bg-gradient-to-b from-purple-500 to-blue-500" />
        {title}
      </h2>
      <div className="grid gap-2">
        {entries.map((entry, i) => (
          <GlossaryCard key={i} {...entry} />
        ))}
      </div>
    </div>
  );
}

export default function GlossaryPage() {
  const { t } = useTranslation();
  const iconSize = 18;

  const sections: GlossarySection[] = [
    {
      title: t('glossary.sections.postInteractions', 'Post Interactions'),
      entries: [
        { icon: <ThumbsUp size={iconSize} />, title: t('glossary.thumbsUp', 'Thumbs Up (Like)'), description: t('glossary.thumbsUpDesc', 'Shows you like or agree with a post. Increases the post\'s engagement score and helps it rank higher in the feed.') },
        { icon: <ThumbsDown size={iconSize} />, title: t('glossary.thumbsDown', 'Thumbs Down (Dislike)'), description: t('glossary.thumbsDownDesc', 'Shows you dislike or disagree with a post. This feedback helps improve content recommendations.') },
        { icon: <MessageSquare size={iconSize} />, title: t('glossary.comment', 'Comment'), description: t('glossary.commentDesc', 'Opens the comment section where you can reply to a post, join discussions, and interact with other users.') },
        { icon: <Share2 size={iconSize} />, title: t('glossary.share', 'Share'), description: t('glossary.shareDesc', 'Share a post externally via a link, or copy the post URL to your clipboard to send to others.') },
        { icon: <Bookmark size={iconSize} />, title: t('glossary.bookmark', 'Bookmark'), description: t('glossary.bookmarkDesc', 'Save a post to your bookmarks for later. Access all saved posts from the Bookmarks page in the sidebar.') },
        { icon: <Gift size={iconSize} />, title: t('glossary.tip', 'Tip'), description: t('glossary.tipDesc', 'Send DHB tokens directly to a content creator as a reward for their content. Tips are recorded on-chain.') },
        { icon: <Flag size={iconSize} />, title: t('glossary.report', 'Report'), description: t('glossary.reportDesc', 'Flag inappropriate or harmful content for review. Reports help keep the community safe.') },
        { icon: <MoreHorizontal size={iconSize} />, title: t('glossary.moreOptions', 'More Options (⋯)'), description: t('glossary.moreOptionsDesc', 'Opens additional actions like editing, deleting, or reporting a post.') },
      ],
    },
    {
      title: t('glossary.sections.translation', 'Translation'),
      entries: [
        { icon: <Languages size={iconSize} />, title: t('glossary.translateButton', 'Translate Button'), description: t('glossary.translateButtonDesc', 'Translates post text, bios, and comments into your preferred language. The app auto-detects your browser language or you can set one manually in Settings.') },
        { icon: <RotateCcw size={iconSize} />, title: t('glossary.showOriginal', 'Show Original'), description: t('glossary.showOriginalDesc', 'After translating, tap this to revert back to the original language of the content.') },
      ],
    },
    {
      title: t('glossary.sections.contentTypes', 'Content Types'),
      entries: [
        { icon: <Image size={iconSize} />, title: t('glossary.imagePost', 'Image Post'), description: t('glossary.imagePostDesc', 'A post containing one or more images. Images are stored on-chain as NFTs with a unique Token ID.') },
        { icon: <Video size={iconSize} />, title: t('glossary.videoPost', 'Video Post'), description: t('glossary.videoPostDesc', 'A post containing a video. Videos can be set to public, private, or pay-per-view (PPV).') },
        { icon: <Radio size={iconSize} />, title: t('glossary.liveStream', 'Live Stream'), description: t('glossary.liveStreamDesc', 'A real-time broadcast. Viewers can watch, comment, and tip the streamer. Streams use low-latency HLS technology.') },
        { icon: <Clock size={iconSize} />, title: t('glossary.story', 'Story'), description: t('glossary.storyDesc', 'Short video content that expires after 24 hours. Tap a user\'s avatar ring on the home feed to view their story.') },
        { icon: <Play size={iconSize} />, title: t('glossary.audio', 'Audio'), description: t('glossary.audioDesc', 'An audio post with a visual waveform player. Creators can upload music, podcasts, or voice recordings.') },
        { icon: <Mic size={iconSize} />, title: t('glossary.audioSpace', 'Audio Space'), description: t('glossary.audioSpaceDesc', 'A live audio room where users can speak, listen, and raise their hand to join the conversation.') },
      ],
    },
    {
      title: t('glossary.sections.visibility', 'Visibility & Access'),
      entries: [
        { icon: <Unlock size={iconSize} />, title: t('glossary.public', 'Public'), description: t('glossary.publicDesc', 'Content visible to everyone. Anyone can view, like, and comment on public posts.') },
        { icon: <Lock size={iconSize} />, title: t('glossary.private', 'Private'), description: t('glossary.privateDesc', 'Content only visible to you. Private posts are hidden from other users and the public feed.') },
        { icon: <Ticket size={iconSize} />, title: t('glossary.ppv', 'Pay-Per-View (PPV)'), description: t('glossary.ppvDesc', 'Premium content that requires a DHB token payment to unlock. Creators set the price and earn revenue from each view.') },
        { icon: <Crown size={iconSize} />, title: t('glossary.subscriberOnly', 'Subscriber Only'), description: t('glossary.subscriberOnlyDesc', 'Content restricted to users who have subscribed to the creator\'s channel.') },
      ],
    },
    {
      title: t('glossary.sections.wallet', 'Wallet & Tokens'),
      entries: [
        { icon: <img src={dhbCoinIcon} alt="DHB" className="w-6 h-6" />, title: t('glossary.dhbToken', 'DHB Token'), description: t('glossary.dhbTokenDesc', 'The native utility token of DeHub. Used for tipping, pay-per-view content, governance voting, and staking.') },
        { icon: <Wallet size={iconSize} />, title: t('glossary.wallet', 'Wallet'), description: t('glossary.walletDesc', 'Your on-chain wallet that holds your DHB tokens and other crypto assets. Connected via Web3Auth for easy access.') },
        { icon: <ArrowUpDown size={iconSize} />, title: t('glossary.swap', 'Swap'), description: t('glossary.swapDesc', 'Exchange one token for another directly within the app. Swaps happen on-chain using decentralized exchanges.') },
        { icon: <TrendingUp size={iconSize} />, title: t('glossary.staking', 'Staking'), description: t('glossary.stakingDesc', 'Lock your DHB tokens to earn rewards over time. Staked tokens also give you increased voting power in governance.') },
        { icon: <Copy size={iconSize} />, title: t('glossary.txHash', 'Transaction Hash'), description: t('glossary.txHashDesc', 'A unique identifier for any on-chain transaction. Click it to view the full transaction details on a blockchain explorer.') },
      ],
    },
    {
      title: t('glossary.sections.social', 'Social Features'),
      entries: [
        { icon: <Users size={iconSize} />, title: t('glossary.followers', 'Followers / Following'), description: t('glossary.followersDesc', 'Follow other users to see their posts in your feed. Your follower count is displayed on your profile.') },
        { icon: <Bell size={iconSize} />, title: t('glossary.notifications', 'Notifications'), description: t('glossary.notificationsDesc', 'Alerts for likes, comments, tips, follows, and other activity related to your account.') },
        { icon: <Send size={iconSize} />, title: t('glossary.dm', 'Direct Messages'), description: t('glossary.dmDesc', 'Private messages between users. Currently available on the mobile app with web support coming soon.') },
        { icon: <AtSign size={iconSize} />, title: t('glossary.mention', 'Mentions (@)'), description: t('glossary.mentionDesc', 'Tag another user in a post or comment by typing @ followed by their username. They will receive a notification.') },
      ],
    },
    {
      title: t('glossary.sections.navigation', 'Navigation'),
      entries: [
        { icon: <Home size={iconSize} />, title: t('glossary.homeFeed', 'Home Feed'), description: t('glossary.homeFeedDesc', 'Your main feed showing posts from people you follow and trending content.') },
        { icon: <Search size={iconSize} />, title: t('glossary.explore', 'Explore'), description: t('glossary.exploreDesc', 'Discover new content and users. Browse by category: videos, images, live streams, and more.') },
        { icon: <Trophy size={iconSize} />, title: t('glossary.leaderboard', 'Leaderboard'), description: t('glossary.leaderboardDesc', 'Rankings of top users by balance, tips sent, tips received, followers, and more. Updated periodically.') },
        { icon: <Sparkles size={iconSize} />, title: t('glossary.assistant', 'AI Assistant'), description: t('glossary.assistantDesc', 'An AI-powered chat assistant that can answer questions, generate images, create videos, and help with platform features.') },
        { icon: <Settings size={iconSize} />, title: t('glossary.settings', 'Settings'), description: t('glossary.settingsDesc', 'Manage your account preferences, language, privacy settings, and appearance.') },
      ],
    },
    {
      title: t('glossary.sections.governance', 'Governance & Community'),
      entries: [
        { icon: <ShieldCheck size={iconSize} />, title: t('glossary.governance', 'Governance'), description: t('glossary.governanceDesc', 'Submit and vote on proposals that shape the platform. Your voting power is weighted by your DHB holdings.') },
        { icon: <Lightbulb size={iconSize} />, title: t('glossary.featureRequests', 'Feature Requests'), description: t('glossary.featureRequestsDesc', 'Suggest new features and vote on community ideas. Popular requests get prioritized for development.') },
        { icon: <ChevronUp size={iconSize} />, title: t('glossary.upvote', 'Upvote'), description: t('glossary.upvoteDesc', 'Vote in favor of a governance proposal or feature request. Helps signal community support.') },
        { icon: <ChevronDown size={iconSize} />, title: t('glossary.downvote', 'Downvote'), description: t('glossary.downvoteDesc', 'Vote against a governance proposal or feature request. Helps signal community opposition.') },
      ],
    },
    {
      title: t('glossary.sections.badges', 'Badges & Ranking'),
      entries: [
        { icon: <Star size={iconSize} />, title: t('glossary.stakingBadge', 'Staking Badges'), description: t('glossary.stakingBadgeDesc', 'Badges displayed next to your username based on your total DHB holdings (wallet + staked). There are 13 tiers — the more DHB you hold, the higher your badge rank. Higher tiers grant more governance voting power and lower platform fees.') },
        ...BADGE_LEVELS.map((b, i) => {
          const fee = i === BADGE_LEVELS.length - 1 ? 1 : parseFloat((10 - i * 0.69).toFixed(2));
          return {
            icon: <img src={getBadgeUrl(b.min) || ''} alt={b.name} className="w-6 h-6 brightness-0 invert" />,
            title: b.name,
            description: `Requires ${b.min.toLocaleString()} DHB · ${fee}% platform fee`,
          };
        }),
        { icon: <Trophy size={iconSize} />, title: t('glossary.leaderboardRanking', 'Leaderboard Ranking'), description: t('glossary.leaderboardRankingDesc', 'Users are ranked by total DHB balance (wallet + staked across all chains). Rankings update periodically and track 1-day and 1-week changes. You can also sort by tips sent, tips received, followers, likes, or subscribers.') },
        { icon: <TrendingUp size={iconSize} />, title: t('glossary.delta', 'Ranking Delta (▲▼)'), description: t('glossary.deltaDesc', 'The green or red arrow next to a leaderboard entry shows how much a user\'s balance changed over the selected time period (1 day, 1 week, etc.).') },
        { icon: <Zap size={iconSize} />, title: t('glossary.tokenId', 'Token ID'), description: t('glossary.tokenIdDesc', 'A unique on-chain identifier assigned to each post when it\'s minted as an NFT on the blockchain.') },
      ],
    },
    {
      title: t('glossary.sections.postActions', 'Post Management'),
      entries: [
        { icon: <Pencil size={iconSize} />, title: t('glossary.edit', 'Edit Post'), description: t('glossary.editDesc', 'Modify the title or description of a post you created. Only the original creator can edit their posts.') },
        { icon: <Trash2 size={iconSize} />, title: t('glossary.delete', 'Delete Post'), description: t('glossary.deleteDesc', 'Permanently remove a post from the feed. The on-chain record remains but the content is no longer displayed.') },
        { icon: <Pin size={iconSize} />, title: t('glossary.pin', 'Pin Post'), description: t('glossary.pinDesc', 'Pin a post to the top of your profile so visitors see it first.') },
        { icon: <ExternalLink size={iconSize} />, title: t('glossary.viewOnExplorer', 'View on Explorer'), description: t('glossary.viewOnExplorerDesc', 'Opens the blockchain explorer (BaseScan) to view the on-chain transaction details for a post or transfer.') },
      ],
    },
  ];

  return (
    <div className="px-2 pt-1 pb-6 sm:px-3 sm:pt-1 sm:pb-6 lg:pt-2 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <img src={glossaryIcon} alt="Glossary" className="w-10 h-10 object-contain brightness-75" />
        <div>
          <h1 className="text-[1.1rem] sm:text-[1.32rem] font-bold text-white">{t('glossary.title', 'Glossary')}</h1>
          <p className="text-xs text-zinc-500">{t('glossary.subtitle', 'Learn what every icon and feature means')}</p>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section, i) => (
        <SectionBlock key={i} {...section} />
      ))}
    </div>
  );
}
