import { useAccountDraftKey, useDraftState } from '@/hooks/use-draft-state';
import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { postTextLimit } from '@/lib/post-text-limit';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { usePostForm } from './hooks/usePostForm';
import { usePostSound } from './hooks/usePostSound';
import { buildSoundtrackTag } from '@/lib/soundtrack';
import type { PollData, LiveStreamHandoff } from './types';
import { PostContentArea } from './components/PostContentArea';
import { PostAccessToggles } from './components/PostAccessToggles';
import { PostActionBar } from './components/PostActionBar';
import { ArticleComposer } from './components/ArticleComposer';
import { CrossPostPicker } from './components/CrossPostPicker';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { SoundPicker } from './components/SoundPicker';
import { cn } from '@/lib/utils';
import { useKeyboardSafeSheet } from '@/hooks/use-keyboard-open';
import { BannedAccountNotice } from '@/components/app/BannedAccountNotice';
import { useBannedAccount } from '@/hooks/use-banned-account';
import { QuotedPostEmbed } from '@/components/app/cards/QuotedPostEmbed';
import type { DeHubNFT } from '@/lib/api/dehub/types';

const CreatePlanModal = lazy(() =>
  import('@/components/app/subscriptions/CreatePlanModal').then((module) => ({
    default: module.CreatePlanModal,
  })),
);
const ScheduledLivestreams = lazy(() => import('./components/ScheduledLivestreams'));

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles?: FileList | null;
  onFilesProcessed?: () => void;
  initialText?: string;
  initialCategory?: string;
  initialPoll?: PollData | null;
  /** Open on the Livestream tab instead of Post. */
  initialLiveMode?: 'video';
  /**
   * Quote this post. Same composer — media, poll, rating, mint — minus what a
   * quote cannot be: a livestream, stage, article, scheduled or paywalled post.
   */
  quotedPost?: DeHubNFT | null;
}

