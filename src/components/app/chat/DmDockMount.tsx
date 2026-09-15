/**
 * DM Dock Mount
 * =============
 * The always-rendered half of the DM dock. Deliberately tiny: the panel pulls
 * in the whole direct-message stack, which has no business on the boot path,
 * so it is only imported once a thread is actually open. Phones never load it
 * at all — there the same call hands off to the Messages route.
 */

import { Suspense, lazy, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDmDock, closeDmDock } from '@/hooks/use-dm-dock';

const DmDock = lazy(() => import('./DmDock').then(m => ({ default: m.DmDock })));

export function DmDockMount() {
  const { dms } = useDmDock();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // On a phone the window model does not apply: hand the thread to the
  // Messages route, which is where the full-screen chat already lives.
  useEffect(() => {
    if (!isMobile || dms.length === 0) return;
    const dm = dms[dms.length - 1];
    dms.forEach(d => closeDmDock(d.address));
    navigate('/app/messages', {
      state: {
        openDmWith: dm.address,
        username: dm.username,
        autoSendBody: dm.autoSendBody,
        draftBody: dm.draftBody,
      },
    });
  }, [isMobile, dms, navigate]);

  if (isMobile || dms.length === 0) return null;

  return (
    <Suspense fallback={null}>
      <DmDock />
    </Suspense>
  );
}
