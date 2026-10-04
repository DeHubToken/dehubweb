import { isVideoInPictureInPicture } from './picture-in-picture';

/** A hidden tab or native PiP must not be treated as scrolling past a video. */
export function isVideoOutsideFeed(video: HTMLVideoElement | null): boolean {
  return document.hidden || isVideoInPictureInPicture(video);
}
