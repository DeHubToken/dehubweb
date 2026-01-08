export type VisualizerStyle = 'bars' | 'waveform' | 'circular' | 'particles' | 'mirror' | 'rings' | 'starfield' | 'terrain';

// Helper to get colors from hue
function getColors(hue: number) {
  return {
    primary: `hsla(${hue}, 80%, 60%, 0.8)`,
    secondary: `hsla(${(hue + 30) % 360}, 70%, 50%, 0.9)`,
    highlight: `hsla(${hue}, 90%, 85%, 1)`,
    glow: `hsla(${hue}, 80%, 60%, 0.6)`,
    dim: `hsla(${hue}, 60%, 40%, 0.6)`,
  };
}

// Classic WMP-style frequency bars
export function drawBars(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  const barCount = 32;
  const barWidth = width / barCount - 2;
  const barSpacing = 2;
  const colors = getColors(hue);

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * frequencyData.length);
    const value = frequencyData[dataIndex] / 255;
    const barHeight = value * height * 0.9;

    const x = i * (barWidth + barSpacing);
    const y = height - barHeight;

    // Create gradient for each bar
    const gradient = ctx.createLinearGradient(x, height, x, y);
    gradient.addColorStop(0, colors.primary);
    gradient.addColorStop(0.5, colors.secondary);
    gradient.addColorStop(1, colors.highlight);

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);

    // Add glow effect on high values
    if (value > 0.7) {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 15;
      ctx.fillRect(x, y, barWidth, barHeight);
      ctx.shadowBlur = 0;
    }
  }
}

// Oscilloscope-style waveform
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  timeData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  const colors = getColors(hue);
  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.strokeStyle = colors.highlight;
  ctx.lineWidth = 2;

  const sliceWidth = width / timeData.length;
  let x = 0;

  for (let i = 0; i < timeData.length; i++) {
    const v = timeData[i] / 128.0;
    const y = (v * height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.stroke();

  // Add glow
  ctx.shadowColor = colors.glow;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// Radial/circular visualizer
export function drawCircular(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  const colors = getColors(hue);
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 3;
  const barCount = 64;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * frequencyData.length);
    const value = frequencyData[dataIndex] / 255;
    const barHeight = value * radius * 0.8;

    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const x1 = centerX + Math.cos(angle) * radius;
    const y1 = centerY + Math.sin(angle) * radius;
    const x2 = centerX + Math.cos(angle) * (radius + barHeight);
    const y2 = centerY + Math.sin(angle) * (radius + barHeight);

    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, colors.dim);
    gradient.addColorStop(1, colors.highlight);

    ctx.beginPath();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Draw center circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 5, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${hue}, 60%, 80%, 0.3)`;
  ctx.lineWidth = 1;
  ctx.stroke();
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  hue: number;
  type: 'bass' | 'treble';
}

let particles: Particle[] = [];
let lastBassLevel = 0;

// Particle burst visualizer - Enhanced for audio sync
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate bass level (first 8 frequency bands)
  let bassLevel = 0;
  for (let i = 0; i < 8; i++) {
    bassLevel += frequencyData[i];
  }
  bassLevel = bassLevel / 8 / 255;

  // Calculate treble level (higher frequencies for sparkles)
  let trebleLevel = 0;
  for (let i = 32; i < 64; i++) {
    trebleLevel += frequencyData[i];
  }
  trebleLevel = trebleLevel / 32 / 255;

  // Beat detection - sudden increase in bass
  const isBeat = bassLevel > lastBassLevel * 1.3 && bassLevel > 0.35;
  lastBassLevel = bassLevel * 0.3 + lastBassLevel * 0.7; // Smooth decay

  // Spawn bass particles on beats (lowered threshold from 0.6 to 0.35)
  if (bassLevel > 0.35 && particles.length < 150) {
    const count = isBeat ? Math.floor(bassLevel * 20) : Math.floor(bassLevel * 5);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6 * bassLevel;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 3 + Math.random() * 5 * bassLevel,
        hue: hue + Math.random() * 40 - 20,
        type: 'bass',
      });
    }
  }

  // Spawn treble sparkles (small fast particles for high frequencies)
  if (trebleLevel > 0.3 && particles.length < 200) {
    const count = Math.floor(trebleLevel * 4);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 50;
      particles.push({
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3 - 1,
        life: 0.6,
        size: 1 + Math.random() * 2,
        hue: hue + 60 + Math.random() * 30,
        type: 'treble',
      });
    }
  }

  // Update and draw particles with audio-reactive pulsing
  particles = particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.type === 'bass' ? 0.015 : 0.025;
    p.vy += p.type === 'bass' ? 0.03 : 0.01; // Less gravity for treble

    if (p.life <= 0) return false;

    // Pulse size with current bass (particles react even after spawning)
    const pulseFactor = p.type === 'bass' ? 1 + bassLevel * 0.5 : 1;
    const currentSize = p.size * p.life * pulseFactor;

    ctx.beginPath();
    ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
    const brightness = p.type === 'bass' ? 70 + bassLevel * 20 : 85;
    ctx.fillStyle = `hsla(${p.hue}, 80%, ${brightness}%, ${p.life})`;
    ctx.fill();

    // Enhanced glow on beats
    if (isBeat || bassLevel > 0.5) {
      ctx.shadowColor = `hsla(${p.hue}, 90%, 70%, ${p.life})`;
      ctx.shadowBlur = 15 + bassLevel * 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    return true;
  });

  // Draw larger, more reactive center orb
  const orbBaseSize = 30 + bassLevel * 50;
  const orbGlow = isBeat ? 40 : 20;
  
  // Outer glow ring that expands on beats
  if (isBeat) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, orbBaseSize + 20, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.4)`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Main orb gradient
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, orbBaseSize);
  gradient.addColorStop(0, `hsla(${hue}, 90%, 80%, ${0.5 + bassLevel * 0.5})`);
  gradient.addColorStop(0.5, `hsla(${hue}, 80%, 60%, ${0.3 + bassLevel * 0.4})`);
  gradient.addColorStop(1, `hsla(${hue}, 80%, 50%, 0)`);
  
  ctx.shadowColor = `hsla(${hue}, 80%, 60%, 0.8)`;
  ctx.shadowBlur = orbGlow + bassLevel * 20;
  ctx.beginPath();
  ctx.arc(centerX, centerY, orbBaseSize, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowBlur = 0;
}

