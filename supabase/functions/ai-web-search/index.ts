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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, query } = await req.json() as { messages: Message[]; query: string };

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Use Gemini Pro for better knowledge-based responses
    const systemPrompt = `You are a knowledgeable AI assistant that provides informative answers on current events, news, and general knowledge topics.

Your knowledge includes information up to your training cutoff. When answering:

1. **For news/current events queries**: Provide context about ongoing topics, recent developments you're aware of, and relevant background information. Be clear about what you know.

2. **For factual queries**: Give accurate, well-structured answers with relevant details.

3. **For trending topics**: Share what you know about popular subjects, viral content, and cultural moments.

**Formatting Guidelines:**
- Use **bold** for key terms and headlines
- Use bullet points for lists
- Keep responses informative but concise
- If you don't have specific real-time data, provide useful context or suggest how users can find current info

**Important**: You don't have live internet access, but you have extensive knowledge. Be helpful and informative based on what you know. Don't apologize unnecessarily - just provide value.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-6), // Keep last 6 messages for context
          { role: 'user', content: query }
        ],
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
    console.log('AI response received, finish_reason:', data.choices?.[0]?.finish_reason);
    
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (!aiResponse) {
      console.error('Empty response from AI:', JSON.stringify(data));
      return new Response(
        JSON.stringify({ 
          response: "I couldn't generate a response. Please try rephrasing your question.",
          isSearchResult: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        response: aiResponse,
        isSearchResult: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-web-search:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
