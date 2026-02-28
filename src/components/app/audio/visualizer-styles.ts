export type VisualizerStyle = 'bars' | 'waveform' | 'circular' | 'spectrum' | 'mirror' | 'rings' | 'pulse' | 'terrain';

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

// Classic WMP-style frequency bars - full width
export function drawBars(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  const barCount = 48;
  const gap = 2;
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  const colors = getColors(hue);

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * (frequencyData.length * 0.6));
    const value = frequencyData[dataIndex] / 255;
    const barHeight = value * height * 0.9;

    const x = i * (barWidth + gap);
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
  const radius = Math.min(width, height) * 0.28;
  const barCount = 128;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * (frequencyData.length * 0.6));
    const value = frequencyData[dataIndex] / 255;
    const barHeight = value * radius * 0.9;

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
    ctx.lineWidth = Math.max(2, (Math.PI * 2 * radius) / barCount * 0.7);
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

// Scrolling Spectrogram - shows frequency history over time
let spectrumImageData: ImageData | null = null;

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  // Initialize or resize image buffer
  if (!spectrumImageData || spectrumImageData.width !== width || spectrumImageData.height !== height) {
    spectrumImageData = ctx.createImageData(width, height);
    // Fill with transparent black
    for (let i = 0; i < spectrumImageData.data.length; i += 4) {
      spectrumImageData.data[i] = 0;
      spectrumImageData.data[i + 1] = 0;
      spectrumImageData.data[i + 2] = 0;
      spectrumImageData.data[i + 3] = 255;
    }
  }

  const data = spectrumImageData.data;

  // Shift all pixels left by 2 pixels for faster scrolling
  const shiftPixels = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - shiftPixels; x++) {
      const srcIndex = (y * width + x + shiftPixels) * 4;
      const dstIndex = (y * width + x) * 4;
      data[dstIndex] = data[srcIndex];
      data[dstIndex + 1] = data[srcIndex + 1];
      data[dstIndex + 2] = data[srcIndex + 2];
      data[dstIndex + 3] = data[srcIndex + 3];
    }
  }

  // Draw new column(s) on right edge
  for (let px = 0; px < shiftPixels; px++) {
    const xPos = width - shiftPixels + px;
    for (let y = 0; y < height; y++) {
      // Map y position to frequency bin (invert so low freq at bottom)
      const freqIndex = Math.floor(((height - 1 - y) / height) * frequencyData.length);
      const value = frequencyData[freqIndex] / 255;

      // Calculate color based on intensity and hue
      // Use hue shifting for different intensity levels
      const intensity = Math.pow(value, 0.7); // Gamma correction for better visibility
      const colorHue = (hue + intensity * 60) % 360; // Shift hue with intensity
      const saturation = 70 + intensity * 25;
      const lightness = intensity * 60;

      // Convert HSL to RGB
      const c = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
      const x = c * (1 - Math.abs((colorHue / 60) % 2 - 1));
      const m = lightness / 100 - c / 2;

      let r = 0, g = 0, b = 0;
      if (colorHue < 60) { r = c; g = x; b = 0; }
      else if (colorHue < 120) { r = x; g = c; b = 0; }
      else if (colorHue < 180) { r = 0; g = c; b = x; }
      else if (colorHue < 240) { r = 0; g = x; b = c; }
      else if (colorHue < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }

      const index = (y * width + xPos) * 4;
      data[index] = Math.round((r + m) * 255);
      data[index + 1] = Math.round((g + m) * 255);
      data[index + 2] = Math.round((b + m) * 255);
      data[index + 3] = 255;
    }
  }

  // Put the image data back
  ctx.putImageData(spectrumImageData, 0, 0);

  // Add frequency labels glow line on right
  const gradient = ctx.createLinearGradient(width - 3, 0, width, 0);
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0.5)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(width - 3, 0, 3, height);
}

export function resetSpectrum() {
  spectrumImageData = null;
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

  const barCount = 48;
  const gap = 2;
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  const centerY = height / 2;

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * (frequencyData.length * 0.6));
    const value = frequencyData[dataIndex] / 255;
    const barHeight = value * (height / 2) * 0.85;

    const x = i * (barWidth + gap);

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