export function resetParticles() {
  particles = [];
  lastBassLevel = 0;
}

// Mirror bars - symmetrical bars from center
export function drawMirror(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  const colors = getColors(hue);
  ctx.clearRect(0, 0, width, height);

  const barCount = 32;
  const barWidth = width / barCount - 2;
  const barSpacing = 2;
  const centerY = height / 2;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * frequencyData.length);
    const value = frequencyData[dataIndex] / 255;
    const barHeight = value * (height / 2) * 0.85;

    const x = i * (barWidth + barSpacing);

    // Create gradient
    const gradient = ctx.createLinearGradient(x, centerY - barHeight, x, centerY + barHeight);
    gradient.addColorStop(0, colors.highlight);
    gradient.addColorStop(0.5, colors.primary);
    gradient.addColorStop(1, colors.highlight);

    ctx.fillStyle = gradient;
    
    // Top half (mirrored)
    ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
    // Bottom half
    ctx.fillRect(x, centerY, barWidth, barHeight);

    // Glow on peaks
    if (value > 0.7) {
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = 12;
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2);
      ctx.shadowBlur = 0;
    }
  }

  // Center line
  ctx.beginPath();
  ctx.strokeStyle = `hsla(${hue}, 80%, 80%, 0.4)`;
  ctx.lineWidth = 1;
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();
}

// Rings - concentric ripple circles
interface Ring {
  radius: number;
  opacity: number;
  hue: number;
}

let rings: Ring[] = [];

export function drawRings(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) / 2;

  // Calculate average level
  let avgLevel = 0;
  for (let i = 0; i < frequencyData.length / 4; i++) {
    avgLevel += frequencyData[i];
  }
  avgLevel = avgLevel / (frequencyData.length / 4) / 255;

  // Spawn new rings on beats
  if (avgLevel > 0.5 && rings.length < 15) {
    rings.push({
      radius: 10,
      opacity: avgLevel,
      hue: hue + Math.random() * 30 - 15,
    });
  }

  // Update and draw rings
  rings = rings.filter((ring) => {
    ring.radius += 2 + avgLevel * 3;
    ring.opacity -= 0.015;

    if (ring.opacity <= 0 || ring.radius > maxRadius) return false;

    ctx.beginPath();
    ctx.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${ring.hue}, 80%, 65%, ${ring.opacity})`;
    ctx.lineWidth = 2 + ring.opacity * 3;
    ctx.stroke();

    return true;
  });

  // Draw center pulse
  const pulseSize = 15 + avgLevel * 25;
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulseSize);
  gradient.addColorStop(0, `hsla(${hue}, 90%, 70%, ${0.6 + avgLevel * 0.3})`);
  gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0)`);
  ctx.beginPath();
  ctx.arc(centerX, centerY, pulseSize, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

export function resetRings() {
  rings = [];
}

// Starfield - 3D flying stars - Enhanced for audio sync
interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
  baseHue: number;
}