function PostModalForAccount({ isOpen, onClose, initialFiles, onFilesProcessed, initialText, initialCategory, initialPoll, initialLiveMode, draftScope, quotedPost }: PostModalProps & { draftScope: string }) {
  const isQuoting = !!quotedPost;
  const { style: keyboardStyle } = useKeyboardSafeSheet(isOpen);
  const { isBanned } = useBannedAccount();
  // Where a live post goes once its mint has provisioned the stream. Held here
  // rather than in the action bar so it survives the bar's own re-renders, and
  // cleared on close so reopening the composer never reopens a dead broadcast.
  const [liveStream, setLiveStream] = useState<LiveStreamHandoff | null>(null);
  const [articleMode, setArticleMode] = useDraftState(draftScope + ':articleMode', false);
  const [articleBody, setArticleBody] = useDraftState(draftScope + ':articleBody', '');
  const finishPost = () => { setArticleBody.complete(articleBody, ''); setArticleBody.clear(); setArticleMode(false); setArticleMode.clear(); onClose(); };
  const { state, actions, computed, refs } = usePostForm(finishPost, setLiveStream, draftScope, quotedPost);
  const { attachedSound, selectSound, clearSound } = usePostSound();
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [soundPickerOpen, setSoundPickerOpen] = useState(false);
  const [planDrawerOpen, setPlanDrawerOpen] = useState(false);
  const [mediaFullscreenOpen, setMediaFullscreenOpen] = useState(false);
  const [articleImage, setArticleImage] = useState<File | null>(null);
  const [articleImagePreview, setArticleImagePreview] = useState('');
  const saveArticleDraft = () => {
    const done = () => { actions.resetForm(); finishPost(); };
    draftImageData(articleImage)
      .then(imageData => actions.saveDraft({ body: articleBody, title: state.titleText, imageData, socialData: imageData }))
      .catch(() => actions.saveDraft({ body: articleBody, title: state.titleText }))
      .finally(done);
  };
  const draftImageData = async (file: File | null): Promise<string | undefined> => {
    if (!file) return undefined;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / bitmap.width, 1200 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.78);
  };
  const restoreDraftImage = async (data: string | undefined, name: string, setter: (file: File | null) => void) => {
    if (!data?.startsWith('data:image/jpeg;base64,')) { setter(null); return; }
    const blob = await (await fetch(data)).blob();
    setter(new File([blob], name, { type: 'image/jpeg' }));
  };

  useEffect(() => {
    if (!articleImage) { setArticleImagePreview(''); return; }
    const url = URL.createObjectURL(articleImage);
    setArticleImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [articleImage]);

  const handleTogglePoll = useCallback(() => {
    if (state.poll) {
      actions.setPoll(null);
    } else {
      actions.setPoll({
        question: '',
        options: [
          { id: '1', text: '' },
          { id: '2', text: '' },
        ],
        duration: 24,
        isMultipleChoice: false,
      });
    }
  }, [state.poll, actions.setPoll]);


  // When opening from share (initialText provided), reset form first for a fresh start
  useEffect(() => {
    if (isOpen && initialText) {
      if (!state.text) actions.setText(initialText);
    }
  }, [isOpen, initialText]);

  // Opened from the Live feed's + button: land on Livestream, not Post. The
  // modal stays mounted between opens, so a later open from anywhere else
  // hands back the Post tab instead of inheriting Livestream.
  const liveModeFromOpenerRef = useRef(false);
  useEffect(() => {
    if (!isOpen) return;
    if (initialLiveMode) {
      setArticleMode(false);
      actions.setLiveMode(initialLiveMode);
      liveModeFromOpenerRef.current = true;
    } else if (liveModeFromOpenerRef.current) {
      actions.setLiveMode(null);
      liveModeFromOpenerRef.current = false;
    }
  }, [isOpen, initialLiveMode, setArticleMode]);

  // Set initial category when modal opens
  useEffect(() => {
    if (isOpen && initialCategory) {
      actions.setSelectedCategory.initialize(initialCategory);
    }
  }, [isOpen, initialCategory]);

  // Pre-initialize poll when opened with initialPoll
  useEffect(() => {
    if (isOpen && initialPoll) {
      actions.setPoll.initialize(initialPoll);
    }
  }, [isOpen, initialPoll]);

  // Process initial files when modal opens with pending files
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      actions.handleFileDrop(initialFiles);
      onFilesProcessed?.();
    }
  }, [isOpen, initialFiles, actions.handleFileDrop, onFilesProcessed]);

  const handleClose = () => {
    // A finished broadcast must not be able to reopen itself the next time the
    // composer is opened.
    setLiveStream(null);
    setPlanDrawerOpen(false);
    onClose();
  };

  const selectPostMode = () => {
    setArticleMode(false);
    actions.setLiveMode(null);
    actions.setShowTitle(false);
  };

  const selectLiveMode = (mode: 'video' | 'townhall') => {
    setArticleMode(false);
    actions.setLiveMode(mode);
  };

  const selectArticleMode = () => {
    setArticleMode(true);
    actions.setShowTitle(true);
    actions.setLiveMode(null);
    actions.setIsPPV(false);
    actions.setIsTokenGated(false);
    actions.setIsSubscribersOnly(false);
  };

  // A banned account can read every post on DeHub and write none of them.
  // The API refuses the mint either way; showing the composer first would
  // only mean losing whatever was typed into it.
  const modalContent = isBanned ? (
    <div className="px-4 py-8">
      <BannedAccountNotice />
    </div>
  ) : (
    <>
      {!isQuoting && (
      <div className="flex items-center justify-center gap-3 px-4 pt-4 pb-1 text-xs font-medium">
        <button type="button" aria-pressed={!articleMode && state.liveMode === null} onClick={selectPostMode} className={cn('transition-colors', !articleMode && state.liveMode === null ? 'text-white' : 'text-white/55 hover:text-white')}>Post</button>
        <span className="text-white/25" aria-hidden="true">|</span>
        <button type="button" aria-pressed={state.liveMode === 'video'} onClick={() => selectLiveMode('video')} className={cn('transition-colors', state.liveMode === 'video' ? 'text-white' : 'text-white/55 hover:text-white')}>Livestream</button>
        <span className="text-white/25" aria-hidden="true">|</span>
        <button type="button" aria-pressed={state.liveMode === 'townhall'} onClick={() => selectLiveMode('townhall')} className={cn('transition-colors', state.liveMode === 'townhall' ? 'text-white' : 'text-white/55 hover:text-white')}>Stages</button>
        <span className="text-white/25" aria-hidden="true">|</span>
        <button type="button" aria-pressed={articleMode} onClick={selectArticleMode} className={cn('transition-colors', articleMode ? 'text-white' : 'text-white/55 hover:text-white')}>Article</button>
      </div>
      )}

      {articleMode ? (
        <ArticleComposer
          title={state.titleText}
          setTitle={actions.setTitleText}
          summary={state.text}
          setSummary={actions.setText}
          body={articleBody}
          setBody={setArticleBody}
          coverPreview={articleImagePreview}
          onCoverChange={setArticleImage}
          onSaveDraft={saveArticleDraft}
          onPublish={() => actions.handlePost({ articleBody: articleBody.trim(), articleImage: articleImage || undefined, socialImage: articleImage || undefined })}
          formReady={computed.canPost && !computed.hasVideo && !computed.hasImage && !computed.hasAudio}
          isPosting={state.isPosting}
          uploadProgress={state.uploadProgress ?? 0}
          mintAwaitingWallet={!!state.mintAwaitingWallet}
          onAbandonMint={actions.abandonMint}
        />
      ) : (
      <>
      {isOpen && state.liveMode === 'video' && <Suspense fallback={null}><ScheduledLivestreams onStart={setLiveStream} /></Suspense>}
      <PostContentArea
        text={state.text}
        maxChars={postTextLimit(computed.postQuota)}
        setText={actions.setText}
        editorRef={refs.editorRef}
        media={state.media}
        onRemoveMedia={actions.removeMedia}
        onMoveMedia={actions.moveMedia}
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
        onReplaceImage={actions.replaceImageFile}
        liveMode={state.liveMode}
        canPost={computed.canPost}
        destinations={computed.destinations}
        hasVideo={computed.hasVideo}
        hasImage={computed.hasImage}
        hasAudio={computed.hasAudio}
        onFileDrop={actions.handleFileDrop}
        scheduledDate={state.scheduledDate}
        onSchedule={actions.setScheduledDate}
        drafts={state.drafts}
        onSaveDraft={() => {
          // The draft is the copy of record from here on, so the composer is
          // emptied and closed behind it. It used to stay open holding the same
          // content — and because the composer is mounted behind a one-way
          // latch, that content was still sitting there on the next open,
          // one Post away from being published or saved twice.
          actions.saveDraft();
          actions.resetForm();
          handleClose();
        }}
        onLoadDraft={draft => {
          actions.loadDraft(draft);
          if (draft.articleBody) {
            setArticleMode(true);
            setArticleBody(draft.articleBody);
            actions.setTitleText(draft.articleTitle || '');
            actions.setShowTitle(true);
            void restoreDraftImage(draft.socialImageData || draft.articleImageData, 'article-share-image.jpg', setArticleImage);
          } else {
            // Loading a plain draft while the article editor is open used to
            // leave the article's body and cover sitting under the new text.
            setArticleMode(false);
            setArticleBody.complete(articleBody, '');
            setArticleImage(null);
          }
        }}
        onDeleteDraft={actions.deleteDraft}
        canSaveDraft={computed.hasContent}
        isRecording={state.isRecording}
        recordingTime={state.recordingTime}
        onStopRecording={actions.stopRecording}
        showTitle={state.showTitle}
        titleText={state.titleText}
        setTitleText={actions.setTitleText}
        onOpenCategories={() => setCategoryDrawerOpen(true)}
        poll={state.poll}
        onPollChange={actions.setPoll}
        onMediaFullscreenChange={setMediaFullscreenOpen}
        hideScheduleAndDrafts={isQuoting}
      />
      {quotedPost && (
        // Shown as it will appear under the quote. Not a link from here —
        // tapping it mid-compose would navigate away from the draft.
        <div className="px-4 pb-3 pointer-events-none">
          <QuotedPostEmbed quotedPost={quotedPost} />
        </div>
      )}
      <PostAccessToggles
        draftScope={draftScope}
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
        tokenSymbol={state.tokenSymbol}
        setTokenSymbol={actions.setTokenSymbol}
        tokenAmount={state.tokenAmount}
        setTokenAmount={actions.setTokenAmount}
        postChainId={state.chainId}
        selectedCategory={state.selectedCategory}
        setSelectedCategory={actions.setSelectedCategory}
        markCategorySaved={actions.markCategorySaved}
        showTitle={state.showTitle}
        setShowTitle={actions.setShowTitle}
        isMature={state.isMature}
        setIsMature={actions.setIsMature}
        isForKids={state.isForKids}
        setIsForKids={actions.setIsForKids}
        shopLinks={state.shopLinks}
        setShopLinks={actions.setShopLinks}
        shopListingIds={state.shopListingIds}
        setShopListingIds={actions.setShopListingIds}
        hasVideoOrAudio={computed.hasVideo || computed.hasAudio}
        categoryDrawerOpen={categoryDrawerOpen}
        setCategoryDrawerOpen={setCategoryDrawerOpen}
        shouldMint={state.shouldMint}
        setShouldMint={actions.setShouldMint}
        mintFeeLabel={computed.mintFeeLabel}
        mintRequired={computed.mintRequired}
        onCreatePlan={() => setPlanDrawerOpen(true)}
        quoteMode={isQuoting}
      />

      <PostActionBar
        extraTool={!state.liveMode && !isQuoting ? <CrossPostPicker onNavigateAway={handleClose} /> : undefined}
        hideLive={isQuoting}
        imageInputRef={refs.imageInputRef}
        videoInputRef={refs.videoInputRef}
        audioInputRef={refs.audioInputRef}
        onImageSelect={actions.handleImageSelect}
        onVideoSelect={actions.handleVideoSelect}
        onAudioSelect={actions.handleAudioSelect}
        onStartRecording={actions.startRecording}
        liveMode={state.liveMode}
        liveStream={liveStream}
        setLiveMode={actions.setLiveMode}
        onInsertFormatting={actions.insertFormatting}
        onInsertEmoji={actions.insertEmoji}
        onInsertGif={actions.insertGif}
        onCameraCapture={actions.openCameraCapture}
        onEnhanceWithAI={actions.handleEnhanceWithAI}
        onPost={() => {
          const soundtrackTag = attachedSound ? buildSoundtrackTag(attachedSound) : undefined;
          actions.handlePost({ ...(soundtrackTag ? { soundtrackTag } : {}) });
        }}
        canPost={computed.canPost}
        isEnhancing={state.isEnhancing}
        isPosting={state.isPosting}
        uploadProgress={state.uploadProgress}
        mintAwaitingWallet={state.mintAwaitingWallet}
        onAbandonMint={actions.abandonMint}
        
        hasText={!!state.text.trim()}
        hasImage={computed.hasImage}
        hasVideo={computed.hasVideo}
        isScheduled={!!state.scheduledDate}
        onOpenCategories={() => setCategoryDrawerOpen(true)}
        onOpenSoundPicker={() => setSoundPickerOpen(true)}
        attachedSound={attachedSound}
        onClearSound={clearSound}
        onCloseModal={handleClose}
        onTogglePoll={handleTogglePoll}
        hasPoll={!!state.poll}
      />
      </>
      )}
    </>
  );

  // Prevent drawer from closing when camera is open
  const handleDrawerChange = (open: boolean) => {
    if (!open && (state.isCameraModalOpen || mediaFullscreenOpen)) return;
    if (!open) handleClose();
  };

  // Use Drawer/Sheet on ALL devices (mobile, tablet, desktop)
  return (
    <>
      <Drawer
        open={isOpen}
        onOpenChange={handleDrawerChange}
        repositionInputs={false}
        dismissible={!mediaFullscreenOpen}
      >
        <DrawerContent
          glass
          hideHandle
          data-post-modal
          style={keyboardStyle ?? undefined}
          // The composer opens over the feed it posts into, so on desktop it
          // takes that column rather than the whole viewport — see `column` in
          // ui/drawer.
          column
          className={cn(
            "max-h-[90dvh]",
            // The article writer is its own page, so it takes the full sheet.
            articleMode && "h-[92dvh] max-h-[92dvh] flex flex-col",
            state.isCameraModalOpen && "invisible pointer-events-none"
          )}
        >
          <VisuallyHidden>
            <DrawerTitle>{isQuoting ? 'Quote post' : 'Create a post'}</DrawerTitle>
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

      {planDrawerOpen && (
        <Suspense fallback={null}>
          <CreatePlanModal
            open={planDrawerOpen}
            onOpenChange={setPlanDrawerOpen}
            onCreated={() => actions.setIsSubscribersOnly(true)}
          />
        </Suspense>
      )}
    </>
  );
}

export function PostModal(props: PostModalProps) {
  const draftScope = props.quotedPost
    ? `post:quote:${props.quotedPost.tokenId}`
    : props.initialText ? `post:share:${props.initialText}` : 'post:new';
  const accountKey = useAccountDraftKey(draftScope);
  return <PostModalForAccount key={accountKey ?? 'guest'} {...props} draftScope={draftScope} />;
}
