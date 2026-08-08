/**
 * Creator presets.
 * ================
 * A preset is a proven prompt scaffold plus the model settings that make it
 * work. The point is that a creator never faces a blank prompt box: pick a
 * look, type a subject, generate. `{subject}` is replaced with whatever the
 * creator typed; if they typed nothing the `sample` subject is used so the
 * tile is still one click from a result.
 */

import type { AudioTask } from '@/constants/audio-models.constants';

export type PresetKind = 'image' | 'video' | '3d' | 'audio';

export interface CreatorPreset {
  id: string;
  name: string;
  kind: PresetKind;
  group: string;
  /** Prompt scaffold. `{subject}` is substituted with the creator's text. */
  template: string;
  /** Subject used when the prompt box is empty. */
  sample: string;
  /** One line explaining what the preset does. */
  hint: string;
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
  {
    id: 'studio-product',
    name: 'Studio Product',
    kind: 'image',
    group: 'Commercial',
    template:
      '{subject}, professional product photography, seamless studio backdrop, large softbox key light with a subtle rim, shallow depth of field, crisp specular highlights, colour-accurate, shot on a 100mm macro lens',
    sample: 'a matte black ceramic coffee flask',
    hint: 'Clean commercial product shot',
    model: 'gemini-3-pro-image',
    aspect: '1:1',
  },
  {
    id: 'cinematic-still',
    name: 'Cinematic Still',
    kind: 'image',
    group: 'Film',
    template:
      '{subject}, cinematic film still, anamorphic widescreen framing, motivated practical lighting, deep shadows with lifted blacks, 35mm grain, muted teal and amber grade, shallow focus',
    sample: 'a lone figure crossing a rain-slick street at night',
    hint: 'Film-still framing and grade',
    model: 'gemini-3-pro-image',
    aspect: '16:9',
  },
  {
    id: 'editorial-portrait',
    name: 'Editorial Portrait',
    kind: 'image',
    group: 'Portrait',
    template:
      '{subject}, editorial fashion portrait, single hard key light at 45 degrees, sculpted shadow falloff, clean neutral backdrop, natural skin texture retained, medium-format detail',
    sample: 'a model in an oversized wool coat',
    hint: 'Magazine-grade portrait lighting',
    model: 'gemini-3-pro-image',
    aspect: '4:5',
  },
  {
    id: 'poster-type',
    name: 'Poster Type',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, bold graphic poster layout, oversized display typography with correct legible spelling, high-contrast monochrome palette with one accent, generous negative space, print-ready composition',
    sample: 'a launch poster reading "NEW DROP"',
    hint: 'Layout with readable display type',
    model: 'gemini-3-pro-image',
    aspect: '4:5',
  },
  {
    id: 'thumbnail-punch',
    name: 'Thumbnail Punch',
    kind: 'image',
    group: 'Social',
    template:
      '{subject}, high-impact video thumbnail, subject filling the frame, exaggerated contrast and saturation, strong separation from the background, readable at small size, no clutter at the edges',
    sample: 'a shocked reaction face beside a glowing chart',
    hint: 'Reads at 200px wide',
    model: 'gemini-3.1-flash-image',
    aspect: '16:9',
  },
  {
    id: 'flat-illustration',
    name: 'Flat Illustration',
    kind: 'image',
    group: 'Design',
    template:
      '{subject}, flat vector illustration, limited three-colour palette, geometric shapes, even weight linework, no gradients, generous margins, suitable for a landing page hero',
    sample: 'a hand passing a coin to another hand',
    hint: 'Vector-style brand illustration',
    model: 'gemini-3.1-flash-image',
    aspect: '16:9',
  },
  {
    id: 'macro-texture',
    name: 'Macro Texture',
    kind: 'image',
    group: 'Abstract',
    template:
      '{subject}, extreme macro photograph, raking light revealing surface relief, razor-thin depth of field, natural colour, fills the frame edge to edge, usable as a background plate',
    sample: 'brushed titanium with fine machining marks',
    hint: 'Background plates and textures',
    model: 'gemini-2.5-flash',
    aspect: '16:9',
  },
  {
    id: 'concept-frame',
    name: 'Concept Frame',
    kind: 'image',
    group: 'Film',
    template:
      '{subject}, production concept art, wide establishing composition, atmospheric depth with layered haze, dramatic scale contrast between figure and environment, painterly rendering',
    sample: 'a derelict orbital station above a dust planet',
    hint: 'Establishing shots and world design',
    model: 'gemini-3-pro-image',
    aspect: '16:9',
  },
];

