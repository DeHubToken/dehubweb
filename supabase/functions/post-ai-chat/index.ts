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
  imageUrl?: string;
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

    // Add specific instructions based on content type
    if (postContext.type === 'video' || postContext.type === 'live') {
      contextInfo += `\n\nIMPORTANT: You cannot watch or analyze video content. If the user asks about what's happening in the video, what the video shows, or any visual content from the video, respond with: "I don't watch videos, but I can help analyze comments and reactions for you!" You can still discuss the title, caption, game being played, streamer info, and other metadata provided.`;
    } else {
      contextInfo += `\n\nYou can see images and analyze their visual content. Help the user understand the content, provide insights, answer questions about what's shown in the image, or discuss the topic.`;
    }
    
    contextInfo += ` Be conversational, helpful, and concise.`;

    // Build messages array - include image in first user message if available
    const apiMessages: any[] = [{ role: 'system', content: contextInfo }];
    
    // If we have an image URL, include it with the first user message
    const hasImage = postContext.imageUrl && postContext.type === 'image';
    
    messages.forEach((msg, index) => {
      if (hasImage && msg.role === 'user' && index === messages.length - 1) {
        // Include image with the latest user message for vision analysis
        apiMessages.push({
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: postContext.imageUrl } },
            { type: 'text', text: msg.content }
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
        max_completion_tokens: 500,
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
