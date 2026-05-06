/**
 * StageMiniPlayer - Floating mini player for active Stages
 * =========================================================
 * Shows when user is in a live stage so they can browse the app.
 * Draggable, similar to RadioMiniPlayer.
 */

import { Mic, MicOff, X, Maximize2, Users, Volume2 } from 'lucide-react';
import { motion, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useStage } from '@/contexts/StageContext';
import stagesMicIcon from '@/assets/icons/stages-mic-icon.png';

export function StageMiniPlayer() {
  const {
    currentSpace,
    myRole,
    isMuted,
    participants,
    toggleMute,
    leaveSpace,
    endSpace,
    openModal,
  } = useStage();

  const dragControls = useDragControls();

  if (!currentSpace) return null;

  const speakers = participants.filter(p => p.role === 'host' || p.role === 'speaker');
  const totalCount = participants.length;

  const handleLeaveOrEnd = () => {
    if (myRole === 'host') {
      endSpace();
    } else {
      leaveSpace();
    }
  };

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{
        left: -window.innerWidth + 220,
        right: 0,
        top: -window.innerHeight + 160,
        bottom: 0,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-20 md:bottom-4 right-4 z-50 select-none"
      style={{ touchAction: 'none' }}
    >
      <div className="bg-black/40 backdrop-blur-[24px] border border-white/10 rounded-2xl shadow-2xl overflow-hidden min-w-[200px]">
        {/* Drag handle + title */}
        <div
          className="flex items-center gap-2 px-3 pt-2.5 pb-1 cursor-grab active:cursor-grabbing"
          onPointerDown={(e) => dragControls.start(e)}
        >
          {/* Live pulse */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>

          <img src={stagesMicIcon} alt="" className="w-4 h-4 object-contain shrink-0" />

          <span className="text-white text-xs font-medium truncate max-w-[120px]">
            {currentSpace.title}
          </span>

          {/* Role label - top right */}
          {myRole && (
            <span className={cn(
              "ml-auto text-[9px] font-medium",
              myRole === 'host' ? "text-yellow-400" :
              myRole === 'speaker' ? "text-blue-400" :
              "text-white/50"
            )}>
              {myRole}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 px-3 py-1 text-white/50 text-[10px]">
          <span className="flex items-center gap-1">
            <Volume2 className="w-3 h-3" />
            {speakers.length}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {totalCount}
          </span>
        </div>

        {/* Controls */}
        <div className="relative flex items-center justify-center gap-2 px-3 pb-2.5 pt-1">
          {/* Mute (speakers only) */}
          {(myRole === 'host' || myRole === 'speaker') && (
            <button
              onClick={toggleMute}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                isMuted
                  ? "bg-white/10 hover:bg-white/20 text-white/60"
                  : "bg-white/20 hover:bg-white/30 text-white ring-2 ring-white/30"
              )}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          {/* Leave / End */}
          <button
            onClick={handleLeaveOrEnd}
            className="w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-all"
            title={myRole === 'host' ? 'End stage' : 'Leave stage'}
          >
            <X className="w-4 h-4" />
          </button>

          {/* Maximize - bottom right */}
          <button
            onClick={() => openModal('live')}
            className="absolute right-3 text-white/50 hover:text-white transition-colors"
            title="Expand stage"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
