import { useEffect } from 'react';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { usePostForm } from './hooks/usePostForm';
import { PostContentArea } from './components/PostContentArea';
import { PostAccessToggles } from './components/PostAccessToggles';
import { PostActionBar } from './components/PostActionBar';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { cn } from '@/lib/utils';

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: FileList | null;
  onFilesProcessed?: () => void;
}

export function PostModal({ isOpen, onClose, initialFiles, onFilesProcessed }: PostModalProps) {
  const { state, actions, computed, refs } = usePostForm(onClose);

  // Process initial files when modal opens with pending files
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      actions.handleFileDrop(initialFiles);
      onFilesProcessed?.();
    }
  }, [isOpen, initialFiles, actions.handleFileDrop, onFilesProcessed]);

  const handleClose = () => {
    actions.resetForm();
    onClose();
  };

  const modalContent = (
    <>

      <PostContentArea
        text={state.text}
        setText={actions.setText}
        description={state.description}
        setDescription={actions.setDescription}
        showDescription={state.showDescription}
        setShowDescription={actions.setShowDescription}
        editorRef={refs.editorRef}
        media={state.media}
        onRemoveMedia={actions.removeMedia}
        onAddAudio={actions.addAudioToMedia}
        onRemoveAudio={actions.removeAudioFromMedia}
        onToggleMusicVideo={actions.toggleMusicVideo}
        onAddThumbnail={actions.addThumbnailToMedia}
        onRemoveThumbnail={actions.removeThumbnailFromMedia}
        onApplyFilter={actions.applyFilterToMedia}
        onClearFilter={actions.clearFilterFromMedia}
        onApplyCrop={actions.applyCropToMedia}
        onClearCrop={actions.clearCropFromMedia}
        onApplyTrim={actions.applyTrimToMedia}
        liveMode={state.liveMode}
        canPost={computed.canPost}
        destinations={computed.destinations}
        hasVideo={computed.hasVideo}
        hasImage={computed.hasImage}
        onFileDrop={actions.handleFileDrop}
        scheduledDate={state.scheduledDate}
        onSchedule={actions.setScheduledDate}
        drafts={state.drafts}
        onSaveDraft={actions.saveDraft}
        onLoadDraft={actions.loadDraft}
        onDeleteDraft={actions.deleteDraft}
        canSaveDraft={computed.canPost}
        isRecording={state.isRecording}
        recordingTime={state.recordingTime}
        onStopRecording={actions.stopRecording}
        chainId={state.chainId}
        onChainChange={actions.setChainId}
      />

      <PostAccessToggles
        isSubscribersOnly={state.isSubscribersOnly}
        setIsSubscribersOnly={actions.setIsSubscribersOnly}
        isPPV={state.isPPV}
        setIsPPV={actions.setIsPPV}
        ppvAmount={state.ppvAmount}
        setPpvAmount={actions.setPpvAmount}
        ppvCurrency={state.ppvCurrency}
        setPpvCurrency={actions.setPpvCurrency}
        isWatch2Earn={state.isWatch2Earn}
        setIsWatch2Earn={actions.setIsWatch2Earn}
        w2eViews={state.w2eViews}
        setW2eViews={actions.setW2eViews}
        w2eComments={state.w2eComments}
        setW2eComments={actions.setW2eComments}
        w2eTotal={state.w2eTotal}
        setW2eTotal={actions.setW2eTotal}
        w2eCurrency={state.w2eCurrency}
        setW2eCurrency={actions.setW2eCurrency}
        isTokenGated={state.isTokenGated}
        setIsTokenGated={actions.setIsTokenGated}
        tokenContract={state.tokenContract}
        setTokenContract={actions.setTokenContract}
        tokenAmount={state.tokenAmount}
        setTokenAmount={actions.setTokenAmount}
        selectedCategory={state.selectedCategory}
        setSelectedCategory={actions.setSelectedCategory}
      />

      <PostActionBar
        imageInputRef={refs.imageInputRef}
        videoInputRef={refs.videoInputRef}
        audioInputRef={refs.audioInputRef}
        onImageSelect={actions.handleImageSelect}
        onVideoSelect={actions.handleVideoSelect}
        onAudioSelect={actions.handleAudioSelect}
        onStartRecording={actions.startRecording}
        liveMode={state.liveMode}
        setLiveMode={actions.setLiveMode}
        onInsertFormatting={actions.insertFormatting}
        onInsertEmoji={actions.insertEmoji}
        onInsertGif={actions.insertGif}
        onCameraCapture={actions.openCameraCapture}
        onEnhanceWithAI={actions.handleEnhanceWithAI}
        onPost={actions.handlePost}
        canPost={computed.canPost}
        isEnhancing={state.isEnhancing}
        isPosting={state.isPosting}
        
        hasText={!!state.text.trim()}
        hasImage={computed.hasImage}
        hasVideo={computed.hasVideo}
        isScheduled={!!state.scheduledDate}
      />
    </>
  );

  // Prevent drawer from closing when camera is open
  const handleDrawerChange = (open: boolean) => {
    if (!open && state.isCameraModalOpen) return; // Don't close if camera is active
    if (!open) handleClose();
  };

  // Use Drawer/Sheet on ALL devices (mobile, tablet, desktop)
  return (
    <>
      <Drawer open={isOpen} onOpenChange={handleDrawerChange}>
        <DrawerContent 
          glass 
          hideHandle 
          className={cn(
            "max-h-[90vh] max-h-[90dvh]",
            state.isCameraModalOpen && "invisible pointer-events-none"
          )}
        >
          <VisuallyHidden>
            <DrawerTitle>Create a post</DrawerTitle>
          </VisuallyHidden>
          {modalContent}
        </DrawerContent>
      </Drawer>

      <CameraCaptureModal
        isOpen={state.isCameraModalOpen}
        onClose={actions.closeCameraCapture}
        onVideoRecorded={actions.handleCameraVideoRecorded}
        onPhotoCaptured={actions.handleCameraPhotoCaptured}
      />
    </>
  );
}
