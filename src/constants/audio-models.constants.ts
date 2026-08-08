/**
 * Audio Generation Configuration
 * ==============================
 * Everything the Creator Studio's Audio mode can make, all of it on ElevenLabs.
 * DeHub already pays for that key (ELEVENLABS_API_KEY) and already used it for
 * the assistant's voice and Stage transcription, so this opens the rest of the
 * account's surface rather than introducing a second vendor.
 *
 * ── Audio is nine tools, not one ─────────────────────────────────────────────
 * Image, video and 3D are each a single verb with a model behind it. Audio is
 * not: a voiceover, a sound effect, a song, a dub and a transcript share a
 * provider and nothing else. So Audio mode carries a task selector, and this
 * file is the registry that drives it — what each task asks the creator for,
 * what it hands back, and what it costs.
 *
 * ── On `baseCostUsd` ─────────────────────────────────────────────────────────
 * ElevenLabs bills in credits, not dollars, and the dollar value of a credit
 * moves with the subscription tier. The numbers here are therefore CONSERVATIVE
 * (rounded up) conversions at the current tier, in the same spirit as the 3D
 * table: too high is a pricing decision, too low is a loss on every generation.
 * Reconcile them against a real ElevenLabs invoice after the first week and
 * adjust.
 *
 * ── Why most tasks are free ──────────────────────────────────────────────────
 * The voiceover in /editor has always been free, and a two-second line of
 * speech costs a fraction of a cent — putting an on-chain transfer in front of
 * it would cost more in friction than it recovers. Only the three tasks that
 * bill real money per run (music, voice changer, dubbing) go through the DHB
 * paywall. `paid` is the single source of truth for that split; the composer
 * reads it rather than hard-coding a list.
 */

export type AudioTask =
  | 'speech'
  | 'dialogue'
  | 'sfx'
  | 'music'
  | 'voice-design'
  | 'voice-changer'
  | 'dubbing'
  | 'transcribe'
  | 'isolate';

/** What the big text box means for a given task, or that it is unused. */
export type PromptRole = 'none' | 'text' | 'script' | 'description';

/** What lands in the results feed when the task finishes. */
export type AudioOutput = 'audio' | 'text' | 'voice';

export interface AudioTaskSpec {
  id: AudioTask;
  label: string;
  /** Shown on the task chip's popover row. */
  description: string;
  emoji: string;
  promptRole: PromptRole;
  /** Placeholder for the composer's text box. Ignored when promptRole is 'none'. */
  placeholder: string;
  /**
   * Needs a media file to work from. These four are transformations of
   * something the creator already has, not generations from nothing.
   */
  needsMedia: boolean;
  /** `accept` for the file input. Dubbing takes video as well as audio. */
  mediaAccept?: string;
  /** Which voice control the task shows: a library voice, or none at all. */
  usesVoice: boolean;
  output: AudioOutput;
  /** Goes through the DHB paywall. See the note above. */
  paid: boolean;
  /** Base cost in USD before markup, per run at the task's default settings. */
  baseCostUsd: number;
  /**
   * Cost scales with length for the metered tasks, so the paywall multiplies
   * `baseCostUsd` by this many units. Music bills per 10s, the two media tasks
   * per minute of input. Absent means a flat per-run charge.
   */
  meteredBy?: 'per-10s' | 'per-minute';
  /** Rough wall-clock, so nobody thinks a two-minute dub has hung. */
  typicalDuration: string;
  tips?: string[];
}

/** Markup percentage (100% = 2x cost), matching image, video and 3D. */
export const AUDIO_GENERATION_MARKUP = 1.0;

