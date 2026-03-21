import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Lightbulb, Menu, X,
  Home, PenSquare, ThumbsUp, Search, User, MessageCircle,
  Bot, Bell, Wallet, Landmark, Trophy, LayoutDashboard,
  Vote, Bookmark, Settings, ArrowLeftRight, Music, Tv,
  BookOpen, ShoppingCart, LogIn
} from "lucide-react";

// Guide screenshots
import screenshotLanding from "@/assets/guide/landing.png";
import screenshotHomeFeed from "@/assets/guide/home-feed.png";
import screenshotExplore from "@/assets/guide/explore.png";
import screenshotMessages from "@/assets/guide/messages.png";
import screenshotAssistant from "@/assets/guide/assistant.png";
import screenshotNotifications from "@/assets/guide/notifications.png";
import screenshotLeaderboard from "@/assets/guide/leaderboard.png";
import screenshotBookmarks from "@/assets/guide/bookmarks.png";
import screenshotSettings from "@/assets/guide/settings.png";
import screenshotGovernance from "@/assets/guide/governance.png";
import screenshotCommandCentre from "@/assets/guide/command-centre.png";
import screenshotTv from "@/assets/guide/tv.png";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface GuideSection {
  id: string;
  title: string;
  icon: React.ElementType;
  intro: string;
  steps: string[];
  tips?: string[];
  screenshot?: string;
}

