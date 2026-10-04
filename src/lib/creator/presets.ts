/**
 * Creator presets.
 * ================
 * A preset is a proven prompt scaffold plus the model settings that make it
 * work. The point is that a creator never faces a blank prompt box: pick a
 * look, type a subject, generate. `{subject}` is replaced with whatever the
 * creator typed; if they typed nothing the `sample` subject is used so the
 * tile is still one click from a result.
 *
 * The product-shoot, UGC/ad and illustration-style presets follow the mode
 * taxonomy in higgsfield-ai/skills (MIT, see LICENSE-HiggsfieldSkills); the
 * prompt scaffolds themselves are ours. The ad formats (headline, benefit
 * bullets, us vs them) and brand deliverables (merch, packaging, signage, logo)
 * follow the same repo's DTC-ads and brandkit references.
 *
 * Video effects lead the video list and run on the cheapest models that do
 * them well (Kling 2.5 Turbo, PixVerse V5, MiniMax), so the most tempting
 * tiles are also the cheapest to try.
 */

import type { AudioTask } from '@/constants/audio-models.constants';
import { OPEN_STUDIO_PRESETS } from './openStudioPresets';

export type PresetKind = 'image' | 'video' | '3d' | 'audio';

export interface CreatorPreset {
  id: string;
  /** i18n key for the display name. The template and sample stay English:
   * they are sent to the model, not shown to the reader. */
  nameKey: string;
  kind: PresetKind;
  group: string;
  /** Prompt scaffold. `{subject}` is substituted with the creator's text. */
  template: string;
  /** Subject used when the prompt box is empty. */
  sample: string;
  /** i18n key for the one line explaining what the preset does. */
  hintKey: string;
  /** Model this preset is tuned for. Applied when the preset is picked. */
  model?: string;
  /** Aspect ratio this preset is tuned for. */
  aspect?: string;
  /** Negative prompt, for models that accept one. */
  negative?: string;
  /**
   * The preset only works with an attached image.
   *
   * Set so the composer can refuse it rather than silently swapping in a
   * different model at a different price, and so the prompt scaffold never
   * ends up telling a text-only model to "reconstruct the attached image"
   * when there is no attachment.
   */
  requiresImage?: boolean;
  /**
   * Audio presets only: which task the preset belongs to.
   *
   * Audio is nine tools rather than one, and a music brief is useless under the
   * sound-effect tool. The strip filters on this so each task shows only its
   * own scaffolds.
   */
  audioTask?: AudioTask;
}

