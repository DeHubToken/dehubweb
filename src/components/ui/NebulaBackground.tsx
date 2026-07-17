import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createScene, createLighting, createResizeHandler, setupMouseInteraction, releaseContext, createRenderGate } from "@/lib/three/scene-helpers";
import { createNebula, animateNebula, disposeNebula, applyNebulaColor, type NebulaSystem } from "@/lib/three/nebula";
import { useAppTheme, DEFAULT_THEME_HUES } from "@/contexts/ThemeContext";

/**
 * Reusable full-screen nebula background from the disabled landing hero.
 * Renders only the rotating particle nebula (no easter eggs, artifact, buzzwords).
 */
export function NebulaBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { themeHues, brandColors } = useAppTheme();
  const colorValue = themeHues.cosmic ?? DEFAULT_THEME_HUES.cosmic;
  // Live-recolour without rebuilding the WebGL scene on every slider tick.
  const systemRef = useRef<NebulaSystem | null>(null);
  const colorRef = useRef(colorValue);
  colorRef.current = colorValue;
  const brandRef = useRef(brandColors);
  brandRef.current = brandColors;
  // Join so the effect re-runs when the palette itself changes, not just its ref.
  const brandKey = brandColors.join(',');

  useEffect(() => {
    if (systemRef.current) applyNebulaColor(systemRef.current, colorValue, brandRef.current);
  }, [colorValue, brandKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const { scene, camera, renderer } = createScene(canvas);
    createLighting(scene);

    const nebulaSystem = createNebula(scene, colorRef.current, brandRef.current);
    systemRef.current = nebulaSystem;
    const mouseInteraction = setupMouseInteraction();
    if (!prefersReducedMotion) {
      mouseInteraction.addListeners();
    }

    const handleResize = createResizeHandler(camera, renderer);
    const onResize = () => {
      handleResize();
      if (prefersReducedMotion) {
        renderer.render(scene, camera);
      }
    };
    window.addEventListener("resize", onResize);

    let animationFrameId = 0;
    let isDisposed = false;
    const clock = new THREE.Clock();
    const gl = renderer.getContext();

    const renderFrame = () => {
      const elapsedTime = clock.getElapsedTime();
      // Camera follows mouse every 2nd frame to match the hero landing page.
      if (Math.round(elapsedTime * 60) % 2 === 0) {
        const { mouseX, mouseY } = mouseInteraction.getMousePosition();
        camera.position.x += (mouseX - camera.position.x) * 0.05;
        camera.position.y += (-mouseY - camera.position.y) * 0.05;
        camera.lookAt(scene.position);
      }
      animateNebula(nebulaSystem);
      renderer.render(scene, camera);
    };

    if (prefersReducedMotion) {
      // Static single frame — no loop, so no gating needed.
      renderFrame();
      return () => {
        isDisposed = true;
        window.removeEventListener("resize", onResize);
        mouseInteraction.removeListeners();
        systemRef.current = null;
        disposeNebula(nebulaSystem);
        releaseContext(renderer);
      };
    }

    // Render gate: stop the loop while the tab is hidden, the canvas is
    // off-screen, OR docs/blog is composited over the canvas (see
    // background-gate). A lost context also halts the loop instead of throwing.
    let gate: ReturnType<typeof createRenderGate> | null = null;
    const animate = () => {
      if (isDisposed) return;
      if (!gate || !gate.isActive() || gl.isContextLost()) {
        animationFrameId = 0;
        return;
      }
      animationFrameId = requestAnimationFrame(animate);
      renderFrame();
    };
    const resume = () => {
      if (isDisposed || animationFrameId !== 0 || gl.isContextLost()) return;
      animationFrameId = requestAnimationFrame(animate);
    };
    gate = createRenderGate(canvas, resume);
    animate();

    return () => {
      isDisposed = true;
      gate?.destroy();
      window.removeEventListener("resize", onResize);
      mouseInteraction.removeListeners();
      cancelAnimationFrame(animationFrameId);
      systemRef.current = null;
      disposeNebula(nebulaSystem);
      releaseContext(renderer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full z-0"
      aria-hidden="true"
    />
  );
}
