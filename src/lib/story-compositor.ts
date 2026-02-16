/**
 * Story Compositor
 * ================
 * Utility to burn overlays (emoji stickers, text) into the final video.
 * Uses canvas to composite overlays onto video frames.
 */

import { StoryOverlay } from '@/components/app/stories/types';

interface CompositeOptions {
  videoBlob: Blob;
  overlays: StoryOverlay[];
  width?: number;
  height?: number;
}

/**
 * Draws overlays onto a canvas context.
 * Used for both preview thumbnail and video compositing.
 */
export function drawOverlaysOnCanvas(
  ctx: CanvasRenderingContext2D,
  overlays: StoryOverlay[],
  canvasWidth: number,
  canvasHeight: number
): void {
  overlays.forEach((overlay) => {
    const x = (overlay.x / 100) * canvasWidth;
    const y = (overlay.y / 100) * canvasHeight;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(overlay.scale, overlay.scale);
    ctx.rotate((overlay.rotation * Math.PI) / 180);

    if (overlay.type === 'emoji') {
      // Draw emoji
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(overlay.content, 0, 0);
    } else if (overlay.type === 'text' && overlay.style) {
      // Draw text with styling
      const fontSize = 24;
      ctx.font = overlay.style.textStyle === 'bold' 
        ? `bold ${fontSize}px sans-serif` 
        : `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const metrics = ctx.measureText(overlay.content);
      const textWidth = metrics.width;
      const textHeight = fontSize;

      if (overlay.style.textStyle === 'background') {
        // Draw background
        ctx.fillStyle = overlay.style.color;
        ctx.beginPath();
        ctx.roundRect(-textWidth / 2 - 12, -textHeight / 2 - 4, textWidth + 24, textHeight + 8, 8);
        ctx.fill();
        // Text color is inverted
        ctx.fillStyle = overlay.style.color === '#FFFFFF' ? '#000000' : '#FFFFFF';
      } else if (overlay.style.textStyle === 'outlined') {
        // Draw outline
        ctx.strokeStyle = overlay.style.color;
        ctx.lineWidth = 3;
        ctx.strokeText(overlay.content, 0, 0);
        ctx.fillStyle = 'transparent';
      } else {
        ctx.fillStyle = overlay.style.color;
      }

      if (overlay.style.textStyle !== 'outlined') {
        ctx.fillText(overlay.content, 0, 0);
      }
    }

    ctx.restore();
  });
}

/**
 * Creates a thumbnail image with overlays burned in.
 */
export async function createThumbnailWithOverlays(
  videoBlob: Blob,
  overlays: StoryOverlay[],
  targetTime = 0
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoBlob);
    
    video.onloadedmetadata = () => {
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Draw video frame
      ctx.drawImage(video, 0, 0);
      
      // Draw overlays
      drawOverlaysOnCanvas(ctx, overlays, canvas.width, canvas.height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }
        },
        'image/jpeg',
        0.9
      );
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    };

    video.src = url;
  });
}

/**
 * Composites overlays onto a video.
 * This is a simplified version that creates a thumbnail.
 * Full video compositing with overlays would require a more complex
 * approach using WebCodecs or server-side processing.
 * 
 * For now, we return the original video and handle overlay rendering
 * on playback in the viewer.
 */
export async function compositeVideoWithOverlays(
  options: CompositeOptions
): Promise<{ video: Blob; thumbnail: Blob; overlays: StoryOverlay[] }> {
  const { videoBlob, overlays } = options;
  
  // Create thumbnail with overlays burned in
  const thumbnail = await createThumbnailWithOverlays(videoBlob, overlays);
  
  // Return original video with overlay metadata
  // The viewer will render overlays on top of the video
  return {
    video: videoBlob,
    thumbnail,
    overlays,
  };
}
