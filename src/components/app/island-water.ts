type Rgb = readonly [number, number, number];

export interface IslandWaterFrame {
  time: number;
  aspect: number;
  lightX: number;
  lightHeight: number;
  lightStrength: number;
  lightColor: Rgb;
  waterTop: Rgb;
  waterBottom: Rgb;
  skyTop: Rgb;
  /** Painted-frame interval; zero after a pause or on the initial frame. */
  frameInterval?: number;
}

/** Lower pixel work after sustained missed frames, never after one hitch.
 * Keep the chosen budget until remount so capped frame rates cannot cause
 * repeated resolution changes when a device is just keeping up. */
export function createIslandWaterBudget() {
  let scale = 1;
  let elapsed = 0;
  let frames = 0;
  return (interval: number) => {
    if (!Number.isFinite(interval) || interval <= 0 || interval > 0.1) {
      elapsed = 0;
      frames = 0;
      return scale;
    }
    elapsed += interval;
    frames++;
    if (elapsed >= 2) {
      if (elapsed / frames > 0.041) scale = Math.max(0.65, scale * 0.85);
      elapsed = 0;
      frames = 0;
    }
    return scale;
  };
}

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSky;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAspect;
uniform vec3 uLight;
uniform float uLightStrength;
uniform vec3 uLightColor;
uniform vec3 uWaterTop;
uniform vec3 uWaterBottom;
uniform vec3 uSkyTop;

vec3 linearColor(vec3 c) { return pow(c, vec3(2.2)); }
float fifth(float x) { float x2 = x * x; return x2 * x2 * x; }

// Height and analytic derivatives of crossing wind waves. Short wavelengths
// fade at the pixel footprint, so the horizon does not sparkle from aliasing.
void wave(inout vec3 field, vec2 p, vec2 direction, float frequency,
          float amplitude, float speed, float phase, float footprint) {
  float attenuation = 1.0 / (1.0 + frequency * frequency * footprint * footprint);
  float angle = dot(p, direction) * frequency + uTime * speed + phase;
  float weight = amplitude * attenuation;
  field.x += sin(angle) * weight;
  field.yz += direction * (cos(angle) * weight * frequency);
}

vec3 ocean(vec2 p, float footprint) {
  // A slow directional swell carries several smaller, crossing wave trains.
  // Domain bending breaks up the regular spacing without boiling the surface.
  p += vec2(sin(p.y * 0.071), cos(p.x * 0.093)) * 1.4;
  vec3 field = vec3(0.0);
  wave(field, p, vec2(0.24, 0.971), 0.13, 0.42, -0.48, 0.7, footprint);
  wave(field, p, vec2(-0.53, 0.848), 0.23, 0.24, -0.63, 2.1, footprint);
  wave(field, p, vec2(0.72, 0.694), 0.47, 0.11, -0.87, 4.6, footprint);
  wave(field, p, vec2(-0.31, 0.951), 0.91, 0.058, -1.19, 1.2, footprint);
  wave(field, p, vec2(0.43, 0.903), 1.83, 0.027, -1.68, 3.8, footprint);
  wave(field, p, vec2(-0.81, 0.586), 3.61, 0.013, -2.31, 5.4, footprint);
  wave(field, p, vec2(0.18, 0.984), 8.47, 0.0058, -3.12, 2.5, footprint);
  wave(field, p, vec2(-0.61, 0.792), 17.31, 0.0032, -4.26, 0.9, footprint);
  wave(field, p, vec2(0.57, 0.822), 35.17, 0.0018, -5.81, 4.2, footprint);
  wave(field, p, vec2(-0.25, 0.968), 68.43, 0.0009, -7.64, 1.8, footprint);
  wave(field, p, vec2(0.79, 0.613), 123.7, 0.0004, -9.87, 3.6, footprint);
  return field;
}

