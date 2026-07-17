import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { rateLimitByIp } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STYLE_PROMPTS: Record<string, string> = {
  'old-english': 'Rewrite the text in Old English style with "thee", "thou", "hath", "doth", and archaic vocabulary. Make it sound like Shakespeare or medieval literature.',
  'cockney': 'Rewrite the text in Cockney accent/dialect with rhyming slang, dropped H sounds, and East London expressions. Keep it authentic to working-class London speech.',
  'celtic': 'Rewrite the text with Celtic/Irish flair, using expressions like "sure", "grand", "aye", adding lyrical Irish turns of phrase and Gaelic-influenced grammar.',
  'scouse': 'Rewrite the text in Scouse (Liverpool) dialect with expressions like "la", "boss", "sound", "dead good", and characteristic Liverpool speech patterns.',
  'wild-west': 'Rewrite the text in Wild West cowboy style with "howdy", "partner", "reckon", "y\'all", and frontier American expressions from the Old West.',
  'asian-uncle': 'Rewrite the text in the style of a stereotypical Asian uncle with wisdom, proverbs, comparing everything to the old days, and wholesome advice.',
  'russian-mafia': 'Rewrite the text in Russian mafia boss style with dramatic pauses, referring to "family", speaking in third person occasionally, and ominous undertones.',
  'pirate': 'Rewrite the text in pirate speak with "arr", "matey", "shiver me timbers", "ye", "be", and nautical references. Make it sound like a sea captain.',
  'alien': 'Rewrite the text as if an alien is trying to communicate with humans, using slightly formal/clinical language, curious observations about "human customs", and occasional misunderstandings.',
  'e-girl': 'Rewrite the text in e-girl/internet culture style with "uwu", "owo", emoticons, elongated words like "pleaseee", lots of enthusiasm, and cute expressions.',
  'chad': 'Rewrite the text in "chad" bro culture style with "bro", "dude", "gains", gym references, excessive confidence, and motivational energy.',
  'hopeless-romantic': 'Rewrite the text in the voice of a hopeless romantic - dreamy, poetic, full of sighs and longing. Use flowery language, metaphors about love, destiny, and hearts. Sprinkle in wistful observations and make everything sound like it could be from a romance novel.',
  'daddy': 'Rewrite the text as a loving, supportive father figure. Be warm, protective, offer wise advice, use phrases like "son/kiddo/champ", share life lessons, and provide that steady, reassuring presence dads are known for.',
  'mommy': 'Rewrite the text as a caring, nurturing mother figure. Be warm, comforting, slightly fussy about their wellbeing, use terms of endearment like "sweetie/honey/dear", offer unconditional support and gentle wisdom.',
  'big-brother': 'Rewrite the text as a supportive older brother. Be protective but cool, give real talk advice, hype them up, use casual language like "yo/man/dude", and have that "I got your back" energy.',
  'lil-bro': 'Rewrite the text as a loving little brother who looks up to the reader. Be enthusiastic, slightly naive but endearing, ask for their opinion, show admiration, and bring that eager-to-help little sibling energy.',
  'big-sister': 'Rewrite the text as a caring older sister. Be supportive but also give honest advice, use sisterly terms like "babe/hun", share wisdom from experience, and have that protective but encouraging vibe.',
  'little-sister': 'Rewrite the text as a sweet little sister. Be playful, sometimes a bit cheeky, ask lots of questions, show admiration for the reader, and bring that innocent, loving younger sibling energy.',
  // Political & Ideological personalities
  'conservative': 'Rewrite the text from a conservative perspective. Emphasize traditional values, personal responsibility, limited government, free markets, respect for institutions, and constitutional principles. Use phrases like "the founding fathers intended", "traditional values", "fiscal responsibility".',
  'liberal': 'Rewrite the text from a liberal perspective. Emphasize individual rights, social progress, equality, civil liberties, and government as a force for good. Use phrases like "progress", "equality", "social justice", "moving forward together".',
  'antifa': 'Rewrite the text from an anti-fascist perspective. Be confrontational against authoritarianism, emphasize direct action, solidarity with the oppressed, and resistance to fascism. Use militant language, references to "solidarity", "comrades", and "resistance".',
  'capitalist': 'Rewrite the text from a free-market capitalist perspective. Emphasize entrepreneurship, innovation, wealth creation, market solutions, and economic freedom. Use phrases like "market forces", "ROI", "disruption", "monetize", "value creation".',
  'socialist': 'Rewrite the text from a democratic socialist perspective. Emphasize workers\' rights, collective ownership, social welfare, economic equality, and critique of capitalism. Use phrases like "workers of the world", "means of production", "solidarity", "collective action".',
  'neocon': 'Rewrite the text from a neoconservative perspective. Emphasize American exceptionalism, strong national defense, spreading democracy, hawkish foreign policy, and moral clarity. Use phrases like "American leadership", "national security", "strength through power".',
  'feminist': 'Rewrite the text from a feminist perspective. Emphasize gender equality, women\'s empowerment, challenging patriarchy, intersectionality, and reproductive rights. Use inclusive language and phrases like "smash the patriarchy", "equal rights", "representation matters".',
  'progressive': 'Rewrite the text from a progressive perspective. Emphasize systemic change, social justice, environmental protection, wealth redistribution, and challenging corporate power. Use phrases like "systemic change", "equity", "climate justice", "intersectional".',
  'nationalist': 'Rewrite the text from a nationalist perspective. Emphasize national identity, sovereignty, cultural preservation, border security, and putting the nation first. Use phrases like "our people", "national sovereignty", "protect our borders", "heritage".',
  'communist': 'Rewrite the text from a communist perspective. Emphasize class struggle, abolition of private property, workers\' revolution, critique of bourgeoisie, and collective ownership. Use phrases like "proletariat", "bourgeoisie", "class consciousness", "seize the means of production", "comrade".',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = await rateLimitByIp(req, 'enhance-text', { limit: 60, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  try {
    const { text, mode = 'spellcheck', style } = await req.json();
    
    if (!text || typeof text !== 'string') {
      console.error('Invalid text input:', text);
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let systemPrompt: string;
    
    if (mode === 'style' && style && STYLE_PROMPTS[style]) {
      systemPrompt = `${STYLE_PROMPTS[style]} Return ONLY the rewritten text, nothing else - no explanations, no quotes, no additional commentary.`;
    } else if (mode === 'grammar') {
      systemPrompt = 'You are a grammar and punctuation expert. Fix grammar, capitalization, punctuation, and sentence structure to make the text read perfectly. Ensure proper capitalization at the start of sentences and for proper nouns. Add missing punctuation. Fix run-on sentences. Keep the original meaning and tone. Return ONLY the corrected text, nothing else.';
    } else {
      // Default spellcheck mode
      systemPrompt = 'You are a spell checker. Fix ONLY spelling mistakes and obvious typos. Do NOT change grammar, style, punctuation, or word choice. Keep the text exactly as written except for fixing misspelled words. Return ONLY the corrected text, nothing else.';
    }

    console.log('Processing text:', text.substring(0, 50), 'mode:', mode, 'style:', style);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add more credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI enhancement failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const enhancedText = data.choices?.[0]?.message?.content?.trim();

    if (!enhancedText) {
      console.error('No enhanced text in response:', data);
      return new Response(
        JSON.stringify({ error: 'Failed to process text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Result:', enhancedText.substring(0, 50));

    return new Response(
      JSON.stringify({ enhancedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enhance-text function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
