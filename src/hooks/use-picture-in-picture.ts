import { useEffect, useState, type RefObject } from 'react';
import { isVideoInPictureInPicture } from '@/lib/picture-in-picture';

export function usePictureInPicture(ref: RefObject<HTMLVideoElement | null>): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const sync = () => setActive(isVideoInPictureInPicture(video));
    sync();
    video.addEventListener('enterpictureinpicture', sync);
    video.addEventListener('leavepictureinpicture', sync);
    video.addEventListener('webkitpresentationmodechanged', sync);
    return () => {
      video.removeEventListener('enterpictureinpicture', sync);
      video.removeEventListener('leavepictureinpicture', sync);
      video.removeEventListener('webkitpresentationmodechanged', sync);
    };
  });
  return active;
}
