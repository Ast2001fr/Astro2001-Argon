/**
 * js/render/webgl-sky.js
 * High-performance WebGL GPU Sky Engine (Three.js-inspired shader pipeline):
 * 1. GPU Milky Way full-sky panorama shader (zero-trig rational stereographic/orthographic unprojection
 + hardware bilinear sampling of assets/textures/milkyway.png in <0.1 ms).
 * 2. GPU 871,136 Starfield VBO + GLSL Point Sprite shader (projects and renders up to 871,136 stars
 *    directly from VRAM with B-V blackbody coloring, daylight/horizon clipping, and Airy/Gaussian glow in <0.3 ms).
 */

function bvToRgbFloat(bv) {
  const t = Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (t < 0.0) {
    const u = (t + 0.4) / 0.4;
    r = (162 + u * 55) / 255;
    g = (192 + u * 43) / 255;
    b = 1.0;
  } else if (t < 0.4) {
    const u = t / 0.4;
    r = (217 + u * 38) / 255;
    g = (235 + u * 18) / 255;
    b = (255 - u * 12) / 255;
  } else if (t < 0.8) {
    const u = (t - 0.4) / 0.4;
    r = 1.0;
    g = (253 - u * 18) / 255;
    b = (243 - u * 48) / 255;
  } else if (t < 1.4) {
    const u = (t - 0.8) / 0.6;
    r = 1.0;
    g = (235 - u * 38) / 255;
    b = (195 - u * 58) / 255;
  } else {
    const u = (t - 1.4) / 0.6;
    r = 1.0;
    g = (197 - u * 32) / 255;
    b = (137 - u * 35) / 255;
  }
  return [r, g, b];
}

const MW_VERT_SRC = `
attribute vec2 aPos;
varying vec2 vScreenPx;
uniform vec2 uResolution;

void main() {
  // Convert NDC (-1..+1) to top-left screen pixels (0..width, 0..height)
  vScreenPx = vec2((aPos.x * 0.5 + 0.5) * uResolution.x, (0.5 - aPos.y * 0.5) * uResolution.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const MW_FRAG_SRC = `
precision highp float;
varying vec2 vScreenPx;

uniform vec2 uCenter;
uniform float uTwoFocal;
uniform float uGlobeRadius;
uniform int uProjMode; // 0 = stereographic, 1 = orthographic globe
uniform vec2 uFlip;    // optical orientation (+1/-1)
uniform vec3 uCamX;
uniform vec3 uCamY;
uniform vec3 uCamZ;
uniform vec3 uHorZ;
uniform int uClipGround;
uniform float uEffBrightness;
uniform int uNightVision;
uniform sampler2D uMwTex;

// J2000 Equatorial -> Galactic rotation rows (IAU 1958 / Hipparcos)
const vec3 R_GAL0 = vec3(-0.0548755604, -0.8734370902, -0.4838350155);
const vec3 R_GAL1 = vec3( 0.4941094279, -0.4448296300,  0.7469822445);
const vec3 R_GAL2 = vec3(-0.8676661490, -0.1980763734,  0.4559837762);
const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;

