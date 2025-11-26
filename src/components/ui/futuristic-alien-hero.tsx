"use client";

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { GlowingEffect } from './glowing-effect';
import { toast } from 'sonner';
import tiktokLogo from '@/assets/tiktok-logo.png';
import instagramLogo from '@/assets/instagram-logo.png';
import xLogo from '@/assets/x-logo.png';
import telegramLogo from '@/assets/telegram-logo.png';
import dehubLogo from '@/assets/dehub-logo.png';
import googlePlayBadge from '@/assets/google-play-badge.png';
import appStoreBadge from '@/assets/app-store-badge.svg';

// --- Simplex Noise Library ---
// Included directly to resolve dependency issues in this environment.
// Source: https://github.com/jwagner/simplex-noise.js
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;
const F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
const G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

class SimplexNoise {
    p: Uint8Array;
    perm: Uint8Array;
    permMod12: Uint8Array;

    constructor(random?: () => number) {
        if (typeof random !== 'function') random = Math.random;
        this.p = new Uint8Array(256);
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);
        for (let i = 0; i < 256; i++) {
            this.p[i] = i;
        }
        for (let i = 255; i > 0; i--) {
            const r = Math.floor(random() * (i + 1));
            const t = this.p[i];
            this.p[i] = this.p[r];
            this.p[r] = t;
        }
        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }
    }

    noise2D(xin: number, yin: number): number {
        const permMod12 = this.permMod12;
        const perm = this.perm;
        let n0, n1, n2;
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = xin - X0;
        const y0 = yin - Y0;
        let i1, j1;
        if (x0 > y0) {
            i1 = 1;
            j1 = 0;
        } else {
            i1 = 0;
            j1 = 1;
        }
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;
        const ii = i & 255;
        const jj = j & 255;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * this.grad2(perm[ii + perm[jj]], x0, y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * this.grad2(perm[ii + i1 + perm[jj + j1]], x1, y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * this.grad2(perm[ii + 1 + perm[jj + 1]], x2, y2);
        }
        return 70.0 * (n0 + n1 + n2);
    }

    noise3D(xin: number, yin: number, zin: number): number {
        const permMod12 = this.permMod12;
        const perm = this.perm;
        let n0, n1, n2, n3;
        const s = (xin + yin + zin) * F3;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const k = Math.floor(zin + s);
        const t = (i + j + k) * G3;
        const X0 = i - t;
        const Y0 = j - t;
        const Z0 = k - t;
        const x0 = xin - X0;
        const y0 = yin - Y0;
        const z0 = zin - Z0;
        let i1, j1, k1;
        let i2, j2, k2;
        if (x0 >= y0) {
            if (y0 >= z0) {
                i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
            } else if (x0 >= z0) {
                i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
            } else {
                i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
            }
        } else {
            if (y0 < z0) {
                i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
            } else if (x0 < z0) {
                i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
            } else {
                i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
            }
        }
        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3;
        const y2 = y0 - j2 + 2.0 * G3;
        const z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3;
        const y3 = y0 - 1.0 + 3.0 * G3;
        const z3 = z0 - 1.0 + 3.0 * G3;
        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;
        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * this.grad3(perm[ii + perm[jj + perm[kk]]], x0, y0, z0);
        }
        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * this.grad3(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x1, y1, z1);
        }
        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * this.grad3(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x2, y2, z2);
        }
        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
        if (t3 < 0) n3 = 0.0;
        else {
            t3 *= t3;
            n3 = t3 * t3 * this.grad3(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x3, y3, z3);
        }
        return 32.0 * (n0 + n1 + n2 + n3);
    }

    noise4D(x: number, y: number, z: number, w: number): number {
        const permMod12 = this.permMod12;
        const perm = this.perm;
        let n0, n1, n2, n3, n4;
        const s = (x + y + z + w) * F4;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        const l = Math.floor(w + s);
        const t = (i + j + k + l) * G4;
        const X0 = i - t;
        const Y0 = j - t;
        const Z0 = k - t;
        const W0 = l - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        const z0 = z - Z0;
        const w0 = w - W0;
        const c = (x0 > y0) ? 32 : 0;
        const c1 = (x0 > z0) ? 16 : 0;
        const c2 = (x0 > w0) ? 8 : 0;
        const c3 = (y0 > z0) ? 4 : 0;
        const c4 = (y0 > w0) ? 2 : 0;
        const c5 = (z0 > w0) ? 1 : 0;
        const C = c + c1 + c2 + c3 + c4 + c5;
        const i1 = (C & 1) !== 0 ? 1 : 0;
        const j1 = (C & 2) !== 0 ? 1 : 0;
        const k1 = (C & 4) !== 0 ? 1 : 0;
        const l1 = (C & 8) !== 0 ? 1 : 0;
        const i2 = (C & 16) !== 0 ? 1 : 0;
        const j2 = (C & 32) !== 0 ? 1 : 0;
        const k2 = (C & 64) !== 0 ? 1 : 0;
        const l2 = (C & 128) !== 0 ? 1 : 0;
        const x1 = x0 - i1 + G4;
        const y1 = y0 - j1 + G4;
        const z1 = z0 - k1 + G4;
        const w1 = w0 - l1 + G4;
        const x2 = x0 - i2 + 2.0 * G4;
        const y2 = y0 - j2 + 2.0 * G4;
        const z2 = z0 - k2 + 2.0 * G4;
        const w2 = w0 - l2 + 2.0 * G4;
        const x3 = x0 - 1.0 + 3.0 * G4;
        const y3 = y0 - 1.0 + 3.0 * G4;
        const z3 = z0 - 1.0 + 3.0 * G4;
        const w3 = w0 - 1.0 + 3.0 * G4;
        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;
        const ll = l & 255;
        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
        if (t0 < 0) n0 = 0.0;
        else {
            t0 *= t0;
            n0 = t0 * t0 * this.grad4(perm[ii + perm[jj + perm[kk + perm[ll]]]], x0, y0, z0, w0);
        }
        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
        if (t1 < 0) n1 = 0.0;
        else {
            t1 *= t1;
            n1 = t1 * t1 * this.grad4(perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]], x1, y1, z1, w1);
        }
        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
        if (t2 < 0) n2 = 0.0;
        else {
            t2 *= t2;
            n2 = t2 * t2 * this.grad4(perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]], x2, y2, z2, w2);
        }
        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
        if (t3 < 0) n3 = 0.0;
        else {
            t3 *= t3;
            n3 = t3 * t3 * this.grad4(perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]], x3, y3, z3, w3);
        }
        return 27.0 * (n0 + n1 + n2 + n3);
    }

    grad2(hash: number, x: number, y: number): number {
        const h = hash & 7;
        const u = h < 4 ? x : y;
        const v = h < 4 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
    }

    grad3(hash: number, x: number, y: number, z: number): number {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    grad4(hash: number, x: number, y: number, z: number, t: number): number {
        const h = hash & 31;
        const u = h < 24 ? x : y;
        const v = h < 16 ? y : z;
        const w = h < 8 ? z : t;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v) + ((h & 4) ? -w : w);
    }
}

