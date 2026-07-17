/**
 * Client-side watermarking utility
 * Adds DeHub logo watermark to images using HTML Canvas API
 */

// DeHub logo as base64 (white logo for watermark)
const DEHUB_LOGO_BASE64 = `data:image/png;base64,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`;

/**
 * Adds a DeHub watermark to an image on the client side
 * @param imageDataUrl - The image as a data URL (base64)
 * @returns Promise<string> - The watermarked image as a data URL
 */
export async function addWatermarkClient(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mainImage = new Image();
    mainImage.crossOrigin = 'anonymous';
    
    mainImage.onload = () => {
      try {
        // Create canvas with main image dimensions
        const canvas = document.createElement('canvas');
        canvas.width = mainImage.width;
        canvas.height = mainImage.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          console.error('Could not get canvas context');
          resolve(imageDataUrl); // Return original if canvas fails
          return;
        }
        
        // Draw main image
        ctx.drawImage(mainImage, 0, 0);
        
        const logoImage = new Image();
        logoImage.onload = () => {
          try {
            // Calculate watermark size (scale to ~12% of image width, max 150px)
            const targetWidth = Math.min(Math.floor(mainImage.width * 0.12), 150);
            const scaleFactor = targetWidth / logoImage.width;
            const targetHeight = Math.floor(logoImage.height * scaleFactor);
            
            // Position: bottom-right corner with padding
            const padding = 15;
            const x = mainImage.width - targetWidth - padding;
            const y = mainImage.height - targetHeight - padding;
            
            // Apply transparency and draw watermark
            ctx.globalAlpha = 0.6;
            ctx.drawImage(logoImage, x, y, targetWidth, targetHeight);
            ctx.globalAlpha = 1.0;
            
            // Export as data URL
            const result = canvas.toDataURL('image/png');
            console.log('Watermark applied successfully on client');
            resolve(result);
          } catch (err) {
            console.error('Error applying watermark:', err);
            resolve(imageDataUrl); // Return original on error
          }
        };
        
        logoImage.onerror = () => {
          console.error('Failed to load watermark logo');
          resolve(imageDataUrl); // Return original if logo fails to load
        };
        
        logoImage.src = DEHUB_LOGO_BASE64;
      } catch (err) {
        console.error('Error in watermark process:', err);
        resolve(imageDataUrl); // Return original on error
      }
    };
    
    mainImage.onerror = () => {
      console.error('Failed to load main image for watermarking');
      resolve(imageDataUrl); // Return original if image fails to load
    };
    
    mainImage.src = imageDataUrl;
  });
}
