import { useTranslation } from 'react-i18next';
import { CINEMA_DIRECTION_FIELDS, normalizeCinemaDirection, type CinemaDirection } from '@/lib/creator/cinemaDirection';
import { SelectChip } from './StudioChip';

interface Props {
  value: CinemaDirection;
  onChange: (value: CinemaDirection) => void;
  mode: string;
  disabled?: boolean;
}

export function CinemaDirectionControls({ value, onChange, mode, disabled }: Props) {
  const { t } = useTranslation();
  if (mode !== 'image' && mode !== 'video') return null;
  const direction = normalizeCinemaDirection(value);
  const text = (key: string, fallback: string) => t(`creator.cinema.${key}`, { defaultValue: fallback });
  return (
    <details className="rounded-2xl border border-white/15 p-3">
      <summary className="cursor-pointer text-sm font-medium">{text('title', 'Cinema direction')}</summary>
      <p className="my-2 text-xs opacity-70">{text('hint', 'Optional prompt guidance. Results vary by model; these choices do not control physical cameras or edit footage. Standard generation pricing applies.')}</p>
      <div className="flex flex-wrap gap-2">
        {CINEMA_DIRECTION_FIELDS.filter((field) => !field.videoOnly || mode === 'video').map((field) => (
          <SelectChip key={field.id} label={text(`${field.id}.label`, field.label)} value={direction[field.id] ?? ''}
            options={[{ value: '', label: text('none', 'No direction') }, ...field.options.map((option, index) => ({ value: option, label: text(`${field.id}.${index}`, option) }))]}
            onChange={(option) => onChange(normalizeCinemaDirection({ ...direction, [field.id]: option }))} disabled={disabled} />
        ))}
      </div>
      {Object.keys(direction).length > 0 && <button type="button" disabled={disabled} className="mt-3 text-xs underline disabled:opacity-40" onClick={() => onChange({})}>{text('reset', 'Clear direction')}</button>}
    </details>
  );
}