export const IMAGE_PRESETS: CreatorPreset[] = [
  ...OPEN_STUDIO_PRESETS.filter((preset) => preset.kind === 'image'),
  {
    id: 'studio-product',
    nameKey: 'creator.presetStudioProductName',
    kind: 'image',
    group: 'Commercial',
    template:
      '{subject}, professional product photography, seamless studio backdrop, large softbox key light with a subtle rim, shallow depth of field, crisp specular highlights, colour-accurate, shot on a 100mm macro lens',
    sample: 'a matte black ceramic coffee flask',
    hintKey: 'creator.presetStudioProductHint',
    model: 'gemini-3-pro-image',
    aspect: '1:1',
  },
  {
    id: 'cinematic-still',
    nameKey: 'creator.presetCinematicStillName',
    kind: 'image',
    group: 'Film',
    template:
      '{subject}, cinematic film still, anamorphic widescreen framing, motivated practical lighting, deep shadows with lifted blacks, 35mm grain, muted teal and amber grade, shallow focus',
    sample: 'a lone figure crossing a rain-slick street at night',
    hintKey: 'creator.presetCinematicStillHint',
    model: 'gemini-3-pro-image',
    aspect: '16:9',
  },
  {
    id: 'editorial-portrait',
    nameKey: 'creator.presetEditorialPortraitName',
    kind: 'image',
    group: 'Portrait',
    template:
      '{subject}, editorial fashion portrait, single hard key light at 45 degrees, sculpted shadow falloff, clean neutral backdrop, natural skin texture retained, medium-format detail',
    sample: 'a model in an oversized wool coat',
    hintKey: 'creator.presetEditorialPortraitHint',
    model: 'gemini-3-pro-image',
    aspect: '4:5',
  },
  {
    id: 'poster-type',
    nameKey: 'creator.presetPosterTypeName',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, bold graphic poster layout, oversized display typography with correct legible spelling, high-contrast monochrome palette with one accent, generous negative space, print-ready composition',
    sample: 'a launch poster reading "NEW DROP"',
    hintKey: 'creator.presetPosterTypeHint',
    model: 'gemini-3-pro-image',
    aspect: '4:5',
  },
  {
    id: 'thumbnail-punch',
    nameKey: 'creator.presetThumbnailPunchName',
    kind: 'image',
    group: 'Social',
    template:
      '{subject}, high-impact video thumbnail, subject filling the frame, exaggerated contrast and saturation, strong separation from the background, readable at small size, no clutter at the edges',
    sample: 'a shocked reaction face beside a glowing chart',
    hintKey: 'creator.presetThumbnailPunchHint',
    model: 'gemini-3.1-flash-image',
    aspect: '16:9',
  },
  {
    id: 'flat-illustration',
    nameKey: 'creator.presetFlatIllustrationName',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, flat vector illustration, limited three-colour palette, geometric shapes, even weight linework, no gradients, generous margins, suitable for a landing page hero',
    sample: 'a hand passing a coin to another hand',
    hintKey: 'creator.presetFlatIllustrationHint',
    model: 'gemini-3.1-flash-image',
    aspect: '16:9',
  },
  {
    id: 'macro-texture',
    nameKey: 'creator.presetMacroTextureName',
    kind: 'image',
    group: 'Abstract',
    template:
      '{subject}, extreme macro photograph, raking light revealing surface relief, razor-thin depth of field, natural colour, fills the frame edge to edge, usable as a background plate',
    sample: 'brushed titanium with fine machining marks',
    hintKey: 'creator.presetMacroTextureHint',
    model: 'gemini-2.5-flash',
    aspect: '16:9',
  },
  {
    id: 'concept-frame',
    nameKey: 'creator.presetConceptFrameName',
    kind: 'image',
    group: 'Film',
    template:
      '{subject}, production concept art, wide establishing composition, atmospheric depth with layered haze, dramatic scale contrast between figure and environment, painterly rendering',
    sample: 'a derelict orbital station above a dust planet',
    hintKey: 'creator.presetConceptFrameHint',
    model: 'gemini-3-pro-image',
    aspect: '16:9',
  },
  {
    id: 'lifestyle-scene',
    nameKey: 'creator.presetLifestyleSceneName',
    kind: 'image',
    group: 'Commercial',
    template:
      '{subject}, placed naturally in a real lived-in setting, candid lifestyle photography, soft window light, gentle background activity, warm true-to-life colour, the product clearly readable and in sharp focus, 35mm lens',
    sample: 'a bottle of cold brew on a sunlit kitchen counter',
    hintKey: 'creator.presetLifestyleSceneHint',
    model: 'gemini-3-pro-image',
    aspect: '4:5',
  },
  {
    id: 'hand-closeup',
    nameKey: 'creator.presetHandCloseupName',
    kind: 'image',
    group: 'Commercial',
    template:
      '{subject}, tight close-up held in a hand, natural skin texture, the product label facing camera, shallow depth of field, soft diffused daylight, clean uncluttered background, macro detail',
    sample: 'a lip balm tube being uncapped',
    hintKey: 'creator.presetHandCloseupHint',
    model: 'gemini-3-pro-image',
    aspect: '4:5',
  },
  {
    id: 'moodboard-pin',
    nameKey: 'creator.presetMoodboardPinName',
    kind: 'image',
    group: 'Social',
    template:
      '{subject}, vertical Pinterest-style moodboard image, curated aesthetic styling, muted cohesive palette, soft natural light, layered textures and props, editorial composition with breathing room',
    sample: 'a soy candle on a linen-draped side table, cottagecore mood',
    hintKey: 'creator.presetMoodboardPinHint',
    model: 'gemini-3-pro-image',
    aspect: '2:3',
  },
  {
    id: 'hero-banner',
    nameKey: 'creator.presetHeroBannerName',
    kind: 'image',
    group: 'Commercial',
    template:
      '{subject}, wide campaign hero image, product placed off-centre with generous clean negative space on one side for a headline, polished commercial lighting, cohesive brand-colour backdrop, crisp and premium',
    sample: 'a pair of running shoes on a gradient backdrop',
    hintKey: 'creator.presetHeroBannerHint',
    model: 'gemini-3-pro-image',
    aspect: '16:9',
  },
  {
    id: 'conceptual-product',
    nameKey: 'creator.presetConceptualProductName',
    kind: 'image',
    group: 'Commercial',
    template:
      '{subject}, surreal conceptual product render, levitating mid-air with dynamic splash and floating elements around it, sculptural studio lighting, high-end CGI finish, bold saturated backdrop, tack sharp',
    sample: 'a can of sparkling water',
    hintKey: 'creator.presetConceptualProductHint',
    model: 'gemini-3-pro-image',
    aspect: '1:1',
  },
  {
    id: 'model-wearing',
    nameKey: 'creator.presetModelWearingName',
    kind: 'image',
    group: 'Portrait',
    template:
      '{subject}, worn by a model in a natural pose, fashion e-commerce photography, even soft lighting, neutral backdrop, true-to-life fit and fabric detail, full outfit visible',
    sample: 'an oversized cream knit cardigan',
    hintKey: 'creator.presetModelWearingHint',
    model: 'gemini-3-pro-image',
    aspect: '3:4',
  },
  {
    id: 'seasonal-restyle',
    nameKey: 'creator.presetSeasonalRestyleName',
    kind: 'image',
    group: 'Commercial',
    template:
      'Keep the product exactly as it is and restyle the scene around it: {subject}. Change only the setting, props, lighting and mood; the product shape, label and colours stay identical.',
    sample: 'a cosy winter holiday version with warm fairy lights',
    hintKey: 'creator.presetSeasonalRestyleHint',
    model: 'gemini-3-pro-image',
    aspect: '1:1',
    requiresImage: true,
  },
  {
    id: 'flat-vector',
    nameKey: 'creator.presetFlatVectorName',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, flat 2D vector illustration, bold clean outlines, solid vibrant flat fills, no shading, no gradients, simple readable shapes, generous negative space',
    sample: 'a rocket launching from a laptop screen',
    hintKey: 'creator.presetFlatVectorHint',
    model: 'gemini-3.1-flash-image',
    aspect: '16:9',
  },
  {
    id: 'ink-marker',
    nameKey: 'creator.presetInkMarkerName',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, hand-inked black marker drawing on off-white paper, solid jet-black fills, thin white scratch highlights, visible marker grain, strictly monochrome',
    sample: 'a fox reading a newspaper',
    hintKey: 'creator.presetInkMarkerHint',
    model: 'gemini-3.1-flash-image',
    aspect: '1:1',
  },
  {
    id: 'mono-silhouette',
    nameKey: 'creator.presetMonoSilhouetteName',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, strict monochrome minimalism, black silhouettes on a white void, high contrast, lots of negative space, graphic and poster-like',
    sample: 'a lighthouse on a cliff',
    hintKey: 'creator.presetMonoSilhouetteHint',
    model: 'gemini-3.1-flash-image',
    aspect: '3:4',
  },
  {
    id: 'storybook-gouache',
    nameKey: 'creator.presetStorybookGouacheName',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, hand-painted storybook gouache illustration, soft textures, warm muted palette, visible brush strokes, gentle whimsical lighting',
    sample: 'a bear baking bread in a forest cottage',
    hintKey: 'creator.presetStorybookGouacheHint',
    model: 'gemini-3.1-flash-image',
    aspect: '4:3',
  },
  {
    id: 'yt-split',
    nameKey: 'creator.presetYtSplitName',
    kind: 'image',
    group: 'Social',
    template:
      '{subject}, split-screen video thumbnail, left half shows the before and right half the after, hard vertical divide, expressive face on one side, bold contrast and saturation, readable at small size, no small text',
    sample: 'a messy desk vs the same desk perfectly organised',
    hintKey: 'creator.presetYtSplitHint',
    model: 'gemini-3.1-flash-image',
    aspect: '16:9',
  },
  {
    id: 'social-carousel',
    nameKey: 'creator.presetSocialCarouselName',
    kind: 'image',
    group: 'Social',
    template:
      '{subject}, single slide of an Instagram carousel, clean editorial layout, one short headline in large legible type, consistent brand colours, strong visual anchor, room at the edge for the next slide to continue',
    sample: 'slide one of "5 habits of focused people"',
    hintKey: 'creator.presetSocialCarouselHint',
    model: 'gemini-3.1-flash-image',
    aspect: '4:5',
  },
  {
    id: 'ad-headline',
    nameKey: 'creator.presetAdHeadlineName',
    kind: 'image',
    group: 'Ads',
    template:
      '{subject}, direct-to-consumer static ad, one bold headline in large correctly spelled type across the top, product hero shot in the centre, clean brand-colour background, small call to action button at the bottom',
    sample: 'a vitamin gummy jar with the headline "Sleep better tonight"',
    hintKey: 'creator.presetAdHeadlineHint',
    model: 'gemini-3.1-flash-image',
    aspect: '1:1',
  },
  {
    id: 'ad-bullets',
    nameKey: 'creator.presetAdBulletsName',
    kind: 'image',
    group: 'Ads',
    template:
      '{subject}, direct-to-consumer static ad, product on one side and three short benefit bullet points with simple icons on the other, correctly spelled legible type, tidy grid, brand colours',
    sample: 'a reusable water bottle: "Keeps cold 24h", "Leak-proof", "Fits cupholders"',
    hintKey: 'creator.presetAdBulletsHint',
    model: 'gemini-3.1-flash-image',
    aspect: '4:5',
  },
  {
    id: 'ad-us-vs-them',
    nameKey: 'creator.presetAdUsVsThemName',
    kind: 'image',
    group: 'Ads',
    template:
      '{subject}, comparison ad, two columns labelled "Us" and "Them", our product bright and appealing on the left with ticks, a generic dull alternative on the right with crosses, correctly spelled short labels, clean layout',
    sample: 'our natural deodorant vs a generic spray can',
    hintKey: 'creator.presetAdUsVsThemHint',
    model: 'gemini-3.1-flash-image',
    aspect: '1:1',
  },
  {
    id: 'merch-mockup',
    nameKey: 'creator.presetMerchMockupName',
    kind: 'image',
    group: 'Brand',
    template:
      '{subject}, realistic merchandise mockup, the design printed cleanly on the garment with natural fabric folds and lighting, shot flat-lay or on a model, neutral backdrop, colour-accurate print',
    sample: 'a black hoodie with a minimal gold lion logo',
    hintKey: 'creator.presetMerchMockupHint',
    model: 'gemini-3.1-flash-image',
    aspect: '4:5',
  },
  {
    id: 'packaging',
    nameKey: 'creator.presetPackagingName',
    kind: 'image',
    group: 'Brand',
    template:
      '{subject}, premium packaging design shot in a studio, crisp print detail, legible correctly spelled label, soft shadows, material texture visible, shelf-ready look',
    sample: 'a coffee bag called "Night Shift Roast"',
    hintKey: 'creator.presetPackagingHint',
    model: 'gemini-3.1-flash-image',
    aspect: '1:1',
  },
  {
    id: 'storefront-sign',
    nameKey: 'creator.presetStorefrontSignName',
    kind: 'image',
    group: 'Brand',
    template:
      '{subject}, brand signage mockup on a real storefront, dimensional letters with realistic lighting and reflections, correctly spelled name, street context, evening glow',
    sample: 'a neon sign reading "DeHub Cafe"',
    hintKey: 'creator.presetStorefrontSignHint',
    model: 'gemini-3.1-flash-image',
    aspect: '4:5',
  },
  {
    id: 'logo-mark',
    nameKey: 'creator.presetLogoMarkName',
    kind: 'image',
    group: 'Brand',
    template:
      '{subject}, minimal logo mark, simple bold geometric shape, flat solid colours, centred on a plain background, works at small sizes, no mockup, no extra text unless asked',
    sample: 'a logo for a running club called "Pace"',
    hintKey: 'creator.presetLogoMarkHint',
    model: 'gemini-3.1-flash-image',
    aspect: '1:1',
  },
  {
    id: 'clay-3d',
    nameKey: 'creator.presetClay3dName',
    kind: 'image',
    group: 'Abstract',
    template:
      '{subject}, soft 3D clay render, rounded chunky shapes, pastel colours, subtle fingerprint texture, soft studio light, toy-like and cute',
    sample: 'a small robot watering a plant',
    hintKey: 'creator.presetClay3dHint',
    model: 'z-image-turbo',
    aspect: '1:1',
    negative: 'photorealistic, harsh shadows',
  },
  {
    id: 'anime-still',
    nameKey: 'creator.presetAnimeStillName',
    kind: 'image',
    group: 'Film',
    template:
      '{subject}, anime film still, hand-painted backgrounds, clean cel shading, soft light and lens glow, detailed sky, cinematic composition',
    sample: 'a girl on a bike at sunset by the sea',
    hintKey: 'creator.presetAnimeStillHint',
    model: 'z-image-turbo',
    aspect: '16:9',
    negative: 'photorealistic, 3d render',
  },
  {
    id: 'pixel-art',
    nameKey: 'creator.presetPixelArtName',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, 16-bit pixel art, limited palette, crisp square pixels, no anti-aliasing, retro video game scene',
    sample: 'a wizard shop in a snowy village',
    hintKey: 'creator.presetPixelArtHint',
    model: 'z-image-turbo',
    aspect: '1:1',
    negative: 'blurry, smooth gradients, photorealistic',
  },
];

