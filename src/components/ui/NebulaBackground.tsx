import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createScene, createLighting, createResizeHandler, setupMouseInteraction } from "@/lib/three/scene-helpers";
import { createNebula, animateNebula, disposeNebula } from "@/lib/three/nebula";

/**
 * Reusable full-screen nebula background from the disabled landing hero.
 * Renders only the rotating particle nebula (no easter eggs, artifact, buzzwords).
 */
export function NebulaBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { scene, camera, renderer } = createScene(canvas);
    createLighting(scene);

    const nebulaSystem = createNebula(scene);
    const mouseInteraction = setupMouseInteraction();
    mouseInteraction.addListeners();

    const handleResize = createResizeHandler(camera, renderer);
    window.addEventListener("resize", handleResize);

    let animationFrameId: number;
    let isDisposed = false;
    const clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);
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
    animate();

    return () => {
      isDisposed = true;
      window.removeEventListener("resize", handleResize);
      mouseInteraction.removeListeners();
      cancelAnimationFrame(animationFrameId);
      disposeNebula(nebulaSystem);
      renderer.dispose();
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