// Main Hero Component
export const FuturisticAlienHero = () => {
    const mountRef = useRef<HTMLCanvasElement>(null);
    
    // Glitch states for title
    const [masterGlitch, setMasterGlitch] = useState(false);
    const [corruptedTitle, setCorruptedTitle] = useState('A New World');
    const [corruptedSubtitle, setCorruptedSubtitle] = useState('Awaits');
    const [showPixelCorruption, setShowPixelCorruption] = useState(false);
    
    // Glitch timing ref
    const glitchTimerRef = useRef<NodeJS.Timeout>();


    // Master synchronized glitch controller (every 5 seconds)
    useEffect(() => {
        const glitchChars = ['█', '▓', '▒', '░', '@', '#', '$', '%', '&', '0', '1'];
        
        const corruptText = (text: string) => {
            const chars = text.split('');
            return chars.map(char => {
                if (Math.random() < 0.3 && char !== ' ') {
                    return glitchChars[Math.floor(Math.random() * glitchChars.length)];
                }
                return char;
            }).join('');
        };
        
        const scheduleMasterGlitch = () => {
            glitchTimerRef.current = setTimeout(() => {
                // Start glitch
                setMasterGlitch(true);
                setShowPixelCorruption(true);
                
                // Corrupt title and subtitle
                setCorruptedTitle(corruptText('A New World'));
                setCorruptedSubtitle(corruptText('Awaits'));
                
                // Rapid cycling of values (every 50ms for 300ms = 6 cycles)
                let cycleCount = 0;
                const cycleInterval = setInterval(() => {
                    cycleCount++;
                    
                    // Continue corrupting text
                    setCorruptedTitle(corruptText('A New World'));
                    setCorruptedSubtitle(corruptText('Awaits'));
                    
                    if (cycleCount >= 6) {
                        clearInterval(cycleInterval);
                    }
                }, 50);
                
                // End glitch after 300ms
                setTimeout(() => {
                    setMasterGlitch(false);
                    setShowPixelCorruption(false);
                    setCorruptedTitle('A New World');
                    setCorruptedSubtitle('Awaits');
                }, 300);
                
                // Schedule next glitch in 5 seconds
                scheduleMasterGlitch();
            }, 5000);
        };
        
        scheduleMasterGlitch();
        
        return () => {
            if (glitchTimerRef.current) {
                clearTimeout(glitchTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!mountRef.current) return;

        // --- Scene Setup ---
        const currentMount = mountRef.current;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({
            canvas: currentMount,
            antialias: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        camera.position.z = 5;

        // --- Lighting ---
        const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
        pointLight.position.set(0, 0, 7);
        scene.add(pointLight);
        
        const ambientLight = new THREE.AmbientLight(0x404040, 3);
        scene.add(ambientLight);

        // --- Alien Artifact & Core ---
        const simplex = new SimplexNoise();
        const artifactGeometry = new THREE.IcosahedronGeometry(1.5, 20);
        artifactGeometry.setAttribute('originalPosition', artifactGeometry.attributes.position.clone());

        const artifactMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.2,
            roughness: 0.1,
            envMapIntensity: 0.9,
            transparent: true,
            opacity: 0.8,
            premultipliedAlpha: true
        });
        const artifact = new THREE.Mesh(artifactGeometry, artifactMaterial);
        scene.add(artifact);

        // --- Nebula Particle System ---
        const nebulaGeometry = new THREE.BufferGeometry();
        const nebulaCount = 20000;
        const posArray = new Float32Array(nebulaCount * 3);
        const colorArray = new Float32Array(nebulaCount * 3);
        const nebulaColors = [new THREE.Color(0xffffff), new THREE.Color(0xffffff), new THREE.Color(0x505050)];

        for(let i = 0; i < nebulaCount; i++) {
            posArray[i*3 + 0] = (Math.random() - 0.5) * 20;
            posArray[i*3 + 1] = (Math.random() - 0.5) * 20;
            posArray[i*3 + 2] = (Math.random() - 0.5) * 20;
            const randomColor = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            colorArray[i*3 + 0] = randomColor.r;
            colorArray[i*3 + 1] = randomColor.g;
            colorArray[i*3 + 2] = randomColor.b;
        }
        nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));

        const nebulaMaterial = new THREE.PointsMaterial({
            size: 0.02,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.8
        });
        const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
        scene.add(nebula);

        // --- Floating Buzzwords ---
        const buzzwords = [
            'DECENTRALIZED MEDIA',
            'CENSORSHIP-RESISTANCE',
            'USER OWNED',
            'FREE SPEECH',
            'DATA OWNERSHIP',
            'INSTANT PAYOUTS',
            'PPV',
            'W2E',
            'COMMUNITY FIRST',
            'DEPIN',
            'WEB3',
            'NFT',
            'REVENUE SHARE',
            'HODL',
            'STAKE',
            'NO KYC',
            'LIBERTY',
            'CENSORSHIP RESISTANT',
            'SOCIALFI',
            'PLAY2EARN',
            'P2E',
            'P2P',
            'PEER TO PEER',
            'NON CUSTODIAL',
            'DAO',
            'DEFI'
        ];
        const textSprites: THREE.Sprite[] = [];
        
        // Create canvas texture for text
        const createTextSprite = (text: string, size: number) => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) return null;
            
            canvas.width = 512;
            canvas.height = 128;
            
            context.fillStyle = 'rgba(255, 255, 255, 1.0)';
            context.font = `bold ${Math.floor(size * 50)}px Arial`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(text, canvas.width / 2, canvas.height / 2);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.7,
                blending: THREE.AdditiveBlending
            });
            
            return new THREE.Sprite(spriteMaterial);
        };
        
        // Create one instance of each buzzword at random positions
        buzzwords.forEach(word => {
            let size = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
            // Scale down only larger buzzwords - keep small ones the same
            if (size > 0.65) {
                size = 0.65 + (size - 0.65) * 0.6; // Compress the upper range
            }
            const sprite = createTextSprite(word, size);
            if (sprite) {
            sprite.position.set(
                (Math.random() - 0.5) * 12,
                (Math.random() - 0.5) * 12,
                Math.random() * -8 - 2  // Keep buzzwords behind camera (z: -10 to -2)
            );
                sprite.scale.set(size * 2.875, size * 0.71875, 1);
                scene.add(sprite);
                textSprites.push(sprite);
            }
        });

        // Create featured foreground buzzwords (closer to camera)
        const featuredBuzzwords = ['decentralized media', 'free speech', 'web3', 'DEPIN', 'socialfi', 'airdrops', 'W2E', 'HODL'];
        featuredBuzzwords.forEach(word => {
            let size = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
            if (size > 0.65) {
                size = 0.65 + (size - 0.65) * 0.6;
            }
            
            // Create sprite with higher opacity for foreground
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 128;
            const context = canvas.getContext('2d');
            if (!context) return;
            
            context.fillStyle = 'rgba(255, 255, 255, 1.0)';
            context.font = `bold ${Math.floor(size * 50)}px Arial`;
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(word, canvas.width / 2, canvas.height / 2);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.8, // Higher opacity for foreground
                blending: THREE.AdditiveBlending
            });
            
            const sprite = new THREE.Sprite(spriteMaterial);
            if (sprite) {
                sprite.position.set(
                    (Math.random() - 0.5) * 5,  // Smaller spread ±5
                    (Math.random() - 0.5) * 5,
                    Math.random() * 2 + 1  // In front of globe (z: 1 to 3)
                );
                sprite.scale.set(size * 2.875 * 1.15, size * 0.71875 * 1.15, 1); // 15% bigger
                scene.add(sprite);
                textSprites.push(sprite);
            }
        });

        // --- Mouse/Touch Interaction ---
        let mouseX = 0, mouseY = 0;
        let isTouching = false;
        
        // Desktop mouse movement (continuous tracking)
        const handleMouseMove = (event: MouseEvent) => {
            mouseX = (event.clientX - window.innerWidth / 2) / 100;
            mouseY = (event.clientY - window.innerHeight / 2) / 100;
        };
        
        // Mobile touch handlers (only during drag)
        const handleTouchStart = (event: TouchEvent) => {
            event.preventDefault(); // Prevent default touch behavior
            isTouching = true;
        };
        
        const handleTouchMove = (event: TouchEvent) => {
            if (!isTouching) return;
            
            event.preventDefault(); // Prevent scrolling during drag
            const touch = event.touches[0];
            mouseX = (touch.clientX - window.innerWidth / 2) / 100;
            mouseY = (touch.clientY - window.innerHeight / 2) / 100;
        };
        
        const handleTouchEnd = () => {
            isTouching = false;
        };
        
        // Add listeners
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('touchend', handleTouchEnd);

        // --- Window Resize ---
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        // --- Animation Loop ---
        const clock = new THREE.Clock();
        let animationFrameId: number;
        
        // Glitch timing variables
        let artifactGlitchTime = 0;
        let artifactOriginalPosition = { x: 0, y: 0, z: 0 };
        let isArtifactGlitching = false;
        
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            const elapsedTime = clock.getElapsedTime();

            camera.position.x += (mouseX - camera.position.x) * 0.05;
            camera.position.y += (-mouseY - camera.position.y) * 0.05;
            camera.lookAt(scene.position);

            artifact.rotation.y = 0.1 * elapsedTime;
            artifact.rotation.x = 0.1 * elapsedTime;

            nebula.rotation.y += 0.0002;

            // Animate text sprites - gentle rotation
            textSprites.forEach((sprite, index) => {
                sprite.rotation.z = Math.sin(elapsedTime * 0.2 + index) * 0.1;
            });

            // Artifact position glitch (every 10-20 seconds)
            if (!isArtifactGlitching && elapsedTime - artifactGlitchTime > 10 + Math.random() * 10) {
                artifactGlitchTime = elapsedTime;
                isArtifactGlitching = true;
                
                // Store original position
                artifactOriginalPosition = {
                    x: artifact.position.x,
                    y: artifact.position.y,
                    z: artifact.position.z
                };
                
                // Random jump
                artifact.position.x += (Math.random() - 0.5) * 0.5;
                artifact.position.y += (Math.random() - 0.5) * 0.5;
                artifact.position.z += (Math.random() - 0.5) * 0.2;
                
                // Return with elastic easing
                setTimeout(() => {
                    const returnDuration = 100;
                    const startTime = Date.now();
                    const startPos = { ...artifact.position };
                    
                    const returnInterval = setInterval(() => {
                        const elapsed = Date.now() - startTime;
                        const progress = Math.min(elapsed / returnDuration, 1);
                        
                        // Elastic easing out
                        const easeProgress = progress === 1 ? 1 : 
                            1 - Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * (2 * Math.PI) / 3);
                        
                        artifact.position.x = startPos.x + (artifactOriginalPosition.x - startPos.x) * easeProgress;
                        artifact.position.y = startPos.y + (artifactOriginalPosition.y - startPos.y) * easeProgress;
                        artifact.position.z = startPos.z + (artifactOriginalPosition.z - startPos.z) * easeProgress;
                        
                        if (progress >= 1) {
                            clearInterval(returnInterval);
                            isArtifactGlitching = false;
                        }
                    }, 16);
                }, 100);
            }


            const positions = artifact.geometry.attributes.position;
            const originalPositions = artifact.geometry.attributes.originalPosition as THREE.BufferAttribute;
            for (let i = 0; i < positions.count; i++) {
                const ox = originalPositions.getX(i);
                const oy = originalPositions.getY(i);
                const oz = originalPositions.getZ(i);
                const noise = simplex.noise4D(ox * 0.5, oy * 0.5, oz * 0.5, elapsedTime * 0.15);
                const displacement = new THREE.Vector3(ox, oy, oz).normalize().multiplyScalar(noise * 0.2);
                positions.setX(i, ox + displacement.x);
                positions.setY(i, oy + displacement.y);
                positions.setZ(i, oz + displacement.z);
            }
            positions.needsUpdate = true;

            renderer.render(scene, camera);
        };
        animate();

        // --- Cleanup on unmount ---
        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('touchend', handleTouchEnd);
            cancelAnimationFrame(animationFrameId);
            renderer.dispose();
            artifactGeometry.dispose();
            artifactMaterial.dispose();
            nebulaGeometry.dispose();
            nebulaMaterial.dispose();
            textSprites.forEach(sprite => {
                if (sprite.material.map) {
                    sprite.material.map.dispose();
                }
                sprite.material.dispose();
            });
        };
    }, []);

    // Framer Motion variants for staggered fade-in animation
    const fadeUpVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                delay: i,
                duration: 1.5,
                ease: [0.23, 0.86, 0.39, 0.96] as [number, number, number, number]
            },
        }),
    };

    return (
        <div className="relative h-screen w-full overflow-hidden bg-black scanline-overlay" style={{ cursor: 'url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'12\' height=\'12\' fill=\'white\' fill-opacity=\'0.9\' /%3E%3C/svg%3E") 6 6, auto' }}>
            {/* Pixel corruption overlay */}
            {showPixelCorruption && (
                <div className="fixed inset-0 pointer-events-none z-50 pixel-corruption">
                    {Array.from({ length: 50 }).map((_, i) => (
                        <div
                            key={i}
                            className="absolute"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                width: `${Math.random() * 10 + 2}px`,
                                height: `${Math.random() * 10 + 2}px`,
                                backgroundColor: ['#00ffff', '#ff00ff', '#ffffff', '#ff0000'][Math.floor(Math.random() * 4)],
                                opacity: 0.6
                            }}
                        />
                    ))}
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div
                            key={`line-${i}`}
                            className="absolute w-full"
                            style={{
                                top: `${Math.random() * 100}%`,
                                height: '2px',
                                background: 'linear-gradient(90deg, transparent, #00ffff 50%, transparent)',
                                opacity: 0.5
                            }}
                        />
                    ))}
                </div>
            )}
            <canvas ref={mountRef} className="absolute top-0 left-0 w-full h-full z-0" />
            <section className="relative h-screen flex items-center justify-center overflow-hidden z-10">
                <div className="text-center p-4">
                    <motion.h1
                        className={`font-exo text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold uppercase tracking-wider text-white ${masterGlitch ? 'glitch-active' : ''}`}
                        style={{ textShadow: '0 0 8px rgba(255, 255, 255, 0.7), 0 0 15px rgba(255, 255, 255, 0.5), 0 0 25px rgba(255, 255, 255, 0.5)' }}
                    >
                        <motion.span variants={fadeUpVariants} custom={0.5} initial="hidden" animate="visible" className="block">
                            {masterGlitch ? corruptedTitle : 'A New World'}
                        </motion.span>
                        <motion.span variants={fadeUpVariants} custom={1.5} initial="hidden" animate="visible" className="block mt-4">
                            {masterGlitch ? corruptedSubtitle : 'Awaits'}
                        </motion.span>
                    </motion.h1>
                    {/* App Store Buttons */}
                    <motion.div 
                        variants={fadeUpVariants} 
                        custom={2} 
                        initial="hidden" 
                        animate="visible" 
                        className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-4"
                    >
                        <a
                            href="https://play.google.com/store/apps/details?id=io.dehub.mobile&hl=tr"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transition-transform hover:scale-105"
                            style={{ cursor: 'url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'12\' height=\'12\' fill=\'white\' fill-opacity=\'0.9\' /%3E%3C/svg%3E") 6 6, auto' }}
                        >
                            <img 
                                src={googlePlayBadge} 
                                alt="Get it on Google Play" 
                                style={{
                                    height: '63px',
                                    width: 'auto',
                                    filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.5))'
                                }}
                            />
                        </a>
                        <button
                            onClick={() => {
                                toast.info('Coming Soon', {
                                    description: 'The iOS app will be available soon!',
                                    duration: 3000,
                                });
                            }}
                            className="transition-transform hover:scale-105"
                            style={{ cursor: 'url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'12\' height=\'12\' fill=\'white\' fill-opacity=\'0.9\' /%3E%3C/svg%3E") 6 6, auto' }}
                        >
                            <img 
                                src={appStoreBadge} 
                                alt="Download on the App Store" 
                                style={{
                                    height: '44px',
                                    width: 'auto',
                                    filter: 'drop-shadow(0 0 12px rgba(255, 255, 255, 0.5))'
                                }}
                            />
                        </button>
                    </motion.div>
                    
                    <motion.div
                        variants={fadeUpVariants}
                        custom={2.5}
                        initial="hidden"
                        animate="visible"
                        className="mt-8 flex items-center justify-center gap-6"
                    >
                        {[
                            { icon: "send", url: "https://t.me/dehub_dhb", label: "Telegram" },
                            { icon: "music", url: "https://tiktok.com/@dehub_official", label: "TikTok" },
                            { icon: "instagram", url: "https://instagram.com/dehub_official", label: "Instagram" },
                            { icon: "twitter", url: "https://x.com/dehub_official", label: "Twitter" },
                            { icon: "scroll", url: "https://docs.dhb.gg", label: "Documentation" },
                        ].map((social, idx) => (
                            <a
                                key={idx}
                                href={social.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="transition-transform hover:scale-110"
                                style={{ cursor: 'url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'12\' height=\'12\' fill=\'white\' fill-opacity=\'0.9\' /%3E%3C/svg%3E") 6 6, auto' }}
                                aria-label={social.label}
                            >
                                {social.icon === "send" && (
                                    <img 
                                        src={telegramLogo}
                                        alt="Telegram"
                                        width="28"
                                        height="28"
                                        style={{
                                            filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))'
                                        }}
                                    />
                                )}
                                {social.icon === "twitter" && (
                                    <img 
                                        src={xLogo}
                                        alt="X (Twitter)"
                                        width="28"
                                        height="28"
                                        style={{
                                            filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))'
                                        }}
                                    />
                                )}
                                {social.icon === "instagram" && (
                                    <img 
                                        src={instagramLogo}
                                        alt="Instagram"
                                        width="28"
                                        height="28"
                                        style={{
                                            filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))'
                                        }}
                                    />
                                )}
                                {social.icon === "music" && (
                                    <img 
                                        src={tiktokLogo}
                                        alt="TikTok"
                                        width="28"
                                        height="28"
                                        style={{
                                            filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))'
                                        }}
                                    />
                                )}
                                {social.icon === "scroll" && (
                                    <div 
                                        style={{
                                            fontSize: '28px',
                                            filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.6))'
                                        }}
                                    >
                                        📜
                                    </div>
                                )}
                            </a>
                        ))}
                    </motion.div>


                    {/* Logo at bottom */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 3.5 }}
                        className="mt-8 flex justify-center translate-y-[2px]"
                    >
                        <img 
                            src={dehubLogo} 
                            alt="DeHub Logo" 
                            className="h-6 w-auto opacity-100"
                            style={{
                                filter: 'drop-shadow(0 0 8px rgba(255, 255, 255, 0.7)) drop-shadow(0 0 15px rgba(255, 255, 255, 0.5)) drop-shadow(0 0 25px rgba(255, 255, 255, 0.5))'
                            }}
                        />
                    </motion.div>
                </div>
            </section>
        </div>
    );
};
