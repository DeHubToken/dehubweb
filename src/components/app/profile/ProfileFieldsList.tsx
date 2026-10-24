import { useTranslation } from 'react-i18next';
import { BadgeCheck } from 'lucide-react';

/** An https link in a field is clickable; anything else is plain text. */
function linkOf(value: string): string | null {
  if (!/^https:\/\/\S+$/i.test(value)) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

/**
 * The profile's label/value lines under the bio — Mastodon's profile fields.
 * A link whose page links back here with rel="me" shows a check. The links
 * carry rel="me" too, the way Mastodon's do, so the proof runs both ways.
 */
export function ProfileFieldsList({
  fields,
}: {
  fields?: Array<{ name: string; value: string; verifiedAt?: string | null }>;
}) {
  const { t } = useTranslation();
  if (!fields?.length) return null;
  return (
    <dl data-profile-fields className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
      {fields.map((field, index) => {
        const href = linkOf(field.value);
        const verified = !!field.verifiedAt && !!href;
        return (
          <div
            key={`${field.name}-${index}`}
            className={`flex items-baseline gap-3 px-3 py-2 ${verified ? 'bg-emerald-500/10' : ''}`}
          >
            <dt className="w-28 shrink-0 truncate text-xs font-semibold uppercase tracking-wide text-zinc-400">{field.name}</dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-white">
              {href ? (
                <a href={href} target="_blank" rel="me nofollow noopener noreferrer" className="truncate hover:underline">
                  {field.value.replace(/^https:\/\/(www\.)?/i, '').replace(/\/$/, '')}
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
