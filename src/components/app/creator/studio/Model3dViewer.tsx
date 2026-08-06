/**
 * GLB viewer.
 * ===========
 * Renders a generated mesh with orbit / zoom / pan, image-based lighting so PBR
 * materials read correctly, and playback of any animation the provider baked in.
 *
 * This module statically imports three, so every consumer must pull it in with
 * React.lazy — three is ~600 kB and nothing outside the 3D surfaces needs it.
 *
 * Everything allocated here is tracked and released on unmount. A WebGL context
 * is a scarce browser resource (most browsers cap it around 16) and the results
 * feed can open and close a viewer many times in one session, so leaking one per
 * open would eventually blank every canvas on the page.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Google's hosted Draco decoder, the same one three's own examples use.
 *
 * Fetched lazily by DRACOLoader and only when a mesh actually turns out to be
 * Draco-compressed, so an ordinary GLB never pays for it. Hosting the decoder
 * ourselves would mean committing wasm under public/, where dehub.io's SPA
 * catch-all turns any missing file into a 200 of HTML — a far worse failure
 * than one external request.
 */
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

interface Model3dViewerProps {
  /** URL of the .glb / .gltf to display. */
  url: string;
  className?: string;
  /** Slowly spin the model until the viewer is touched. Default true. */
  autoRotate?: boolean;
}

export function Model3dViewer({ url, className, autoRotate = true }: Model3dViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  /** Set by the scene so the reset button can call back into it. */
  const resetViewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setLoading(true);
    setError(null);
    setProgress(0);

    let disposed = false;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    // r155+ names: outputColorSpace / SRGBColorSpace. The pre-r150 spelling
    // (outputEncoding / sRGBEncoding) is gone and silently does nothing.
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      (mount.clientWidth || 1) / (mount.clientHeight || 1),
      0.01,
      1000,
    );
    camera.position.set(0, 0, 3);

    // Image-based lighting. Without an environment map, metallic and rough
    // materials render as flat black — which looks like a broken mesh rather
    // than a lighting problem.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    // The room is only needed to bake the PMREM. Keeping it would pin a scene
    // full of box geometry and materials for the life of the viewer.
    roomEnv.dispose();
    scene.environment = envRT.texture;

    // A key light on top of the IBL, so form still reads on matte surfaces.
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 1, -3);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.4;
    // Stop spinning as soon as it is being driven by hand; resuming would fight
    // the creator for control of the camera.
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);

    let model: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    const clock = new THREE.Clock();

    /** Fit the camera to the mesh, whatever scale the provider exported at. */
    function frameModel(object: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return;

      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      // Re-centre on the origin rather than moving the camera to the mesh, so
      // orbiting pivots around the model instead of swinging around a point
      // somewhere off in space.
      object.position.sub(center);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fitDistance = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360);
      // A little margin so the mesh is not flush against the frame edge.
      const distance = fitDistance * 1.6;

      camera.position.set(distance * 0.5, distance * 0.35, distance);
      camera.near = distance / 100;
      camera.far = distance * 100;
      camera.updateProjectionMatrix();

      controls.target.set(0, 0, 0);
      controls.minDistance = distance * 0.15;
      controls.maxDistance = distance * 6;
      controls.update();
      controls.saveState();
    }

    resetViewRef.current = () => {
      controls.reset();
      controls.autoRotate = autoRotate;
    };

    loader.load(
      url,
      (gltf) => {
        if (disposed) {
          // Arrived after unmount: release it rather than attaching to a scene
          // that is already being torn down.
          disposeObject(gltf.scene);
          return;
        }
        model = gltf.scene;
        scene.add(model);
        frameModel(model);

        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
        }

        setLoading(false);
      },
      (event) => {
        if (disposed || !event.lengthComputable) return;
        setProgress(Math.round((event.loaded / event.total) * 100));
      },
      (err) => {
        if (disposed) return;
        console.error('[3d] Could not load mesh', err);
        setError(
          'Could not load this model. It may still be downloadable — try the Download button.',
        );
        setLoading(false);
      },
    );

    const resizeObserver = new ResizeObserver(() => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(mount);

    // A lost context leaves a permanently blank canvas, so say so instead of
    // showing an empty box that looks like a failed generation.
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setError('The 3D view lost its graphics context. Reopen this result to try again.');
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      mixer?.update(delta);
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      resetViewRef.current = null;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      mixer?.stopAllAction();
      controls.dispose();
      if (model) {
        scene.remove(model);
        disposeObject(model);
      }
      scene.environment = null;
      envRT.dispose();
      pmrem.dispose();
      dracoLoader.dispose();
      renderer.dispose();
      // forceContextLoss frees the GPU context immediately rather than waiting
      // for the canvas to be garbage collected, which is what actually keeps a
      // long session from exhausting the browser's context budget.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [url, autoRotate]);

  return (
    <div className={cn('relative h-full w-full', className)}>
      <div ref={mountRef} className="h-full w-full touch-none [&>canvas]:block" />

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
          <Loader2 className="h-5 w-5 animate-spin text-white/70" />
          <p className="text-[11px] font-medium text-white/70">
            {progress > 0 ? `Loading model ${progress}%` : 'Loading model'}
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-xs text-center text-[13px] leading-relaxed text-white/60">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <button
            type="button"
            onClick={() => resetViewRef.current?.()}
            aria-label="Reset the camera to the starting view"
            title="Reset view"
            className="absolute right-2 top-2 rounded-lg border border-white/15 bg-black/50 p-2 text-white/70 backdrop-blur transition hover:border-white/30 hover:bg-black/70 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-medium text-white/35">
            Drag to orbit · scroll to zoom
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Release every GPU resource under an object.
 *
 * Removing a mesh from a scene does not free its buffers or textures; three
 * requires each to be disposed explicitly. Materials are shared often enough
 * that textures are collected into a set first, so a texture referenced by four
 * materials is disposed once rather than four times.
 */
function disposeObject(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();

    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];

    for (const material of materials) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
      material.dispose();
    }
  });

  for (const texture of textures) texture.dispose();
}

export default Model3dViewer;
