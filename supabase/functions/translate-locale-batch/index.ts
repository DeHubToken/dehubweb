/**
 * Translate Locale Batch
 * ======================
 * Accepts a batch of English i18n key-value pairs + target language.
 * Returns AI-translated values using Lovable AI (Gemini Flash).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Language name map for the AI prompt
const langNames: Record<string, string> = {
  es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', zh: 'Chinese (Simplified)',
  ja: 'Japanese', ko: 'Korean', ar: 'Arabic', hi: 'Hindi', ru: 'Russian', tr: 'Turkish',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian', vi: 'Vietnamese', th: 'Thai',
  id: 'Indonesian', ms: 'Malay', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', ur: 'Urdu',
  fa: 'Persian', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', cs: 'Czech',
  hu: 'Hungarian', ro: 'Romanian', bg: 'Bulgarian', sr: 'Serbian', hr: 'Croatian', sk: 'Slovak',
  el: 'Greek', he: 'Hebrew', ka: 'Georgian', sw: 'Swahili', tl: 'Tagalog', af: 'Afrikaans',
  mr: 'Marathi', pa: 'Punjabi', gu: 'Gujarati', ml: 'Malayalam', kn: 'Kannada', si: 'Sinhala',
  ne: 'Nepali', my: 'Burmese', km: 'Khmer', lo: 'Lao', mn: 'Mongolian', kk: 'Kazakh',
  uz: 'Uzbek', az: 'Azerbaijani', sq: 'Albanian', am: 'Amharic', ha: 'Hausa', ig: 'Igbo',
  yo: 'Yoruba', so: 'Somali', zu: 'Zulu', be: 'Belarusian', lt: 'Lithuanian', lv: 'Latvian',
  et: 'Estonian', ca: 'Catalan', sa: 'Sanskrit', ku: 'Kurdish', sd: 'Sindhi', ug: 'Uyghur',
  tg: 'Tajik', tk: 'Turkmen', hy: 'Armenian', ky: 'Kyrgyz', or: 'Odia', om: 'Oromo',
  ti: 'Tigrinya', mi: 'Maori', mg: 'Malagasy', jv: 'Javanese', qu: 'Quechua',
  yue: 'Cantonese', wuu: 'Wu Chinese', arz: 'Egyptian Arabic', acm: 'Iraqi Arabic',
  acw: 'Hijazi Arabic', aec: "Sa'idi Arabic", ajp: 'Levantine Arabic', ayn: 'Sanaani Arabic',
  apd: 'Sudanese Arabic', ary: 'Moroccan Arabic', pbt: 'Southern Pashto', bho: 'Bhojpuri',
  ctg: 'Chittagonian', hne: 'Chhattisgarhi', dcc: 'Deccan', dyu: 'Jula', gsw: 'Swiss German',
  mag: 'Magahi', pcm: 'Nigerian Pidgin', rkt: 'Rangpuri', sdr: 'Sadri', skr: 'Saraiki',
  syl: 'Sylheti', tts: 'Northeastern Thai', wes: 'Cameroon Pidgin', cjy: 'Jinyu Chinese',
  mnp: 'Min Bei Chinese',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keys, targetLang } = await req.json();

    if (!keys || !targetLang || typeof keys !== 'object') {
      return new Response(JSON.stringify({ error: 'Missing keys or targetLang' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const langName = langNames[targetLang] || targetLang;
    const entries = Object.entries(keys as Record<string, string>);

    if (entries.length === 0) {
      return new Response(JSON.stringify({ translations: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the translation prompt
    const keyValueLines = entries.map(([k, v]) => `"${k}": "${v.replace(/"/g, '\\"')}"`).join(',\n');

    const prompt = `Translate these English UI strings to ${langName}. 
This is for a social media app called DeHub. Keep brand names (DeHub, DHB, Base) unchanged.
Keep template variables like {{name}}, {{count}}, {{amount}} unchanged.
Keep emojis unchanged. Keep technical terms like PPV, DM, NFT, etc.
Return ONLY a valid JSON object with the same keys and translated values. No explanation.

{
${keyValueLines}
}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      // Return empty if no API key — client will use English fallbacks
      return new Response(JSON.stringify({ translations: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a professional UI translator. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`AI gateway error: ${aiResp.status}`, errText);
      return new Response(JSON.stringify({ translations: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    let content = aiData.choices?.[0]?.message?.content || '';

    // Strip markdown code fences if present
    content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
      const translations = JSON.parse(content);
      return new Response(JSON.stringify({ translations }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      console.error('Failed to parse AI translation response:', content.slice(0, 200));
      return new Response(JSON.stringify({ translations: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (err) {
    console.error('translate-locale-batch error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
