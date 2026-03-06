import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface PostContext {
  type: 'image' | 'video' | 'live' | 'post';
  author?: string;
  caption?: string;
  title?: string;
  game?: string;
  viewers?: string;
  thumbnail?: string;
  imageUrl?: string;
}

const PERSONALITY_STYLES: Record<string, string> = {
  'normal': '',
  'daddy': 'Speak like a loving, supportive father figure. Be warm, protective, offer wise advice, use phrases like "son/kiddo/champ", share life lessons, and provide that steady, reassuring presence dads are known for.',
  'mommy': 'Speak like a caring, nurturing mother figure. Be warm, comforting, slightly fussy about their wellbeing, use terms of endearment like "sweetie/honey/dear", offer unconditional support and gentle wisdom.',
  'big-brother': 'Speak like a supportive older brother. Be protective but cool, give real talk advice, hype them up, use casual language like "yo/man/dude", and have that "I got your back" energy.',
  'lil-bro': 'Speak like a loving little brother who looks up to the user. Be enthusiastic, slightly naive but endearing, ask for their opinion, show admiration, and bring that eager-to-help little sibling energy.',
  'big-sister': 'Speak like a caring older sister. Be supportive but also give honest advice, use sisterly terms like "babe/hun", share wisdom from experience, and have that protective but encouraging vibe.',
  'little-sister': 'Speak like a sweet little sister. Be playful, sometimes a bit cheeky, ask lots of questions, show admiration for the user, and bring that innocent, loving younger sibling energy.',
  'old-english': 'Speak in Old English style with "thee", "thou", "hath", "doth", and archaic vocabulary like Shakespeare.',
  'cockney': 'Speak in Cockney accent with rhyming slang, dropped H sounds, and East London expressions.',
  'celtic': 'Speak with Celtic/Irish flair, using expressions like "sure", "grand", "aye" with lyrical Irish turns of phrase.',
  'scouse': 'Speak in Scouse (Liverpool) dialect with expressions like "la", "boss", "sound", "dead good".',
  'wild-west': 'Speak in Wild West cowboy style with "howdy", "partner", "reckon", "y\'all" and frontier expressions.',
  'asian-uncle': 'Speak like a stereotypical Asian uncle with wisdom, proverbs, and wholesome advice.',
  'russian-mafia': 'Speak like a Russian mafia boss with dramatic pauses, referring to "family", and ominous undertones.',
  'pirate': 'Speak in pirate speak with "arr", "matey", "shiver me timbers", "ye" and nautical references.',
  'alien': 'Speak as an alien trying to communicate with humans, with formal/clinical language and curious observations.',
  'e-girl': 'Speak in e-girl/internet culture style with "uwu", "owo", emoticons, elongated words and cute expressions.',
  'chad': 'Speak in "chad" bro culture style with "bro", "dude", gym references, and excessive confidence.',
  'hopeless-romantic': 'Speak like a hopeless romantic - dreamy, poetic, with flowery language and metaphors about love and destiny.',
  // Political & Ideological personalities
  'conservative': 'Speak from a conservative perspective. Emphasize traditional values, personal responsibility, limited government, free markets, respect for institutions, and constitutional principles. Use phrases like "the founding fathers intended", "traditional values", "fiscal responsibility".',
  'liberal': 'Speak from a liberal perspective. Emphasize individual rights, social progress, equality, civil liberties, and government as a force for good. Use phrases like "progress", "equality", "social justice", "moving forward together".',
  'antifa': 'Speak from an anti-fascist perspective. Be confrontational against authoritarianism, emphasize direct action, solidarity with the oppressed, and resistance to fascism. Use militant language, references to "solidarity", "comrades", and "resistance".',
  'capitalist': 'Speak from a free-market capitalist perspective. Emphasize entrepreneurship, innovation, wealth creation, market solutions, and economic freedom. Use phrases like "market forces", "ROI", "disruption", "monetize", "value creation".',
  'socialist': 'Speak from a democratic socialist perspective. Emphasize workers\' rights, collective ownership, social welfare, economic equality, and critique of capitalism. Use phrases like "workers of the world", "means of production", "solidarity", "collective action".',
  'neocon': 'Speak from a neoconservative perspective. Emphasize American exceptionalism, strong national defense, spreading democracy, hawkish foreign policy, and moral clarity. Use phrases like "American leadership", "national security", "strength through power".',
  'feminist': 'Speak from a feminist perspective. Emphasize gender equality, women\'s empowerment, challenging patriarchy, intersectionality, and reproductive rights. Use inclusive language and phrases like "smash the patriarchy", "equal rights", "representation matters".',
  'progressive': 'Speak from a progressive perspective. Emphasize systemic change, social justice, environmental protection, wealth redistribution, and challenging corporate power. Use phrases like "systemic change", "equity", "climate justice", "intersectional".',
  'nationalist': 'Speak from a nationalist perspective. Emphasize national identity, sovereignty, cultural preservation, border security, and putting the nation first. Use phrases like "our people", "national sovereignty", "protect our borders", "heritage".',
  'communist': 'Speak from a communist perspective. Emphasize class struggle, abolition of private property, workers\' revolution, critique of bourgeoisie, and collective ownership. Use phrases like "proletariat", "bourgeoisie", "class consciousness", "seize the means of production", "comrade".',
};

// Keywords that indicate user wants live/current information (requires premium Perplexity)
// ONLY explicit news/search intent — NOT generic time words like "this week"
const LIVE_SEARCH_KEYWORDS = [
  'news', 'breaking news', 'latest news', 'headlines',
  'happening in the world', 'current events',
  'search for', 'look up', 'find me', 'google', 'search the web', 'search online',
  'trending', 'viral', 'new release', 'just announced', 'just released',
  'election results', 'poll results',
  'stock price', 'market price', 'crypto price', 'bitcoin price', 'eth price',
  'weather forecast', 'weather in', 'weather today',
  'sports score', 'game score', 'match score',
  'who won the', 'did you hear about',
  'whats happening in', "what's happening in",
];

