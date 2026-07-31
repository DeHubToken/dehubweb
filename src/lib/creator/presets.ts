/**
 * Creator presets.
 * ================
 * A preset is a proven prompt scaffold plus the model settings that make it
 * work. The point is that a creator never faces a blank prompt box: pick a
 * look, type a subject, generate. `{subject}` is replaced with whatever the
 * creator typed; if they typed nothing the `sample` subject is used so the
 * tile is still one click from a result.
 */

export type PresetKind = 'image' | 'video';

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
  },
];

export const ALL_PRESETS: CreatorPreset[] = [...IMAGE_PRESETS, ...VIDEO_PRESETS];

export function presetsFor(kind: PresetKind): CreatorPreset[] {
  return kind === 'image' ? IMAGE_PRESETS : VIDEO_PRESETS;
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