export const VIDEO_PRESETS: CreatorPreset[] = [
  ...OPEN_STUDIO_PRESETS.filter((preset) => preset.kind === 'video'),
  {
    id: 'crash-zoom',
    nameKey: 'creator.presetCrashZoomName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. The shot opens wide, then the camera snaps into a sudden, fast zoom straight onto the subject\'s face, stopping hard on a tight close-up. Punchy and dramatic, one continuous take.',
    sample: 'A streamer realising they just won',
    hintKey: 'creator.presetCrashZoomHint',
    model: 'kling-2.5-turbo',
    aspect: '9:16',
    negative: 'slow zoom, jump cut, warping face',
  },
  {
    id: 'dolly-zoom',
    nameKey: 'creator.presetDollyZoomName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. Vertigo dolly zoom: the camera tracks backward while zooming in, so the subject stays the same size in frame as the background visibly stretches and warps away behind them. Unsettling, cinematic, one continuous move.',
    sample: 'A man frozen in a long hotel corridor',
    hintKey: 'creator.presetDollyZoomHint',
    model: 'kling-2.5-turbo',
    aspect: '16:9',
    negative: 'jump cut, subject changing size, flicker',
  },
  {
    id: 'bullet-time',
    nameKey: 'creator.presetBulletTimeName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. Bullet time: the action is frozen mid-motion, debris and droplets suspended in the air, while the camera sweeps in a smooth half circle around the subject. Crisp detail, high-speed look.',
    sample: 'A dancer mid-leap with water splashing around her',
    hintKey: 'creator.presetBulletTimeHint',
    model: 'kling-2.5-turbo',
    aspect: '16:9',
    negative: 'jump cut, motion blur smear, morphing body',
  },
  {
    id: 'fpv-dive',
    nameKey: 'creator.presetFpvDiveName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. FPV drone shot: the camera dives steeply, banks hard and weaves close past obstacles at high speed before levelling out, fast and immersive, one continuous flight.',
    sample: 'A waterfall in a jungle canyon',
    hintKey: 'creator.presetFpvDiveHint',
    model: 'kling-2.5-turbo',
    aspect: '16:9',
    negative: 'jump cut, frozen frame, warping terrain',
  },
  {
    id: 'earth-zoom-out',
    nameKey: 'creator.presetEarthZoomOutName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. The camera starts close on the subject and pulls straight up and out in one continuous move, through rooftops, the city, clouds and the curve of the Earth, until the planet hangs in space.',
    sample: 'A person waving from a rooftop',
    hintKey: 'creator.presetEarthZoomOutHint',
    model: 'kling-2.5-turbo',
    aspect: '9:16',
    negative: 'jump cut, cut to black, flicker',
  },
  {
    id: 'whip-pan',
    nameKey: 'creator.presetWhipPanName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. The camera whips sideways in a fast, motion-blurred pan and lands sharply on the subject, revealing them with energy. Snappy transition feel.',
    sample: 'A skater landing a trick',
    hintKey: 'creator.presetWhipPanHint',
    model: 'pixverse-v5',
    aspect: '9:16',
    negative: 'slow pan, jump cut, warping',
  },
  {
    id: 'disintegrate',
    nameKey: 'creator.presetDisintegrateName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. The subject begins to disintegrate from the edges inward, breaking into fine glowing particles and ash that drift away on the wind until nothing is left. Locked-off camera, dramatic lighting.',
    sample: 'A statue of a king in a desert',
    hintKey: 'creator.presetDisintegrateHint',
    model: 'pixverse-v5',
    aspect: '9:16',
    negative: 'jump cut, sudden disappearance, flicker',
  },
  {
    id: 'levitate',
    nameKey: 'creator.presetLevitateName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. The subject slowly lifts off the ground and floats upward, dust and small objects rising around them, soft light catching the air. Calm, magical, one continuous take.',
    sample: 'A girl meditating in an empty warehouse',
    hintKey: 'creator.presetLevitateHint',
    model: 'pixverse-v5',
    aspect: '9:16',
    negative: 'jump cut, falling, morphing body',
  },
  {
    id: 'exploded-view',
    nameKey: 'creator.presetExplodedViewName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. The product smoothly separates into its individual components, each part floating outward in precise alignment to form a clean exploded view, then holds. Studio backdrop, crisp lighting.',
    sample: 'A pair of wireless headphones',
    hintKey: 'creator.presetExplodedViewHint',
    model: 'pixverse-v5',
    aspect: '1:1',
    negative: 'chaotic explosion, warping parts, text artifacts',
  },
  {
    id: 'melt',
    nameKey: 'creator.presetMeltName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. The subject slowly softens and melts, running down in thick glossy drips and pooling on the ground. Surreal, locked-off camera, rich colour.',
    sample: 'A chrome smiley-face sculpture on a pedestal',
    hintKey: 'creator.presetMeltHint',
    model: 'pixverse-v5',
    aspect: '9:16',
    negative: 'jump cut, flicker, sudden disappearance',
  },
  {
    id: 'set-ablaze',
    nameKey: 'creator.presetSetAblazeName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. Flames catch at the base and quickly climb until the subject is wreathed in bright, roaring fire, embers spiralling upward against a dark background.',
    sample: 'A guitar standing on a stage',
    hintKey: 'creator.presetSetAblazeHint',
    model: 'pixverse-v5',
    aspect: '9:16',
    negative: 'smoke only, jump cut, flicker',
  },
  {
    id: 'vhs-glitch',
    nameKey: 'creator.presetVhsGlitchName',
    kind: 'video',
    group: 'Effects',
    template:
      '{subject}. Shot as worn VHS footage: scan lines, colour bleed, tracking jitter and brief digital glitches tearing across the frame, 90s camcorder look.',
    sample: 'Friends dancing at a house party',
    hintKey: 'creator.presetVhsGlitchHint',
    model: 'minimax-video',
    aspect: '9:16',
    negative: 'clean digital look, jump cut',
  },
  {
    id: 'slow-push',
    nameKey: 'creator.presetSlowPushName',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. The camera pushes slowly forward on a dolly, steady and level, gradually tightening on the subject. Motion is smooth and continuous with no cuts.',
    sample: 'A chef plating a dish under warm kitchen light',
    hintKey: 'creator.presetSlowPushHint',
    model: 'kling-2.6-pro',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, warping, distorted hands',
  },
  {
    id: 'orbit',
    nameKey: 'creator.presetOrbitName',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. The camera arcs smoothly around the subject at a constant radius, keeping it centred while the background parallaxes past. Single continuous take.',
    sample: 'A sneaker resting on a concrete plinth',
    hintKey: 'creator.presetOrbitHint',
    model: 'kling-2.6-pro',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, morphing geometry',
  },
  {
    id: 'crane-reveal',
    nameKey: 'creator.presetCraneRevealName',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. The camera rises on a crane from ground level, tilting down slightly as it climbs, opening the frame to reveal the wider environment. One continuous move.',
    sample: 'A market street waking up at dawn',
    hintKey: 'creator.presetCraneRevealHint',
    model: 'seedance-2.0',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, flickering',
  },
  {
    id: 'product-turn',
    nameKey: 'creator.presetProductTurnName',
    kind: 'video',
    group: 'Commercial',
    template:
      '{subject}. The product rotates slowly on a turntable against a clean seamless backdrop, studio lighting sweeping across its surface to pick out material and finish. Locked-off camera.',
    sample: 'A glass fragrance bottle',
    hintKey: 'creator.presetProductTurnHint',
    model: 'kling-2.6-pro',
    aspect: '1:1',
    negative: 'text artifacts, warped label, wobbling',
  },
  {
    id: 'talking-portrait',
    nameKey: 'creator.presetTalkingPortraitName',
    kind: 'video',
    group: 'Social',
    template:
      '{subject}. Framed as a chest-up portrait facing the lens, natural micro-expressions and relaxed blinking, subtle handheld breathing in the camera, soft key light from the front.',
    sample: 'A presenter explaining something to camera',
    hintKey: 'creator.presetTalkingPortraitHint',
    model: 'seedance-2.0',
    aspect: '9:16',
    negative: 'distorted face, extra fingers, sudden identity change',
  },
  {
    id: 'drone-flyover',
    nameKey: 'creator.presetDroneFlyoverName',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. Aerial drone shot travelling forward at altitude, gentle downward tilt, smooth gimbal stabilisation, landscape sliding past beneath. Continuous flight, no cuts.',
    sample: 'A coastline where cliffs meet the sea',
    hintKey: 'creator.presetDroneFlyoverHint',
    model: 'seedance-2.0',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, warping terrain',
  },
  {
    id: 'macro-detail',
    nameKey: 'creator.presetMacroDetailName',
    kind: 'video',
    group: 'Commercial',
    template:
      '{subject}. Extreme macro, the camera drifts slowly across the surface with a razor-thin plane of focus, catching specular highlights as it moves. Deliberate and unhurried.',
    sample: 'Condensation beading on cold glass',
    hintKey: 'creator.presetMacroDetailHint',
    model: 'seedance-2.0-fast',
    aspect: '16:9',
    negative: 'shaky camera, focus hunting',
  },
  {
    id: 'animate-still',
    nameKey: 'creator.presetAnimateStillName',
    kind: 'video',
    group: 'Image to video',
    template:
      '{subject}. Bring the attached image to life with restrained, believable motion: drifting atmosphere, small secondary movement, and a slow parallax push. Preserve the original composition and identity exactly.',
    sample: 'Subtle life added to the attached frame',
    hintKey: 'creator.presetAnimateStillHint',
    model: 'runway-gen4',
    aspect: '16:9',
    negative: 'identity change, morphing face, warping',
    requiresImage: true,
  },
  {
    id: 'ugc-selfie',
    nameKey: 'creator.presetUgcSelfieName',
    kind: 'video',
    group: 'Social',
    template:
      'A person films themselves on a phone at arm’s length, talking casually and enthusiastically about {subject}. Handheld selfie framing, natural room light, relaxed authentic delivery, small natural camera wobble, one continuous take.',
    sample: 'a new pair of wireless earbuds',
    hintKey: 'creator.presetUgcSelfieHint',
    model: 'seedance-2.0',
    aspect: '9:16',
  },
  {
    id: 'ugc-unboxing',
    nameKey: 'creator.presetUgcUnboxingName',
    kind: 'video',
    group: 'Social',
    template:
      'Phone-shot unboxing: hands open a delivery box on a table and reveal {subject}, lifting it toward the camera with a genuine reaction. Top-down then close handheld framing, natural daylight, one continuous take.',
    sample: 'a skincare gift set',
    hintKey: 'creator.presetUgcUnboxingHint',
    model: 'seedance-2.0',
    aspect: '9:16',
  },
  {
    id: 'ugc-tutorial',
    nameKey: 'creator.presetUgcTutorialName',
    kind: 'video',
    group: 'Social',
    template:
      'A creator demonstrates how to use {subject} step by step, showing it clearly to the phone camera, pointing out one key feature. Handheld vertical framing, bright natural light, friendly instructional energy.',
    sample: 'a pour-over coffee kit',
    hintKey: 'creator.presetUgcTutorialHint',
    model: 'seedance-2.0',
    aspect: '9:16',
  },
  {
    id: 'product-review',
    nameKey: 'creator.presetProductReviewName',
    kind: 'video',
    group: 'Social',
    template:
      'A presenter sits facing the camera holding {subject}, turning it in their hands while giving an honest opinion, nodding and gesturing naturally. Medium close-up, soft key light, tidy home background.',
    sample: 'a mechanical keyboard',
    hintKey: 'creator.presetProductReviewHint',
    model: 'seedance-2.0',
    aspect: '9:16',
  },
  {
    id: 'tv-spot',
    nameKey: 'creator.presetTvSpotName',
    kind: 'video',
    group: 'Commercial',
    template:
      'Polished broadcast commercial for {subject}: a sweeping establishing shot, a smooth dolly move to a hero close-up of the product, crisp commercial lighting, rich colour grade, premium and confident pacing.',
    sample: 'a luxury electric SUV',
    hintKey: 'creator.presetTvSpotHint',
    model: 'kling-2.6-pro',
    aspect: '16:9',
    negative: 'shaky camera, warping, distorted text, jump cut',
  },
  {
    id: 'product-showcase',
    nameKey: 'creator.presetProductShowcaseName',
    kind: 'video',
    group: 'Commercial',
    template:
      '{subject}. Polished product showcase: the product sits centred on a sculpted set, the camera glides in a slow arc as a light sweep travels across its surface, finishing on a clean hero frame. Premium, no people.',
    sample: 'A smartwatch with a steel strap',
    hintKey: 'creator.presetProductShowcaseHint',
    model: 'kling-2.5-turbo',
    aspect: '9:16',
    negative: 'text artifacts, warped label, shaky camera',
  },
  {
    id: 'try-on',
    nameKey: 'creator.presetTryOnName',
    kind: 'video',
    group: 'Commercial',
    template:
      '{subject}. A model wears the item from the attached image and turns naturally to show fit and fabric from several angles, soft daylight, clean backdrop. Keep the item\'s design, colour and details exactly as attached.',
    sample: 'The jacket in the attached photo',
    hintKey: 'creator.presetTryOnHint',
    model: 'kling-2.5-turbo',
    aspect: '9:16',
    negative: 'changing the garment, extra limbs, morphing face',
    requiresImage: true,
  },
];