// Pulse - Morphing frequency blob that reacts to music
export function drawPulse(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 260
) {
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.25;

  // Calculate energy levels for different frequency ranges
  let bassEnergy = 0;
  for (let i = 0; i < 8; i++) {
    bassEnergy += frequencyData[i];
  }
  bassEnergy = bassEnergy / 8 / 255;

  let midEnergy = 0;
  for (let i = 8; i < 32; i++) {
    midEnergy += frequencyData[i];
  }
  midEnergy = midEnergy / 24 / 255;

  let highEnergy = 0;
  for (let i = 32; i < 64; i++) {
    highEnergy += frequencyData[i];
  }
  highEnergy = highEnergy / 32 / 255;

  const totalEnergy = (bassEnergy * 0.5 + midEnergy * 0.3 + highEnergy * 0.2);

  // Draw multiple layers - outer (high), middle (mid), inner (bass)
  const layers = [
    { energy: highEnergy, radiusMult: 1.3, hueOffset: 60, opacity: 0.3, points: 64 },
    { energy: midEnergy, radiusMult: 1.0, hueOffset: 30, opacity: 0.5, points: 48 },
    { energy: bassEnergy, radiusMult: 0.7, hueOffset: 0, opacity: 0.8, points: 32 },
  ];

  // Background glow based on total energy
  const bgGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius * 2);
  bgGlow.addColorStop(0, `hsla(${hue}, 80%, 50%, ${totalEnergy * 0.3})`);
  bgGlow.addColorStop(0.5, `hsla(${hue}, 70%, 40%, ${totalEnergy * 0.1})`);
  bgGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, width, height);

  layers.forEach((layer, layerIndex) => {
    const layerHue = (hue + layer.hueOffset) % 360;
    const layerRadius = baseRadius * layer.radiusMult;

    ctx.beginPath();

    for (let i = 0; i <= layer.points; i++) {
      const angle = (i / layer.points) * Math.PI * 2;
      
      // Map angle to frequency bin
      const freqIndex = Math.floor((i / layer.points) * (frequencyData.length * 0.5));
      const freqValue = frequencyData[freqIndex] / 255;

      // Calculate radius at this angle - blob shape with frequency modulation
      const morphAmount = freqValue * layerRadius * 0.5;
      const wobble = Math.sin(angle * 3) * layer.energy * 10;
      const radius = layerRadius + morphAmount + wobble;

      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        // Use bezier curves for smooth blob shape
        const prevAngle = ((i - 1) / layer.points) * Math.PI * 2;
        const prevFreqIndex = Math.floor(((i - 1) / layer.points) * (frequencyData.length * 0.5));
        const prevFreqValue = frequencyData[prevFreqIndex] / 255;
        const prevMorph = prevFreqValue * layerRadius * 0.5;
        const prevWobble = Math.sin(prevAngle * 3) * layer.energy * 10;
        const prevRadius = layerRadius + prevMorph + prevWobble;

        const prevX = centerX + Math.cos(prevAngle) * prevRadius;
        const prevY = centerY + Math.sin(prevAngle) * prevRadius;

        const cpRadius = (radius + prevRadius) / 2;
        const cpAngle = (angle + prevAngle) / 2;
        const cpX = centerX + Math.cos(cpAngle) * cpRadius * 1.05;
        const cpY = centerY + Math.sin(cpAngle) * cpRadius * 1.05;

        ctx.quadraticCurveTo(cpX, cpY, x, y);
      }
    }

    ctx.closePath();

    // Fill with gradient
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, layerRadius * 1.5);
    gradient.addColorStop(0, `hsla(${layerHue}, 90%, 70%, ${layer.opacity * layer.energy})`);
    gradient.addColorStop(0.5, `hsla(${layerHue}, 80%, 55%, ${layer.opacity * 0.7 * (0.3 + layer.energy * 0.7)})`);
    gradient.addColorStop(1, `hsla(${layerHue}, 70%, 40%, 0)`);

    ctx.fillStyle = gradient;
    ctx.fill();

    // Add glow stroke
    ctx.strokeStyle = `hsla(${layerHue}, 85%, 65%, ${layer.opacity * (0.5 + layer.energy * 0.5)})`;
    ctx.lineWidth = 2 + layer.energy * 2;
    ctx.shadowColor = `hsla(${layerHue}, 90%, 60%, ${layer.energy})`;
    ctx.shadowBlur = 10 + layer.energy * 15;
    ctx.stroke();
    ctx.shadowBlur = 0;
  });

  // Inner core - bright center
  const coreRadius = baseRadius * 0.15 + bassEnergy * 20;
  const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius);
  coreGradient.addColorStop(0, `hsla(${hue}, 100%, 95%, ${0.8 + bassEnergy * 0.2})`);
  coreGradient.addColorStop(0.5, `hsla(${hue}, 90%, 75%, ${0.5 + bassEnergy * 0.3})`);
  coreGradient.addColorStop(1, `hsla(${hue}, 80%, 60%, 0)`);

  ctx.beginPath();
  ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
  ctx.fillStyle = coreGradient;
  ctx.shadowColor = `hsla(${hue}, 100%, 80%, 0.8)`;
  ctx.shadowBlur = 20 + bassEnergy * 20;
  ctx.fill();
  ctx.shadowBlur = 0;
}

export function resetPulse() {
  // No persistent state to reset
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
