/**
 * StageDeepLinkPage - Handles /stage/:id invite links
 * Joins the stage and opens the AudioSpacesModal.
 */

import { BrandIcon } from '@/components/app/war/WarHudIcon';
import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStage } from '@/contexts/StageContext';
import { useAuth } from '@/contexts/AuthContext';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';
import { DeHubPageLoader } from '@/components/app/DeHubLoader';

export default function StageDeepLinkPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { joinSpace, currentSpace, openModal } = useStage();
  const { isAuthenticated } = useAuth();
  const joinedRef = useRef(false);

  useEffect(() => {
    if (!id || joinedRef.current) return;

    // If already in this space, just open the modal
    if (currentSpace?.id === id) {
      openModal('live');
      navigate('/app', { replace: true });
      return;
    }

    if (!isAuthenticated) {
      // Not logged in — go home, modal will require auth
      navigate('/app', { replace: true });
      return;
    }

    joinedRef.current = true;

    joinSpace(id)
      .then((success) => {
        if (success) {
          openModal('live');
        }
        // Navigate to home either way — mini player or modal will be visible
        navigate('/app', { replace: true });
      })
      .catch(() => {
        // A rejected join (invalid/ended stage, network error) previously left
        // the user stuck on this spinner forever.
        navigate('/app', { replace: true });
      });
  }, [id, isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div data-glass-page className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 text-white">
      <BrandIcon src={stagesMicIcon} alt="" className="w-16 h-16 object-contain opacity-80" />
      <DeHubPageLoader size={48} minHeight="0" label="Joining stage..." />
    </div>
  );
}
