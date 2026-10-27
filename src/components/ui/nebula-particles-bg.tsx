import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Lightweight nebula particle background for the 404 page.
 * Renders slowly rotating white square particles — no globe, no easter eggs.
 */
export function NebulaParticlesBg() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.z = 5;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    } catch {
      // Decorative WebGL must never replace the page with an error boundary.
      return;
    }
    try {
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
    } catch {
      renderer.dispose();
      return;
    }

    // Particles
    const PARTICLE_COUNT = 8000;
    const SPREAD = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 1] = (Math.random() - 0.5) * SPREAD;
      positions[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;

      const brightness = 0.3 + Math.random() * 0.7;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.7,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // Mouse interaction
    let mouseX = 0;
    let mouseY = 0;
    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 0.5;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 0.5;
    };
    window.addEventListener("mousemove", onMouseMove);

    // Resize
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
      try { renderer.setSize(container.clientWidth, container.clientHeight); }
      catch { stop(); failed = true; }
    };
    window.addEventListener("resize", onResize);

    // Animate
    let frameId: number | undefined;
    let failed = false;
    const stop = () => { if (frameId !== undefined) cancelAnimationFrame(frameId); frameId = undefined; };
    const animate = () => {
      frameId = undefined;
      if (failed || document.hidden) return;
      points.rotation.y += 0.0003;
      points.rotation.x += 0.0001;

      // Subtle mouse parallax
      camera.position.x += (mouseX - camera.position.x) * 0.02;
      camera.position.y += (-mouseY - camera.position.y) * 0.02;
      camera.lookAt(scene.position);

      try { renderer.render(scene, camera); }
      catch { failed = true; renderer.domElement.remove(); return; }
      if (!reducedMotion.matches) frameId = requestAnimationFrame(animate);
    };
    const resume = () => { stop(); animate(); };
    const onContextLost = (event: Event) => { event.preventDefault(); failed = true; stop(); };
    const onContextRestored = () => { failed = false; resume(); };
    document.addEventListener('visibilitychange', resume);
    reducedMotion.addEventListener('change', resume);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
    resume();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', resume);
      reducedMotion.removeEventListener('change', resume);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.035), transparent 70%)' }} />;
}