void main() {
  float dx = (vScreenPx.x - uCenter.x) * uFlip.x;
  float dy = -(vScreenPx.y - uCenter.y) * uFlip.y;

  vec3 camVec;
  if (uProjMode == 1) {
    float r2 = dx * dx + dy * dy;
    float R2 = uGlobeRadius * uGlobeRadius;
    if (r2 > R2) {
      discard;
    }
    float cx = dx / uGlobeRadius;
    float cy = dy / uGlobeRadius;
    float cz = sqrt(max(0.0, 1.0 - cx * cx - cy * cy));
    camVec = vec3(cx, cy, cz);
  } else {
    // Rational inverse stereographic projection (0 trig functions!)
    float tx = dx / uTwoFocal;
    float ty = dy / uTwoFocal;
    float r2 = tx * tx + ty * ty;
    float invDenom = 1.0 / (1.0 + r2);
    camVec = vec3(2.0 * tx * invDenom, 2.0 * ty * invDenom, (1.0 - r2) * invDenom);
  }

  // Transform camera vector back to J2000 Equatorial unit vector
  vec3 eq = camVec.x * uCamX + camVec.y * uCamY + camVec.z * uCamZ;

  if (uClipGround == 1) {
    float sinAlt = dot(eq, uHorZ);
    if (sinAlt < -0.035) {
      discard;
    }
  }

  // Equatorial -> Galactic spherical coordinates (u, v)
  float gx = dot(R_GAL0, eq);
  float gy = dot(R_GAL1, eq);
  float gz = clamp(dot(R_GAL2, eq), -1.0, 1.0);

  float b = asin(gz);
  float l = atan(gy, gx);
  float u = fract((l / TWO_PI) + 0.5);
  float v = 0.5 - (b / PI);

  vec4 tex = texture2D(uMwTex, vec2(u, v));
  float alpha = tex.a * uEffBrightness * 0.56;
  if (alpha <= 0.004) {
    discard;
  }

  vec3 rgb = tex.rgb;
  if (uNightVision == 1) {
    float lum = dot(rgb, vec3(0.30, 0.59, 0.11));
    rgb = vec3(lum * 0.92, lum * 0.08, lum * 0.05);
  }

  // Premultiplied screen-like additive output
  gl_FragColor = vec4(rgb * alpha, alpha);
}
`;

const STAR_VERT_SRC = `
attribute vec3 aUnitVec;
attribute float aMag;
attribute vec3 aColor;

uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uTwoFocal;
uniform float uGlobeRadius;
uniform int uProjMode;
uniform vec2 uFlip;
uniform vec3 uCamX;
uniform vec3 uCamY;
uniform vec3 uCamZ;
uniform vec3 uHorZ;
uniform int uClipGround;
uniform float uLimitMag;
uniform float uDpr;
uniform int uNightVision;
uniform int uAlmanach;

varying vec3 vColor;
varying float vAlpha;
varying float vHaloRatio;

void main() {
  if (aMag > uLimitMag) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  float cz = dot(uCamZ, aUnitVec);
  if (uProjMode == 1) {
    if (cz < 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
  } else {
    if (cz <= -0.92) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
  }

  if (uClipGround == 1) {
    float sinAlt = dot(uHorZ, aUnitVec);
    if (sinAlt < -0.02) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      return;
    }
  }

  float cx = dot(uCamX, aUnitVec);
  float cy = dot(uCamY, aUnitVec);

  float dx;
  float dy;
  if (uProjMode == 1) {
    dx = uGlobeRadius * cx;
    dy = -uGlobeRadius * cy;
  } else {
    float k = uTwoFocal / (1.0 + cz);
    dx = k * cx * uFlip.x;
    dy = -k * cy * uFlip.y;
  }

  float sx = uCenter.x + dx;
  float sy = uCenter.y + dy;

  // Convert screen px (sx, sy) to NDC (-1..+1)
  float ndcX = (sx / uResolution.x) * 2.0 - 1.0;
  float ndcY = 1.0 - (sy / uResolution.y) * 2.0;
  gl_Position = vec4(ndcX, ndcY, 0.0, 1.0);

  // Uranometria / Astro2001 star sizing & luminance curve
  float magDiff = uLimitMag - aMag;
  float coreRadius = clamp(0.58 + pow(max(0.0, 6.2 - aMag), 1.28) * 0.38, 0.55, 5.2);
  vAlpha = clamp(magDiff * 0.46, 0.16, 1.0);

  // Bright stars (aMag < 3.4) include an outer soft atmospheric glow halo
  float totalRadius = coreRadius;
  if (aMag < 3.4) {
    float haloMult = (aMag < 1.5) ? 3.4 : 2.3;
    totalRadius = coreRadius * haloMult;
    vHaloRatio = coreRadius / totalRadius;
  } else {
    vHaloRatio = 1.0;
  }

  // Pad by 0.85 px for sub-pixel anti-aliasing on small stars
  gl_PointSize = max(1.6, (totalRadius * 2.0 + 1.4) * uDpr);

  if (uNightVision == 1) {
    vColor = vec3(1.0, 0.27, 0.20);
  } else if (uAlmanach == 1) {
    vColor = vec3(0.11, 0.09, 0.06);
  } else {
    vColor = aColor;
  }
}
`;

const STAR_FRAG_SRC = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
varying float vHaloRatio;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float dist = length(uv);
  if (dist > 1.0) {
    discard;
  }

  float intensity = 0.0;
  if (vHaloRatio < 0.99) {
    // Bright star with crisp core + exponential atmospheric halo
    float coreDist = dist / vHaloRatio;
    float core = 1.0 - smoothstep(0.65, 1.05, coreDist);
    float halo = exp(-dist * dist * 3.8) * 0.38;
    intensity = clamp(core + halo, 0.0, 1.0);
  } else {
    // Faint/medium star: crisp anti-aliased Airy disk
    intensity = 1.0 - smoothstep(0.42, 1.0, dist);
  }

  float a = intensity * vAlpha;
  if (a <= 0.005) {
    discard;
  }
  gl_FragColor = vec4(vColor * a, a);
}
`;