const sections: GuideSection[] = [
  {
    id: "getting-started",
    screenshot: screenshotLanding,
    title: "Getting Started",
    icon: LogIn,
    intro: "DeHub supports two ways to sign in: social login via Web3Auth (email, Google, X, etc.) or connecting an external wallet like MetaMask. Social-login users get a smart account — the platform covers all gas fees. External-wallet users need to hold gas on the relevant chain.",
    steps: [
      "Visit dehub.io and click 'Launch App' or navigate to /app.",
      "Choose 'Sign In' — you'll see social login options (Google, X, Email, etc.) and a 'Connect Wallet' option for external wallets.",
      "If using social login, complete the sign-in flow. A smart account is created for you automatically — no gas needed.",
      "If connecting an external wallet, approve the connection in your wallet extension or mobile app.",
      "After signing in, you'll be prompted to set a username. This is required to interact on the platform.",
      "You're in! Explore the feed, set up your profile, and start posting."
    ],
    tips: [
      "Social-login users never pay gas — DeHub covers it via account abstraction.",
      "External-wallet users need gas on the chain they're interacting with.",
      "You can copy your wallet address from the sidebar or your profile page."
    ]
  },
  {
    id: "home-feed",
    screenshot: screenshotHomeFeed,
    title: "Home Feed",
    icon: Home,
    intro: "The home feed is where you see posts from people you follow and trending content. It supports multiple content-type tabs and sorting options.",
    steps: [
      "Navigate to /app — this is your home feed.",
      "Use the top tabs to filter by content type: Home (all), Videos, Images, Shorts, Music, or Live streams.",
      "Swipe left/right on the tabs to see more options on mobile.",
      "Use the filter/sort button (top-right of the feed) to change sorting: Hot, New, or Top.",
      "Pull down to refresh the feed on mobile.",
      "Scroll down to load more posts automatically (infinite scroll).",
      "Toggle between Grid and Feed view using the layout switcher."
    ],
    tips: [
      "Grid view is great for browsing images quickly.",
      "The 'Home' tab shows all content types mixed together.",
      "Live tab shows currently active live streams."
    ]
  },
  {
    id: "creating-posts",
    screenshot: screenshotHomeFeed,
    title: "Creating Posts",
    icon: PenSquare,
    intro: "Create text posts, share images, videos, voice notes, GIFs, and more. Use hashtags, cashtags, and mentions to increase reach.",
    steps: [
      "Click the 'Post' button in the sidebar (desktop) or the + button (mobile).",
      "Type your text in the compose area.",
      "To add an image or video, click the media icon and select a file.",
      "To record a voice note, click the microphone icon.",
      "To add a GIF, click the GIF icon and search for one.",
      "Use #hashtags to categorize your post (e.g., #crypto, #defi).",
      "Use $cashtags to reference tokens (e.g., $DHB, $ETH).",
      "Use @mentions to tag other users (e.g., @username).",
      "Click 'Post' to publish. Your post appears in the feed immediately."
    ],
    tips: [
      "Posts support markdown-style formatting.",
      "You can quote-post by clicking the repost icon on any post and selecting 'Quote'.",
      "Categories (hashtags) appear in the 'Talk of the Town' leaderboard."
    ]
  },
  {
    id: "interacting-with-posts",
    screenshot: screenshotHomeFeed,
    title: "Interacting with Posts",
    icon: ThumbsUp,
    intro: "Engage with content by voting, commenting, tipping, bookmarking, sharing, and translating.",
    steps: [
      "Upvote or downvote a post using the arrow icons on the left side of any post.",
      "Click the comment icon to open the comment section and leave a reply.",
      "Click the gem/tip icon to send a DHB tip to the post creator.",
      "Click the bookmark icon to save a post for later.",
      "Click the share icon to copy the post link or share externally.",
      "Click the translate button (globe icon) on any post to translate text to your language.",
      "For image posts, use the 'Translate Image' button to get an AI-translated version of text within the image.",
      "Click on any post to open it in full-screen single-post view."
    ],
    tips: [
      "Tips go directly to the creator's wallet in DHB tokens.",
      "You can set a tip amount via quick-select buttons or enter a custom amount.",
      "Bookmarked posts are accessible from the Bookmarks page in the sidebar."
    ]
  },
  {
    id: "explore-search",
    screenshot: screenshotExplore,
    title: "Explore & Search",
    icon: Search,
    intro: "Discover new content and users through the explore page and powerful search functionality.",
    steps: [
      "Navigate to /app/explore from the sidebar.",
      "Use the search bar at the top to search for users, posts, or content.",
      "Filter results by tab: All, People, Posts, Images, Videos, Music, Live.",
      "Browse trending topics and categories on the explore page.",
      "Click on a trending topic to see all related posts.",
      "Click on a user in search results to visit their profile."
    ],
    tips: [
      "Search supports usernames, wallet addresses, and content keywords.",
      "Trending topics update based on recent posting activity."
    ]
  },
  {
    id: "profile",
    screenshot: screenshotHomeFeed,
    title: "Profile",
    icon: User,
    intro: "Your profile showcases your posts, followers, following, and wallet information.",
    steps: [
      "Click your avatar or 'Profile' in the sidebar to view your profile.",
      "Click 'Edit Profile' to update your display name, bio, and avatar.",
      "Upload a profile picture by clicking on your avatar in edit mode.",
      "View your follower and following counts on your profile page.",
      "Browse your own posts, media, and liked content via the profile tabs.",
      "Copy your wallet address by clicking the copy icon next to it.",
      "Visit other users' profiles by clicking their username or avatar anywhere on the platform."
    ],
    tips: [
      "Your username is unique and appears in your profile URL (dehub.io/@username).",
      "Privacy settings let you control who can see your follower counts."
    ]
  },
  {
    id: "messages",
    screenshot: screenshotMessages,
    title: "Messages",
    icon: MessageCircle,
    intro: "Send direct messages to other users on the platform.",
    steps: [
      "Click 'Messages' in the sidebar to open the messaging page.",
      "Click the compose button to start a new conversation.",
      "Search for a user by username to message them.",
      "Type your message and press send.",
      "View your conversation history in the messages list.",
      "Click on a conversation to continue chatting."
    ],
    tips: [
      "You'll receive a notification when someone messages you.",
      "Creators can lock messages behind a tip requirement."
    ]
  },
  {
    id: "ai-assistant",
    screenshot: screenshotAssistant,
    title: "AI Assistant",
    icon: Bot,
    intro: "Chat with DeHub's built-in AI assistant for help, information, and creative tasks.",
    steps: [
      "Click 'Assistant' in the sidebar to open the AI chat.",
      "Type your question or request in the chat input.",
      "The AI can help with crypto information, platform questions, and general knowledge.",
      "Start a new conversation by clicking the new chat button.",
      "View your conversation history in the sidebar of the assistant page.",
      "You can attach images for the AI to analyze."
    ],
    tips: [
      "The AI remembers context within a conversation.",
      "You can ask the AI about DeHub features, crypto terms, or general questions.",
      "Previous conversations are saved and accessible anytime."
    ]
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: Bell,
    intro: "Stay updated with likes, comments, tips, follows, and other activity on your content.",
    steps: [
      "Click the bell icon or 'Notifications' in the sidebar.",
      "View all notifications in a chronological list.",
      "Click on a notification to navigate to the related content.",
      "Notifications include: new followers, post votes, comments, tips, and mentions.",
      "Unread notifications are highlighted — they mark as read when viewed."
    ],
    tips: [
      "The notification badge shows the count of unread notifications.",
      "Tip notifications show the amount of DHB you received."
    ]
  },
  {
    id: "wallet",
    title: "Wallet",
    icon: Wallet,
    intro: "View your DHB balances across multiple chains, check staking deposits, and manage your assets.",
    steps: [
      "Click 'Wallet' in the sidebar to open the wallet page.",
      "View your total DHB balance aggregated across all supported chains.",
      "See per-chain breakdowns: Ethereum, Base, BNB Chain, and more.",
      "Check your staking deposits and rewards.",
      "Click 'Refresh Scan' to update your balances from on-chain data.",
      "Copy your wallet address to receive tokens from others."
    ],
    tips: [
      "Balances update automatically but you can force a refresh anytime.",
      "The wallet shows both liquid (available) and staked balances."
    ]
  },
  {
    id: "staking",
    title: "Staking",
    icon: Landmark,
    intro: "Stake your DHB tokens to earn rewards and increase your governance voting power.",
    steps: [
      "Navigate to the 'Staking' page from the sidebar.",
      "Enter the amount of DHB you want to stake.",
      "Select the chain you want to stake on.",
      "Confirm the transaction in your wallet (external wallets) or it auto-executes (social login).",
      "View your staked amounts and any pending rewards.",
      "To unstake, enter the amount and confirm the unstaking transaction."
    ],
    tips: [
      "Staking increases your vote weight in governance proposals.",
      "Social-login users don't need gas to stake — it's gasless.",
      "You can stake on multiple chains simultaneously."
    ]
  },
  {
    id: "leaderboard",
    title: "Leaderboard",
    icon: Trophy,
    intro: "See who's on top! The leaderboard ranks users by balance, daily spending, and trending topics.",
    steps: [
      "Navigate to the 'Leaderboard' page from the sidebar.",
      "Switch between tabs: Balance, Daily Spent, and Talk of the Town.",
      "Balance tab ranks users by their total DHB holdings.",
      "Daily Spent tab shows who's been most active tipping in the last 24 hours.",
      "Talk of the Town shows the most-discussed topics/categories.",
      "Click on any user to visit their profile.",
      "The leaderboard updates periodically throughout the day."
    ],
    tips: [
      "Daily rankings reset every 24 hours.",
      "Talk of the Town tracks single-word categories from hashtags."
    ]
  },
  {
    id: "command-centre",
    title: "Command Centre",
    icon: LayoutDashboard,
    intro: "A dashboard overview showing your key metrics and platform activity at a glance.",
    steps: [
      "Click 'Command Centre' in the sidebar.",
      "View your profile summary, including post count, followers, and engagement.",
      "See your recent activity and trending topics.",
      "Access quick links to commonly used features."
    ],
    tips: [
      "The Command Centre gives you a bird's-eye view of your DeHub presence."
    ]
  },
  {
    id: "governance",
    title: "Governance",
    icon: Vote,
    intro: "Participate in platform governance by creating proposals and voting on community decisions.",
    steps: [
      "Navigate to 'Governance' from the sidebar.",
      "Browse active proposals submitted by the community.",
      "Click on a proposal to read its full description and discussion.",
      "Vote on proposals using the thumbs up/down buttons — your vote weight depends on your DHB stake.",
      "Leave comments on proposals to discuss with the community.",
      "Submit your own proposal by clicking the 'Create Proposal' button."
    ],
    tips: [
      "Your voting power is determined by your staked DHB amount.",
      "Badge holders may get additional vote weight.",
      "Proposals go through stages: Active → Passed/Rejected."
    ]
  },
  {
    id: "bookmarks",
    title: "Bookmarks",
    icon: Bookmark,
    intro: "Save posts to your bookmarks for easy access later.",
    steps: [
      "Click the bookmark icon on any post to save it.",
      "Navigate to 'Bookmarks' in the sidebar to view all saved posts.",
      "Click on a bookmarked post to view it in full.",
      "Remove a bookmark by clicking the bookmark icon again."
    ],
    tips: [
      "Bookmarks are private — only you can see your saved posts.",
      "There's no limit to how many posts you can bookmark."
    ]
  },
  {
    id: "settings",
    title: "Settings",
    icon: Settings,
    intro: "Customize your DeHub experience with language, privacy, and display preferences.",
    steps: [
      "Click 'Settings' in the sidebar.",
      "Change your display language from the language selector.",
      "Adjust privacy settings: control who sees your follower counts and following list.",
      "Set your default post visibility preferences.",
      "Manage notification preferences."
    ],
    tips: [
      "DeHub supports multiple languages — the entire interface translates.",
      "Privacy settings apply immediately."
    ]
  },
  {
    id: "buying-dhb",
    title: "Buying DHB",
    icon: ShoppingCart,
    intro: "Buy DHB tokens directly within the app using the built-in swap interface.",
    steps: [
      "Navigate to the 'Buy' page from the sidebar.",
      "Select the token you want to swap from (e.g., ETH, USDC).",
      "Enter the amount you want to spend or the amount of DHB you want to receive.",
      "Review the exchange rate and estimated output.",
      "Click the settings gear icon to adjust slippage tolerance (default is 1%).",
      "Confirm the swap transaction.",
      "DHB tokens will appear in your wallet once the transaction completes."
    ],
    tips: [
      "Higher slippage tolerance = more likely to execute, but potential for worse pricing.",
      "Always check the exchange rate before confirming.",
      "You can set custom slippage in the settings panel."
    ]
  },
  {
    id: "bridge",
    title: "Bridge",
    icon: ArrowLeftRight,
    intro: "Move your DHB tokens between supported blockchains using the cross-chain bridge.",
    steps: [
      "Navigate to the 'Bridge' page from the sidebar.",
      "Select the source chain (where your DHB currently is).",
      "Select the destination chain (where you want to send DHB).",
      "Enter the amount of DHB to bridge.",
      "Review the bridge fee and estimated arrival time.",
      "Confirm the bridge transaction.",
      "Wait for the transaction to complete — bridging may take a few minutes."
    ],
    tips: [
      "Bridge fees vary by chain pair.",
      "Bridging typically takes 1-5 minutes depending on the chains involved.",
      "Always double-check the destination chain before confirming."
    ]
  },
  {
    id: "music-tv",
    title: "Music & TV",
    icon: Music,
    intro: "Enjoy media content directly within DeHub — stream music and watch live TV channels.",
    steps: [
      "Navigate to 'Music' from the sidebar to browse and play music posts.",
      "Navigate to 'TV' to access live TV channels.",
      "Browse channels by category or country.",
      "Click on a channel to start watching.",
      "Use the player controls to adjust volume and playback.",
      "Report broken channels using the report button."
    ],
    tips: [
      "TV channels are community-verified for reliability.",
      "Music posts can be played while browsing other content."
    ]
  },
  {
    id: "glossary",
    title: "Glossary",
    icon: BookOpen,
    intro: "A comprehensive glossary of crypto and platform terminology to help you navigate Web3.",
    steps: [
      "Navigate to 'Glossary' from the sidebar.",
      "Browse terms alphabetically or use the search to find specific terms.",
      "Click on a term to see its full definition and explanation.",
      "Terms cover crypto concepts, DeFi terminology, and DeHub-specific features."
    ],
    tips: [
      "Great resource for newcomers to crypto and Web3.",
      "The glossary is regularly updated with new terms."
    ]
  },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const ScreenshotPlaceholder = () => (
  <div className="w-full h-48 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-white/30 text-sm select-none mt-4">
    Screenshot coming soon
  </div>
);

const SectionCard = React.forwardRef<HTMLDivElement, { section: GuideSection }>(
  ({ section }, ref) => {
    const Icon = section.icon;
    return (
      <div
        ref={ref}
        id={section.id}
        className="bg-white/5 backdrop-blur-[24px] border border-white/10 rounded-2xl p-6 md:p-8 scroll-mt-24"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl md:text-2xl font-bold text-white">{section.title}</h2>
        </div>

        <p className="text-white/70 mb-6 leading-relaxed">{section.intro}</p>

        <div className="space-y-3 mb-6">
          {section.steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60 mt-0.5">
                {i + 1}
              </span>
              <p className="text-white/80 text-sm leading-relaxed">{step}</p>
            </div>
          ))}
        </div>

        {section.tips && section.tips.length > 0 && (
          <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold text-yellow-400">Pro Tips</span>
            </div>
            <ul className="space-y-1.5">
              {section.tips.map((tip, i) => (
                <li key={i} className="text-sm text-white/60 flex gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-yellow-400/50" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ScreenshotPlaceholder />
      </div>
    );
  }
);
SectionCard.displayName = "SectionCard";

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const GuidePage: React.FC = () => {
  const [activeId, setActiveId] = useState(sections[0].id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-8 h-16">
          <Link to="/app" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to App</span>
          </Link>
          <h1 className="text-lg font-bold">DeHub User Guide</h1>
          <button
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="hidden md:block w-24" />
        </div>
      </header>

      {/* Mobile nav */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-black/95 backdrop-blur-xl overflow-y-auto p-4">
          <nav className="space-y-1">
            {sections.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${
                    activeId === s.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {s.title}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex gap-8 px-4 md:px-8 py-8">
        {/* Desktop TOC sidebar */}
        <aside className="hidden md:block w-60 shrink-0">
          <nav className="sticky top-24 space-y-0.5 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 scrollbar-thin">
            {sections.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-all ${
                    activeId === s.id
                      ? "bg-white/10 text-white font-medium"
                      : "text-white/40 hover:text-white/70 hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 space-y-6 pb-20">
          {/* Hero */}
          <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-6 md:p-10 mb-2">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">
              Welcome to DeHub
            </h1>
            <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
              Your complete guide to using DeHub — the decentralized social media platform.
              Learn how to create posts, tip creators, stake tokens, participate in governance, and more.
            </p>
          </div>

          {sections.map(s => (
            <SectionCard key={s.id} section={s} />
          ))}
        </main>
      </div>
    </div>
  );
};

export default GuidePage;
