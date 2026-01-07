export type VisualizerStyle = 'bars' | 'waveform' | 'circular' | 'particles';

// Classic WMP-style frequency bars
export function drawBars(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number
) {
  const barCount = 32;
  const barWidth = width / barCount - 2;
  const barSpacing = 2;

  ctx.clearRect(0, 0, width, height);

  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor((i / barCount) * frequencyData.length);
    const value = frequencyData[dataIndex] / 255;
    const barHeight = value * height * 0.9;

    const x = i * (barWidth + barSpacing);
    const y = height - barHeight;

    // Create gradient for each bar
    const gradient = ctx.createLinearGradient(x, height, x, y);
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)'); // Purple at bottom
    gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.9)'); // Blue in middle
    gradient.addColorStop(1, 'rgba(255, 255, 255, 1)'); // White at top

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);

    // Add glow effect on high values
    if (value > 0.7) {
      ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
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
  height: number
) {
  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
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
  ctx.shadowColor = 'rgba(139, 92, 246, 0.6)';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// Radial/circular visualizer
export function drawCircular(
  ctx: CanvasRenderingContext2D,
  frequencyData: Uint8Array,
  width: number,
  height: number
) {
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
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.9)');

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
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
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
  height: number
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
        hue: 260 + Math.random() * 40, // Purple-blue range
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
  gradient.addColorStop(0, `rgba(139, 92, 246, ${0.3 + bassLevel * 0.4})`);
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.beginPath();
  ctx.arc(centerX, centerY, orbSize, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

export function resetParticles() {
  particles = [];
}
