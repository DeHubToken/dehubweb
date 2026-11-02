import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';
import { fieldLink, presetById, presetOf, splitProfileFields, displayFieldUrl } from '@/lib/profile-field-presets';
import { PROFILE_FIELD_ICONS } from './profileFieldIcons';

/**
 * The profile's label/value lines under the bio — Mastodon's profile fields.
 * Website and the other link kinds are not here: they show with the social
 * links (ProfileLinksPill). A link whose page links back here with rel="me"
 * shows a check. The links carry rel="me" too, the way Mastodon's do, so the
 * proof runs both ways.
 */
export function ProfileFieldsList({
  fields,
}: {
  fields?: Array<{ name: string; value: string; verifiedAt?: string | null }>;
}) {
  const { t } = useTranslation();
  const { rest } = splitProfileFields(fields);
  if (!rest.length) return null;
  return (
    <dl data-profile-fields className="mt-3 flex flex-col gap-1.5">
      {rest.map((field, index) => {
        const href = fieldLink(field.value);
        const verified = !!field.verifiedAt && !!href;
        const preset = presetOf(field.name);
        const Icon = PROFILE_FIELD_ICONS[preset];
        const label = preset === 'custom' ? field.name : t(`profileFields.presets.${preset}`, presetById(preset)!.name);
        return (
          <div key={`${field.name}-${index}`} className="flex min-w-0 items-center gap-2 text-sm">
            <dt className="flex shrink-0 items-center gap-1.5 text-zinc-400">
              {preset !== 'custom' && <Icon className="size-4 shrink-0" aria-hidden />}
              <span className={preset === 'custom' ? 'max-w-[9rem] truncate' : 'sr-only'}>{label}</span>
            </dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-white/90">
              {href ? (
                <a href={href} target="_blank" rel="me nofollow noopener noreferrer" className="truncate hover:underline">
                  {displayFieldUrl(field.value)}
                </a>
              ) : (
                <span className="truncate">{field.value}</span>
              )}
              {verified && (
                <span title={t('profileFields.verified')} className="shrink-0">
                  <BadgeCheck className="size-4 text-emerald-400" aria-label={t('profileFields.verified')} />
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
