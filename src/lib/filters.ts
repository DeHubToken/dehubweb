import type { FilterSettings, FilterPreset } from '@/features/post/types/filters';
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
