"use client";

import { useLocation, Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import * as THREE from "three";
import { SimplexNoise } from "@/lib/simplex-noise";

const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGlitching, setIsGlitching] = useState(false);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // Nebula background effect
  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Nebula particles
    const particleCount = 3000;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const radius = Math.random() * 15 + 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi) - 10;

      // Purple/cyan/pink nebula colors
      const colorChoice = Math.random();
      if (colorChoice < 0.33) {
        colors[i3] = 0.6 + Math.random() * 0.4;
        colors[i3 + 1] = 0.1 + Math.random() * 0.2;
        colors[i3 + 2] = 0.8 + Math.random() * 0.2;
      } else if (colorChoice < 0.66) {
        colors[i3] = 0.1 + Math.random() * 0.2;
        colors[i3 + 1] = 0.6 + Math.random() * 0.4;
        colors[i3 + 2] = 0.8 + Math.random() * 0.2;
      } else {
        colors[i3] = 0.8 + Math.random() * 0.2;
        colors[i3 + 1] = 0.3 + Math.random() * 0.3;
        colors[i3 + 2] = 0.6 + Math.random() * 0.4;
      }

      sizes[i] = Math.random() * 3 + 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const nebula = new THREE.Points(geometry, material);
    scene.add(nebula);

    camera.position.z = 5;

    const simplex = new SimplexNoise();
    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = Date.now() * 0.0001;

      nebula.rotation.y = time * 0.5;
      nebula.rotation.x = Math.sin(time) * 0.1;

      // Animate particle positions slightly
      const pos = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const noise = simplex.noise3D(x * 0.1, y * 0.1, time);
        pos.setY(i, y + noise * 0.002);
      }
      pos.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);

  // Periodic glitch effect
  useEffect(() => {
    const glitchInterval = setInterval(() => {
      setIsGlitching(true);
      setTimeout(() => setIsGlitching(false), 200);
    }, 4000 + Math.random() * 3000);

    return () => clearInterval(glitchInterval);
  }, []);

  const fadeUpVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.2,
        duration: 1,
        ease: [0.23, 0.86, 0.39, 0.96] as [number, number, number, number],
      },
    }),
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black scanline-overlay">
      {/* Nebula background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Content overlay */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4">
        <motion.h1
          custom={0}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className={`mb-4 text-[120px] sm:text-[180px] md:text-[220px] font-black tracking-tighter leading-none ${isGlitching ? 'glitch-active' : ''}`}
          style={{
            fontFamily: "'Exo', sans-serif",
            color: 'white',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.5), 0 0 40px rgba(255, 255, 255, 0.3), 0 0 60px rgba(255, 255, 255, 0.2)',
          }}
        >
          404
        </motion.h1>

        <motion.p
          custom={1}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
          className={`mb-8 text-xl sm:text-2xl md:text-3xl font-bold tracking-widest uppercase ${isGlitching ? 'glitch-active' : ''}`}
          style={{
            fontFamily: "'Exo', sans-serif",
            color: 'rgba(255, 255, 255, 0.8)',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.4)',
          }}
        >
          {t('notFound.title')}
        </motion.p>

        <motion.div
          custom={2}
          variants={fadeUpVariants}
          initial="hidden"
          animate="visible"
        >
          <Link
            to="/"
            className="group relative inline-flex items-center gap-2 px-8 py-4 text-lg font-bold uppercase tracking-wider transition-all duration-300 hover:scale-105"
            style={{
              fontFamily: "'Exo', sans-serif",
              color: 'white',
              textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <span className="relative z-10">{t('notFound.returnHome')}</span>
            <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
};

export default NotFound;
