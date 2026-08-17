import type { FilterSettings, FilterPreset, CropSettings } from '@/features/post/types/filters';
import { DEFAULT_FILTER_SETTINGS } from '@/features/post/types/filters';

/**
 * Converts FilterSettings to a CSS filter string
 */
export function generateFilterCSS(settings: FilterSettings): string {
  const filters: string[] = [];

  if (settings.brightness !== 100) {
    filters.push(`brightness(${settings.brightness / 100})`);
  }
  if (settings.contrast !== 100) {
    filters.push(`contrast(${settings.contrast / 100})`);
  }
  if (settings.saturation !== 100) {
    filters.push(`saturate(${settings.saturation / 100})`);
  }
  if (settings.grayscale > 0) {
    filters.push(`grayscale(${settings.grayscale / 100})`);
  }
  if (settings.sepia > 0) {
    filters.push(`sepia(${settings.sepia / 100})`);
  }
  if (settings.hueRotate !== 0) {
    filters.push(`hue-rotate(${settings.hueRotate}deg)`);
  }
  if (settings.blur > 0) {
    filters.push(`blur(${settings.blur}px)`);
  }

  return filters.length > 0 ? filters.join(' ') : 'none';
}

/**
 * Returns default/neutral filter settings
 */
export function getDefaultSettings(): FilterSettings {
  return { ...DEFAULT_FILTER_SETTINGS };
}

/**
 * Blends a preset with custom adjustments
 */
export function blendWithPreset(
  preset: FilterPreset,
  adjustments: Partial<FilterSettings>
): FilterSettings {
  return {
    ...preset.settings,
    ...adjustments,
  };
}

/**
 * Check if settings differ from default (no filter applied)
 */
export function hasFilterApplied(settings?: FilterSettings): boolean {
  if (!settings) return false;
  
  return (
    settings.brightness !== 100 ||
    settings.contrast !== 100 ||
    settings.saturation !== 100 ||
    settings.grayscale !== 0 ||
    settings.sepia !== 0 ||
    settings.hueRotate !== 0 ||
    settings.blur !== 0
  );
}

/**
 * Check if crop settings differ from the identity (nothing to bake).
 */
export function hasCropApplied(settings?: CropSettings): boolean {
  if (!settings) return false;
  const box = settings.cropBox;
  const boxChanged = !!box && (box.x !== 0 || box.y !== 0 || box.width !== 100 || box.height !== 100);
  return settings.rotation !== 0 || settings.flipX || settings.flipY || boxChanged;
}

/**
 * Bake the composer's filter + crop/rotate settings into the image file that
 * actually uploads.
 *
 * The editors only ever STORED settings; the upload shipped the original
 * bytes, so everything a user did in the filter and crop sheets silently
 * vanished at post time. The canvas here replays exactly what the preview
 * shows: ctx.filter takes the same generateFilterCSS string, and the
 * orientation pass mirrors generateCropTransform's `rotate() scale()` order.
 * The crop box percentages are relative to the rotated frame, as drawn in the
 * crop editor.
 *
 * Fails open — any error returns the original file, because "posted without
 * the filter" beats "could not post".
 */
export async function applyEditsToImageFile(
  file: File,
  filterSettings?: FilterSettings,
  cropSettings?: CropSettings,
): Promise<File> {
  // A canvas draw flattens an animated GIF to its first frame — worse than
  // posting the original unedited.
  if (file.type === 'image/gif') return file;

  const bakeFilter = hasFilterApplied(filterSettings);
  const bakeCrop = hasCropApplied(cropSettings);
  if (!bakeFilter && !bakeCrop) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);

    const rotation = (((cropSettings?.rotation ?? 0) % 360) + 360) % 360;
    const quarterTurned = rotation === 90 || rotation === 270;
    const baseW = quarterTurned ? bitmap.height : bitmap.width;
    const baseH = quarterTurned ? bitmap.width : bitmap.height;

    // Pass 1: orientation + filter, full frame.
    const stage = document.createElement('canvas');
    stage.width = baseW;
    stage.height = baseH;
    const sctx = stage.getContext('2d');
    if (!sctx) return file;
    if (bakeFilter && filterSettings) {
      // Engines without ctx.filter ignore the assignment: the crop still
      // bakes and the image posts unfiltered, same as before this existed.
      sctx.filter = generateFilterCSS(filterSettings);
    }
    sctx.translate(baseW / 2, baseH / 2);
    sctx.rotate((rotation * Math.PI) / 180);
    sctx.scale(cropSettings?.flipX ? -1 : 1, cropSettings?.flipY ? -1 : 1);
    sctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    // Pass 2: the crop box, in percentages of the oriented frame.
    const box = cropSettings?.cropBox;
    const sx = box ? (box.x / 100) * baseW : 0;
    const sy = box ? (box.y / 100) * baseH : 0;
    const sw = box ? (box.width / 100) * baseW : baseW;
    const sh = box ? (box.height / 100) * baseH : baseH;

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw));
    out.height = Math.max(1, Math.round(sh));
    const octx = out.getContext('2d');
    if (!octx) return file;
    octx.drawImage(stage, sx, sy, sw, sh, 0, 0, out.width, out.height);

    // PNG/WebP keep their type (transparency); everything else goes out JPEG.
    const outType = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, outType, 0.92));
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type });
  } catch (err) {
    console.warn('[Filters] Could not bake edits, posting the original:', err);
    return file;
  } finally {
    bitmap?.close?.();
  }
}

/**
 * Apply filter to an image using canvas and return a blob URL
 */
export async function applyFilterToImage(
  imageUrl: string,
  settings: FilterSettings
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Apply the filter
      ctx.filter = generateFilterCSS(settings);
      ctx.drawImage(img, 0, 0);
      
      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, 'image/jpeg', 0.92);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}
