/**
 * Person segmenter
 * ================
 * The one module that touches MediaPipe. It is only ever reached through the
 * dynamic `import()` in ./background, so the tasks-vision runtime, its WASM
 * and the model weights cost nothing until a creator actually turns a
 * background effect on — and nothing at all for everyone who never goes live.
 *
 * Everything is served from our own origin. The content security policy only
 * trusts 'self' for scripts and fetches, and a go-live that silently loses its
 * background because a CDN was blocked (by policy, an ad blocker or a corporate
 * proxy) is a worse failure than one that never offered the option:
 *
 *   - The WASM loader scripts and binaries are imported with `?url`, so Vite
 *     copies them out of node_modules into /assets/ with a content hash. They
 *     then ride the same year-long immutable cache and service-worker
 *     CacheFirst as every other build file, and an upgrade of the package
 *     changes the URL by itself.
 *   - The model lives in public/models/ under a versioned name, because public
 *     files are not hashed: change the filename when the weights change.
 *
 * Both the SIMD and the scalar builds are shipped. Safari before 16.4 has no
 * WASM SIMD and would otherwise fail at instantiate; the probe below picks the
 * right one so only one ~11 MB binary is ever fetched.
 */

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import simdLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import simdBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import scalarLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import scalarBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';
import { createLogger } from '@/lib/logger';

const logger = createLogger('PersonSegmenter');

/**
 * MediaPipe's selfie segmenter, float16 (~250 KB). Downloaded once from
 * Google's mediapipe-models bucket (image_segmenter/selfie_segmenter/float16,
 * published 2023-05-07) and committed as-is.
 */
export const SELFIE_SEGMENTER_MODEL_URL = `${import.meta.env.BASE_URL}models/selfie_segmenter_float16_v1.tflite`;

export type SegmenterDelegate = 'GPU' | 'CPU';

/** Receives one frame's person confidence, 0..1 per pixel, row-major. */
export type MaskSink = (confidence: Float32Array, width: number, height: number) => void;

export interface PersonSegmenter {
  readonly delegate: SegmenterDelegate;
  /**
   * Segments one frame synchronously. `sink` is called before this returns,
   * and the array it receives is only valid inside the call — MediaPipe frees
   * the mask straight after — so read it there rather than keeping it.
   */
  segment: (input: TexImageSource, timestampMs: number, sink: MaskSink) => void;
  close: () => void;
}

async function resolveFileset() {
  const simd = await FilesetResolver.isSimdSupported().catch(() => false);
  return simd
    ? { wasmLoaderPath: simdLoaderUrl, wasmBinaryPath: simdBinaryUrl }
    : { wasmLoaderPath: scalarLoaderUrl, wasmBinaryPath: scalarBinaryUrl };
}

export async function createPersonSegmenter(): Promise<PersonSegmenter> {
  const fileset = await resolveFileset();

  /*
   * GPU first: on anything with WebGL2 it is several times faster than the
   * CPU path and keeps segmentation inside a 30fps frame budget. It fails at
   * creation (no WebGL2, a blocklisted driver) rather than mid-stream, so a
   * single retry on CPU is enough.
   */
  let lastError: unknown = null;
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const task = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SELFIE_SEGMENTER_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      });
      logger.info('Person segmenter ready', { delegate, simd: fileset.wasmBinaryPath === simdBinaryUrl });
      return wrap(task, delegate);
    } catch (error) {
      lastError = error;
      logger.warn(`Person segmenter could not start on ${delegate}`, error);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('The person segmenter failed to load.');
}

function wrap(task: ImageSegmenter, delegate: SegmenterDelegate): PersonSegmenter {
  // VIDEO mode rejects a timestamp that is not strictly greater than the last
  // one, and two frames can land on the same millisecond.
  let lastTimestamp = -1;
  return {
    delegate,
    segment: (input, timestampMs, sink) => {
      const timestamp = Math.max(Math.floor(timestampMs), lastTimestamp + 1);
      lastTimestamp = timestamp;
      task.segmentForVideo(input, timestamp, (result) => {
        const masks = result.confidenceMasks;
        // The selfie model has a single sigmoid output, which the runtime may
        // hand back as [person] alone or expanded to [background, person].
        // The person channel is the last one either way.
        const person = masks?.[masks.length - 1];
        if (!person) return;
        sink(person.getAsFloat32Array(), person.width, person.height);
      });
    },
    close: () => task.close(),
  };
}