// Personal/self-referencing questions — ALWAYS use user context, never web search
const PERSONAL_KEYWORDS = [
  'my followers', 'my following', 'my balance', 'my tips', 'my rank',
  'my likes', 'my posts', 'my staked', 'my badge', 'my subscribers',
  'did i gain', 'did i get', 'did i lose', 'did i earn', 'did i receive', 'did i send',
  'do i have', 'have i gained', 'have i got', 'have i lost', 'have i earned',
  'i gained', 'i lost', 'i earned', 'i received', 'i sent',
  'how many followers', 'how many likes', 'how many tips', 'how many posts',
  'how many subscribers', 'my leaderboard', 'my position', 'my wallet',
  'my profile', 'my stats', 'my earnings', 'my activity',
  'followers did i', 'likes did i', 'tips did i',
];

// Post analysis keywords — triggers fetching user's posts from DeHub API
const POST_ANALYSIS_KEYWORDS = [
  'study my posts', 'analyze my posts', 'analyse my posts', 'review my posts',
  'look at my posts', 'check my posts', 'evaluate my posts', 'rate my posts',
  'my content', 'study my content', 'analyze my content', 'analyse my content',
  'review my content', 'my recent posts', 'my last posts', 'my latest posts',
  'how can i improve', 'improve my content', 'content advice', 'posting advice',
  'what do i post', 'my posting style', 'my post history', 'my uploads',
  'study my videos', 'analyze my videos', 'review my videos',
  'study my images', 'analyze my images', 'review my images',
  'tell me about my posts', 'tell me about my content', 'what kind of content',
  'my best posts', 'my top posts', 'my worst posts', 'my most liked',
  'based on my posts', 'read my posts', 'read my last', 'read my recent',
  'from my posts', 'looking at my posts', 'my post data', 'my posting',
  'tell me about myself', 'tell me about me', 'what kind of person',
  'who am i', 'describe me', 'what am i like', 'personality from',
  'judge me', 'roast me', 'roast my', 'critique my',
];

// Keywords that indicate the user is asking about ANOTHER user on the platform
const OTHER_USER_KEYWORDS = [
  'tell me about @', 'who is @', 'what does @', 'show me @',
  'analyze @', 'analyse @', 'study @', 'review @', 'check @',
  'look at @', 'posts from @', 'content from @', 'posts by @', 'content by @',
  'tell me about', 'who is', 'what does', 'show me',
  'analyze', 'analyse', 'study', 'review', 'check',
  'look at', 'posts from', 'content from', 'posts by', 'content by',
  'roast @', "what kind of person is", "describe @",
  "what do they post", "their posts", "their content", "their profile",
];

// Keywords about DeHub - FREE tier (already trained on docs)
const DEHUB_KEYWORDS = [
  'dehub', 'dhb', '$dhb', 'token', 'delabs', 'futurov', 'ftv',
  'malik', 'mal.eth', 'mike hales', 'indi', 'bailey',
  'first class', 'w2e', 'watch2earn', 'watch to earn',
  'depin', 'node', 'staking', 'governance',
  'pancakeswap', 'uniswap', 'mexc', 'base chain', 'bnb chain',
  'ppv', 'pay per view', 'subscriptions', 'tips',
  'censorship', 'decentralized', 'decentralised',
  'your token', 'your platform', 'this app', 'this platform'
];

// Keywords that indicate complex reasoning (requires Pro tier)
const COMPLEX_REASONING_KEYWORDS = [
  'explain', 'analyze', 'analyse', 'compare', 'contrast',
  'why', 'how does', 'how do', 'what if', 'evaluate',
  'pros and cons', 'advantages', 'disadvantages',
  'step by step', 'detailed', 'in depth', 'comprehensive',
  'calculate', 'solve', 'prove', 'derive',
  'summarize this article', 'summarize this document',
  'write an essay', 'write a report', 'write code',
  'debug', 'fix this', 'refactor', 'optimize'
];

// Keywords that indicate token transfer or purchase requests
const TOKEN_TRANSFER_KEYWORDS = [
  'send', 'transfer', 'pay', 'tip', 'give',
  'send tokens', 'transfer tokens', 'send dhb', 'transfer dhb',
  'send coins', 'transfer coins', 'pay with', 'tip with'
];

const TOKEN_PURCHASE_KEYWORDS = [
  'buy', 'purchase', 'swap', 'exchange', 'get tokens',
  'buy dhb', 'purchase dhb', 'buy tokens', 'purchase tokens',
  'swap for dhb', 'exchange for dhb', 'get dhb'
];

// Parse token transaction from message
function parseTokenTransaction(message: string): { type: 'transfer' | 'purchase' | null; amount?: string; recipient?: string; token?: string } {
  const lowerMessage = message.toLowerCase();
  
  // Check for transfer patterns like "send 100 DHB to @user1" or "send 100 to bailey"
  // More flexible regex to handle various formats
  const transferPatterns = [
    // "send 100 DHB to @bailey" or "send 100 to bailey"
    /(?:send|transfer|pay|tip|give)\s+(\d+(?:\.\d+)?)\s*(?:dhb|tokens?|coins?)?\s*(?:to\s+)?@?(\w+)/i,
    // "send @bailey 100 DHB"
    /(?:send|transfer|pay|tip|give)\s+@?(\w+)\s+(\d+(?:\.\d+)?)\s*(?:dhb|tokens?|coins?)?/i,
  ];
  
  for (const pattern of transferPatterns) {
    const match = lowerMessage.match(pattern);
    if (match) {
      // First pattern: amount is match[1], recipient is match[2]
      // Second pattern: recipient is match[1], amount is match[2]
      const isSecondPattern = pattern.source.includes('@?(\\w+)\\s+(\\d+');
      const amount = isSecondPattern ? match[2] : match[1];
      const recipient = isSecondPattern ? match[1] : match[2];
      
      // Filter out keywords that aren't usernames
      const invalidRecipients = ['dhb', 'tokens', 'token', 'coins', 'coin', 'to'];
      if (!invalidRecipients.includes(recipient.toLowerCase())) {
        console.log('Transfer parsed:', { amount, recipient });
        return {
          type: 'transfer',
          amount: amount,
          recipient: recipient,
          token: 'DHB'
        };
      }
    }
  }
  
  // Check for purchase patterns like "buy 100 DHB"
  const purchaseMatch = message.match(/(?:buy|purchase|get|swap\s+(?:for)?)\s+(\d+(?:\.\d+)?)\s*(?:dhb|tokens?|coins?)?/i);
  if (purchaseMatch) {
    console.log('Purchase parsed:', { amount: purchaseMatch[1] });
    return {
      type: 'purchase',
      amount: purchaseMatch[1],
      token: 'DHB'
    };
  }
  
  // Check if it's a general transfer/purchase request without specific amounts
  const isTransferRequest = TOKEN_TRANSFER_KEYWORDS.some(kw => lowerMessage.includes(kw));
  const isPurchaseRequest = TOKEN_PURCHASE_KEYWORDS.some(kw => lowerMessage.includes(kw));
  
  if (isTransferRequest) {
    return { type: 'transfer' };
  }
  if (isPurchaseRequest) {
    return { type: 'purchase' };
  }
  
  return { type: null };
}