export const VIDEO_PRESETS: CreatorPreset[] = [
  {
    id: 'slow-push',
    name: 'Slow Push In',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. The camera pushes slowly forward on a dolly, steady and level, gradually tightening on the subject. Motion is smooth and continuous with no cuts.',
    sample: 'A chef plating a dish under warm kitchen light',
    hint: 'Steady dolly move toward the subject',
    model: 'kling-2.6-pro',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, warping, distorted hands',
  },
  {
    id: 'orbit',
    name: 'Orbit',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. The camera arcs smoothly around the subject at a constant radius, keeping it centred while the background parallaxes past. Single continuous take.',
    sample: 'A sneaker resting on a concrete plinth',
    hint: 'Circular move that reveals depth',
    model: 'kling-2.6-pro',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, morphing geometry',
  },
  {
    id: 'crane-reveal',
    name: 'Crane Reveal',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. The camera rises on a crane from ground level, tilting down slightly as it climbs, opening the frame to reveal the wider environment. One continuous move.',
    sample: 'A market street waking up at dawn',
    hint: 'Rise that opens into the wide shot',
    model: 'seedance-2.0',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, flickering',
  },
  {
    id: 'product-turn',
    name: 'Product Turn',
    kind: 'video',
    group: 'Commercial',
    template:
      '{subject}. The product rotates slowly on a turntable against a clean seamless backdrop, studio lighting sweeping across its surface to pick out material and finish. Locked-off camera.',
    sample: 'A glass fragrance bottle',
    hint: 'Turntable loop for a product',
    model: 'kling-2.6-pro',
    aspect: '1:1',
    negative: 'text artifacts, warped label, wobbling',
  },
  {
    id: 'talking-portrait',
    name: 'Talking Portrait',
    kind: 'video',
    group: 'Social',
    template:
      '{subject}. Framed as a chest-up portrait facing the lens, natural micro-expressions and relaxed blinking, subtle handheld breathing in the camera, soft key light from the front.',
    sample: 'A presenter explaining something to camera',
    hint: 'Vertical piece-to-camera',
    model: 'seedance-2.0',
    aspect: '9:16',
    negative: 'distorted face, extra fingers, sudden identity change',
  },
  {
    id: 'drone-flyover',
    name: 'Drone Flyover',
    kind: 'video',
    group: 'Camera',
    template:
      '{subject}. Aerial drone shot travelling forward at altitude, gentle downward tilt, smooth gimbal stabilisation, landscape sliding past beneath. Continuous flight, no cuts.',
    sample: 'A coastline where cliffs meet the sea',
    hint: 'Aerial travelling shot',
    model: 'seedance-2.0',
    aspect: '16:9',
    negative: 'shaky camera, jump cut, warping terrain',
  },
  {
    id: 'macro-detail',
    name: 'Macro Detail',
    kind: 'video',
    group: 'Commercial',
    template:
      '{subject}. Extreme macro, the camera drifts slowly across the surface with a razor-thin plane of focus, catching specular highlights as it moves. Deliberate and unhurried.',
    sample: 'Condensation beading on cold glass',
    hint: 'Slow macro drift across a surface',
    model: 'seedance-2.0-fast',
    aspect: '16:9',
    negative: 'shaky camera, focus hunting',
  },
  {
    id: 'animate-still',
    name: 'Animate a Still',
    kind: 'video',
    group: 'Image to video',
    template:
      '{subject}. Bring the attached image to life with restrained, believable motion: drifting atmosphere, small secondary movement, and a slow parallax push. Preserve the original composition and identity exactly.',
    sample: 'Subtle life added to the attached frame',
    hint: 'Needs an attached image',
    model: 'runway-gen4',
    aspect: '16:9',
    negative: 'identity change, morphing face, warping',
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
    name: 'Game Prop',
    kind: '3d',
    group: 'Games',
    template:
      '{subject}, a single self-contained game prop, clean readable silhouette, even wall thickness, no floating parts, neutral surface materials, modelled in a neutral upright orientation against a plain background',
    sample: 'a weathered iron lantern',
    hint: 'Realtime-ready single object',
    model: 'tripo-2.5',
  },
  {
    id: 'character-figure',
    name: 'Character Figure',
    kind: '3d',
    group: 'Characters',
    template:
      '{subject}, full body character in a neutral A-pose, arms clear of the torso, legs slightly apart, symmetrical proportions, no props held in hand, plain background, even diffuse lighting with no cast shadows',
    sample: 'a stylised explorer in a heavy coat',
    hint: 'Clean pose that rigs well later',
    model: 'tripo-2.5',
  },
  {
    id: 'product-scan',
    name: 'Product Replica',
    kind: '3d',
    group: 'Commercial',
    template:
      '{subject}, accurate product replica, true proportions, crisp panel lines and parting seams, faithful surface materials and finish, upright and centred, plain background',
    sample: 'a matte black ceramic coffee flask',
    hint: 'Faithful copy of a real object',
    model: 'rodin-hyper3d',
  },
  {
    id: 'stylised-collectible',
    name: 'Stylised Collectible',
    kind: '3d',
    group: 'Characters',
    template:
      '{subject}, chunky stylised collectible figurine, exaggerated proportions with an oversized head, simplified rounded forms, bold flat colour blocking, sitting flat on an implied base',
    sample: 'a tiny astronaut hugging a helmet',
    hint: 'Vinyl-toy proportions',
    model: 'tripo-2.5',
  },
  {
    id: 'hard-surface',
    name: 'Hard Surface',
    kind: '3d',
    group: 'Games',
    template:
      '{subject}, hard-surface mechanical model, crisp bevelled edges, deliberate panel breaks and greebles, brushed metal and machined plastic, engineered look with no organic curves, plain background',
    sample: 'a compact reconnaissance drone',
    hint: 'Machined, panelled, mechanical',
    model: 'rodin-hyper3d',
  },
  {
    id: 'environment-asset',
    name: 'Environment Piece',
    kind: '3d',
    group: 'Environments',
    template:
      '{subject}, a single environment asset modelled as one connected piece, grounded flat at its base, believable material wear and surface damage, no surrounding scenery or terrain',
    sample: 'a collapsed stone archway',
    hint: 'One set-dressing object, not a scene',
    model: 'tripo-2.5',
  },
  {
    id: 'photo-to-mesh',
    name: 'Photo to Mesh',
    kind: '3d',
    group: 'Image to 3D',
    template:
      '{subject}. Reconstruct the attached image as a 3D object, holding its exact proportions, colours and surface materials. Infer the unseen back and underside plausibly from the visible form.',
    sample: 'The object in the attached photo',
    hint: 'Needs an attached image',
    model: 'hunyuan3d-v2',
    requiresImage: true,
  },
  {
    id: 'quick-blockout',
    name: 'Quick Blockout',
    kind: '3d',
    group: 'Drafts',
    template:
      '{subject}, simple low-poly blockout, primary masses only, no fine detail or small features, clean flat faces, neutral grey material',
    sample: 'a modular sci-fi corridor section',
    hint: 'Cheap draft to test an idea',
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
    name: 'Warm Narrator',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[warm] [measured] {subject}',
    sample: 'And that is how the whole thing began.',
    hint: 'Unhurried documentary read',
  },
  {
    id: 'ad-energetic',
    name: 'Ad Read',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[excited] [upbeat] {subject}',
    sample: 'Three days only — everything must go!',
    hint: 'Bright, high-energy commercial',
  },
  {
    id: 'trailer-voice',
    name: 'Trailer Voice',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[dramatic] [slowly] [deep] {subject}',
    sample: 'In a world where nothing is quite what it seems.',
    hint: 'Big, slow, cinematic',
  },
  {
    id: 'asmr-whisper',
    name: 'Close Whisper',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[whispers] [softly] {subject}',
    sample: 'Stay very still. Listen.',
    hint: 'Intimate, quiet, close-mic',
  },
  {
    id: 'explainer-clear',
    name: 'Explainer',
    kind: 'audio',
    audioTask: 'speech',
    group: 'Voiceover',
    template: '[clear] [friendly] [natural pace] {subject}',
    sample: 'There are three things worth knowing here.',
    hint: 'Neutral, easy to follow',
  },
  {
    id: 'sfx-impact',
    name: 'Impact',
    kind: 'audio',
    audioTask: 'sfx',
    group: 'Sound',
    template:
      '{subject}, single decisive impact, tight transient, short natural tail, close-miked, clean and dry with no music',
    sample: 'a heavy wooden door slamming shut',
    hint: 'One sharp hit, no tail',
  },
  {
    id: 'sfx-ambience',
    name: 'Ambience Bed',
    kind: 'audio',
    audioTask: 'sfx',
    group: 'Sound',
    template:
      '{subject}, continuous evenly-textured background ambience, no sudden events or standout details, consistent level throughout, suitable for seamless looping',
    sample: 'a quiet cafe interior, distant chatter and cups',
    hint: 'Seamless background loop',
  },
  {
    id: 'sfx-ui',
    name: 'Interface',
    kind: 'audio',
    audioTask: 'sfx',
    group: 'Sound',
    template:
      '{subject}, very short clean synthetic interface sound, crisp and modern, minimal reverb, no background noise',
    sample: 'a soft confirmation chime',
    hint: 'Tiny, clean UI blip',
  },
  {
    id: 'music-lofi',
    name: 'Lo-fi Bed',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, slow lo-fi hip hop, dusty drum loop, warm Rhodes chords, soft vinyl crackle, mellow and unobtrusive, sits under a voiceover without competing',
    sample: 'a rainy late-night study beat',
    hint: 'Under-dialogue background',
  },
  {
    id: 'music-cinematic',
    name: 'Cinematic Build',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, orchestral cinematic build, sparse piano opening, strings entering gradually, low percussion swell into a full resolve, wide and epic',
    sample: 'a slow reveal turning triumphant',
    hint: 'Starts small, ends huge',
  },
  {
    id: 'music-upbeat',
    name: 'Upbeat Promo',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, bright upbeat pop instrumental, driving four-on-the-floor kick, plucked synths, handclaps, confident and commercial, steady energy throughout',
    sample: 'a product launch montage',
    hint: 'Bright, driving, commercial',
  },
  {
    id: 'music-tension',
    name: 'Tension',
    kind: 'audio',
    audioTask: 'music',
    group: 'Music',
    template:
      '{subject}, sparse tense underscore, low sustained drone, irregular ticking pulse, dissonant string harmonics, restrained and unresolved',
    sample: 'something is about to go wrong',
    hint: 'Unsettled, never resolves',
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
