export type VisualizerStyle = 'static' | 'bars' | 'waveform' | 'circular' | 'spectrum' | 'mirror' | 'rings' | 'pulse' | 'terrain' | 'orb';

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

// Static waveform - full-track amplitude display with L-R playback progress.
// Pre-decodes the audio file to extract amplitude peaks for the entire duration,
// then renders all bars at once. Bars behind the playhead are brighter/colored;
// bars ahead are dim. The playhead sweeps left→right as the audio plays.

/** Cached decoded waveform data per URL */
const waveformCache = new Map<string, number[]>();
/**
 * Decodes currently in flight, keyed by URL, each holding the cards waiting on
 * it. This used to be a single `activeDecodeUrl` string: a card whose track
 * started decoding while a *different* track was in flight returned early and
 * its `onReady` was never called, so its peaks stayed null forever and it
 * painted an empty box. A feed with more than one audio post hit that every
 * time. One entry per URL fixes it and still collapses repeat requests for the
 * same URL into a single fetch.
 */
const activeDecodes = new Map<string, ((peaks: number[]) => void)[]>();

/**
 * Decode an audio URL and cache its per-bar amplitude peaks.
 * Returns immediately if already cached.  Calls `onReady` when done.
 */
export async function decodeAudioWaveform(
  audioUrl: string,
  barCount: number,
  onReady: (peaks: number[]) => void
) {
  // Already cached
  const cached = waveformCache.get(audioUrl);
  if (cached && cached.length === barCount) {
    onReady(cached);
    return;
  }

  // Same URL already decoding — wait on that one rather than fetching twice.
  const waiting = activeDecodes.get(audioUrl);
  if (waiting) {
    waiting.push(onReady);
    return;
  }
  const subscribers: ((peaks: number[]) => void)[] = [onReady];
  activeDecodes.set(audioUrl, subscribers);

  const settle = (peaks: number[]) => {
    waveformCache.set(audioUrl, peaks);
    activeDecodes.delete(audioUrl);
    for (const fn of subscribers) fn(peaks);
  };

  try {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(1, 1, 44100);
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

    const rawData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.floor(rawData.length / barCount);
    const peaks: number[] = [];

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      const start = i * samplesPerBar;
      for (let j = start; j < start + samplesPerBar && j < rawData.length; j++) {
        sum += Math.abs(rawData[j]);
      }
      peaks.push(sum / samplesPerBar);
    }

    // Normalize to 0–1
    const max = Math.max(...peaks, 0.001);
    settle(peaks.map(p => p / max));
  } catch (err) {
    console.error('Failed to decode audio waveform:', err);
    // Fallback: generate a seeded pattern
    settle(generateFallbackPattern(audioUrl, barCount));
  }
}

/** Simple seeded PRNG (mulberry32) for fallback */
function seedRandom(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  }
  return () => {
    h |= 0;
    h = h + 0x6d2b79f5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateFallbackPattern(seed: string, count: number): number[] {
  const rand = seedRandom(seed);
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
    bars.push(envelope * (0.4 + 0.6 * rand()));
  }
  return bars;
}

/**
 * A stable, per-post waveform shape to paint before (or instead of) the real
 * decode. The decode needs the whole file, so a card that is far from the
 * viewport, offline or serving a track the browser cannot decode has nothing —
 * and a waveform of nothing is a black rectangle. Every style falls back to
 * this so an audio post always looks like an audio post.
 */
const seededPeaksCache = new Map<string, number[]>();
export function seededPeaks(seed: string, count: number): number[] {
  const key = `${seed}:${count}`;
  let cached = seededPeaksCache.get(key);
  if (!cached) {
    cached = generateFallbackPattern(seed, count);
    seededPeaksCache.set(key, cached);
  }
  return cached;
}

/**
 * Frequency-domain frame synthesised from a waveform shape, so the analyser
 * styles have something to draw while paused. Without it, switching style with
 * the audio stopped left the previous style's last frame on the canvas and the
 * picker looked dead.
 */
