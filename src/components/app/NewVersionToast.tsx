import { useEffect } from 'react';
import { toast } from 'sonner';
import { startVersionWatch } from '@/lib/version-check';

/**
 * Renders nothing; watches for a newer deploy and raises a persistent toast
 * offering a refresh, with a one-line summary of what shipped and a link to the
 * PR that shipped it. See lib/version-check for the polling rules.
 *
 * Mounted once at the App root, next to <Sonner />.
 */
export function NewVersionToast() {
  useEffect(
    () =>
      startVersionWatch((version) => {
        // toast.message, not the bare toast(): only the named methods are
        // patched by lib/toast-i18n-interceptor, so this is the callable that
        // gets translated once a `toasts.new_version_available` key exists.
        toast.message('New version available', {
          // Never auto-dismiss. The whole point is that it is still there when
          // the user next looks at the tab.
          duration: Infinity,
          closeButton: true,
          description: (
            <span className="block">
              {version.note || 'Refresh to pick up the latest changes.'}
              {version.url ? (
                <>
                  {' '}
                  <a
                    href={version.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap text-white underline underline-offset-2 hover:text-white/80"
                  >
                    What changed
                  </a>
                </>
              ) : null}
            </span>
          ),
          action: {
            label: 'Refresh',
            // A plain reload is enough to land on the new build: sw.js serves
            // navigations NetworkFirst, so the HTML comes back fresh with live
            // chunk URLs, and the chunks themselves are content-hashed, so
            // nothing cached under an old name can be replayed for them.
            onClick: () => window.location.reload(),
          },
        });
      }),
    []
  );

  return null;
}