/**
 * 3D presets.
 *
 * These read differently from the image and video ones on purpose. A mesh
 * generator is not steered by lighting or lens language — it takes none of it —
 * so the scaffolds here describe form, silhouette and material instead, and say
 * what the mesh is *for*, since that is what decides poly budget and topology.
 */
export const MODEL3D_PRESETS: CreatorPreset[] = [
  {
    id: 'game-prop',
    nameKey: 'creator.presetGamePropName',
    kind: '3d',
    group: 'Games',
    template:
      '{subject}, a single self-contained game prop, clean readable silhouette, even wall thickness, no floating parts, neutral surface materials, modelled in a neutral upright orientation against a plain background',
    sample: 'a weathered iron lantern',
    hintKey: 'creator.presetGamePropHint',
    model: 'tripo-2.5',
  },
  {
    id: 'character-figure',
    nameKey: 'creator.presetCharacterFigureName',
    kind: '3d',
    group: 'Characters',
    template:
      '{subject}, full body character in a neutral A-pose, arms clear of the torso, legs slightly apart, symmetrical proportions, no props held in hand, plain background, even diffuse lighting with no cast shadows',
    sample: 'a stylised explorer in a heavy coat',
    hintKey: 'creator.presetCharacterFigureHint',
    model: 'tripo-2.5',
  },
  {
    id: 'product-scan',
    nameKey: 'creator.presetProductScanName',
    kind: '3d',
    group: 'Commercial',
    template:
      '{subject}, accurate product replica, true proportions, crisp panel lines and parting seams, faithful surface materials and finish, upright and centred, plain background',
    sample: 'a matte black ceramic coffee flask',
    hintKey: 'creator.presetProductScanHint',
    model: 'rodin-hyper3d',
  },
  {
    id: 'stylised-collectible',
    nameKey: 'creator.presetStylisedCollectibleName',
    kind: '3d',
    group: 'Characters',
    template:
      '{subject}, chunky stylised collectible figurine, exaggerated proportions with an oversized head, simplified rounded forms, bold flat colour blocking, sitting flat on an implied base',
    sample: 'a tiny astronaut hugging a helmet',
    hintKey: 'creator.presetStylisedCollectibleHint',
    model: 'tripo-2.5',
  },
  {
    id: 'hard-surface',
    nameKey: 'creator.presetHardSurfaceName',
    kind: '3d',
    group: 'Games',
    template:
      '{subject}, hard-surface mechanical model, crisp bevelled edges, deliberate panel breaks and greebles, brushed metal and machined plastic, engineered look with no organic curves, plain background',
    sample: 'a compact reconnaissance drone',
    hintKey: 'creator.presetHardSurfaceHint',
    model: 'rodin-hyper3d',
  },
  {
    id: 'environment-asset',
    nameKey: 'creator.presetEnvironmentAssetName',
    kind: '3d',
    group: 'Environments',
    template:
      '{subject}, a single environment asset modelled as one connected piece, grounded flat at its base, believable material wear and surface damage, no surrounding scenery or terrain',
    sample: 'a collapsed stone archway',
    hintKey: 'creator.presetEnvironmentAssetHint',
    model: 'tripo-2.5',
  },
  {
    id: 'photo-to-mesh',
    nameKey: 'creator.presetPhotoToMeshName',
    kind: '3d',
    group: 'Image to 3D',
    template:
      '{subject}. Reconstruct the attached image as a 3D object, holding its exact proportions, colours and surface materials. Infer the unseen back and underside plausibly from the visible form.',
    sample: 'The object in the attached photo',
    hintKey: 'creator.presetPhotoToMeshHint',
    model: 'hunyuan3d-v2',
    requiresImage: true,
  },
  {
    id: 'quick-blockout',
    nameKey: 'creator.presetQuickBlockoutName',
    kind: '3d',
    group: 'Drafts',
    template:
      '{subject}, simple low-poly blockout, primary masses only, no fine detail or small features, clean flat faces, neutral grey material',
    sample: 'a modular sci-fi corridor section',
    hintKey: 'creator.presetQuickBlockoutHint',
    // Tripo, not TRELLIS: TRELLIS has no text-to-3D path, so a preset that
    // supplies only text could never actually run on it.
    model: 'tripo-2.5',
  },
];