export const AUDIO_TASKS: Record<AudioTask, AudioTaskSpec> = {
  speech: {
    id: 'speech',
    label: 'Speech',
    description: 'Text to speech in any voice',
    emoji: '🎙️',
    promptRole: 'text',
    placeholder: 'Type what the voice should say',
    needsMedia: false,
    usesVoice: true,
    output: 'audio',
    paid: false,
    baseCostUsd: 0,
    typicalDuration: '2-10s',
    tips: [
      '🎭 v3 reads performance tags inline — [whispers], [laughs], [sighs]',
      '🎚️ Lower stability is more expressive; higher is more consistent take to take',
      '🌍 Leave the language on Auto unless a name is being read in the wrong accent',
    ],
  },
  dialogue: {
    id: 'dialogue',
    label: 'Dialogue',
    description: 'Multi-speaker scene, one voice per line',
    emoji: '🎭',
    promptRole: 'script',
    placeholder: 'Alice: We should go.\nBob: [laughs] After you.',
    needsMedia: false,
    usesVoice: true,
    output: 'audio',
    paid: false,
    baseCostUsd: 0,
    typicalDuration: '5-20s',
    tips: [
      '📝 One line per speaker, "Name: line" — the name picks the voice',
      '🎭 Performance tags work here too, and carry across the exchange',
      '🗣️ Assign a voice to each speaker below; unassigned names use the default',
    ],
  },
  sfx: {
    id: 'sfx',
    label: 'Sound effect',
    description: 'Describe a sound and get it',
    emoji: '💥',
    promptRole: 'description',
    placeholder: 'Describe the sound, for example "heavy door slamming in a stone hall"',
    needsMedia: false,
    usesVoice: false,
    output: 'audio',
    paid: false,
    baseCostUsd: 0,
    typicalDuration: '5-15s',
    tips: [
      '🔁 Turn on Loop for a seamless ambience bed',
      '🎯 Prompt influence high follows your words literally; low is more creative',
      '⏱️ Leave duration on Auto and the model picks a natural length',
    ],
  },
  music: {
    id: 'music',
    label: 'Music',
    description: 'Full track from a description',
    emoji: '🎵',
    promptRole: 'description',
    placeholder: 'Describe the track, for example "slow lo-fi beat, warm rhodes, vinyl crackle"',
    needsMedia: false,
    usesVoice: false,
    output: 'audio',
    paid: true,
    // Music is the most expensive endpoint on the account and is billed by
    // length, so it is metered rather than flat-rated.
    baseCostUsd: 0.04,
    meteredBy: 'per-10s',
    typicalDuration: '30-90s',
    tips: [
      '🎼 Name the instruments, tempo and mood — genre alone gives generic results',
      '🎤 Instrumental is on by default; turn it off to get sung vocals',
      '⏳ Longer tracks cost proportionally more and take proportionally longer',
    ],
  },
  'voice-design': {
    id: 'voice-design',
    label: 'Voice design',
    description: 'Invent a voice from a description',
    emoji: '🧬',
    promptRole: 'description',
    placeholder: 'Describe the voice, for example "gravelly old sailor, slow, warm, faint Irish lilt"',
    needsMedia: false,
    usesVoice: false,
    output: 'voice',
    paid: false,
    baseCostUsd: 0,
    typicalDuration: '10-20s',
    tips: [
      '🎨 Age, accent, pace, texture and mood — all five gets you much closer',
      '🔀 Three takes come back each run; save the one you want to your library',
      '💾 A saved voice then shows up everywhere the voice picker does',
    ],
  },
  'voice-changer': {
    id: 'voice-changer',
    label: 'Voice changer',
    description: 'Re-perform your recording in another voice',
    emoji: '🔄',
    promptRole: 'none',
    placeholder: '',
    needsMedia: true,
    mediaAccept: 'audio/*',
    usesVoice: true,
    output: 'audio',
    paid: true,
    baseCostUsd: 0.06,
    meteredBy: 'per-minute',
    typicalDuration: '10-40s',
    tips: [
      '🎭 Your delivery, timing and emotion are kept — only the voice changes',
      '🎧 A clean, close recording gives a dramatically better result',
      '🔇 Background noise removal is on by default',
    ],
  },
  dubbing: {
    id: 'dubbing',
    label: 'Dubbing',
    description: 'Translate a clip, keeping the speaker’s voice',
    emoji: '🌍',
    promptRole: 'none',
    placeholder: '',
    needsMedia: true,
    mediaAccept: 'audio/*,video/*',
    usesVoice: false,
    output: 'audio',
    paid: true,
    baseCostUsd: 0.3,
    meteredBy: 'per-minute',
    typicalDuration: '1-5 min',
    tips: [
      '🗣️ The original speaker’s voice is preserved in the new language',
      '👥 Set the speaker count when you know it — guessing costs accuracy',
      '⏳ This one genuinely takes minutes. It keeps running if you leave the page',
    ],
  },
  transcribe: {
    id: 'transcribe',
    label: 'Transcribe',
    description: 'Speech to text with speaker labels',
    emoji: '📝',
    promptRole: 'none',
    placeholder: '',
    needsMedia: true,
    mediaAccept: 'audio/*,video/*',
    usesVoice: false,
    output: 'text',
    paid: false,
    baseCostUsd: 0,
    typicalDuration: '10-60s',
    tips: [
      '👥 Speaker labels separate who said what across the whole recording',
      '🔊 Audio events like [laughter] are tagged inline when they occur',
      '📋 The transcript is copyable straight from the result card',
    ],
  },
  isolate: {
    id: 'isolate',
    label: 'Clean up',
    description: 'Strip background noise from a recording',
    emoji: '🧹',
    promptRole: 'none',
    placeholder: '',
    needsMedia: true,
    mediaAccept: 'audio/*,video/*',
    usesVoice: false,
    output: 'audio',
    paid: false,
    baseCostUsd: 0,
    typicalDuration: '10-30s',
    tips: [
      '🎙️ Pulls the voice clean out of traffic, wind, hiss or room tone',
      '🎬 Good first step before dubbing or the voice changer',
      '🔇 Anything that is not speech is removed, music included',
    ],
  },
};