void main() {
  float depth = 1.0 - vUv.y;
  vec3 ray = normalize(vec3((vUv.x - 0.5) * uAspect * 1.6,
                           -(depth * 0.58 + 0.004), -1.25));
  vec2 p = ray.xz * (-3.5 / ray.y);
  float distance = length(p);
  float footprint = 0.133 * distance * distance / uResolution.y;
  vec3 field = ocean(p, footprint);
  vec3 normal = normalize(vec3(-field.y, 1.0, -field.z));
  vec3 view = -ray;
  vec3 reflected = reflect(ray, normal);

  // Project the reflected ray into the cached sky, including the real sun,
  // cloud light and palm silhouettes, instead of painting a stripe of glints.
  float forward = max(0.15, -reflected.z);
  vec2 skyUv = vec2(0.5 + reflected.x / forward / (uAspect * 1.28),
                   reflected.y / forward * 1.25 / 0.42);
  float skyEdge = smoothstep(0.0, 0.05, skyUv.x) * (1.0 - smoothstep(0.95, 1.0, skyUv.x));
  skyEdge *= 1.0 - smoothstep(0.94, 1.0, skyUv.y);
  vec3 sky = linearColor(texture2D(uSky, clamp(skyUv, 0.0, 1.0)).rgb);
  sky = mix(uSkyTop, sky, skyEdge);

  float nv = max(0.001, dot(normal, view));
  float fresnel = 0.02 + 0.98 * fifth(1.0 - nv);
  float shallows = exp(-distance * 0.022);
  vec3 body = mix(uWaterBottom, uWaterTop, 0.26 + shallows * 0.35);
  float subsurface = 0.70 + field.x * 0.08 + max(0.0, dot(normal, uLight)) * 0.46;
  body *= subsurface;
  vec3 color = mix(body, sky, fresnel);

  // Broad sun radiance and fine specular peaks respond to the same normal.
  // GGX roughness keeps highlights finite while the light path breaks into
  // irregular facets rather than independent moving dashes.
  vec3 light = uLight;
  vec3 halfVector = normalize(light + view);
  float nl = max(0.001, dot(normal, light));
  float nh = max(0.0, dot(normal, halfVector));
  float vh = max(0.0, dot(view, halfVector));
  float roughness = 0.15 + (1.0 - shallows) * 0.08;
  float alpha = roughness * roughness;
  float alpha2 = alpha * alpha;
  float denominator = nh * nh * (alpha2 - 1.0) + 1.0;
  float distribution = alpha2 / max(0.000001, 3.14159 * denominator * denominator);
  float k = (roughness + 1.0) * (roughness + 1.0) * 0.125;
  float geometry = nv / (nv * (1.0 - k) + k) * nl / (nl * (1.0 - k) + k);
  float specularFresnel = 0.02 + 0.98 * fifth(1.0 - vh);
  float specular = distribution * geometry * specularFresnel / max(0.004, 4.0 * nv);
  color += uLightColor * min(2.8, specular) * uLightStrength * 1.6;

  // Atmospheric perspective merges the distant sea into its reflected sky.
  float mist = (1.0 - exp(-distance * 0.006)) * 0.24;
  color = mix(color, sky, mist);
  color = color / (1.0 + color * 0.35);
  gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(1.0 / 2.2)), 1.0);
}`;

export interface IslandWater {
  resize(width: number, seaHeight: number): void;
  setSky(sky: HTMLCanvasElement): void;
  draw(frame: IslandWaterFrame): HTMLCanvasElement | null;
  dispose(): void;
}

/** One small offscreen surface, composed into the existing paused 2D scene. */
export function createIslandWater(): IslandWater | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let ready = false;
  let disposed = false;
  const onLost = () => { ready = false; };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ready = false;
    canvas.removeEventListener('webglcontextlost', onLost);
    shaders.forEach(shader => gl.deleteShader(shader));
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    if (program) gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Water shader unavailable');
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Water shader failed');
    return shader;
  };
  try {
    program = gl.createProgram();
    if (!program) throw new Error('Water program unavailable');
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Water program failed');
    buffer = gl.createBuffer();
    texture = gl.createTexture();
    if (!buffer || !texture) throw new Error('Water buffers unavailable');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.uniform1i(gl.getUniformLocation(program, 'uSky'), 0);
    // Power-of-two reflection levels let the GPU filter fine foliage at each
    // ripple's footprint instead of turning the coastline into pixel specks.
    const reflection = document.createElement('canvas');
    reflection.width = 512;
    reflection.height = 256;
    const reflectionContext = reflection.getContext('2d');
    if (!reflectionContext) throw new Error('Water reflection unavailable');
    const names = ['uResolution', 'uTime', 'uAspect', 'uLight', 'uLightStrength', 'uLightColor', 'uWaterTop', 'uWaterBottom', 'uSkyTop'] as const;
    const uniforms = Object.fromEntries(names.map(name => [name, gl.getUniformLocation(program!, name)]));
    const color = (name: string, rgb: Rgb) => gl.uniform3f(uniforms[name], (rgb[0] / 255) ** 2.2, (rgb[1] / 255) ** 2.2, (rgb[2] / 255) ** 2.2);
    const budget = createIslandWaterBudget();
    let width = 1;
    let seaHeight = 1;
    let quality = 1;
    const size = () => {
      const scale = Math.min(1, 1000 / width, 640 / seaHeight) * quality;
      const nextWidth = Math.max(1, Math.round(width * scale));
      const nextHeight = Math.max(1, Math.round(seaHeight * scale));
      if (canvas.width !== nextWidth) canvas.width = nextWidth;
      if (canvas.height !== nextHeight) canvas.height = nextHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return {
      resize(nextWidth, nextSeaHeight) {
        width = Math.max(1, nextWidth);
        seaHeight = Math.max(1, nextSeaHeight);
        size();
      },
      setSky(sky) {
        if (disposed || gl.isContextLost()) return;
        reflectionContext.drawImage(sky, 0, 0, 512, 256);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, reflection);
        gl.generateMipmap(gl.TEXTURE_2D);
        ready = true;
      },
      draw(frame) {
        if (!ready || disposed || gl.isContextLost()) return null;
        const nextQuality = budget(frame.frameInterval ?? 0);
        if (nextQuality !== quality) {
          quality = nextQuality;
          size();
        }
        gl.useProgram(program);
        gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
        gl.uniform1f(uniforms.uTime, frame.time);
        gl.uniform1f(uniforms.uAspect, frame.aspect);
        const lightX = (frame.lightX - 0.5) * frame.aspect * 1.6;
        const lightY = Math.max(0.025, frame.lightHeight);
        const lightLength = Math.hypot(lightX, lightY, 1.25);
        gl.uniform3f(uniforms.uLight, lightX / lightLength, lightY / lightLength, -1.25 / lightLength);
        gl.uniform1f(uniforms.uLightStrength, frame.lightStrength);
        color('uLightColor', frame.lightColor);
        color('uWaterTop', frame.waterTop);
        color('uWaterBottom', frame.waterBottom);
        color('uSkyTop', frame.skyTop);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        return canvas;
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
