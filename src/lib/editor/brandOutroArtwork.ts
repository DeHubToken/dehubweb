import type { BrandOutroArtwork } from "./brandOutro";
import { BRAND_OUTRO_SOURCES } from "./brandOutroSources";

let artworkPromise: Promise<BrandOutroArtwork> | undefined;

/** The official icon and font are embedded for offline exports. */
export function loadBrandOutroArtwork(): Promise<BrandOutroArtwork> {
  if (artworkPromise) return artworkPromise;
  const sources = BRAND_OUTRO_SOURCES;
  const mark = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the export icon"));
    image.src = sources.mark;
  });
  const font = typeof FontFace === "function" && document.fonts
    ? new FontFace("DeHubOutro", "url(" + sources.font + ")", { weight: "500" }).load().then(face => { document.fonts.add(face); })
    : Promise.resolve();
  artworkPromise = Promise.all([mark, font]).then(([image]) => {
    const logo = document.createElement("canvas");
    logo.width = 256;
    logo.height = Math.ceil(256 * 1184 / 908);
    const ctx = logo.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the export icon");
    ctx.drawImage(image, 502, 236, 908, 1184, 0, 0, logo.width, logo.height);
    return { logo };
  }).catch(error => { artworkPromise = undefined; throw error; });
  return artworkPromise;
}
