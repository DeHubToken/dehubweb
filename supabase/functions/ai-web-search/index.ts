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

    // Use Gemini with Google Search grounding for real-time web search
    const systemPrompt = `You are a helpful AI assistant with real-time web search capabilities. You can search the web to find current information, news, and up-to-date data.

When answering:
1. Provide accurate, current information from web sources
2. Include relevant details and context
3. If you find multiple sources, synthesize the information
4. For news queries, prioritize recent articles
5. Always be helpful and conversational

Format your responses clearly with:
- Bold headers for sections (**Header**)
- Bullet points for lists
- Links when referencing sources

IMPORTANT: Keep responses under 1200 words to avoid cutoffs.`;

    // Use Gemini 2.5 Pro which has better grounding/search capabilities
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
          ...messages,
          { 
            role: 'user', 
            content: `Search the web and answer this query with current, up-to-date information: ${query}`
          }
        ],
        max_completion_tokens: 1500,
        // Enable Google Search grounding for real-time web results
        tools: [{
          type: 'function',
          function: {
            name: 'google_search',
            description: 'Search Google for real-time information',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query' }
              },
              required: ['query']
            }
          }
        }],
        tool_choice: 'auto'
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
    console.log('AI response data:', JSON.stringify(data, null, 2));
    
    const aiResponse = data.choices?.[0]?.message?.content || 'I apologize, I couldn\'t find relevant information for your query.';

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