/**
 * Audio presets.
 *
 * Different again from the other three. A voice model is not steered by
 * lighting, lens or material language — the speech scaffolds shape *delivery*,
 * and they do it with the inline performance tags v3 reads, which is the one
 * thing that reliably changes a read. The sound and music scaffolds name the
 * source, the space and the recording, because that is what those two models
 * actually respond to.
 *
 * `{subject}` is the creator's own line, exactly as in every other kind — so a
 * speech preset wraps the words to be spoken rather than replacing them.
 */
export const AUDIO_PRESETS: CreatorPreset[] = [
  {
    id: 'narrator-warm',
    nameKey: 'creator.presetNarratorWarmName',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[warm] [measured] {subject}',
    sample: 'And that is how the whole thing began.',
    hintKey: 'creator.presetNarratorWarmHint',
  },
  {
    id: 'ad-energetic',
    nameKey: 'creator.presetAdEnergeticName',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[excited] [upbeat] {subject}',
    sample: 'Three days only — everything must go!',
    hintKey: 'creator.presetAdEnergeticHint',
  },
  {
    id: 'trailer-voice',
    nameKey: 'creator.presetTrailerVoiceName',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[dramatic] [slowly] [deep] {subject}',
    sample: 'In a world where nothing is quite what it seems.',
    hintKey: 'creator.presetTrailerVoiceHint',
  },
  {
    id: 'asmr-whisper',
    nameKey: 'creator.presetAsmrWhisperName',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[whispers] [softly] {subject}',
    sample: 'Stay very still. Listen.',
    hintKey: 'creator.presetAsmrWhisperHint',
  },
  {
    id: 'explainer-clear',
    nameKey: 'creator.presetExplainerClearName',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[clear] [friendly] [natural pace] {subject}',
    sample: 'There are three things worth knowing here.',
    hintKey: 'creator.presetExplainerClearHint',
  },
  {
    id: 'sfx-impact',
    nameKey: 'creator.presetSfxImpactName',
    kind: 'audio',
    audioTask: 'sfx',
    group: 'Sound',
    template:
      '{subject}, single decisive impact, tight transient, short natural tail, close-miked, clean and dry with no music',
    sample: 'a heavy wooden door slamming shut',
    hintKey: 'creator.presetSfxImpactHint',
  },
  {
    id: 'sfx-ambience',
    nameKey: 'creator.presetSfxAmbienceName',
    kind: 'audio',
    audioTask: 'sfx',
    group: 'Sound',
    template:
      '{subject}, continuous evenly-textured background ambience, no sudden events or standout details, consistent level throughout, suitable for seamless looping',
    sample: 'a quiet cafe interior, distant chatter and cups',
    hintKey: 'creator.presetSfxAmbienceHint',
  },
  {
    id: 'sfx-ui',
    nameKey: 'creator.presetSfxUiName',
    kind: 'audio',
    audioTask: 'sfx',
    group: 'Sound',
    template:
      '{subject}, very short clean synthetic interface sound, crisp and modern, minimal reverb, no background noise',
    sample: 'a soft confirmation chime',
    hintKey: 'creator.presetSfxUiHint',
  },
  {
    id: 'music-lofi',
    nameKey: 'creator.presetMusicLofiName',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, slow lo-fi hip hop, dusty drum loop, warm Rhodes chords, soft vinyl crackle, mellow and unobtrusive, sits under a voiceover without competing',
    sample: 'a rainy late-night study beat',
    hintKey: 'creator.presetMusicLofiHint',
  },
  {
    id: 'music-cinematic',
    nameKey: 'creator.presetMusicCinematicName',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, orchestral cinematic build, sparse piano opening, strings entering gradually, low percussion swell into a full resolve, wide and epic',
    sample: 'a slow reveal turning triumphant',
    hintKey: 'creator.presetMusicCinematicHint',
  },
  {
    id: 'music-upbeat',
    nameKey: 'creator.presetMusicUpbeatName',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, bright upbeat pop instrumental, driving four-on-the-floor kick, plucked synths, handclaps, confident and commercial, steady energy throughout',
    sample: 'a product launch montage',
    hintKey: 'creator.presetMusicUpbeatHint',
  },
  {
    id: 'music-tension',
    nameKey: 'creator.presetMusicTensionName',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, sparse tense underscore, low sustained drone, irregular ticking pulse, dissonant string harmonics, restrained and unresolved',
    sample: 'something is about to go wrong',
    hintKey: 'creator.presetMusicTensionHint',
  },
];

export const ALL_PRESETS: CreatorPreset[] = [
  ...IMAGE_PRESETS,
  ...VIDEO_PRESETS,
  ...MODEL3D_PRESETS,
  ...AUDIO_PRESETS,
];

export function presetsFor(kind: PresetKind): CreatorPreset[] {
  if (kind === 'image') return IMAGE_PRESETS;
  if (kind === 'video') return VIDEO_PRESETS;
  if (kind === 'audio') return AUDIO_PRESETS;
  return MODEL3D_PRESETS;
}

export function getPreset(id: string | null | undefined): CreatorPreset | undefined {
  if (!id) return undefined;
  return ALL_PRESETS.find((p) => p.id === id);
}

/**
 * Build the final prompt. An empty subject falls back to the preset's sample so
 * a bare click on a preset tile still produces something worth looking at.
 */
export function applyPreset(preset: CreatorPreset | undefined, subject: string): string {
  const trimmed = subject.trim();
  if (!preset) return trimmed;
  return preset.template.replace('{subject}', trimmed || preset.sample);
}
