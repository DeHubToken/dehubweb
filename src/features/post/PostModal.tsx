import { useEffect, useState, useMemo } from 'react';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { usePostForm } from './hooks/usePostForm';
import { usePostSound } from './hooks/usePostSound';
import { PostContentArea } from './components/PostContentArea';
import { PostAccessToggles } from './components/PostAccessToggles';
import { PostActionBar } from './components/PostActionBar';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { SoundPicker } from './components/SoundPicker';
import { cn } from '@/lib/utils';
import { extractCommunitySlug } from '@/components/app/communities/CommunityLinkEmbed';

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: FileList | null;
  onFilesProcessed?: () => void;
  initialText?: string;
  initialCategory?: string;
}

export function PostModal({ isOpen, onClose, initialFiles, onFilesProcessed, initialText, initialCategory }: PostModalProps) {
  const { state, actions, computed, refs } = usePostForm(onClose);
  const { attachedSound, selectSound, clearSound } = usePostSound();
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);

  // Extract community slug from initialText (if it's a community share link)
  const communitySlug = useMemo(() => {
    if (!initialText) return null;
    return extractCommunitySlug(initialText);
  }, [initialText]);

  // Set initial text when modal opens — put it straight in the editor
  useEffect(() => {
    if (isOpen && initialText) {
      actions.setText(initialText);
    }
  }, [isOpen, initialText]);

  // Set initial category when modal opens
  useEffect(() => {
    if (isOpen && initialCategory) {
      actions.setSelectedCategory(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Process initial files when modal opens with pending files
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      actions.handleFileDrop(initialFiles);
      onFilesProcessed?.();
    }
  }, [isOpen, initialFiles, actions.handleFileDrop, onFilesProcessed]);

  const handleClose = () => {
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
        canPost={computed.canPost || !!communitySlug}
        destinations={computed.destinations}
        hasVideo={computed.hasVideo}
        hasImage={computed.hasImage}
        hasAudio={computed.hasAudio}
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
        showTitle={state.showTitle}
        titleText={state.titleText}
        setTitleText={actions.setTitleText}
        onOpenCategories={() => setCategoryDrawerOpen(true)}
        communitySlug={communitySlug}
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
        markCategorySaved={actions.markCategorySaved}
        showTitle={state.showTitle}
        setShowTitle={actions.setShowTitle}
        hasVideoOrAudio={computed.hasVideo || computed.hasAudio}
        categoryDrawerOpen={categoryDrawerOpen}
        setCategoryDrawerOpen={setCategoryDrawerOpen}
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
        onPost={() => {
          // Inject soundtrack metadata into description before posting
          if (attachedSound) {
            const tag = `[soundtrack:${attachedSound.tokenId}:${attachedSound.title}:${attachedSound.creator}]`;
            const currentDesc = state.text;
            if (!currentDesc.includes('[soundtrack:')) {
              actions.setText(currentDesc + (currentDesc ? '\n' : '') + tag);
            }
          }
          // Small delay to let state update, then post
          setTimeout(() => actions.handlePost(), 50);
        }}
        canPost={computed.canPost}
        isEnhancing={state.isEnhancing}
        isPosting={state.isPosting}
        uploadProgress={state.uploadProgress}
        
        hasText={!!state.text.trim()}
        hasImage={computed.hasImage}
        hasVideo={computed.hasVideo}
        isScheduled={!!state.scheduledDate}
        onOpenCategories={() => setCategoryDrawerOpen(true)}
        onOpenSoundPicker={() => setSoundPickerOpen(true)}
        attachedSound={attachedSound}
        onClearSound={clearSound}
        onCloseModal={handleClose}
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

      <SoundPicker
        isOpen={soundPickerOpen}
        onClose={() => setSoundPickerOpen(false)}
        onSelect={selectSound}
        currentSound={attachedSound}
      />
    </>
  );
}
