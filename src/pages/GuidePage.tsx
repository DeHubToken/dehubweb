import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight, Lightbulb, Menu, X,
  Home, PenSquare, ThumbsUp, Search, User, MessageCircle,
  Bot, Bell, Wallet, Landmark, Trophy, LayoutDashboard,
  Vote, Bookmark, Settings, ArrowLeftRight, Music, Tv,
  BookOpen, ShoppingCart, LogIn
} from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

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
import { SEOHead } from "@/components/SEOHead";
import { ThemedIcon } from "@/components/app/war/WarHudIcon";
import { useFeedSwallowClip } from "@/hooks/use-feed-swallow-clip";

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
    intro: "There are five ways into DeHub and none of them need you to already own a wallet: Google, Apple, a code sent to your email, a code sent by SMS, or an existing wallet you connect. Everything except the wallet route creates a non-custodial wallet for you in the background — you hold the keys, and DeHub sponsors the gas so you can post, tip and collect without ever buying a native token.",
    steps: [
      "Visit dehub.io — the home feed is the front page, so you can look around before signing in.",
      "Click 'Sign In'. You'll see Google and Apple, fields for an email address or a phone number, and 'Connect Wallet' for an existing one.",
      "With Google or Apple, complete the provider's flow. With email or SMS, enter the code that arrives.",
      "A wallet is created and secured for you on first sign-in. Connecting your own wallet instead means one signature to prove the address.",
      "Pick a username. It is what people see and it doubles as your dehub.io/<username> profile link.",
      "You're in. Explore the feed, set up your profile, and start posting."
    ],
    tips: [
      "Social, email and SMS sign-ins never pay gas — DeHub sponsors it. Connected wallets pay their own ETH or BNB.",
      "Coming back to a legacy DeHub account? Sign in with the email or phone number it used and the migration finds it for you.",
      "You can keep several accounts on one device and switch between them in Settings → Profile."
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
    screenshot: screenshotNotifications,
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
    screenshot: screenshotCommandCentre,
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
    screenshot: screenshotCommandCentre,
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
    screenshot: screenshotLeaderboard,
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
    screenshot: screenshotCommandCentre,
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
    screenshot: screenshotGovernance,
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
    screenshot: screenshotBookmarks,
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
    screenshot: screenshotSettings,
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
    id: "posting-allowance",
    title: "Your Daily Posting Allowance",
    icon: PenSquare,
    intro: "Posting is free every day up to an allowance that scales with your staking badge. Everybody starts with ten text posts and one gigabyte of video, images and audio per day. Go past either one and the rest of that day is paid for in DHB — only on the part that runs over.",
    steps: [
      "Post as normal. Inside the allowance nothing is charged and nothing is asked of you.",
      "Text posts and media are separate pools, so a day spent uploading video still leaves all ten text posts free.",
      "When a post would run over, the app prices it first and checks your wallet can cover it before anything uploads.",
      "The post publishes exactly as it would inside the allowance — publishing never waits on a payment.",
      "Then you approve one transfer for that post only, settled on whichever of Base or BNB Chain holds enough DHB.",
      "Both pools reset at midnight UTC."
    ],
    tips: [
      "Overage is pro-rata: 200 MB past your allowance costs 200 MB, not a whole gigabyte.",
      "Reposts, comments, reactions, tips and messages cost nothing and never touch the allowance.",
      "Decline the payment and the post stays up — the amount just blocks your next paid post until it is settled. Tomorrow's free allowance is always yours.",
      "A staking badge raises the free allowance and lowers the price of anything past it."
    ]
  },
  {
    id: "reactions-and-safety",
    title: "Reactions, Muting & Mature Content",
    icon: ThumbsUp,
    intro: "There are nine reactions behind the like button, and a set of controls for deciding what you see and who can reach you.",
    steps: [
      "Hold the thumbs-up on any post to open the reaction tray: like, love, respect, hot, lol, sad, cry, dislike and poo.",
      "The seven positive ones count towards the post's like total; dislike and poo count against it.",
      "Your reaction is weighted by your staking badge, so a badge holder's reaction moves the count further than one vote.",
      "Tap the X in a post's header to mute its author — they drop out of your feed straight away.",
      "Creators mark their own posts as mature while composing them; those posts stay off the public home feed.",
      "To see mature posts everywhere, turn on 'Show mature content' in Settings."
    ],
    tips: [
      "A mature post is still fully visible on the creator's profile and to the people who follow them.",
      "Blocking from a profile goes further than muting and cuts off messaging too.",
      "The reaction tray shows who reacted and with what, so you can see the room rather than just a number."
    ]
  },
  {
    id: "stages",
    title: "Stages (Live Audio Rooms)",
    icon: MessageCircle,
    intro: "Stages are live audio rooms built into DeHub. A host opens a room, brings speakers up, and anyone can drop in to listen from the Stages page or a shared link.",
    steps: [
      "Open 'Stages' in the sidebar to see what is live now and what is scheduled.",
      "Tap a live stage to join as a listener, or set a reminder on a scheduled one and get told when it starts.",
      "Start your own from the same page — you can go live straight from the browser, with no OBS or stream key.",
      "As host, bring speakers on stage, mute or remove them, share your screen, and drive the soundboard.",
      "Listeners send live reactions and talk in the room chat without coming on stage.",
      "Every stage records, and the recording plays back afterwards from the card it appears on."
    ],
    tips: [
      "Live subtitles caption each speaker and translate into whatever language you are reading in.",
      "Live dubbing can speak the room aloud in the host's own cloned voice, billed by the minute in DHB.",
      "Hosts can put a radio station on air or play their own music clips between conversations.",
      "A mini-player keeps the room going in the corner while you browse the rest of the app."
    ]
  },
  {
    id: "communities",
    title: "Communities & Events",
    icon: Landmark,
    intro: "Communities are member-run spaces with their own feed, members and activity. Events add time-bound programming on top of them.",
    steps: [
      "Open 'Communities' in the sidebar and browse the public ones.",
      "Join in one tap. New activity shows as an unread badge in the navigation.",
      "Post, discuss, run polls and tip inside a community's own feed.",
      "Community owners moderate their own space and can grant admin rights to others.",
      "Open 'Events' for scheduled programming, with a full page per event you can follow along with live."
    ],
    tips: [
      "Community chat supports @mentions and @here, so a post can reach the room.",
      "An invite link lets you bring people straight into a community."
    ]
  },
  {
    id: "arcade",
    title: "Arcade",
    icon: Trophy,
    intro: "Five games run inside DeHub in a browser tab — nothing to install, nothing to buy.",
    steps: [
      "Open 'Arcade' in the sidebar.",
      "Pick a game: King's Gambit (3D chess with an online Elo ladder), Claude of Duty (a shooter that generates its own art as it loads), Jungle Trail (a procedural rainforest walk), Street Slayer (a beat 'em up made for DeHub) or Trenchstar (a walkable trading floor).",
      "Play in the tab. King's Gambit and Street Slayer keep leaderboards.",
      "Trenchstar also runs in a VR headset through WebXR."
    ],
    tips: [
      "Two of them hide inside the appearance themes — set the app to War for Claude of Duty, or Jungle for Jungle Trail.",
      "Every game has its own share card, so a link to one unfurls properly wherever you post it."
    ]
  },
  {
    id: "bounties-stores",
    title: "Bounties & Stores",
    icon: ShoppingCart,
    intro: "Two ways to turn the platform into income: post or claim a bounty, or open a storefront and sell to your audience.",
    steps: [
      "Open 'Bounties' to browse open work, filtered by category or currency.",
      "Claim one, do the work, and submit it to collect the reward — anyone can be a hunter, no application needed.",
      "Post your own bounty with a brief and a reward in DHB or USDC. It goes into escrow the moment you post it.",
      "Open 'Stores' to set up a storefront with its own page, branding and listings.",
      "Products are priced and settled in DHB through the built-in wallet, with no external checkout."
    ],
    tips: [
      "Bounties are organised into Social Media, Clipping and Contracts.",
      "A dispute flow settles disagreements over delivery, so escrow always resolves fairly.",
      "Creators use bounties to grow a community — shares, clips and reactions are all valid tasks."
    ]
  },
  {
    id: "creator-studio",
    title: "Creator Studio & Editor",
    icon: PenSquare,
    intro: "Creator Studio generates images, video, music, voice and 3D models from a prompt, and hands them to an editor — including a full multi-track video editor that runs in the browser.",
    steps: [
      "Open Creator Studio and describe what you want made.",
      "The server quotes the cost before the job runs, so you see what it costs before you spend it.",
      "Renders continue in a shared queue while you carry on browsing the app.",
      "Arrange the results in the Canva-style editor, or open the video editor for a real timeline with cutting, layering and export.",
      "Drop the finished piece straight into a post, a short or a store listing."
    ],
    tips: [
      "A free stock asset library sits alongside the Studio for anything you would rather not generate.",
      "Generation runs on AI credits, denominated in DHB, which every account accrues daily.",
      "Heavier users can take an Ultra, Team or Scale plan for a monthly credit allowance instead."
    ]
  },
  {
    id: "buying-dhb",
    screenshot: screenshotCommandCentre,
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
    screenshot: screenshotCommandCentre,
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
    screenshot: screenshotTv,
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
    id: "post-info",
    screenshot: screenshotHomeFeed,
    title: "Post Info & Fractions",
    icon: BookOpen,
    intro: "A minted post is an NFT split into 1,000 fractions. The Post Info page shows on-chain data, engagement stats, ownership breakdown, and lets you trade fractions of any post — on an unminted post it offers to mint instead.",
    steps: [
      "Tap the 'ⓘ' icon on any post to open its Post Info page.",
      "At the top you'll see the Token ID (unique on-chain identifier) and the transaction hash — click the hash to view it on the block explorer.",
      "Below that, engagement stats show total likes, dislikes, views, comments, and tips received.",
      "The Holders section shows a progress bar of how many of the 1,000 fractions the creator still owns, plus a list of all fraction holders with their balances and percentages.",
      "If the post is pay-per-view (PPV), you'll see the price, currency, and how many users have purchased access.",
      "Post owners can change visibility (Public, Unlisted, or Private) and edit the title/description directly from this page.",
    ],
    tips: [
      "A freshly minted post starts with the creator holding all 1,000 fractions (100% ownership).",
      "The transaction hash links to BaseScan or BscScan depending on the chain.",
      "Unlisted posts don't appear in feeds but can still be accessed via direct link.",
    ]
  },
  {
    id: "buying-fractions",
    screenshot: screenshotHomeFeed,
    title: "Buying Fractions",
    icon: ShoppingCart,
    intro: "You can buy fractions of any post to own a share of that content. Fraction trading happens on the Post Info page's marketplace tab.",
    steps: [
      "Open the Post Info page for the post you're interested in (tap the 'ⓘ' icon).",
      "Switch to the 'Marketplace' tab to see available listings and offers.",
      "Browse listed fractions — each listing shows the seller, quantity, price per fraction, and total cost in DHB.",
      "Click 'Make Offer' to submit a buy offer at a price you choose.",
      "Enter the number of fractions you want and the price per fraction in DHB.",
      "Confirm your offer — the fraction holder can then accept or reject it.",
      "Once accepted, the fractions transfer to your wallet and the DHB is sent to the seller."
    ],
    tips: [
      "Check the holders list to see the current ownership distribution before buying.",
      "Owning fractions of a post means you hold a share of that on-chain NFT.",
      "Fraction prices are set by sellers — shop around for the best deals."
    ]
  },
  {
    id: "selling-fractions",
    screenshot: screenshotHomeFeed,
    title: "Selling Fractions",
    icon: Landmark,
    intro: "If you own fractions of a post (as the creator or through purchase), you can list them for sale on the marketplace.",
    steps: [
      "Open the Post Info page for a post you own fractions of.",
      "Switch to the 'Marketplace' tab.",
      "Click the 'List Fractions' button (only visible if you hold fractions).",
      "Enter the number of fractions you want to sell.",
      "Set your asking price per fraction in DHB.",
      "Review the total listing value and confirm.",
      "Your fractions are now listed — other users can purchase them or make counter-offers."
    ],
    tips: [
      "You can list any amount up to your total fraction balance.",
      "Listings can be cancelled before someone buys.",
      "As a creator, selling fractions lets fans co-own your content."
    ]
  },
  {
    id: "minting-posts",
    screenshot: screenshotHomeFeed,
    title: "Minting Posts (Creating NFTs)",
    icon: PenSquare,
    intro: "Minting is optional. A post publishes off-chain the moment you send it — no wallet, no signature, no gas — and you can mint it as an NFT whenever you want, either as you compose it or later from the post itself.",
    steps: [
      "Click the 'Post' button in the sidebar (desktop) or the + button (mobile).",
      "Write your text, attach media (images, videos, audio), and add categories.",
      "Leave 'Mint post' off to publish off-chain, or switch it on to mint as you publish.",
      "Publishing never waits on the chain: the post appears in the feed either way.",
      "To mint later, open the post's 'ⓘ' info page and use the Mint action there.",
      "Once minted, the post gets a Token ID and a transaction hash you can verify on-chain, and you hold all 1,000 fractions of it."
    ],
    tips: [
      "Social, email and SMS sign-ins pay zero gas — DeHub sponsors minting fees.",
      "External-wallet users need ETH on Base or BNB on BNB Chain for gas.",
      "Minting is what makes a post tradeable and royalty-bearing. An unminted post still earns tips and views.",
      "The on-chain record is permanent once minted, even if the post is later deleted from the feed."
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
/*  Search utilities                                                   */
/* ------------------------------------------------------------------ */

/** Tokenize query into lowercase words for multi-term matching */
function tokenize(raw: string): string[] {
  return raw.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Score a section against search tokens. Higher = better match.
 *  Returns 0 if any token has no match (AND logic). */
function scoreSection(section: GuideSection, tokens: string[]): number {
  if (tokens.length === 0) return 1; // no filter

  const titleLower = section.title.toLowerCase();
  const introLower = section.intro.toLowerCase();
  const stepsLower = section.steps.map(s => s.toLowerCase());
  const tipsLower = (section.tips || []).map(t => t.toLowerCase());
  const allText = [titleLower, introLower, ...stepsLower, ...tipsLower];

  let total = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    // Title match is worth 10x
    if (titleLower.includes(token)) tokenScore += 10;
    // Intro match worth 3x
    if (introLower.includes(token)) tokenScore += 3;
    // Steps/tips match worth 1x each
    for (const text of [...stepsLower, ...tipsLower]) {
      if (text.includes(token)) tokenScore += 1;
    }
    if (tokenScore === 0) return 0; // AND logic: every token must hit
    total += tokenScore;
  }
  return total;
}

/** Highlight matching tokens in text */
const HighlightText: React.FC<{ text: string; tokens: string[] }> = ({ text, tokens }) => {
  if (tokens.length === 0) return <>{text}</>;

  // Build a regex that matches any token
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-400/20 text-yellow-300 rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const ScreenshotImage = ({ src, alt }: { src?: string; alt: string }) => {
  if (!src) {
    return (
      <div className="w-full h-48 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center text-white/30 text-sm select-none mt-4">
        Screenshot coming soon
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl overflow-hidden border border-white/10">
      <img src={src} alt={alt} className="w-full h-auto" loading="lazy" />
    </div>
  );
};

const SectionCard = React.forwardRef<HTMLDivElement, { section: GuideSection; tokens: string[] }>(
  ({ section, tokens }, ref) => {
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
          <h2 className="text-xl md:text-2xl font-bold text-white">
            <HighlightText text={section.title} tokens={tokens} />
          </h2>
        </div>

        <p className="text-white/70 mb-6 leading-relaxed">
          <HighlightText text={section.intro} tokens={tokens} />
        </p>

        <div className="space-y-3 mb-6">
          {section.steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60 mt-0.5">
                {i + 1}
              </span>
              <p className="text-white/80 text-sm leading-relaxed">
                <HighlightText text={step} tokens={tokens} />
              </p>
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
                  <span><HighlightText text={tip} tokens={tokens} /></span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ScreenshotImage src={section.screenshot} alt={`${section.title} screenshot`} />
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
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(searchQuery, 200);
  const tokens = useMemo(() => tokenize(debouncedQuery), [debouncedQuery]);

  // Swallow the guide content at the sticky header pill's top edge under the
  // glass themes, exactly like the home feed cuts at its nav pill.
  const contentRef = useRef<HTMLDivElement>(null);
  useFeedSwallowClip(contentRef, '[data-feed-nav-outer] > [data-page-bento]');

  // Filter & rank sections by search relevance
  const filteredSections = useMemo(() => {
    if (tokens.length === 0) return sections;
    return sections
      .map(s => ({ section: s, score: scoreSection(s, tokens) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.section);
  }, [tokens]);

  // Keyboard shortcut: Cmd/Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery("");
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

    filteredSections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filteredSections]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileNavOpen(false);
  };

  const isSearching = tokens.length > 0;

  return (
    <>
      <SEOHead
        title="DeHub Guide — Visual Walkthrough of the App"
        description="A visual walkthrough of DeHub: feeds, messaging, wallet, staking, governance and more. See every screen and learn how the decentralized social platform works."
        url="https://dehub.io/guide"
      />
    <div data-glass-page className="min-h-screen bg-black text-white">
      {/* Sticky nav pill */}
      <div data-feed-nav-outer className="sticky top-0 z-50 bg-black px-4 md:px-8 pt-2 pb-0 max-w-7xl mx-auto">
        <div data-page-bento className="bg-zinc-900 rounded-2xl px-3 md:px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <Link to="/app" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium hidden sm:inline">Back to App</span>
            </Link>
            <div className="text-lg font-bold hidden sm:block">DeHub User Guide</div>

            {/* Search bar */}
            <div className="relative flex-1 max-w-xs mx-3 sm:mx-0 sm:flex-none sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guide..."
                className="w-full h-9 pl-9 pr-16 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08] transition-all"
              />
              {searchQuery ? (
                <button
                  onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : (
                <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-white/20 font-mono">
                  <span className="px-1 py-0.5 rounded bg-white/5 border border-white/10">⌘K</span>
                </kbd>
              )}
            </div>

            <button
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label={mobileNavOpen ? "Close navigation" : "Toggle navigation"}
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-40 bg-black/95 backdrop-blur-xl overflow-y-auto p-4">
          <nav className="space-y-1">
            {filteredSections.map(s => {
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
            {filteredSections.map(s => {
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
        <main ref={contentRef} className="flex-1 min-w-0 space-y-6 pb-20">
          {/* Hero */}
          {!isSearching && (
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-6 md:p-10 mb-2">
              <h1 className="text-3xl md:text-4xl font-bold mb-3">
                DeHub User Guide & Documentation
              </h1>
              <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
                Your complete guide to using DeHub — the decentralized social media platform.
                Learn how to create posts, tip creators, stake tokens, participate in governance, and more.
              </p>
            </div>
          )}

          {/* Search results count */}
          {isSearching && (
            <div className="flex items-center gap-2 text-sm text-white/40 px-1">
              <Search className="w-3.5 h-3.5" />
              <span>
                {filteredSections.length === 0
                  ? `No results for "${debouncedQuery}"`
                  : `${filteredSections.length} section${filteredSections.length !== 1 ? 's' : ''} matching "${debouncedQuery}"`
                }
              </span>
              <button
                onClick={() => setSearchQuery("")}
                className="ml-auto text-white/30 hover:text-white/60 underline underline-offset-2 text-xs"
              >
                Clear search
              </button>
            </div>
          )}

          {/* Empty state */}
          {isSearching && filteredSections.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
              <ThemedIcon icon="search" alt="" className="w-14 h-14 object-contain mx-auto mb-4 opacity-55" />
              <p className="text-white/40 text-sm mb-2">No matching sections found.</p>
              <p className="text-white/20 text-xs">Try different keywords or browse all sections.</p>
            </div>
          )}

          {filteredSections.map(s => (
            <SectionCard key={s.id} section={s} tokens={tokens} />
          ))}
        </main>
      </div>
    </div>
    </>
  );
};

export default GuidePage;
