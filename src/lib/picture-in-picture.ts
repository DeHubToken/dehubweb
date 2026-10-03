type SafariVideo = HTMLVideoElement & { webkitPresentationMode?: string };

export function isVideoInPictureInPicture(video: HTMLMediaElement | null): boolean {
  return !!video && (document.pictureInPictureElement === video ||
    (video as SafariVideo).webkitPresentationMode === 'picture-in-picture');
}

/** Keep the actual element and its transport until the user closes PiP. */
export function releaseAfterPictureInPicture(video: HTMLVideoElement, release: () => void): void {
  if (!isVideoInPictureInPicture(video)) { release(); return; }
  let released = false;
  const finish = () => {
    if (released || isVideoInPictureInPicture(video)) return;
    released = true;
    video.removeEventListener('leavepictureinpicture', finish);
    video.removeEventListener('webkitpresentationmodechanged', finish);
    const parking = video.parentElement;
    release();
    if (parking?.dataset.pipParking === 'true') parking.remove();
  };
  video.addEventListener('leavepictureinpicture', finish);
  video.addEventListener('webkitpresentationmodechanged', finish);
  // Passive cleanup may run after React has removed the source page. Reattach
  // in this task so the browser never sees a detached, abandoned PiP element.
  if (!video.isConnected) {
    const parking = document.createElement('div');
    parking.dataset.pipParking = 'true';
    parking.style.cssText = 'position:fixed;left:-2px;top:-2px;width:1px;height:1px;overflow:hidden;pointer-events:none';
    document.body.appendChild(parking);
    parking.appendChild(video);
  }
}