/** Display order of the task chip. Creation first, then transformation. */
export const AUDIO_TASK_ORDER: AudioTask[] = [
  'speech',
  'dialogue',
  'sfx',
  'music',
  'voice-design',
  'voice-changer',
  'dubbing',
  'transcribe',
  'isolate',
];

export const AUDIO_TASK_OPTIONS: AudioTaskSpec[] = AUDIO_TASK_ORDER.map((id) => AUDIO_TASKS[id]);

export function isAudioTask(v: unknown): v is AudioTask {
  return typeof v === 'string' && v in AUDIO_TASKS;
}

// ── Speech models ───────────────────────────────────────────────────────────

export type TtsModelKey =
  | 'eleven_v3'
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5'
  | 'eleven_flash_v2_5';

export interface TtsModel {
  id: TtsModelKey;
  name: string;
  description: string;
  /** Reads inline performance tags such as [whispers]. v3 only. */
  supportsTags: boolean;
  /** Accepts an explicit speed multiplier. */
  supportsSpeed: boolean;
  /** Roughly how many languages the model covers, for the chip detail line. */
  languages: number;
}

export const TTS_MODELS: Record<TtsModelKey, TtsModel> = {
  eleven_v3: {
    id: 'eleven_v3',
    name: 'Eleven v3',
    description: 'Most expressive — reads performance tags',
    supportsTags: true,
    // v3 derives pace from the tags and the text rather than a speed dial, and
    // sending one is rejected outright.
    supportsSpeed: false,
    languages: 70,
  },
  eleven_multilingual_v2: {
    id: 'eleven_multilingual_v2',
    name: 'Multilingual v2',
    description: 'Most lifelike and stable — the safe default',
    supportsTags: false,
    supportsSpeed: true,
    languages: 29,
  },
  eleven_turbo_v2_5: {
    id: 'eleven_turbo_v2_5',
    name: 'Turbo v2.5',
    description: 'Balanced quality and speed',
    supportsTags: false,
    supportsSpeed: true,
    languages: 32,
  },
  eleven_flash_v2_5: {
    id: 'eleven_flash_v2_5',
    name: 'Flash v2.5',
    description: 'Fastest, for long scripts',
    supportsTags: false,
    supportsSpeed: true,
    languages: 32,
  },
};

export const TTS_MODEL_OPTIONS: TtsModel[] = [
  TTS_MODELS.eleven_multilingual_v2,
  TTS_MODELS.eleven_v3,
  TTS_MODELS.eleven_turbo_v2_5,
  TTS_MODELS.eleven_flash_v2_5,
];

/** Dialogue is a v3 capability; no other model accepts a multi-speaker input. */
export const DIALOGUE_MODEL_ID = 'eleven_v3';

// ── Voice settings ──────────────────────────────────────────────────────────

export interface VoiceSettings {
  /** 0 = maximum variation between takes, 1 = monotone but repeatable. */
  stability: number;
  /** How closely the output tracks the original voice's timbre. */
  similarity: number;
  /** Exaggerates the speaker's delivery. Costs latency and can destabilise. */
  style: number;
  speakerBoost: boolean;
  /** 0.7-1.2. Ignored by v3. */
  speed: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity: 0.75,
  style: 0.3,
  speakerBoost: true,
  speed: 1.0,
};

