/**
 * Creator Flow — starter templates.
 * =================================
 * Their UGC starter ships four pre-rendered avatar clips from their own CDN;
 * this one ships the same shape (four image generators feeding four video
 * generators, one shared reference) with the prompts, and lets the creator
 * render it with their own avatar.
 */
import type { FlowEdge, FlowNode } from './types';
import { edgeStyle } from './edgeStyles';

const STRIDE_X = 380;
const X_OFFSET = 310;

const IMG_PROMPTS = [
  'A photorealistic portrait of @Avatar relaxing in an overwater bungalow in the Maldives, lying back on white linen cushions, looking out over a turquoise infinity pool that merges with the ocean. Elegant black swimwear, gold hoop earrings, a calm knowing expression toward the camera. Bright natural sunlight, shallow depth of field, sharp focus on the face. Seated facing the camera as if about to speak for a vlog.',
  'A photorealistic medium close-up of @Avatar seated in a first-class airplane suite with rich wood panelling and gold accents, refined black top and gold jewellery, soft diffused daylight from the window. Holding the phone in selfie mode, about to speak to the camera. No overlays.',
  'A photorealistic close-up of @Avatar in the driver seat of a high-end supercar at night, looking directly at the camera with focused determination. Black top, gold hoop earrings, dark interior lit by red and blue dashboard LEDs and passing city lights on the windshield. Cinematic lighting, dramatic shadows, shallow depth of field, sharp focus on the eyes.',
  'A photorealistic cinematic close-up of @Avatar at a table in a stylish modern restaurant, a smartphone on a small tripod filming vlog-style. Confident engaging expression, relaxed intentional posture. Softly blurred warm restaurant background with bokeh highlights. Eye-level static camera, natural indoor light, ultra-realistic 4K rendering, natural colours.',
];

const VID_PROMPTS = [
  'Static locked-off shot, same framing as the reference. Subject faces the camera in vlog style and speaks calmly and confidently: "You officially have zero excuses left not to make content." Slight eyebrow raise on key phrases, controlled pauses. Camera completely stable, no zoom. Natural skin texture, 4K, cinematic texture.',
  'Handheld selfie shot at arm\'s length, vertical framing, subtle natural sway. Subject looks into the camera and speaks with a smile: "First, get a photo of your avatar. Second, write a prompt to place it anywhere. Third, add a short script and generate the videos." Micro-expressions on each clause, no reframing, 4K.',
  'Handheld shot by another person at eye level, only the subject visible, subtle micro-movements, consistent framing. Confident clear delivery: "You now have the workflow to post a brand new video every single day. Pick your niche, generate, and let the system do the heavy lifting." Light smile, natural pauses, 4K.',
  'Handheld shot by another person at eye level. The subject leans toward the camera for a second as if just noticing it, then says: "This is exactly how you bring in views, leads and clients on autopilot. Comment AI if you want videos like this." Subtle eyebrow lift, minimal head movement, 4K.',
];

export interface FlowTemplate {
  nodes: FlowNode[];
  edges: FlowEdge[];
  nodeCounters: Record<string, number>;
}

export function makeUgcTemplate(): FlowTemplate {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  for (let i = 0; i < 4; i += 1) {
    const base = i * STRIDE_X;
    const ptImgId = `tpl-pt-${i + 1}`;
    const igId = `tpl-ig-${i + 1}`;
    const ptVidId = `tpl-pv-${i + 1}`;
    const vgId = `tpl-vg-${i + 1}`;

    nodes.push({
      id: ptVidId,
      type: 'promptNode',
      position: { x: base + X_OFFSET * 2, y: -430 },
      style: { width: 260, height: 390 },
      data: { label: `TEXT #${i + 5}`, status: 'idle', prompt: VID_PROMPTS[i] },
    });
    nodes.push({
      id: vgId,
      type: 'videoGenNode',
      position: { x: base + X_OFFSET * 2, y: 0 },
      style: { width: 340, height: 260 },
      data: { label: `VIDEO GEN #${i + 1}`, status: 'idle', model: 'seedance-2.0', aspectRatio: '9:16', duration: 5, resolution: '1080p' },
    });
    nodes.push({
      id: igId,
      type: 'imageGenNode',
      position: { x: base, y: 620 },
      style: { width: 300, height: 300 },
      data: { label: `IMAGE GEN #${i + 1}`, status: 'idle', model: 'nano-banana-pro', aspectRatio: '9:16' },
    });
    nodes.push({
      id: ptImgId,
      type: 'promptNode',
      position: { x: base, y: 1200 },
      style: { width: 260, height: 390 },
      data: { label: `TEXT #${i + 1}`, status: 'idle', prompt: IMG_PROMPTS[i] },
    });

    edges.push({ id: `tpl-e-pt${i + 1}-ig${i + 1}`, source: ptImgId, target: igId, targetHandle: 'prompt', animated: false, style: edgeStyle('prompt') });
    edges.push({ id: `tpl-e-ig${i + 1}-vg${i + 1}`, source: igId, target: vgId, targetHandle: 'startFrame', animated: false, style: edgeStyle('startFrame') });
    edges.push({ id: `tpl-e-pv${i + 1}-vg${i + 1}`, source: ptVidId, target: vgId, targetHandle: 'prompt', animated: false, style: edgeStyle('prompt') });
  }

  const avatarId = 'tpl-avatar';
  nodes.push({
    id: avatarId,
    type: 'imageInputNode',
    position: { x: -380, y: 160 },
    style: { width: 260 },
    data: { label: 'Avatar', status: 'idle', imageNaturalRatio: '9 / 16' },
  });
  for (let i = 0; i < 4; i += 1) {
    edges.push({ id: `tpl-e-avatar-ig${i + 1}`, source: avatarId, target: `tpl-ig-${i + 1}`, targetHandle: 'image', animated: false, style: edgeStyle('image') });
  }

  return { nodes, edges, nodeCounters: { promptNode: 8, imageGenNode: 4, videoGenNode: 4, imageInputNode: 1 } };
}