let stars: Star[] = [];
let starsInitialized = false;
let lastStarEnergy = 0;
let speedBoost = 0;

function initStars(width: number, height: number, hue: number) {
  stars = [];
  for (let i = 0; i < 200; i++) {
    stars.push({
      x: Math.random() * width - width / 2,
      y: Math.random() * height - height / 2,
      z: Math.random() * 1000,
      size: Math.random() * 2 + 1,
      baseHue: hue + Math.random() * 60 - 30,
    });
  }
  starsInitialized = true;
}

export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  if (!starsInitialized) initStars(width, height, hue);

  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate bass energy (more reactive)
  let bassEnergy = 0;
  for (let i = 0; i < 12; i++) {
    bassEnergy += frequencyData[i];
  }
  bassEnergy = bassEnergy / 12 / 255;

  // Calculate mid energy
  let midEnergy = 0;
  for (let i = 12; i < 48; i++) {
    midEnergy += frequencyData[i];
  }
  midEnergy = midEnergy / 36 / 255;

  // Combined energy weighted toward bass
  const energy = bassEnergy * 0.7 + midEnergy * 0.3;

  // Beat detection for speed bursts
  const isBeat = energy > lastStarEnergy * 1.4 && energy > 0.4;
  if (isBeat) {
    speedBoost = 30; // Instant speed boost on beat
  }
  speedBoost *= 0.92; // Decay the boost
  lastStarEnergy = energy * 0.2 + lastStarEnergy * 0.8;

  // Speed starts at 0 during silence, scales up with energy
  const baseSpeed = energy * 40;
  const speed = baseSpeed + speedBoost;

  stars.forEach((star) => {
    // Move star toward viewer
    star.z -= speed;

    // Reset star if too close
    if (star.z <= 0) {
      star.x = Math.random() * width - width / 2;
      star.y = Math.random() * height - height / 2;
      star.z = 1000;
      star.baseHue = hue + Math.random() * 60 - 30;
    }

    // Project 3D to 2D
    const scale = 200 / star.z;
    const x = centerX + star.x * scale;
    const y = centerY + star.y * scale;
    const size = star.size * scale;

    // Skip if out of bounds
    if (x < 0 || x > width || y < 0 || y > height) return;

    // Brightness increases as star approaches and pulses on beats
    let brightness = Math.min(1, (1000 - star.z) / 400);
    if (isBeat) brightness = Math.min(1, brightness * 1.5); // Flash on beats

    // Trail length scales dramatically with energy
    const trailLength = Math.min(60, speed * 1.2);
    
    // Trail
    const prevScale = 200 / (star.z + trailLength);
    const prevX = centerX + star.x * prevScale;
    const prevY = centerY + star.y * prevScale;

    // Draw trail with energy-based width
    const trailWidth = size * (0.3 + energy * 0.7);
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = `hsla(${star.baseHue}, 80%, ${50 + brightness * 40}%, ${brightness * 0.7})`;
    ctx.lineWidth = trailWidth;
    ctx.stroke();

    // Star point - bigger and brighter on beats
    const starSize = isBeat ? size * 1.5 : size;
    ctx.beginPath();
    ctx.arc(x, y, starSize, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${star.baseHue}, 85%, ${65 + brightness * 30}%, ${brightness})`;
    ctx.fill();

    // Glow on high energy
    if (energy > 0.5 || isBeat) {
      ctx.shadowColor = `hsla(${star.baseHue}, 90%, 70%, ${brightness})`;
      ctx.shadowBlur = 8 + energy * 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  // Center vignette glow on beats
  if (isBeat) {
    const vignetteGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(width, height) * 0.5);
    vignetteGradient.addColorStop(0, `hsla(${hue}, 80%, 60%, 0.15)`);
    vignetteGradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0)`);
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, width, height);
  }
}

