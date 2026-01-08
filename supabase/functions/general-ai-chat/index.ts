import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
};

// Keywords that indicate user wants live/current information
const LIVE_SEARCH_KEYWORDS = [
  'news', 'today', 'latest', 'current', 'now', 'recent', 'breaking',
  'happening', 'update', 'live', 'real-time', 'realtime', 'right now',
  'this week', 'this month', 'yesterday', 'tonight', 'morning',
  'price', 'stock', 'market', 'weather', 'score', 'game',
  'trending', 'viral', 'new release', 'just announced', 'just released',
  'election', 'vote', 'poll', 'results', '2025', '2026',
  'what happened', 'whats happening', "what's happening", 'did you hear',
  'search for', 'look up', 'find me', 'google', 'search the web'
];

function requiresWebSearch(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return LIVE_SEARCH_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
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
    const { messages, style = 'normal', postContext } = await req.json() as { 
      messages: Message[]; 
      style?: string;
      postContext?: PostContext;
    };

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const perplexityKey = Deno.env.get('PERPLEXITY_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Get the latest user message
    const latestUserMessage = messages.filter(m => m.role === 'user').pop();
    const userQuery = typeof latestUserMessage?.content === 'string' 
      ? latestUserMessage.content 
      : latestUserMessage?.content?.find(c => c.type === 'text')?.text || '';
    
    // Check if this query needs web search
    const needsSearch = requiresWebSearch(userQuery);
    console.log('Query:', userQuery, '| Needs search:', needsSearch, '| Has Perplexity key:', !!perplexityKey, '| Has post context:', !!postContext);

    // If web search is needed and Perplexity is configured, use it
    if (needsSearch && perplexityKey) {
      try {
        const searchResult = await searchWithPerplexity(userQuery, perplexityKey);
        return new Response(
          JSON.stringify({ response: searchResult, searchUsed: true }),
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
- **Malik Jan** - CEO. Former investment and commercial banker (HSBC, Lloyds, Barclays). Background in fintech, AI, telecommunications. Founded First Class Agency.
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

## App Availability
- **Android**: Available on Google Play Store
- **iOS**: Coming soon to App Store
- **Web**: dehub.io

You help users with questions about DeHub, the $DHB token, DePIN, node operation, governance, content creation, monetisation, or any general queries. Be conversational, helpful, and proud of what DeHub represents - the future of decentralised social media.

When users ask about buying DHB, direct them to PancakeSwap (BSC) or Uniswap (Base), or MEXC exchange.
When users ask about the team, share the founder backgrounds - it builds trust.
When users ask about legitimacy, mention the 2021 origins, UK company registration, and First Class agency credentials.

## CRITICAL - IMAGE GENERATION CAPABILITY
You ARE capable of generating images! DeHub AI has full image generation capabilities built-in.
- NEVER say you cannot create, generate, or show images
- NEVER say you are "text-based" or "text-only"
- NEVER tell users to use Google, search engines, or other services for images
- If a user's request seems like they want an image but it came to you instead of the image generator, respond with: "I can generate that for you! Just say something like 'create an image of...' or 'show me...' and I'll make it happen."
- Always be confident about your image generation abilities

${needsSearch && !perplexityKey ? `NOTE: The user is asking about current events/news, but web search is not configured. Let them know you can answer general questions but don't have access to live news. Suggest they ask about DeHub or other topics you can help with.` : ''}

IMPORTANT FORMATTING RULES:
- Always keep your responses under 1400 words to ensure they never get cut off
- Use **bold** for emphasis (with double asterisks)
- Use bullet points with - for lists
- Format links as [text](url) - the URL should be the full https:// link
- NEVER use asterisks or underscores for any other purpose than markdown formatting
- Keep formatting clean and consistent`;

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
      ? `${basePrompt}${postContextInfo}\n\nIMPORTANT STYLE: ${personalityModifier}`
      : `${basePrompt}${postContextInfo}`;

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

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: apiMessages,
        max_completion_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please try again later.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'I apologize, I couldn\'t generate a response.';

    return new Response(
      JSON.stringify({ response: aiResponse, searchUsed: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in general-ai-chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