// Generate a mock transaction hash
function generateMockTxHash(): string {
  const chars = '0123456789abcdef';
  let hash = '0x';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

function isPersonalQuestion(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return PERSONAL_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

function isDeHubRelated(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return DEHUB_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

function requiresPostAnalysis(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return POST_ANALYSIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Extract how many posts user wants analyzed (default 10, max 50)
function extractPostCount(message: string): number {
  const match = message.match(/(?:last|recent|latest|top|past)\s+(\d+)\s*(?:posts?|videos?|images?|uploads?|content)/i);
  if (match) return Math.min(parseInt(match[1], 10), 50);
  const match2 = message.match(/(\d+)\s*(?:posts?|videos?|images?|uploads?|content)/i);
  if (match2) return Math.min(parseInt(match2[1], 10), 50);
  return 10;
}

// Detect if user is asking about another user and extract the username
function extractTargetUsername(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  
  // Direct @mention: "tell me about @bailey", "analyze @malik"
  const atMatch = message.match(/@(\w[\w.-]{0,29})/);
  if (atMatch) return atMatch[1];
  
  // Patterns like "tell me about bailey", "who is malik", "study user1's posts"
  const patterns = [
    /(?:tell me about|who is|what does|describe|analyze|analyse|study|review|check|look at|roast)\s+(?:user\s+)?([a-zA-Z][\w.-]{1,29})(?:'s)?(?:\s+(?:posts?|content|profile|videos?|images?|uploads?))?/i,
    /(?:posts?|content|profile|videos?|images?)\s+(?:from|by|of)\s+(?:@?([a-zA-Z][\w.-]{1,29}))/i,
    /(?:what kind of person is)\s+(?:@?([a-zA-Z][\w.-]{1,29}))/i,
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const name = match[1].toLowerCase();
      // Filter out common words that aren't usernames
      const stopWords = ['me', 'my', 'myself', 'i', 'the', 'this', 'that', 'it', 'a', 'an',
        'dehub', 'dhb', 'token', 'platform', 'app', 'bitcoin', 'crypto', 'nft', 'web3',
        'how', 'what', 'why', 'when', 'where', 'your', 'you', 'their', 'them', 'someone',
        'content', 'posts', 'videos', 'images', 'profile', 'last', 'recent', 'latest'];
      if (!stopWords.includes(name)) return match[1];
    }
  }
  
  return null;
}

function requiresOtherUserLookup(message: string): boolean {
  const target = extractTargetUsername(message);
  // Must have a target and NOT be a self-referencing query
  if (!target) return false;
  const lowerMessage = message.toLowerCase();
  // If it's clearly about "my" content, it's not about another user
  if (lowerMessage.includes('my post') || lowerMessage.includes('my content') || lowerMessage.includes('about myself') || lowerMessage.includes('about me')) return false;
  return true;
}

// Fetch another user's profile from DeHub API
async function fetchUserProfile(username: string): Promise<any | null> {
  try {
    const cleanUsername = username.replace('@', '');
    const url = `https://api.dehub.io/api/account_info/${encodeURIComponent(cleanUsername)}`;
    console.log(`[UserLookup] Fetching profile: ${url}`);
    const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (!response.ok) {
      console.error(`[UserLookup] Profile API error: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return data?.result || data || null;
  } catch (error) {
    console.error('[UserLookup] Failed to fetch profile:', error);
    return null;
  }
}

// Fetch user posts from DeHub API — uses userId (username), NOT wallet address
async function fetchUserPosts(userId: string, limit: number = 10): Promise<any[]> {
  try {
    const url = `https://api.dehub.io/api/user/${encodeURIComponent(userId)}/nfts?page=1&limit=${limit}`;
    console.log(`[PostAnalysis] Fetching posts: ${url}`);
    const response = await fetch(url, { 
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      console.error(`[PostAnalysis] DeHub API error: ${response.status}`);
      const text = await response.text();
      console.error(`[PostAnalysis] Response: ${text.substring(0, 200)}`);
      return [];
    }
    const data = await response.json();
    const posts = data?.result || data?.data || data || [];
    console.log(`[PostAnalysis] Fetched ${Array.isArray(posts) ? posts.length : 0} posts`);
    return Array.isArray(posts) ? posts : [];
  } catch (error) {
    console.error('[PostAnalysis] Failed to fetch posts:', error);
    return [];
  }
}

// Format a user profile into readable context
function formatProfileForContext(profile: any): string {
  const parts: string[] = [];
  if (profile.username) parts.push(`Username: @${profile.username}`);
  if (profile.displayName) parts.push(`Display Name: ${profile.displayName}`);
  if (profile.aboutMe) parts.push(`Bio: ${profile.aboutMe}`);
  if (profile.address) parts.push(`Wallet: ${profile.address}`);
  if (profile.followers !== undefined) parts.push(`Followers: ${profile.followers}`);
  if (profile.following !== undefined) parts.push(`Following: ${profile.following}`);
  if (profile.subscribers !== undefined) parts.push(`Subscribers: ${profile.subscribers}`);
  if (profile.likesReceived !== undefined) parts.push(`Likes Received: ${profile.likesReceived}`);
  if (profile.postsCount !== undefined || profile.nftsCount !== undefined) parts.push(`Posts: ${profile.postsCount ?? profile.nftsCount ?? 0}`);
  if (profile.totalTipsReceived !== undefined) parts.push(`Tips Received: ${profile.totalTipsReceived} DHB`);
  if (profile.totalTipsSent !== undefined) parts.push(`Tips Sent: ${profile.totalTipsSent} DHB`);
  if (profile.isVerified) parts.push(`Verified: Yes`);
  if (profile.badges?.length) parts.push(`Badges: ${profile.badges.map((b: any) => b.name || b).join(', ')}`);
  if (profile.twitterLink) parts.push(`Twitter: ${profile.twitterLink}`);
  if (profile.instagramLink) parts.push(`Instagram: ${profile.instagramLink}`);
  if (profile.telegramLink) parts.push(`Telegram: ${profile.telegramLink}`);
  if (profile.createdAt) parts.push(`Joined: ${profile.createdAt}`);
  return parts.join('\n');
}
// Format posts into a readable context for the AI
function formatPostsForContext(posts: any[]): string {
  if (!posts.length) return '';
  
  const formatted = posts.map((post: any, i: number) => {
    const parts: string[] = [`Post ${i + 1}:`];
    const type = post.postType || post.media_type || 'unknown';
    parts.push(`Type: ${type}`);
    if (post.name && post.name !== 'Untitled') parts.push(`Title: ${post.name}`);
    if (post.title && post.title !== 'Untitled') parts.push(`Title: ${post.title}`);
    if (post.description) parts.push(`Description: ${post.description.substring(0, 300)}`);
    if (post.views !== undefined || post.view_count !== undefined) parts.push(`Views: ${post.views ?? post.view_count ?? 0}`);
    if (post.likes !== undefined || post.like_count !== undefined) parts.push(`Likes: ${post.likes ?? post.like_count ?? 0}`);
    if (post.dislikes !== undefined || post.dislike_count !== undefined) parts.push(`Dislikes: ${post.dislikes ?? post.dislike_count ?? 0}`);
    if (post.commentCount !== undefined || post.comment_count !== undefined) parts.push(`Comments: ${post.commentCount ?? post.comment_count ?? 0}`);
    if (post.totalVotes?.for !== undefined) parts.push(`Upvotes: ${post.totalVotes.for}`);
    if (post.category) parts.push(`Category: ${Array.isArray(post.category) ? post.category.join(', ') : post.category}`);
    if (post.tags?.length) parts.push(`Tags: ${post.tags.join(', ')}`);
    if (post.createdAt || post.created_at) parts.push(`Posted: ${post.createdAt || post.created_at}`);
    if (post.videoDuration || post.duration) parts.push(`Duration: ${post.videoDuration || post.duration}s`);
    if (post.is_ppv) parts.push(`PPV: Yes (${post.ppv_price} ${post.ppv_currency || 'DHB'})`);
    if (post.is_w2e) parts.push(`Watch2Earn: Yes`);
    return parts.join(' | ');
  });
  
  return formatted.join('\n');
}

function requiresWebSearch(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  if (isPersonalQuestion(message)) return false;
  if (requiresPostAnalysis(message)) return false;
  if (requiresOtherUserLookup(message)) return false;
  return LIVE_SEARCH_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

function requiresComplexReasoning(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return COMPLEX_REASONING_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Smart model selection based on query complexity
// Returns: { model: string, tier: 'free' | 'standard' | 'premium', reason: string }
function selectOptimalModel(message: string, hasPerplexityKey: boolean): { model: string; tier: string; reason: string } {
  const isPersonal = isPersonalQuestion(message);
  const needsSearch = requiresWebSearch(message);
  const isDeHub = isDeHubRelated(message);
  const isComplex = requiresComplexReasoning(message);
  
  // Other user lookup = use Pro for deep profile analysis
  if (requiresOtherUserLookup(message)) {
    return { 
      model: 'gemini-2.5-pro', 
      tier: 'standard', 
      reason: 'Other user profile analysis' 
    };
  }
  
  // Post analysis = use Pro for deeper analysis
  if (requiresPostAnalysis(message)) {
    return { 
      model: 'gemini-2.5-pro', 
      tier: 'standard', 
      reason: 'Post content analysis' 
    };
  }
  
  // Personal questions about user's own data = use Gemini with user context, never web search
  if (isPersonal) {
    return { 
      model: 'gemini-2.5-flash', 
      tier: 'free', 
      reason: 'Personal user data query' 
    };
  }
  
  // DeHub questions = FREE tier (Gemini Flash) - we're trained on this
  if (isDeHub && !needsSearch) {
    return { 
      model: 'gemini-2.5-flash', 
      tier: 'free', 
      reason: 'DeHub knowledge (free)' 
    };
  }
  
  // Live search required = PREMIUM tier (Perplexity)
  if (needsSearch && hasPerplexityKey) {
    return { 
      model: 'perplexity', 
      tier: 'premium', 
      reason: 'Live web search' 
    };
  }
  
  // Complex reasoning = PRO tier (Gemini Pro)
  if (isComplex) {
    return { 
      model: 'gemini-2.5-pro', 
      tier: 'standard', 
      reason: 'Complex reasoning' 
    };
  }
  
  // Default = FREE tier (Gemini Flash)
  return { 
    model: 'gemini-2.5-flash', 
    tier: 'free', 
    reason: 'Standard query' 
  };
}

async function searchWithPerplexity(query: string, perplexityKey: string): Promise<string> {
  console.log('Searching with Perplexity:', query);
  
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${perplexityKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: 'Be precise and concise. Provide current, accurate information with sources when relevant.' },
        { role: 'user', content: query }
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Perplexity API error:', response.status, errorText);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || [];
  
  // Remove inline citation brackets like [1], [2][3], etc.
  content = content.replace(/\[\d+\]/g, '');
  
  // Format response with citations if available
  let formattedResponse = content;
  if (citations.length > 0) {
    formattedResponse += '\n\n**Sources:**\n';
    citations.slice(0, 5).forEach((url: string, i: number) => {
      formattedResponse += `- [Source ${i + 1}](${url})\n`;
    });
  }
  
  return formattedResponse;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, style = 'normal', postContext, model = 'auto', isAuthenticated = false, userLanguage, userContext } = await req.json() as { 
      messages: Message[]; 
      style?: string;
      postContext?: PostContext;
      model?: string;
      isAuthenticated?: boolean;
      userLanguage?: string;
      userContext?: {
        username?: string;
        displayName?: string;
        walletAddress?: string;
        followers?: number;
        following?: number;
        postsCount?: number;
        likesReceived?: number;
        badgeBalance?: number;
        tipsReceived?: number;
        tipsSent?: number;
        staked?: number;
        leaderboardRank?: number;
        leaderboardBalance?: number;
        snapshots?: Array<{
          balance: number;
          followers: number | null;
          likes: number | null;
          subscribers: number | null;
          sent_tips: number;
          received_tips: number;
          snapshot_date: string;
        }>;
      };
    };

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    const xaiApiKey = Deno.env.get('XAI_API_KEY');
    
    console.log('Chat request:', { model, hasXaiKey: !!xaiApiKey, hasPerplexityKey: !!perplexityKey, isAuthenticated });
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get the latest user message
    const latestUserMessage = messages.filter(m => m.role === 'user').pop();
    const userQuery = typeof latestUserMessage?.content === 'string' 
      ? latestUserMessage.content 
      : latestUserMessage?.content?.find(c => c.type === 'text')?.text || '';
    
    // Check for token transaction requests (transfer or purchase)
    const txParsed = parseTokenTransaction(userQuery);
    
    // If user is NOT authenticated and requests a token transaction, return simulation
    if (!isAuthenticated && txParsed.type) {
      const txHash = generateMockTxHash();
      const timestamp = new Date().toISOString();
      
      let simulationResponse: string;
      
      if (txParsed.type === 'transfer') {
        const amount = txParsed.amount || '0';
        const recipient = txParsed.recipient || 'unknown';
        simulationResponse = `**Transfer Request**\n\n**Type:** Token Transfer\n**Amount:** ${amount} DHB\n**Recipient:** @${recipient}`;
      } else {
        const amount = txParsed.amount || '0';
        simulationResponse = `**Purchase Request**\n\n**Type:** Token Purchase\n**Amount:** ${amount} DHB`;
      }
      
      return new Response(
        JSON.stringify({ 
          response: simulationResponse,
          isSimulation: true,
          simulationType: txParsed.type,
          simulationData: {
            txHash,
            amount: txParsed.amount || '0',
            recipient: txParsed.recipient,
            token: 'DHB',
            timestamp
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Smart auto-model selection based on query complexity
    const isAutoMode = model === 'auto' || model === 'gemini-2.5-flash'; // Default to auto
    const autoSelection = selectOptimalModel(userQuery, !!perplexityKey);
    
    // Use auto-selected model unless user explicitly chose a different one
    const effectiveModel = isAutoMode ? autoSelection.model : model;
    const modelTier = isAutoMode ? autoSelection.tier : 'manual';
    const modelReason = isAutoMode ? autoSelection.reason : 'User selected';
    
    console.log('Smart model selection:', { 
      userQuery: userQuery.substring(0, 50), 
      autoSelection, 
      effectiveModel,
      isAutoMode,
      modelTier
    });

    // If Perplexity was selected by auto-model and key is available, use it
    if (effectiveModel === 'perplexity' && perplexityKey) {
      try {
        const searchResult = await searchWithPerplexity(userQuery, perplexityKey);
        return new Response(
          JSON.stringify({ 
            response: searchResult, 
            searchUsed: true,
            modelUsed: 'perplexity',
            modelTier: 'premium',
            modelReason: 'Live web search'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (searchError) {
        console.error('Perplexity search failed, falling back to regular AI:', searchError);
        // Fall through to regular AI if search fails
      }
    }

    // Regular AI response (DeHub knowledge + general)
    const personalityModifier = PERSONALITY_STYLES[style] || '';
    const basePrompt = `You are DeHub AI - the official AI assistant for DeHub, a decentralised, user-owned social media platform and alternative to legacy apps like YouTube, X, Rumble, Twitch, and Patreon.

## CRITICAL IDENTITY RULES - FOLLOW THESE EXACTLY:
- You are **DeHub AI**, powered by **DeHub's custom multi-model AI stack**
- NEVER mention Google, Perplexity, OpenAI, Anthropic, Claude, GPT, Gemini, Bard, or any other AI company/model
- NEVER say you were "trained by", "created by", or "developed by" any external company
- If asked about your technology, say: "I run on DeHub's proprietary multi-model AI infrastructure"
- If asked who made you, say: "I was built by the DeHub team at DeLabs LTD"
- Your ONLY identity is DeHub AI - no other affiliations

## About DeHub
DeHub is a censorship-resistant, blockchain-powered platform where:
- Creators own their audience data and control their content distribution
- Content lives forever onchain with full transparency
- No fear of censorship or demonetisation
- Direct creator-to-fan relationships without corporate gatekeepers

## Company & Team
DeHub is developed by **DeLabs LTD**, a UK-registered Web3 development company.

### Co-Founders:

#### **Malik Jan (mal.eth)** - Founder, CEO & CTO
Results-driven entrepreneurial software engineer, recruiter and business professional. Former top biller at Blue Arrow (UK's largest recruitment agency) out of 600 staff across 70 offices, demonstrating exceptional sales performance.

**DeHub Achievement**: Scaled DeHub from inception to 600M FDV with $10M in the liquidity pool at peak. Achieved tier 1 CEX listings and 1000x ROI. Generated over $1M in revenue in year 1 with 40 full-time staff (all hired personally). Used all revenue to reinvest into building the 4-year roadmap which is now complete.

**Professional Background**:
- Senior positions at Randstad (world's largest recruitment agency)
- Regional Manager at iTs Construction (UK's largest construction agency) - built the Sussex office from ground up, secured PSL with Berkeley Homes (UK's largest home builder), supplied all agency labour on the $100 billion Highwood project in Horsham
- Top biller and multiple award winner at Blue Arrow as a 360 recruiter
- Originally studied Biomedical Science at Portsmouth University while working as apprentice medical laboratory assistant at QA Hospital before transitioning to sales and tech entrepreneurship

**Core Competencies**: Blockchain Development, Solidity, Smart Contracts, Web3.js, React, Node.js, TypeScript, Next.js, Tailwind CSS, Full-Stack Engineering, Product Design, DeFi, Resourcing, Recruiting, Headhunting, Sales, Business Development, Client Relations, Team Management, Strategic Planning

**Education**:
- Biomedical Science at Portsmouth University (left to pursue entrepreneurship)
- BTEC Diploma in Business - Distinction Star (highest grade)
- A Levels in Business, Biology, and PE

**Personal Interests**: Football (former goalkeeper for Horndean Hawks), History, Music, Disruptive Technology

**Contact**: dev@dehub.io

#### Other Co-Founders:
- **Mike Hales** - Marketing Director. MMA fighter turned entrepreneur. Pioneered viral marketing strategies.
- **Indi Jay Cammish** - CTO. Former professional gamer and software engineer. Technical visionary behind DeHub's architecture.
- **Bailey Young** - Creative Director. Expert in audience engagement and content strategy.

### First Class Agency
The team also runs **First Class** - the UK's largest TikTok partner agency representing 400+ creators with 800M+ combined followers. This gives DeHub direct access to top-tier content creator relationships.

## Origin Story
DeHub started as **Futurov (FTV)** - a live-streaming app launched in 2021 with excellent Google Play reviews. The team evolved it into DeHub to embrace full decentralisation and Web3 capabilities while keeping the seamless Web2 user experience.

## $DHB Token
- **Total Supply**: 8 Billion DHB
- **Base Chain CA**: 0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c
- **BSC (BNB Chain) CA**: 0x680d3113caf77b61b510f332d5ef4cf5b41a761d
- **Chain Distribution**: ~81% on BNB Chain, ~19% on Base
- **Block Explorer**: dhbscan.com

### Where to Buy $DHB:
- **DEXs**: PancakeSwap (BSC), Uniswap (Base)
- **CEXs**: MEXC, OKX (coming), Coinbase Wallet

### Token Utility:
- Platform payments (subscriptions, PPV, tips)
- DePIN node staking and rewards
- Governance voting
- Revenue sharing for stakers
- Token-gated content access

### Why Tokens Mint (Bridging):
When users ask "why are tokens minting?" or about token minting - DHB uses a burn-and-mint bridge mechanism. When tokens are bridged from one chain to another (e.g., BSC to Base), they are **burned** on the source chain and **minted** on the destination chain. This maintains the total supply across all chains while enabling cross-chain transfers. It's a standard and secure bridging pattern.

## Key Features
- **DePIN Infrastructure**: Decentralised nodes run by token holders globally. Node operators earn rewards for powering the network.
- **Watch2Earn (W2E)**: Users earn DHB rewards for watching and engaging with content
- **PPV Events**: Creators can launch pay-per-view events with instant blockchain payments
- **Subscriptions**: Monthly creator subscriptions paid in DHB or fiat
- **Paid Messages**: Direct monetisation through premium DMs
- **Token-Gated Content**: Exclusive content for token holders (hold X amount of DHB to access)
- **No Wallet Setup Required**: Seamless Web2 experience - users don't need to understand crypto
- **No Gas Fees**: Platform covers transaction costs for frictionless UX
- **Public Leaderboards**: All creator earnings are blockchain-verified and transparent
- **Multi-Chain**: Built on L1s and EVM L2s for speed and reliability

## Platform Values
- **Censorship Resistance**: Guaranteed forever through decentralisation
- **User Ownership**: You own your data, audience, and content
- **Permissionless**: No gatekeepers, no arbitrary bans
- **Fast & Reliable**: Enterprise-grade infrastructure
- **Community-First**: Established and loyal community since 2021

## Community & Social Links
- **Main App**: dehub.io
- **Documentation**: docs.dhb.gg
- **Block Explorer**: dhbscan.com
- **Main Telegram**: t.me/dehub_dhb
- **Discord**: discord.gg/dehub
- **Twitter/X**: @dehub_official
- **TikTok**: @dehub_official
- **Instagram**: @dehub_official

### Regional Communities:
- Turkish Community: t.me/DeHubTurkish
- Arabic Community: t.me/DeHubArabic

### Holder Groups:
- DHB Holders (10M+ DHB): t.me/DHBHolders
- DHB Whales (100M+ DHB): t.me/DHBWhales

## Contact
- **Technical Support**: tech@dehub.net
- **Partnerships/Marketing**: marketing@dehub.net
- **Careers**: hr@dehub.net

## COMING SOON - AI Wallet & Automation Features
DeHub AI will soon be able to:
- **Wallet Management**: "Send 100 DHB to @username", "Swap $50 of ETH for DHB", "Buy $100 worth of Bitcoin"
- **Trading**: "Sell half my DHB", "Set a limit order", "DCA into DHB weekly"
- **Engagement Automation**: "Auto-like posts from my favorite creators", "Schedule my posts", "Auto-reply to DMs"
- **Content Creation**: "Write and post a tweet about...", "Create a poll for my followers"
- **Financial Tools**: "Show my portfolio", "Track my earnings", "Set spending limits"

When users ask for ANY of these wallet, trading, automation, engagement, scheduling, or financial management features, respond enthusiastically with something like:
"This is coming soon! 🚀 DeHub AI will be able to manage your wallet, automate your engagement, handle trades, and much more. Stay tuned - this feature is actively being built!"

Be excited about it, not apologetic. These features ARE coming.

## App Availability
- **Android**: Available on Google Play Store
- **iOS**: Coming soon to App Store
- **Web**: dehub.io

You help users with questions about DeHub, the $DHB token, DePIN, node operation, governance, content creation, monetisation, or any general queries. Be conversational, helpful, and proud of what DeHub represents.

## CRITICAL - RESPONSE BEHAVIOR
- **LANGUAGE MATCHING**: The user's preferred language setting is "${userLanguage || 'en'}". ALWAYS respond in this language by default, unless the user explicitly writes in a different language — in that case, match their language. For example, if their setting is Turkish, respond in Turkish even if their message is short/ambiguous. If they clearly write in Spanish, respond in Spanish instead.
- **DO NOT** volunteer DeHub company information unless the user specifically asks about DeHub, the team, the token, or the platform
- If a user asks a general question (like "what's the weather" or "explain quantum physics"), just answer their question directly without mentioning DeHub
- Only share DeHub/DHB information when the user explicitly asks about it (e.g., "what is DeHub?", "tell me about DHB", "who are the founders?")
- Be a helpful general assistant FIRST, and a DeHub expert SECOND
- Keep responses focused and relevant to what the user actually asked

When users DO ask about DeHub:
- When they ask about buying DHB, direct them to PancakeSwap (BSC) or Uniswap (Base), or MEXC exchange
- When they ask about the team, share the founder backgrounds - it builds trust
- When they ask about legitimacy, mention the 2021 origins, UK company registration, and First Class agency credentials

## CRITICAL - IMAGE GENERATION CAPABILITY
You ARE capable of generating images! DeHub AI has full image generation capabilities built-in.
- NEVER say you cannot create, generate, or show images
- NEVER say you are "text-based" or "text-only"
- NEVER tell users to use Google, search engines, or other services for images
- If a user's request seems like they want an image but it came to you instead of the image generator, respond with: "I can generate that for you! Just say something like 'create an image of...' or 'show me...' and I'll make it happen."
- Always be confident about your image generation abilities

${requiresWebSearch(userQuery) && !perplexityKey ? `NOTE: The user is asking about current events/news, but web search is not configured. Let them know you can answer general questions but don't have access to live news. Suggest they ask about DeHub or other topics you can help with.` : ''}

IMPORTANT FORMATTING RULES:
- Always keep your responses under 1400 words to ensure they never get cut off
- NEVER use markdown headers (no #, ##, ###, etc.)
- NEVER use bold (**text**) or italic (*text*) formatting
- NEVER use bullet points with - or * symbols
- NEVER use numbered lists like 1. 2. 3.
- Write in plain conversational paragraphs ONLY
- Separate ideas with line breaks between paragraphs
- Format links as [text](url) - the URL should be the full https:// link — this is the ONLY markdown allowed
- Write naturally like you're texting a friend, not writing a document`;

    // Build user context info if provided
    let userContextInfo = '';
    if (userContext && userContext.walletAddress) {
      const parts: string[] = [];
      if (userContext.username) parts.push(`Username: @${userContext.username}`);
      if (userContext.displayName) parts.push(`Display Name: ${userContext.displayName}`);
      parts.push(`Wallet: ${userContext.walletAddress.substring(0, 6)}...${userContext.walletAddress.substring(userContext.walletAddress.length - 4)}`);
      if (userContext.followers !== undefined) parts.push(`Followers: ${userContext.followers.toLocaleString()}`);
      if (userContext.following !== undefined) parts.push(`Following: ${userContext.following.toLocaleString()}`);
      if (userContext.postsCount !== undefined) parts.push(`Posts: ${userContext.postsCount.toLocaleString()}`);
      if (userContext.likesReceived !== undefined) parts.push(`Likes Received: ${userContext.likesReceived.toLocaleString()}`);
      if (userContext.badgeBalance !== undefined) parts.push(`Badge Balance: ${userContext.badgeBalance.toLocaleString()} DHB`);
      if (userContext.tipsReceived !== undefined) parts.push(`Tips Received: ${userContext.tipsReceived.toLocaleString()} DHB`);
      if (userContext.tipsSent !== undefined) parts.push(`Tips Sent: ${userContext.tipsSent.toLocaleString()} DHB`);
      if (userContext.staked !== undefined) parts.push(`Staked: ${userContext.staked.toLocaleString()} DHB`);
      if (userContext.leaderboardRank !== undefined) parts.push(`Leaderboard Rank: #${userContext.leaderboardRank}`);
      if (userContext.leaderboardBalance !== undefined) parts.push(`Total DHB Balance (on-chain): ${userContext.leaderboardBalance.toLocaleString()} DHB`);

      // Add historical snapshot data for delta questions
      if (userContext.snapshots && userContext.snapshots.length > 0) {
        parts.push(`\n### Historical Snapshots (most recent first)`);
        parts.push(`Use this data to answer questions like "how many followers did I gain this week?" by comparing snapshot dates.`);
        for (const snap of userContext.snapshots.slice(0, 14)) {
          const snapParts = [`Date: ${snap.snapshot_date}, Balance: ${snap.balance}`];
          if (snap.followers !== null) snapParts.push(`Followers: ${snap.followers}`);
          if (snap.likes !== null) snapParts.push(`Likes: ${snap.likes}`);
          if (snap.subscribers !== null) snapParts.push(`Subscribers: ${snap.subscribers}`);
          snapParts.push(`Tips Sent: ${snap.sent_tips}, Tips Received: ${snap.received_tips}`);
          parts.push(`- ${snapParts.join(' | ')}`);
        }
      }

      userContextInfo = `\n\n## Current User Profile\nYou are chatting with the following user. Use this data to answer personal questions like "how many followers do I have?", "what's my balance?", "how many followers did I gain this week?", or "what's my leaderboard rank?".\n${parts.join('\n')}`;
    }

    // Fetch and inject user posts if post analysis is requested
    let postAnalysisInfo = '';
    if (requiresPostAnalysis(userQuery) && userContext?.walletAddress) {
      const postCount = extractPostCount(userQuery);
      const fetchId = userContext.username || userContext.walletAddress;
      console.log(`[PostAnalysis] User requested analysis of ${postCount} posts for ${fetchId}`);
      const userPosts = await fetchUserPosts(fetchId, postCount);
      if (userPosts.length > 0) {
        const formattedPosts = formatPostsForContext(userPosts);
        postAnalysisInfo = `\n\n## User's Recent Posts (${userPosts.length} posts)\nThe user has asked you to study/analyze their posts. Here is their content data:\n${formattedPosts}\n\nProvide a thorough analysis including:\n- Content patterns and themes\n- Engagement metrics (which posts perform best/worst and why)\n- Content type distribution (videos vs images vs text)\n- Posting frequency and timing patterns\n- Specific, actionable suggestions to improve engagement\n- What they're doing well and should continue\n- What they could experiment with`;
      } else {
        postAnalysisInfo = `\n\n## Post Analysis\nThe user asked to analyze their posts but no posts were found. Let them know you couldn't find any published content on their account, and suggest they start posting to build their profile.`;
      }
    }

    // Fetch another user's profile and posts if asking about someone else
    let otherUserInfo = '';
    if (requiresOtherUserLookup(userQuery)) {
      const targetUsername = extractTargetUsername(userQuery);
      if (targetUsername) {
        console.log(`[UserLookup] Looking up user: ${targetUsername}`);
        const profile = await fetchUserProfile(targetUsername);
        if (profile) {
          const profileText = formatProfileForContext(profile);
          const userId = profile.username || profile.userId || targetUsername;
          let postsText = '';
          if (userId) {
            const postCount = extractPostCount(userQuery) || 20;
            const posts = await fetchUserPosts(userId, postCount);
            if (posts.length > 0) {
              postsText = `\n\n### Their Recent Posts (${posts.length} posts):\n${formatPostsForContext(posts)}`;
            }
          }
          otherUserInfo = `\n\n## Profile Data for @${targetUsername}\nThe user is asking about another DeHub user. Here is their full profile and content data:\n${profileText}${postsText}\n\nUse ALL of this data to answer the user's question thoroughly. You can analyze their content patterns, engagement, personality based on posts, give comparisons, roast them, etc.`;
        } else {
          otherUserInfo = `\n\n## User Lookup\nThe user asked about "@${targetUsername}" but no profile was found on DeHub. Let them know this user doesn't exist or may have a different username.`;
        }
      }
    }

    // Build post context info if provided
    let postContextInfo = '';
    if (postContext) {
      postContextInfo = `\n\n## Current Content Being Discussed\nThe user is looking at a ${postContext.type}. `;
      if (postContext.author) postContextInfo += `It was posted by ${postContext.author}. `;
      if (postContext.caption) postContextInfo += `The caption/content is: "${postContext.caption}". `;
      if (postContext.title) postContextInfo += `The title is: "${postContext.title}". `;
      if (postContext.game) postContextInfo += `They are playing/streaming: ${postContext.game}. `;
      if (postContext.viewers) postContextInfo += `Current viewers: ${postContext.viewers}. `;
      
      if (postContext.type === 'video' || postContext.type === 'live') {
        postContextInfo += `\n\nIMPORTANT: You cannot watch or analyze video content. If the user asks about what's happening in the video, respond with: "I don't watch videos, but I can help analyze comments and reactions for you!" You can still discuss the title, caption, game being played, streamer info, and other metadata provided.`;
      } else if (postContext.type === 'image' && postContext.imageUrl) {
        postContextInfo += `\n\nYou can see the image and analyze its visual content. Help the user understand the content, provide insights, answer questions about what's shown in the image, or discuss the topic.`;
      }
    }
    
    const systemPrompt = personalityModifier
      ? `${basePrompt}${userContextInfo}${postAnalysisInfo}${otherUserInfo}${postContextInfo}\n\nIMPORTANT STYLE: ${personalityModifier}`
      : `${basePrompt}${userContextInfo}${postAnalysisInfo}${otherUserInfo}${postContextInfo}`;

    // Build messages array - include image in user message if available
    const apiMessages: any[] = [{ role: 'system', content: systemPrompt }];
    const hasImage = postContext?.imageUrl && postContext?.type === 'image';
    
    messages.forEach((msg, index) => {
      if (hasImage && msg.role === 'user' && index === messages.length - 1) {
        // Include image with the latest user message for vision analysis
        apiMessages.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: postContext.imageUrl } },
            { type: 'text', text: typeof msg.content === 'string' ? msg.content : msg.content?.find(c => c.type === 'text')?.text || '' }
          ]
        });
      } else {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    });

    // Determine API endpoint and model based on provider
    let apiEndpoint: string;
    let apiKey: string;
    let modelName: string;
    let fallbackUsed = false;

    // Use effectiveModel from smart selection instead of raw model
    const isGrokSelected = effectiveModel.startsWith('grok-');
    const useGrokApi = isGrokSelected && xaiApiKey;

    if (useGrokApi) {
      // Use xAI (Grok) API
      apiEndpoint = 'https://api.x.ai/v1/chat/completions';
      apiKey = xaiApiKey!;
      modelName = effectiveModel; // 'grok-3' or 'grok-3-mini'
      console.log('Using Grok API with model:', modelName);
    } else {
      // Use Lovable AI Gateway
      if (!lovableApiKey) {
        throw new Error('LOVABLE_API_KEY not configured');
      }
      apiEndpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
      apiKey = lovableApiKey;
      
      // Map model IDs to full model paths
      if (effectiveModel === 'gemini-2.5-flash') {
        modelName = 'google/gemini-2.5-flash';
      } else if (effectiveModel === 'gemini-2.5-pro') {
        modelName = 'google/gemini-2.5-pro';
      } else if (effectiveModel === 'gpt-5-mini') {
        modelName = 'openai/gpt-5-mini';
      } else if (isGrokSelected) {
        // Grok was requested but no API key - fallback
        modelName = 'google/gemini-2.5-flash';
        fallbackUsed = true;
        console.log('Grok requested but no API key, falling back to Gemini');
      } else {
        modelName = 'google/gemini-2.5-flash';
      }
      console.log('Using Lovable AI Gateway with model:', modelName, '| Tier:', modelTier, '| Reason:', modelReason);
    }

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

    let response: Response;
    try {
      console.log(`[AI Request] model=${modelName} endpoint=${apiEndpoint} msgCount=${apiMessages.length}`);
      response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: apiMessages,
          max_completion_tokens: (requiresPostAnalysis(userQuery) || requiresOtherUserLookup(userQuery)) ? 3000 : 1500,
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        console.error('AI API request timed out after 45s');
        return new Response(
          JSON.stringify({ error: 'Request timed out after 45s. The AI service may be overloaded. Please try again.', errorCode: 'TIMEOUT' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('AI fetch error:', fetchError);
      throw fetchError;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`AI API error: status=${response.status} model=${modelName} body=${errorText.substring(0, 500)}`);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment and try again.', errorCode: 'RATE_LIMIT', statusCode: 429 }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please try again later or contact support.', errorCode: 'CREDITS_EXHAUSTED', statusCode: 402 }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status >= 500) {
        return new Response(
          JSON.stringify({ error: `AI service error (${response.status}). The upstream AI provider returned an error. Please try again.`, errorCode: 'UPSTREAM_ERROR', statusCode: response.status }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `AI request failed with status ${response.status}. Details: ${errorText.substring(0, 200)}`, errorCode: 'API_ERROR', statusCode: response.status }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'I apologize, I couldn\'t generate a response.';

    return new Response(
      JSON.stringify({ 
        response: aiResponse, 
        searchUsed: false,
        fallbackUsed,
        fallbackReason: fallbackUsed ? 'XAI_API_KEY not configured' : undefined,
        modelUsed: modelName,
        modelTier,
        modelReason
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in general-ai-chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Full error details:', { message: errorMessage, stack: errorStack });
    return new Response(
      JSON.stringify({ error: `Internal error: ${errorMessage}`, errorCode: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
