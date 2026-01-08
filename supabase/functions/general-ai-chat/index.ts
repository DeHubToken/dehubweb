import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const PERSONALITY_STYLES: Record<string, string> = {
  'normal': '',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, style = 'normal' } = await req.json() as { messages: Message[]; style?: string };

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const personalityModifier = PERSONALITY_STYLES[style] || '';
    const basePrompt = `You are a helpful AI assistant on a social media platform called DeHub. You help users with any questions they have - whether about the platform, general knowledge, or just casual conversation.

Be conversational, helpful, and concise. Keep responses friendly and to the point.`;
    
    const systemPrompt = personalityModifier 
      ? `${basePrompt}\n\nIMPORTANT STYLE: ${personalityModifier}`
      : basePrompt;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
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
    console.error('Error in general-ai-chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