export class WebGLSkyAccelerator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false
    });

    this.supported = !!this.gl;
    this.starsUploaded = false;
    this.totalStars = 0;
    this.starStrideBytes = 28; // 7 floats * 4 bytes: ux, uy, uz, mag, r, g, b
    this.mwTextureReady = false;
    this.onAssetLoaded = null;

    // CPU-side Float32Array of star unit vectors (ux, uy, uz) for instant CPU access on bright/named stars
    this.starUnitVectors = null;

    if (this.supported) {
      this._initShadersAndBuffers();
      this._loadMilkyWayTexture('assets/textures/milkyway.png');
    }
  }

  _compileShader(type, src) {
    const { gl } = this;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('WebGL shader compile warning:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  _linkProgram(vsSrc, fsSrc) {
    const { gl } = this;
    const vs = this._compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('WebGL program link warning:', gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  _initShadersAndBuffers() {
    const { gl } = this;
    this.mwProg = this._linkProgram(MW_VERT_SRC, MW_FRAG_SRC);
    this.starProg = this._linkProgram(STAR_VERT_SRC, STAR_FRAG_SRC);
    if (!this.mwProg || !this.starProg) {
      this.supported = false;
      return;
    }

    // Fullscreen quad for Milky Way
    this.quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    // Milky Way uniforms & attributes
    this.mwLoc = {
      aPos: gl.getAttribLocation(this.mwProg, 'aPos'),
      uResolution: gl.getUniformLocation(this.mwProg, 'uResolution'),
      uCenter: gl.getUniformLocation(this.mwProg, 'uCenter'),
      uTwoFocal: gl.getUniformLocation(this.mwProg, 'uTwoFocal'),
      uGlobeRadius: gl.getUniformLocation(this.mwProg, 'uGlobeRadius'),
      uProjMode: gl.getUniformLocation(this.mwProg, 'uProjMode'),
      uFlip: gl.getUniformLocation(this.mwProg, 'uFlip'),
      uCamX: gl.getUniformLocation(this.mwProg, 'uCamX'),
      uCamY: gl.getUniformLocation(this.mwProg, 'uCamY'),
      uCamZ: gl.getUniformLocation(this.mwProg, 'uCamZ'),
      uHorZ: gl.getUniformLocation(this.mwProg, 'uHorZ'),
      uClipGround: gl.getUniformLocation(this.mwProg, 'uClipGround'),
      uEffBrightness: gl.getUniformLocation(this.mwProg, 'uEffBrightness'),
      uNightVision: gl.getUniformLocation(this.mwProg, 'uNightVision'),
      uMwTex: gl.getUniformLocation(this.mwProg, 'uMwTex')
    };

    // Star program uniforms & attributes
    this.starLoc = {
      aUnitVec: gl.getAttribLocation(this.starProg, 'aUnitVec'),
      aMag: gl.getAttribLocation(this.starProg, 'aMag'),
      aColor: gl.getAttribLocation(this.starProg, 'aColor'),
      uResolution: gl.getUniformLocation(this.starProg, 'uResolution'),
      uCenter: gl.getUniformLocation(this.starProg, 'uCenter'),
      uTwoFocal: gl.getUniformLocation(this.starProg, 'uTwoFocal'),
      uGlobeRadius: gl.getUniformLocation(this.starProg, 'uGlobeRadius'),
      uProjMode: gl.getUniformLocation(this.starProg, 'uProjMode'),
      uFlip: gl.getUniformLocation(this.starProg, 'uFlip'),
      uCamX: gl.getUniformLocation(this.starProg, 'uCamX'),
      uCamY: gl.getUniformLocation(this.starProg, 'uCamY'),
      uCamZ: gl.getUniformLocation(this.starProg, 'uCamZ'),
      uHorZ: gl.getUniformLocation(this.starProg, 'uHorZ'),
      uClipGround: gl.getUniformLocation(this.starProg, 'uClipGround'),
      uLimitMag: gl.getUniformLocation(this.starProg, 'uLimitMag'),
      uDpr: gl.getUniformLocation(this.starProg, 'uDpr'),
      uNightVision: gl.getUniformLocation(this.starProg, 'uNightVision'),
      uAlmanach: gl.getUniformLocation(this.starProg, 'uAlmanach')
    };

    this.starVbo = gl.createBuffer();
    this.mwTex = gl.createTexture();
  }

  _loadMilkyWayTexture(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!this.supported) return;
      const { gl } = this;
      gl.bindTexture(gl.TEXTURE_2D, this.mwTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.mwTextureReady = true;
      if (this.onAssetLoaded) this.onAssetLoaded();
    };
    img.src = url;
  }

  /**
   * Build precomputed 3D unit vectors (ux, uy, uz) for all 871,136 stars once
   * and upload the interleaved vertex buffer to the GPU VBO.
   */
  ensureStarsUploaded(starsView) {
    if (this.starsUploaded || !starsView) return;
    const totalStars = Math.floor(starsView.byteLength / 8);
    this.totalStars = totalStars;

    // Precompute color LUT for all 256 possible int8 B-V values (-128..127)
    const colorLut = new Float32Array(256 * 3);
    for (let b = -128; b <= 127; b++) {
      const idx = (b + 128) * 3;
      const [cr, cg, cb] = bvToRgbFloat(b / 50);
      colorLut[idx] = cr;
      colorLut[idx + 1] = cg;
      colorLut[idx + 2] = cb;
    }

    const vboData = new Float32Array(totalStars * 7);
    const unitVecs = new Float32Array(totalStars * 3);
    const magCutoffs = new Int32Array(130); // index for mag = (mIdx - 20) * 0.1 from -2.0 to +11.0
    let currentCutoffIdx = 0;

    const u16ToRad = (Math.PI * 2) / 65535;
    const i16ToRad = (Math.PI * 0.5) / 32767;

    for (let i = 0; i < totalStars; i++) {
      const off = i * 8;
      const raRad = starsView.getUint16(off, true) * u16ToRad;
      const decRad = starsView.getInt16(off + 2, true) * i16ToRad;
      const mag = starsView.getInt16(off + 4, true) * 0.001;
      const bvI8 = starsView.getInt8(off + 6);

      const cosDec = Math.cos(decRad);
      const ux = cosDec * Math.cos(raRad);
      const uy = cosDec * Math.sin(raRad);
      const uz = Math.sin(decRad);

      const uOff = i * 3;
      unitVecs[uOff] = ux;
      unitVecs[uOff + 1] = uy;
      unitVecs[uOff + 2] = uz;

      const cIdx = (bvI8 + 128) * 3;
      const vOff = i * 7;
      vboData[vOff] = ux;
      vboData[vOff + 1] = uy;
      vboData[vOff + 2] = uz;
      vboData[vOff + 3] = mag;
      vboData[vOff + 4] = colorLut[cIdx];
      vboData[vOff + 5] = colorLut[cIdx + 1];
      vboData[vOff + 6] = colorLut[cIdx + 2];

      while (currentCutoffIdx < 130 && mag > (currentCutoffIdx - 20) * 0.1) {
        magCutoffs[currentCutoffIdx] = i;
        currentCutoffIdx++;
      }
    }
    while (currentCutoffIdx < 130) {
      magCutoffs[currentCutoffIdx++] = totalStars;
    }

    this.starUnitVectors = unitVecs;
    this.magCutoffs = magCutoffs;

    if (this.supported) {
      const { gl } = this;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.starVbo);
      gl.bufferData(gl.ARRAY_BUFFER, vboData, gl.STATIC_DRAW);
    }
    this.starsUploaded = true;
  }

  /**
   * O(1) lookup for how many stars in stars.bin have mag <= limitMag
   */
  getStarCountForLimitMag(limitMag) {
    if (!this.magCutoffs) return this.totalStars;
    const bin = Math.min(129, Math.max(0, Math.ceil((limitMag + 2.0) * 10)));
    return this.magCutoffs[bin] || this.totalStars;
  }

  _syncCanvasSize(viewport) {
    const dpr = viewport.dpr || 1;
    const pw = Math.max(1, Math.round(viewport.width * dpr));
    const ph = Math.max(1, Math.round(viewport.height * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.gl.viewport(0, 0, pw, ph);
  }

  /**
   * Render the Milky Way panorama on the GPU and composite onto the 2D canvas
   */
  renderMilkyWay(ctx2d, viewport, astroState) {
    if (!this.supported || !this.mwTextureReady) return false;

    const brightness = astroState.brightness ?? 1.0;
    if (brightness <= 0.01) return true;

    const sunAlt = astroState.sunAltDeg ?? -25;
    let skyDarkness = 1.0;
    if (viewport.viewMode === 'terrestrial' && astroState.atmosphereEnabled !== false) {
      if (sunAlt > -4) return true;
      if (sunAlt > -16) {
        skyDarkness = Math.max(0, Math.min(1, (-4 - sunAlt) / 12));
      }
    }
    const effBrightness = brightness * skyDarkness;
    if (effBrightness <= 0.02) return true;

    this._syncCanvasSize(viewport);
    const { gl, mwLoc } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.BLEND);

    gl.useProgram(this.mwProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(mwLoc.aPos);
    gl.vertexAttribPointer(mwLoc.aPos, 2, gl.FLOAT, false, 0, 0);

    const isGlobe = viewport.viewMode === 'celestial' && viewport.fov >= 45;
    const globeRadius = Math.min(viewport.width, viewport.height) * 0.44 * (90 / Math.max(25, viewport.fov));
    const clipGround = (viewport.viewMode === 'terrestrial' && astroState.groundEnabled !== false) ? 1 : 0;

    gl.uniform2f(mwLoc.uResolution, viewport.width, viewport.height);
    gl.uniform2f(mwLoc.uCenter, viewport.cx, viewport.cy);
    gl.uniform1f(mwLoc.uTwoFocal, 2 * viewport.focal);
    gl.uniform1f(mwLoc.uGlobeRadius, globeRadius);
    gl.uniform1i(mwLoc.uProjMode, isGlobe ? 1 : 0);
    gl.uniform2f(mwLoc.uFlip, viewport.flipX || 1, viewport.flipY || 1);
    gl.uniform3fv(mwLoc.uCamX, viewport.camX);
    gl.uniform3fv(mwLoc.uCamY, viewport.camY);
    gl.uniform3fv(mwLoc.uCamZ, viewport.camZ);
    gl.uniform3fv(mwLoc.uHorZ, viewport.horZ);
    gl.uniform1i(mwLoc.uClipGround, clipGround);
    gl.uniform1f(mwLoc.uEffBrightness, effBrightness);
    gl.uniform1i(mwLoc.uNightVision, astroState.nightVision ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mwTex);
    gl.uniform1i(mwLoc.uMwTex, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    ctx2d.save();
    ctx2d.globalCompositeOperation = 'screen';
    ctx2d.drawImage(this.canvas, 0, 0, viewport.width, viewport.height);
    ctx2d.restore();
    return true;
  }

  /**
   * Render all visible stars up to limitMag in a single WebGL draw call on the GPU
   */
  renderStars(ctx2d, viewport, state, limitMag, nightVision, isAlmanach) {
    if (!this.supported || !this.starsUploaded) return false;

    const starCount = this.getStarCountForLimitMag(limitMag);
    if (starCount <= 0) return true;

    this._syncCanvasSize(viewport);
    const { gl, starLoc } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    if (isAlmanach) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      // Additive screen-like blending for realistic stellar overlapping in clusters
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    }

    gl.useProgram(this.starProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starVbo);

    const stride = this.starStrideBytes;
    gl.enableVertexAttribArray(starLoc.aUnitVec);
    gl.vertexAttribPointer(starLoc.aUnitVec, 3, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(starLoc.aMag);
    gl.vertexAttribPointer(starLoc.aMag, 1, gl.FLOAT, false, stride, 12);

    gl.enableVertexAttribArray(starLoc.aColor);
    gl.vertexAttribPointer(starLoc.aColor, 3, gl.FLOAT, false, stride, 16);

    const isGlobe = viewport.viewMode === 'celestial' && viewport.fov >= 45;
    const globeRadius = Math.min(viewport.width, viewport.height) * 0.44 * (90 / Math.max(25, viewport.fov));
    const clipGround = (viewport.viewMode === 'terrestrial' && state.toggles.ground) ? 1 : 0;

    gl.uniform2f(starLoc.uResolution, viewport.width, viewport.height);
    gl.uniform2f(starLoc.uCenter, viewport.cx, viewport.cy);
    gl.uniform1f(starLoc.uTwoFocal, 2 * viewport.focal);
    gl.uniform1f(starLoc.uGlobeRadius, globeRadius);
    gl.uniform1i(starLoc.uProjMode, isGlobe ? 1 : 0);
    gl.uniform2f(starLoc.uFlip, viewport.flipX || 1, viewport.flipY || 1);
    gl.uniform3fv(starLoc.uCamX, viewport.camX);
    gl.uniform3fv(starLoc.uCamY, viewport.camY);
    gl.uniform3fv(starLoc.uCamZ, viewport.camZ);
    gl.uniform3fv(starLoc.uHorZ, viewport.horZ);
    gl.uniform1i(starLoc.uClipGround, clipGround);
    gl.uniform1f(starLoc.uLimitMag, limitMag);
    gl.uniform1f(starLoc.uDpr, viewport.dpr || 1);
    gl.uniform1i(starLoc.uNightVision, nightVision ? 1 : 0);
    gl.uniform1i(starLoc.uAlmanach, isAlmanach ? 1 : 0);

    gl.drawArrays(gl.POINTS, 0, starCount);

    ctx2d.save();
    ctx2d.drawImage(this.canvas, 0, 0, viewport.width, viewport.height);
    ctx2d.restore();
    return true;
  }
}
