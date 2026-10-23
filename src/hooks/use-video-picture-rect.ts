import { useEffect, useState, type RefObject } from 'react';
import { containedPicture, type PictureRect } from '@/lib/live-overlay/layout';

export interface VideoPicture extends PictureRect {
  portrait: boolean;
}

const EMPTY: VideoPicture = { left: 0, top: 0, width: 0, height: 0, portrait: false };

/**
 * Where a video's picture is, in the coordinates of the layer drawn over it.
 *
 * Measured against the `<video>` element's own box, not the layer's: in
 * fullscreen with chat open the container also holds the chat column, so the
 * picture sits in only part of it. Inside that box the frame is drawn
 * `object-contain`, so the picture is narrower still on a letterboxed stream.
 *
 * Kept current across resizes, rotation, fullscreen and a change of stream
 * resolution: a WebRTC stream can switch size mid-broadcast, and a screen share
 * handing over to a camera turns a landscape picture portrait with no change to
 * either box.
 */
export function useVideoPictureRect(
  layerRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
): VideoPicture {
  const [picture, setPicture] = useState<VideoPicture>(EMPTY);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    let frame = 0;
    let video: HTMLVideoElement | null = null;

    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const v = videoRef.current;
        const layerBox = layer.getBoundingClientRect();
        const videoBox = v ? v.getBoundingClientRect() : layerBox;
        const vw = v?.videoWidth ?? 0;
        const vh = v?.videoHeight ?? 0;
        const inVideo = containedPicture(videoBox.width, videoBox.height, vw, vh);
        const next: VideoPicture = {
          left: videoBox.left - layerBox.left + inVideo.left,
          top: videoBox.top - layerBox.top + inVideo.top,
          width: inVideo.width,
          height: inVideo.height,
          portrait: vw > 0 && vh > vw,
        };
        setPicture((prev) =>
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.height === next.height &&
          prev.portrait === next.portrait
            ? prev
            : next,
        );
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(layer);

    // The <video> can mount after the layer (it waits on playback being
    // allowed) and is swapped between a live and a replay element, so it is
    // re-attached whenever a different one appears.
    const attach = () => {
      const v = videoRef.current;
      if (v === video) return;
      if (video) {
        observer.unobserve(video);
        video.removeEventListener('loadedmetadata', measure);
        video.removeEventListener('resize', measure);
      }
      video = v;
      if (video) {
        observer.observe(video);
        video.addEventListener('loadedmetadata', measure);
        video.addEventListener('resize', measure);
      }
      measure();
    };

    attach();
    const poll = window.setInterval(attach, 1000);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(poll);
      observer.disconnect();
      video?.removeEventListener('loadedmetadata', measure);
      video?.removeEventListener('resize', measure);
    };
  }, [layerRef, videoRef]);

  return picture;
}
