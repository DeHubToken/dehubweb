import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PostContext {
  type: 'image' | 'video' | 'live' | 'post';
  author?: string;
  caption?: string;
  title?: string;
  game?: string;
  viewers?: string;
  thumbnail?: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, postContext } = await req.json() as { 
      messages: Message[]; 
      postContext: PostContext 
    };

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build context about the post
    let contextInfo = `You are an AI assistant helping users understand content on a social media platform. `;
    contextInfo += `The user is looking at a ${postContext.type}. `;
    
    if (postContext.author) {
      contextInfo += `It was posted by ${postContext.author}. `;
    }
    if (postContext.caption) {
      contextInfo += `The caption/content is: "${postContext.caption}". `;
    }
    if (postContext.title) {
      contextInfo += `The title is: "${postContext.title}". `;
    }
    if (postContext.game) {
      contextInfo += `They are playing/streaming: ${postContext.game}. `;
    }
    if (postContext.viewers) {
      contextInfo += `Current viewers: ${postContext.viewers}. `;
    }

    contextInfo += `\n\nHelp the user understand the content, provide insights, answer questions, or discuss the topic. Be conversational, helpful, and concise. If you don't have enough information, say so honestly.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: contextInfo },
          ...messages
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'I apologize, I couldn\'t generate a response.';

    return new Response(
      JSON.stringify({ response: aiResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in post-ai-chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