/**
 * Output formats worth exposing. MP3 covers every browser and the editor's
 * timeline; PCM is here because it is what anyone doing post-production wants
 * and it costs nothing extra to offer.
 */
export const AUDIO_OUTPUT_FORMATS = [
  { value: 'mp3_44100_128', label: 'MP3 128 kbps', detail: 'Default — smallest' },
  { value: 'mp3_44100_192', label: 'MP3 192 kbps', detail: 'Higher quality' },
  { value: 'pcm_44100', label: 'WAV / PCM', detail: 'Uncompressed, for editing' },
] as const;

export type AudioOutputFormat = (typeof AUDIO_OUTPUT_FORMATS)[number]['value'];

// ── Languages ───────────────────────────────────────────────────────────────

/**
 * Language codes for the speech and dubbing pickers.
 *
 * On speech this is an override, not a requirement: left unset the model reads
 * the language out of the text, which is right almost always. It exists for the
 * case that actually bites — a proper noun or a loanword being read in the
 * wrong accent.
 */
export interface AudioLanguage {
  code: string;
  label: string;
}

export const AUDIO_LANGUAGES: AudioLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'pl', label: 'Polish' },
  { code: 'nl', label: 'Dutch' },
  { code: 'sv', label: 'Swedish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'cs', label: 'Czech' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'id', label: 'Indonesian' },
  { code: 'fil', label: 'Filipino' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'ms', label: 'Malay' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'el', label: 'Greek' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'hr', label: 'Croatian' },
  { code: 'sk', label: 'Slovak' },
];

// ── Task-specific bounds ────────────────────────────────────────────────────

/**
 * The TTS endpoint used to cap text at 500 characters, which is about three
 * sentences — far too short for the voiceover the studio is for. This is the
 * new ceiling, and it is enforced in the edge function too so a hand-rolled
 * request cannot bill the account for a novel.
 */
export const MAX_SPEECH_CHARS = 5000;

/** Sound effects: the provider's own ceiling. 0 means "let the model decide". */
export const SFX_MIN_SECONDS = 0.5;
export const SFX_MAX_SECONDS = 30;
export const SFX_AUTO_DURATION = 0;

/** Music length bounds, in seconds. Billed per 10s — see `meteredBy`. */
export const MUSIC_MIN_SECONDS = 10;
export const MUSIC_MAX_SECONDS = 300;
export const MUSIC_DEFAULT_SECONDS = 60;

/**
 * Upload ceiling for the four media tasks.
 *
 * Rejected in the composer rather than after payment: voice changer and dubbing
 * both charge before the file is sent, so a file the provider will refuse has
 * to be caught while it is still free to say no.
 */
export const MAX_AUDIO_UPLOAD_BYTES = 100 * 1024 * 1024;

// ── Pricing ─────────────────────────────────────────────────────────────────

/**
 * Final USD cost with markup, for `units` of whatever the task meters.
 *
 * `units` is 10-second blocks for music and whole minutes for the two media
 * tasks — always rounded UP, because a 61-second dub costs the account two
 * minutes. Flat-rated and free tasks ignore it.
 */
export function getAudioCostUsd(spec: AudioTaskSpec, units = 1): number {
  if (!spec.paid) return 0;
  const billable = spec.meteredBy ? Math.max(1, Math.ceil(units)) : 1;
  return spec.baseCostUsd * billable * (1 + AUDIO_GENERATION_MARKUP);
}

/** Cost in DHB at the live price. */
export function getAudioCostDhb(spec: AudioTaskSpec, dhbPriceUsd: number, units = 1): number {
  if (dhbPriceUsd <= 0) return 0;
  return getAudioCostUsd(spec, units) / dhbPriceUsd;
}

/**
 * How many billable units a run is, from the length the creator has chosen.
 *
 * Music knows its length up front. The media tasks do not — the duration of an
 * upload is only known once the browser has decoded it, so the composer reads
 * it and passes it here. A file whose duration cannot be read bills as one
 * minute, which is the smallest honest guess rather than a free pass.
 */
export function billableUnits(spec: AudioTaskSpec, seconds: number | null): number {
  if (!spec.meteredBy) return 1;
  if (spec.meteredBy === 'per-10s') return Math.max(1, Math.ceil((seconds ?? 10) / 10));
  return Math.max(1, Math.ceil((seconds ?? 60) / 60));
}
