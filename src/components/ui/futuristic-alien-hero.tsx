"use client";

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import dehubLogoCenter from '@/assets/dehub-logo-center.png';

// Shared modules
import { useGlitchEffect } from '@/hooks/use-glitch-effect';
import { TIMING } from '@/config/hero-config';
import { createScene, createLighting, createResizeHandler, setupMouseInteraction } from '@/lib/three/scene-helpers';
import { createNebula, animateNebula, disposeNebula } from '@/lib/three/nebula';
import { createShootingStars, spawnShootingStars, animateShootingStars, disposeShootingStars } from '@/lib/three/shooting-stars';
import { loadBuzzwords, animateBuzzwords, triggerBuzzwordGlitch, disposeBuzzwords, BuzzwordSystem } from '@/lib/three/buzzwords';
import { createArtifact, animateArtifact, triggerArtifactGlitch, disposeArtifact } from '@/lib/three/artifact';

// UI Components
import { HeroTitle } from '@/components/hero/HeroTitle';
import { AppStoreButtons } from '@/components/hero/AppStoreButtons';
import { SocialLinks } from '@/components/hero/SocialLinks';
import { PixelCorruption } from '@/components/hero/PixelCorruption';

const cursorStyle = { 
  cursor: 'url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'12\' height=\'12\' fill=\'white\' fill-opacity=\'0.9\' /%3E%3C/svg%3E") 6 6, auto' 
};

export const FuturisticAlienHero = () => {
  const mountRef = useRef<HTMLCanvasElement>(null);
  const { masterGlitch, corruptedTitle, corruptedSubtitle, showPixelCorruption } = useGlitchEffect();

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const { scene, camera, renderer } = createScene(mountRef.current);
    createLighting(scene);

    // Create systems
    const shootingStars = createShootingStars(scene);
    const lastShootingStarTime = { value: 0 };

    const artifactSystem = createArtifact(scene, dehubLogoCenter);
    const nebulaSystem = createNebula(scene);

    const buzzwordSystem: BuzzwordSystem = { sprites: [], types: [], loaded: false };

    // Mouse interaction
    const mouseInteraction = setupMouseInteraction();
    mouseInteraction.addListeners();

    // Window resize
    const handleResize = createResizeHandler(camera, renderer);
    window.addEventListener('resize', handleResize);

    // Load buzzwords after delay
    setTimeout(() => loadBuzzwords(scene, buzzwordSystem), TIMING.BUZZWORD_LOAD_DELAY);

    // Animation state
    const clock = new THREE.Clock();
    let animationFrameId: number;
    let previousTime = 0;
    let artifactGlitchTime = 0;
    let buzzwordGlitchTime = 0;
    let isArtifactGlitching = false;
    let isBuzzwordGlitching = false;
    const artifactOriginalPosition = { x: 0, y: 0, z: 0 };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const delta = elapsedTime - previousTime;
      previousTime = elapsedTime;

      // Camera follows mouse
      const { mouseX, mouseY } = mouseInteraction.getMousePosition();
      camera.position.x += (mouseX - camera.position.x) * 0.05;
      camera.position.y += (-mouseY - camera.position.y) * 0.05;
      camera.lookAt(scene.position);

      // Animate systems
      animateArtifact(artifactSystem, elapsedTime);
      animateNebula(nebulaSystem);
      spawnShootingStars(shootingStars, elapsedTime, lastShootingStarTime);
      animateShootingStars(shootingStars, delta);
      animateBuzzwords(buzzwordSystem, elapsedTime);

      // Buzzword glitch (every 5-10 seconds)
      if (!isBuzzwordGlitching && elapsedTime - buzzwordGlitchTime > 5 + Math.random() * 5) {
        buzzwordGlitchTime = elapsedTime;
        isBuzzwordGlitching = true;
        triggerBuzzwordGlitch(buzzwordSystem);
        setTimeout(() => { isBuzzwordGlitching = false; }, 300);
      }

      // Artifact glitch (every 10-20 seconds)
      if (!isArtifactGlitching && elapsedTime - artifactGlitchTime > 10 + Math.random() * 10) {
        artifactGlitchTime = elapsedTime;
        isArtifactGlitching = true;
        triggerArtifactGlitch(artifactSystem.artifact, artifactOriginalPosition);
        setTimeout(() => { isArtifactGlitching = false; }, 300);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      mouseInteraction.removeListeners();
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      disposeArtifact(artifactSystem);
      disposeNebula(nebulaSystem);
      disposeShootingStars(shootingStars);
      disposeBuzzwords(buzzwordSystem);
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black scanline-overlay" style={cursorStyle}>
      <PixelCorruption visible={showPixelCorruption} />
      <canvas ref={mountRef} className="absolute top-0 left-0 w-full h-full z-0" />
      
      <section className="relative h-screen flex items-center justify-center overflow-hidden z-10">
        <div className="text-center p-4 -translate-y-[40px] md:translate-y-0">
          <HeroTitle
            masterGlitch={masterGlitch}
            corruptedTitle={corruptedTitle}
            corruptedSubtitle={corruptedSubtitle}
            className="mt-[25px] md:mt-0"
          />
          <AppStoreButtons />
          <SocialLinks />
        </div>
      </section>
    </div>
  );
};
