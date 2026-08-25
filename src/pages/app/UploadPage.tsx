/**
 * /app/upload — the composer, as a URL.
 * =====================================
 * The composer is a modal opened from a button, which is fine everywhere there
 * is a button and useless everywhere there is not. Trenchstar's desk frames
 * three real DeHub pages — the feed, your profile, and this — and "make a
 * post" had no address to frame.
 *
 * So this page renders nothing of its own and opens the real composer on
 * mount. Nothing is duplicated: it is the same modal, the same form, the same
 * wallet and the same quota as the button in the sidebar, which is the whole
 * point of giving it a URL rather than building a second one.
 *
 * Closing it returns to the feed. A composer dismissed on a page that is only
 * a composer would otherwise leave an empty middle panel and no way back that
 * did not involve the browser's Back button.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalDropZone } from '@/hooks/use-global-drop-zone';

export default function UploadPage() {
  const { openPostModal, isPostModalOpen } = useGlobalDropZone();
  const navigate = useNavigate();
  // Whether the modal has actually been up yet: on the first render it is
  // still closed, and treating that as "closed again" would bounce straight
  // back to the feed before the composer ever appeared.
  const [wasOpen, setWasOpen] = useState(false);

  useEffect(() => {
    openPostModal();
  }, [openPostModal]);

  useEffect(() => {
    if (isPostModalOpen) setWasOpen(true);
  }, [isPostModalOpen]);

  useEffect(() => {
    if (wasOpen && !isPostModalOpen) navigate('/app', { replace: true });
  }, [wasOpen, isPostModalOpen, navigate]);

  return null;
}
