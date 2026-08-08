/**
 * Voice chip.
 * ===========
 * The voice control on the composer's settings rail. A thin wrapper over
 * SelectChip so it looks and behaves like every other chip beside it, rather
 * than the full-height browser in ElevenLabsVoicePicker — that one is a panel
 * with previews and a search box, which is right in the Stage drawer and far
 * too big for a rail that already scrolls sideways.
 *
 * The creator's own cloned and designed voices are listed first, because they
 * are the ones somebody came here for.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCustomVoices } from '@/hooks/use-custom-voices';
import { DEFAULT_VOICE_ID } from '@/lib/creator/generationEngine';
import { SelectChip, type ChipOption } from './StudioChip';

interface LibraryVoice {
  voice_id: string;
  name: string;
  labels?: Record<string, string>;
}

interface StudioVoicePickerProps {
  value: string;
  onChange: (voiceId: string) => void;
  /** Jumps the composer to the voice-design tool. */
  onDesignVoice: () => void;
}

/** Sentinel option. Not a voice id — intercepted before it can be selected. */
const DESIGN_SENTINEL = '__design__';

export function StudioVoicePicker({ value, onChange, onDesignVoice }: StudioVoicePickerProps) {
  const [library, setLibrary] = useState<LibraryVoice[]>([]);
  const { voices: customVoices } = useCustomVoices();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // A GET with query params, not functions.invoke: that function reads
        // `search` and `page_size` off the URL, and invoke posts a body it
        // would never look at. Matching ElevenLabsVoicePicker.
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-voices?page_size=100`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          },
        );
        if (!res.ok) throw new Error('Failed to fetch voices');
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.voices)) setLibrary(data.voices as LibraryVoice[]);
      } catch {
        // The stock list failing is not fatal: the default voice and anything
        // the creator has cloned are still selectable, so the chip degrades to
        // those rather than disappearing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const options: ChipOption<string>[] = useMemo(() => {
    const mine: ChipOption<string>[] = customVoices.map((v) => ({
      value: v.elevenlabs_voice_id,
      label: v.name,
      detail: 'Your voice',
    }));

    const stock: ChipOption<string>[] = library
      // A cloned voice also comes back in the account's own library listing, so
      // without this it appears twice — once as "Your voice" and once as stock.
      .filter((v) => !customVoices.some((c) => c.elevenlabs_voice_id === v.voice_id))
      .map((v) => ({
        value: v.voice_id,
        label: v.name,
        detail: [v.labels?.accent, v.labels?.description, v.labels?.age]
          .filter(Boolean)
          .join(' · '),
      }));

    // The chip must always be able to display its current value. Until the
    // library loads that is nothing, and the chip would read as empty.
    const fallback: ChipOption<string>[] =
      mine.length || stock.length ? [] : [{ value: DEFAULT_VOICE_ID, label: 'Aria', detail: 'Default' }];

    return [
      ...mine,
      ...stock,
      ...fallback,
      { value: DESIGN_SENTINEL, label: '✨ Design a new voice', detail: 'Describe one in words' },
    ];
  }, [customVoices, library]);

  const current = options.find((o) => o.value === value);

  return (
    <SelectChip
      label="Voice"
      width="md"
      searchable
      searchPlaceholder="Search voices…"
      value={value}
      // A voice selected on another surface, or one that has since been
      // deleted, would otherwise leave the chip face blank.
      display={current?.label ?? 'Voice'}
      options={options}
      onChange={(next) => {
        if (next === DESIGN_SENTINEL) {
          onDesignVoice();
          return;
        }
        onChange(next);
      }}
    />
  );
}
