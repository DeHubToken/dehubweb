/**
 * A generated 3D mesh as an ordinary video clip: one slow turn of the model,
 * recorded from a WebGL canvas. Transparent where the browser can record alpha
 * (WebM VP9/VP8), otherwise on a dark studio backdrop. Pulls in three lazily.
 */
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/versioned/decoders/1.5.7/";

export interface TurntableOptions { size?: number; seconds?: number; fps?: number; signal?: AbortSignal }

/** Best recording format this browser offers, transparent first. */
export function turntableFormat(isSupported: (type: string) => boolean = t => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) {
  for (const mime of ["video/webm;codecs=vp9", "video/webm;codecs=vp8"]) if (isSupported(mime)) return { mime, ext: "webm", alpha: true };
  for (const mime of ["video/mp4;codecs=avc1", "video/mp4"]) if (isSupported(mime)) return { mime, ext: "mp4", alpha: false };
  return null;
}

/** Camera angle at a point in the turn, easing in and out so the loop reads as deliberate. */
export function turntableAngle(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) * Math.PI * 2;
}

export async function renderTurntable(url: string, options: TurntableOptions = {}): Promise<File> {
  const { size = 1080, seconds = 6, fps = 30, signal } = options;
  const format = turntableFormat();
  if (!format) throw new Error("turntable_unsupported");
  const [THREE, { GLTFLoader }, { DRACOLoader }, { RoomEnvironment }] = await Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
    import("three/addons/environments/RoomEnvironment.js"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  // A detached canvas never composites, so a stream taken from it records nothing.
  canvas.style.cssText = "position:fixed;left:-100000px;top:0;width:1px;height:1px;pointer-events:none";
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: format.alpha, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, format.alpha ? 0 : 1);
  const scene = new THREE.Scene();
  if (!format.alpha) scene.background = new THREE.Color("#18181b");
  const generator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = generator.fromScene(room, 0.04);
  room.dispose(); generator.dispose();
  scene.environment = environment.texture;
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(3, 5, 4);
  scene.add(light);
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_PATH);
  const pivot = new THREE.Group();
  scene.add(pivot);
  try {
    const mesh = (await new GLTFLoader().setDRACOLoader(draco).loadAsync(url)).scene;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const bounds = new THREE.Box3().setFromObject(mesh);
    if (bounds.isEmpty()) throw new Error("empty_mesh");
    const box = bounds.getSize(new THREE.Vector3());
    mesh.position.sub(bounds.getCenter(new THREE.Vector3()));
    pivot.add(mesh);
    const radius = box.length() / 2;
    const distance = radius / Math.sin(THREE.MathUtils.degToRad(35) / 2) * 1.05;
    const camera = new THREE.PerspectiveCamera(35, 1, distance / 100, distance * 100);
    camera.position.set(0, distance * 0.28, distance);
    camera.lookAt(0, 0, 0);

    const stream = canvas.captureStream(fps);
    const track = stream.getVideoTracks()[0];
    const recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    recorder.start(250);
    const frames = Math.round(seconds * fps);
    for (let i = 0; i <= frames; i++) {
      if (signal?.aborted) { recorder.stop(); throw new DOMException("aborted", "AbortError"); }
      pivot.rotation.y = turntableAngle(i / frames);
      renderer.render(scene, camera);
      // A paint has to happen for the stream to take the frame.
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => setTimeout(r, 1000 / fps));
    }
    recorder.stop();
    await stopped;
    track.stop();
    const blob = new Blob(chunks, { type: format.mime.split(";")[0] });
    if (!blob.size) throw new Error("turntable_empty");
    return new File([blob], `3d-turntable-${Date.now()}.${format.ext}`, { type: blob.type });
  } finally {
    const textures = new Set<{ dispose(): void }>();
    type Disposable = { dispose(): void };
    pivot.traverse((node) => {
      const part = node as unknown as { geometry?: Disposable; material?: Disposable | Disposable[] };
      part.geometry?.dispose();
      for (const material of Array.isArray(part.material) ? part.material : part.material ? [part.material] : []) {
        for (const value of Object.values(material)) if ((value as { isTexture?: boolean } | null)?.isTexture) textures.add(value as unknown as Disposable);
        material.dispose();
      }
    });
    textures.forEach(t => t.dispose());
    draco.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss();
    canvas.remove();
  }
}