export function resetStarfield() {
  stars = [];
  starsInitialized = false;
  lastStarEnergy = 0;
  speedBoost = 0;
}

// Terrain - retro synthwave wireframe
let terrainOffset = 0;

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  ctx.clearRect(0, 0, width, height);

  const colors = getColors(hue);
  const rows = 12;
  const cols = 24;
  const perspective = 0.7;
  const horizonY = height * 0.35;

  // Calculate bass for motion
  let bassLevel = 0;
  for (let i = 0; i < 8; i++) {
    bassLevel += frequencyData[i];
  }
  bassLevel = bassLevel / 8 / 255;

  terrainOffset += 0.02 + bassLevel * 0.08;

  // Draw horizon glow
  const horizonGradient = ctx.createLinearGradient(0, 0, 0, horizonY);
  horizonGradient.addColorStop(0, `hsla(${(hue + 180) % 360}, 60%, 20%, 0.3)`);
  horizonGradient.addColorStop(1, `hsla(${hue}, 80%, 50%, 0.2)`);
  ctx.fillStyle = horizonGradient;
  ctx.fillRect(0, 0, width, horizonY);

  // Sun
  const sunGradient = ctx.createRadialGradient(width / 2, horizonY, 0, width / 2, horizonY, 40);
  sunGradient.addColorStop(0, `hsla(${(hue + 40) % 360}, 100%, 70%, 0.8)`);
  sunGradient.addColorStop(0.5, `hsla(${hue}, 80%, 50%, 0.4)`);
  sunGradient.addColorStop(1, `hsla(${hue}, 80%, 50%, 0)`);
  ctx.beginPath();
  ctx.arc(width / 2, horizonY, 40, 0, Math.PI * 2);
  ctx.fillStyle = sunGradient;
  ctx.fill();

  // Draw grid
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 1;

  for (let row = 0; row < rows; row++) {
    const rowProgress = row / rows;
    const y = horizonY + (height - horizonY) * Math.pow(rowProgress, perspective);
    const nextY = horizonY + (height - horizonY) * Math.pow((row + 1) / rows, perspective);

    // Get frequency data for this row
    const freqIndex = Math.floor((row / rows) * (frequencyData.length / 2));
    const freqValue = frequencyData[freqIndex] / 255;

    for (let col = 0; col < cols; col++) {
      const colProgress = col / cols;
      const nextColProgress = (col + 1) / cols;

      // Calculate x positions with perspective
      const xSpread = 1 + (1 - rowProgress) * 0.5;
      const x1 = width * (0.5 + (colProgress - 0.5) * xSpread);
      const x2 = width * (0.5 + (nextColProgress - 0.5) * xSpread);

      const nextXSpread = 1 + (1 - (row + 1) / rows) * 0.5;
      const nextX1 = width * (0.5 + (colProgress - 0.5) * nextXSpread);

      // Height offset based on frequency and wave
      const wave = Math.sin((col / cols) * Math.PI * 4 + terrainOffset * 3) * 0.5 + 0.5;
      const heightOffset = freqValue * wave * 15 * (1 - rowProgress);

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(x1, y - heightOffset);
      ctx.lineTo(x2, y - heightOffset);
      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${0.3 + rowProgress * 0.5})`;
      ctx.stroke();

      // Vertical line (only for some columns)
      if (row < rows - 1 && col % 2 === 0) {
        const nextFreqValue = frequencyData[Math.floor(((row + 1) / rows) * (frequencyData.length / 2))] / 255;
        const nextWave = Math.sin((col / cols) * Math.PI * 4 + terrainOffset * 3) * 0.5 + 0.5;
        const nextHeightOffset = nextFreqValue * nextWave * 15 * (1 - (row + 1) / rows);

        ctx.beginPath();
        ctx.moveTo(x1, y - heightOffset);
        ctx.lineTo(nextX1, nextY - nextHeightOffset);
        ctx.strokeStyle = `hsla(${hue}, 60%, 55%, ${0.2 + rowProgress * 0.4})`;
        ctx.stroke();
      }
    }
  }
}

export function resetTerrain() {
  terrainOffset = 0;
}