export function idleFrequencyData(peaks: number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (!peaks.length) return out;
  for (let i = 0; i < length; i++) {
    const p = peaks[Math.floor((i / length) * peaks.length)] ?? 0;
    // Tilt down across the spectrum the way real music does, so bars/spectrum
    // read as a plausible frozen frame rather than a flat wall.
    const tilt = 1 - (i / length) * 0.75;
    out[i] = Math.round(Math.min(1, p * 0.7 * tilt) * 255);
  }
  return out;
}

/** Time-domain counterpart of `idleFrequencyData`, centred on the 128 zero line. */
export function idleTimeData(peaks: number[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const p = peaks.length ? (peaks[Math.floor((i / length) * peaks.length)] ?? 0) : 0;
    out[i] = Math.round(128 + Math.sin((i / length) * Math.PI * 8) * p * 40);
  }
  return out;
}

/**
 * Draw the full-track waveform. `progress` is 0–1 representing playback position.
 */
export function drawStatic(
  ctx: CanvasRenderingContext2D,
  _frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0,
  seed: string = 'default',
  progress: number = 0,
  peaks: number[] | null = null,
  barCountHint = 100
) {
  ctx.clearRect(0, 0, width, height);

  // Never return without drawing: an audio card with no decoded peaks yet used
  // to be an empty black box until the whole file had downloaded.
  const shape = peaks && peaks.length ? peaks : seededPeaks(seed, barCountHint);

  const barCount = shape.length;
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);
  const centerY = height / 2;
  const maxBarH = height * 0.8;
  // Use fractional progress for smooth sweep instead of snapping bar-by-bar
  const progressX = progress * (barCount * (barWidth + gap));

  for (let i = 0; i < barCount; i++) {
    const barH = Math.max(2, shape[i] * maxBarH);
    const x = i * (barWidth + gap);
    const y = centerY - barH / 2;
    const barEnd = x + barWidth;

    // Determine how "played" this bar is (0 = unplayed, 1 = fully played, 0-1 = partial)
    let playedRatio = 0;
    if (progressX >= barEnd) {
      playedRatio = 1;
    } else if (progressX > x) {
      playedRatio = (progressX - x) / barWidth;
    }

    // Draw unplayed portion (full bar, dim)
    ctx.fillStyle = `hsla(0, 0%, 100%, 0.2)`;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, 1);
    ctx.fill();

    // Draw played portion on top
    if (playedRatio > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, barWidth * playedRatio, barH);
      ctx.clip();

      if (hue === 0) {
        ctx.fillStyle = `hsla(0, 0%, 100%, 0.85)`;
      } else {
        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        gradient.addColorStop(0, `hsla(${hue}, 80%, 75%, 0.9)`);
        gradient.addColorStop(0.5, `hsla(${hue}, 85%, 60%, 0.95)`);
        gradient.addColorStop(1, `hsla(${hue}, 80%, 75%, 0.9)`);
        ctx.fillStyle = gradient;
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1);
      ctx.fill();
      ctx.restore();
    }
  }
}

export function resetStatic() {
  // No per-frame state to reset
}


/* ─── Orb ──────────────────────────────────────────────────────────────────
   The assistant's ball of cosmic dust, on canvas and wired to the analyser.

   This is a TRANSCRIPTION of src/components/app/chat/ReplyOrb.tsx, not a new
   effect that resembles it: same 30 grains, same uniform-y latitudes, same
   golden-angle longitudes, same -14° lean, same 0.42/0.05/0.62 ratios, same
   0.55+0.45·depth scale and 0.2+0.8·depth fade, same 9000ms idle spin. Change
   one, change all three (web orb, mobile orb, this) or the ball stops being
   the same object in three places.

   The only thing this file adds is the music, and it adds it to values the
   orb already had rather than to new geometry:
     · spin sweeps between the orb's own idle (9000ms) and thinking (2600ms)
       rates with loudness, so a loud track really is the "thinking" ball;
     · the haze pulse the orb runs on a timer is driven by bass instead;
     · each grain owns a slice of the spectrum, so its own band brightens it,
       fattens it and pushes it a little off the sphere;
     · loudness opens up the glow and the colour saturation. */

