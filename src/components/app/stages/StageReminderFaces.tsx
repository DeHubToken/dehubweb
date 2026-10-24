/**
 * StageReminderFaces — who is waiting on a stage
 * ==============================================
 * A short facepile of the highest-follower accounts that set a reminder, plus
 * the total. Social proof on an announcement card: "these people are coming"
 * does more for a click than a bell icon does.
 *
 * Reminder rows survive the stage going live, so the same row is worth showing
 * on a live invite link — a room in its first minute has a headcount of one and
 * a guest arriving from the notification deserves to see the rest of the crowd
 * on its way. Pass `state="live"` there for the wording; the live room's own
 * crowd shows these people as seats instead (see useStagePreAudience).
 *
 * Each face opens that person's profile (username first, wallet-id fallback,
 * the same resolution StageHostLink uses). The faces sit inside the live card,
 * which is itself one big <button>, so they are <span role="link"> and stop
 * the click from also opening the stage.
 *
 * Renders nothing when nobody has reminded, so an empty announcement stays
 * clean rather than advertising that no one is interested. The same silence
 * covers the reminders table being unreachable — the hook resolves to zero
 * and the row simply does not appear.
 */

import Bell from "@/components/ui/cut-icons/alerts";

import { useNavigate } from 'react-router-dom';
import { useTranslation as _useCopy } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useStageReminderFaces } from '@/hooks/use-stage-reminders';
import { StageAvatar } from './StageAvatar';

export function StageReminderFaces({
  spaceId,
  className,
  state = 'upcoming',
}: {
  spaceId: string | undefined;
  className?: string;
  /** Wording only — "set a reminder" before the stage starts, "coming" after. */
  state?: 'upcoming' | 'live';
}) {
  const { t: _copy } = _useCopy();
  const navigate = useNavigate();
  const { faces, total } = useStageReminderFaces(spaceId);

  if (total === 0) return null;

  // Everyone past the facepile is carried by the trailing count, so the
  // chip reads "+4" beside ten faces rather than restating the total.
  const hidden = Math.max(0, total - faces.length);

  const tooltip =
    state === 'live'
      ? _copy("copy.abbf88d1cafa", { count: total, defaultValue: "{{count}} people said they were coming" })
      : _copy("copy.ec280c7818c9", { count: total, defaultValue: "{{count}} people have set a reminder" });

  return (
    <div className={cn('flex items-center gap-2', className)} title={tooltip}>
      {faces.length > 0 && (
        <div className="flex -space-x-1.5">
          {faces.map((face) => {
            const handle = face.username?.replace(/^@+/, '');
            const openProfile = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
              e.stopPropagation();
              e.preventDefault();
              if (handle) navigate(`/${handle}`);
              else navigate(`/app/profile?id=${face.address}`);
            };
            return (
              <span
                key={face.address}
                role="link"
                tabIndex={0}
                aria-label={_copy("copy.648c99c43631", { defaultValue: "View {{value1}}'s profile", value1: `@${handle || face.address.slice(0, 6)}` })}
                title={handle ? `@${handle}` : undefined}
                onClick={openProfile}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openProfile(e);
                }}
                className="relative block w-6 h-6 rounded-md ring-1 ring-black/40 shrink-0 cursor-pointer transition-transform hover:z-10 hover:scale-110 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-white/70"
              >
                {/* Falls through the same ladder as every stage picture and
                    lands on the initial; a face whose picture 404d used to be
                    an empty grey square in the row. */}
                <StageAvatar
                  address={face.address}
                  avatar={face.avatarUrl}
                  name={face.username}
                  size={24}
                  className="w-full h-full rounded-md text-[8px]"
                />
              </span>
            );
          })}
        </div>
      )}
      <span className="flex items-center gap-1 text-zinc-400 text-[11px] font-medium">
        <Bell className="w-3 h-3 shrink-0" />
        {hidden > 0 ? `+${hidden}` : total}
      </span>
    </div>
  );
}

export default StageReminderFaces;
