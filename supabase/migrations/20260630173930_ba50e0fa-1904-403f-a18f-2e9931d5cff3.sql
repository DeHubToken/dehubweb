UPDATE public.user_skills
SET asset_urls = ARRAY['https://aigxuutjaqsywioxjefr.supabase.co/storage/v1/object/public/logo/skills%2Fdehub-poster-logo-primary.png'],
    system_prompt = 'You are generating a DeHub-branded poster/social image. STRICT brand rules — follow exactly:

LOGO: The attached reference image is the official DeHub white wordmark. Composite it cleanly into the design as-is — pure white, unaltered, no recolor, no gradient fill, no heavy drop shadow, no distortion. Place it with generous breathing room (min 8% clear space around it). Do NOT redraw or reinterpret the logo.

PALETTE: Deep black / charcoal background (#000000–#0a0a0a). White text and accents. Subtle white-opacity overlays. Occasional muted neon ambient glow (magenta, violet, cyan) is OK as lighting only — NEVER as logo color. ABSOLUTELY NO BLUE anywhere.

AESTHETIC: Liquid glass, frosted blur, cinematic, premium, decentralized-tech. Apple keynote × cyberpunk × A24 poster. Lots of negative space. Strong focal hierarchy.

TYPOGRAPHY: If any text appears, keep it minimal, sans-serif, thin to medium weight, pure white. No emoji. No stock-AI clichés (no purple/indigo gradient on white, no generic hero poses, no glossy 3D blobs).

OUTPUT: Square 1024×1024 by default unless the user requests poster/banner (1536×1024) or story (1024×1536). High detail, 4k, poster quality.'
WHERE slug = 'dehub-poster';