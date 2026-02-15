"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { X } from 'lucide-react';
import { useNebulaPrefetch } from '@/hooks/use-nebula-prefetch';
import { cn } from '@/lib/utils';
import dehubLogoCenter from '@/assets/dehub-logo-center.png';

// Shared modules
import { useGlitchEffect } from '@/hooks/use-glitch-effect';
import { TIMING } from '@/config/hero-config';
import { createScene, createLighting, createResizeHandler, setupMouseInteraction } from '@/lib/three/scene-helpers';
import { createNebula, animateNebula, disposeNebula, loadEasterEggs } from '@/lib/three/nebula';
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

const SKIP_LANDING_KEY = "dehub_skip_landing";

export const FuturisticAlienHero = () => {
  const mountRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const { masterGlitch, corruptedTitle, corruptedSubtitle, showPixelCorruption } = useGlitchEffect();
  const [isCloseButtonGlitching, setIsCloseButtonGlitching] = useState(false);
  
  // Prefetch app data on first user interaction (mousemove/touch/scroll)
  useNebulaPrefetch();
  
  // Close button glitch effect - triggers every 4-6 seconds
  useEffect(() => {
    const triggerGlitch = () => {
      setIsCloseButtonGlitching(true);
      setTimeout(() => setIsCloseButtonGlitching(false), 400);
    };
    
    // Initial glitch after 2 seconds
    const initialTimer = setTimeout(triggerGlitch, 2000);
    
    // Recurring glitch every 4-6 seconds
    const interval = setInterval(() => {
      triggerGlitch();
    }, 4000 + Math.random() * 2000);
    
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const handleEnterApp = () => {
    // Save preference to skip landing next time
    localStorage.setItem(SKIP_LANDING_KEY, "true");
    navigate('/app');
  };

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const { scene, camera, renderer } = createScene(mountRef.current);
    createLighting(scene);

    // Create systems
    const shootingStarsSystem = createShootingStars(scene);
    const lastShootingStarTime = { value: 0 };

    const artifactSystem = createArtifact(scene, dehubLogoCenter);
    const nebulaSystem = createNebula(scene);

    const buzzwordSystem: BuzzwordSystem = { 
      sprites: [], types: [], loaded: false,
      timers: [], intervals: [], isDisposed: false 
    };

    // Mouse interaction
    const mouseInteraction = setupMouseInteraction();
    mouseInteraction.addListeners();

    // Window resize
    const handleResize = createResizeHandler(camera, renderer);
    window.addEventListener('resize', handleResize);

    // Track the load delay timeout
    const loadDelayTimer = setTimeout(() => {
      loadBuzzwords(scene, buzzwordSystem);
      loadEasterEggs(nebulaSystem);
    }, TIMING.BUZZWORD_LOAD_DELAY);

    // Animation state
    const clock = new THREE.Clock();
    let animationFrameId: number;
    let previousTime = 0;
    let artifactGlitchTime = 0;
    let buzzwordGlitchTime = 0;
    let isArtifactGlitching = false;
    let isBuzzwordGlitching = false;
    let isDisposed = false;
    const artifactOriginalPosition = { x: 0, y: 0, z: 0 };
    const glitchTimers: NodeJS.Timeout[] = [];

    const animate = () => {
      if (isDisposed) return;
      
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
      spawnShootingStars(shootingStarsSystem, elapsedTime, lastShootingStarTime);
      animateShootingStars(shootingStarsSystem, delta);
      animateBuzzwords(buzzwordSystem, elapsedTime);

      // Buzzword glitch (every 5-10 seconds)
      if (!isBuzzwordGlitching && elapsedTime - buzzwordGlitchTime > 5 + Math.random() * 5) {
        buzzwordGlitchTime = elapsedTime;
        isBuzzwordGlitching = true;
        triggerBuzzwordGlitch(buzzwordSystem);
        const timer = setTimeout(() => { isBuzzwordGlitching = false; }, 300);
        glitchTimers.push(timer);
      }

      // Artifact glitch (every 10-20 seconds)
      if (!isArtifactGlitching && elapsedTime - artifactGlitchTime > 10 + Math.random() * 10) {
        artifactGlitchTime = elapsedTime;
        isArtifactGlitching = true;
        triggerArtifactGlitch(artifactSystem, artifactOriginalPosition);
        const timer = setTimeout(() => { isArtifactGlitching = false; }, 300);
        glitchTimers.push(timer);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      isDisposed = true;
      
      // Clear all local timers
      clearTimeout(loadDelayTimer);
      glitchTimers.forEach(timer => clearTimeout(timer));
      
      window.removeEventListener('resize', handleResize);
      mouseInteraction.removeListeners();
      cancelAnimationFrame(animationFrameId);
      
      // Dispose systems (each handles its own timer cleanup)
      disposeArtifact(artifactSystem);
      disposeNebula(nebulaSystem);
      disposeShootingStars(shootingStarsSystem);
      disposeBuzzwords(buzzwordSystem);
      
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black scanline-overlay" style={cursorStyle}>
      <PixelCorruption visible={showPixelCorruption} />
      <canvas ref={mountRef} className="absolute top-0 left-0 w-full h-full z-0" />
      
      {/* Close/Enter App Button */}
      <button
        onClick={handleEnterApp}
        className={cn(
          "absolute top-4 right-4 z-20 p-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all duration-200 group",
          isCloseButtonGlitching && "animate-close-button-glitch"
        )}
        aria-label="Enter App"
        style={isCloseButtonGlitching ? {
          boxShadow: '0 0 20px rgba(255, 255, 255, 0.6), 0 0 40px rgba(139, 92, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.2)',
          borderColor: 'rgba(255, 255, 255, 0.5)',
        } : undefined}
      >
        <X className={cn(
          "w-6 h-6 text-white/70 group-hover:text-white transition-colors",
          isCloseButtonGlitching && "text-white"
        )} />
      </button>
      
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