/** Mirrors ReplyOrb's MOTES. */
const ORB_MOTES = 30;
/** Golden-angle fraction (137.5°/360°) — ReplyOrb's GOLDEN_FRACTION. */
const ORB_GOLDEN_FRACTION = 0.381966;
/** ms — ReplyOrb's DURATION, and the two ends the music interpolates between. */
const ORB_DURATION = {
  idle: { spin: 9000, haze: 3000 },
  thinking: { spin: 2600, haze: 1200 },
} as const;
/** ReplyOrb's RATIO: sphere radius, grain size and haze size over the box. */
const ORB_RATIO = { sphere: 0.42, mote: 0.05, haze: 0.62 } as const;
/** ReplyOrb's TILT_DEG. */
const ORB_TILT = (-14 * Math.PI) / 180;
const ORB_TAU = Math.PI * 2;

/** ReplyOrb's LAYOUT, plus the one field it has no use for: which slice of the
    spectrum this grain listens to. Longitude picks it, so a grain carries its
    band around the sphere as it turns — keyed off latitude it would paint a
    bass-pole/treble-pole gradient that never moves. */
const ORB_LAYOUT = Array.from({ length: ORB_MOTES }, (_, i) => {
  const t = (i + 0.5) / ORB_MOTES;
  const y = 1 - 2 * t;
  const phase = (i * ORB_GOLDEN_FRACTION) % 1;
  return {
    y,
    ringRadius: Math.sqrt(Math.max(0, 1 - y * y)),
    phase,
    bright: i % 7 === 3,
    // Crowded towards the low end, where music actually lives.
    binFrac: Math.pow(phase, 1.35),
  };
});

let orbSpin = 0;
let orbHaze = 0;
let orbHazeDir = 1;
let orbEnergy = 0;
let orbBass = 0;
let orbLastFrame = 0;

const orbLerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function drawOrb(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number,
  hue: number = 0
) {
  ctx.clearRect(0, 0, width, height);

  const bins = frequencyData.length;
  const band = (from: number, to: number) => {
    if (!bins) return 0;
    const lo = Math.min(from, bins);
    const hi = Math.min(to, bins);
    if (hi <= lo) return 0;
    let sum = 0;
    for (let i = lo; i < hi; i++) sum += frequencyData[i];
    return sum / (hi - lo) / 255;
  };

  const bass = band(0, 8);
  const level = bass * 0.5 + band(8, 32) * 0.32 + band(32, 72) * 0.18;

  // Fast attack, slow release: the ball snaps onto a hit and settles out of
  // it, which is what reads as reacting rather than wobbling.
  orbEnergy += (level - orbEnergy) * (level > orbEnergy ? 0.45 : 0.12);
  orbBass += (bass - orbBass) * (bass > orbBass ? 0.6 : 0.15);

  // Real elapsed time, so ReplyOrb's durations mean here what they mean there.
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  const dt = orbLastFrame ? Math.min(64, now - orbLastFrame) : 16;
  orbLastFrame = now;

  const spinMs = orbLerp(ORB_DURATION.idle.spin, ORB_DURATION.thinking.spin, orbEnergy);
  const hazeMs = orbLerp(ORB_DURATION.idle.haze, ORB_DURATION.thinking.haze, orbEnergy);
  orbSpin = (orbSpin + dt / spinMs) % 1;
  // The orb's haze keyframe is a ping-pong; here it ping-pongs on a clock that
  // the bass can shove straight to the top.
  orbHaze += (orbHazeDir * dt) / (hazeMs / 2);
  if (orbHaze >= 1) { orbHaze = 1; orbHazeDir = -1; }
  if (orbHaze <= 0) { orbHaze = 0; orbHazeDir = 1; }
  const haze = Math.min(1, orbHaze + orbBass * 0.6);

  const centreX = width / 2;
  const centreY = height / 2;
  const box = Math.min(width, height);
  const R = box * ORB_RATIO.sphere;
  const moteBase = Math.max(1.5, box * ORB_RATIO.mote);

  // Hue 0 is the orb as it ships everywhere else: white dust, nothing hued.
  // Past that the slider tints it, and loudness is what saturates it.
  const mono = hue === 0;
  const h = mono ? 0 : hue;
  const sat = mono ? 0 : Math.round(45 + orbEnergy * 55);
  const dust = (lightness: number, alpha: number) =>
    `hsla(${h}, ${sat}%, ${lightness}%, ${alpha})`;

  ctx.save();
  ctx.translate(centreX, centreY);
  ctx.rotate(ORB_TILT);

  // Faint core haze — without it the motes read as a ring of dots rather than
  // a body with volume. ReplyOrb's exact gradient, with its 0.18/0.30 idle and
  // thinking alphas becoming a continuous ramp off the music.
  const hazeR = ((box * ORB_RATIO.haze) / 2) * (1 + haze * 0.12 + orbBass * 0.18);
  const hazeAlpha = (0.22 + orbEnergy * 0.5) * (0.5 + haze * 0.5);
  const hazeGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, hazeR);
  // The extra stop over ReplyOrb's two: a tight hot centre that only the bass
  // opens. It is what turns the haze from a grey smudge into something that
  // flares on the beat, without adding an object the orb doesn't have.
  hazeGradient.addColorStop(0, dust(mono ? 100 : 92, Math.min(1, hazeAlpha + orbBass * 0.5)));
  hazeGradient.addColorStop(0.14, dust(mono ? 100 : 84, hazeAlpha));
  hazeGradient.addColorStop(0.7, dust(mono ? 100 : 70, 0));
  hazeGradient.addColorStop(1, dust(mono ? 100 : 70, 0));
  ctx.beginPath();
  ctx.arc(0, 0, hazeR, 0, ORB_TAU);
  ctx.fillStyle = hazeGradient;
  ctx.fill();

  // The grains. Back half first so the haze sits inside the ball.
  const glow = moteBase * (0.35 + orbEnergy * 2.2);
  for (const pass of [false, true]) {
    for (const m of ORB_LAYOUT) {
      const angle = (orbSpin + m.phase) * ORB_TAU;
      // cos gives depth: +1 is the front of the ball, -1 the back.
      const depth = (Math.cos(angle) + 1) / 2;
      if (pass !== depth >= 0.5) continue;

      const f = bins ? frequencyData[Math.min(bins - 1, Math.floor(m.binFrac * bins))] / 255 : 0;
      // Its own band lifts the grain off the sphere, so the ball has a surface
      // that moves with the music instead of a body that scales with it.
      const push = 1 + f * 0.22;
      const x = m.ringRadius * R * Math.sin(angle) * push;
      const y = m.y * R * push;

      const dot = (m.bright ? moteBase * 1.45 : moteBase) * (0.55 + 0.45 * depth) * (1 + f * 0.55);
      const base = m.bright ? 0.95 : orbLerp(0.68, 0.8, orbEnergy);
      const alpha = Math.min(1, (0.2 + 0.8 * depth) * base * (0.75 + f * 0.5));

      ctx.beginPath();
      ctx.arc(x, y, dot / 2, 0, ORB_TAU);
      ctx.fillStyle = dust(mono ? 100 : orbLerp(72, 92, f), alpha);
      ctx.shadowColor = dust(mono ? 100 : 68, Math.min(1, alpha * (0.6 + f * 0.8)));
      ctx.shadowBlur = glow * (0.5 + depth * 0.5) * (0.6 + f);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  ctx.restore();
}

export function resetOrb() {
  orbSpin = 0;
  orbHaze = 0;
  orbHazeDir = 1;
  orbEnergy = 0;
  orbBass = 0;
  orbLastFrame = 0;
}
