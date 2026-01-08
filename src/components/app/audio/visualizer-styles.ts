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
}

let particles: Particle[] = [];

// Particle burst visualizer
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

  // Calculate bass level (average of first 8 frequency bands)
  let bassLevel = 0;
  for (let i = 0; i < 8; i++) {
    bassLevel += frequencyData[i];
  }
  bassLevel = bassLevel / 8 / 255;

  // Spawn particles on bass hits
  if (bassLevel > 0.6 && particles.length < 100) {
    const count = Math.floor(bassLevel * 10);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4 * bassLevel;
      particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 2 + Math.random() * 4,
        hue: hue + Math.random() * 40 - 20, // Vary around selected hue
      });
    }
  }

  // Update and draw particles
  particles = particles.filter((p) => {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
    p.vy += 0.05; // Gravity

    if (p.life <= 0) return false;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${p.hue}, 80%, 70%, ${p.life})`;
    ctx.fill();

    // Add glow
    ctx.shadowColor = `hsla(${p.hue}, 80%, 70%, 0.8)`;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    return true;
  });

  // Draw subtle center orb
  const orbSize = 20 + bassLevel * 30;
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, orbSize);
  gradient.addColorStop(0, `hsla(${hue}, 80%, 60%, ${0.3 + bassLevel * 0.4})`);
  gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0)`);
  ctx.beginPath();
  ctx.arc(centerX, centerY, orbSize, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

export function resetParticles() {
  particles = [];
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

// Starfield - 3D flying stars
interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
}

let stars: Star[] = [];
let starsInitialized = false;

function initStars(width: number, height: number) {
  stars = [];
  for (let i = 0; i < 150; i++) {
    stars.push({
      x: Math.random() * width - width / 2,
      y: Math.random() * height - height / 2,
      z: Math.random() * 1000,
      size: Math.random() * 2 + 1,
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
  if (!starsInitialized) initStars(width, height);

  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate energy level
  let energy = 0;
  for (let i = 0; i < frequencyData.length / 2; i++) {
    energy += frequencyData[i];
  }
  energy = energy / (frequencyData.length / 2) / 255;

  const speed = 5 + energy * 25;

  stars.forEach((star) => {
    // Move star toward viewer
    star.z -= speed;

    // Reset star if too close
    if (star.z <= 0) {
      star.x = Math.random() * width - width / 2;
      star.y = Math.random() * height - height / 2;
      star.z = 1000;
    }

    // Project 3D to 2D
    const scale = 200 / star.z;
    const x = centerX + star.x * scale;
    const y = centerY + star.y * scale;
    const size = star.size * scale;

    // Skip if out of bounds
    if (x < 0 || x > width || y < 0 || y > height) return;

    // Draw star with trail
    const brightness = Math.min(1, (1000 - star.z) / 500);
    const trailLength = Math.min(20, speed * 0.8);
    
    // Trail
    const prevScale = 200 / (star.z + trailLength);
    const prevX = centerX + star.x * prevScale;
    const prevY = centerY + star.y * prevScale;

    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = `hsla(${hue + (star.z / 1000) * 40}, 80%, ${50 + brightness * 40}%, ${brightness * 0.6})`;
    ctx.lineWidth = size * 0.5;
    ctx.stroke();

    // Star point
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${hue}, 80%, ${60 + brightness * 30}%, ${brightness})`;
    ctx.fill();
  });
}

export function resetStarfield() {
  stars = [];
  starsInitialized = false;
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
