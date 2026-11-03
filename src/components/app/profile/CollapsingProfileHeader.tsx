import { PageHeader } from '@/components/app/PageHeader';
import { useAppTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import './profile-collapse.css';

/** Floating Back over the cover until the tabs row pins and carries its own
 *  Back, identity and Follow. There is no compact bar in between. */
export function CollapsingProfileHeader({ tabsPinned = false }: { tabsPinned?: boolean }) {
  const { theme } = useAppTheme();
  return (
    <div className="profile-collapse-anchor">
      <div data-profile-collapse data-tabs-pinned={tabsPinned} className="profile-collapse-bar" aria-hidden={tabsPinned}>
        {!tabsPinned && (
          <PageHeader overlay plainBack className={cn(
            '!right-auto !top-3 !left-0 sm:!top-4 sm:!left-3',
            (theme === 'system' || theme === 'immersive') && 'max-sm:!top-1',
          )} />
        )}
      </div>
    </div>
  );
}
