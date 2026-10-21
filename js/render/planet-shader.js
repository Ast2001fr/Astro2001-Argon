/**
 * js/render/planet-shader.js
 * True Orthographic Bitmap Renderer for Sun, Moon, and Planets
 * with real bitmap textures, spherical rotation, solar phase illumination,
 * limb darkening, earthshine, and 3D Saturn rings with shadow casting.
 */

const DEG2RAD = Math.PI / 180;

const BODY_LIST = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Earth',
  'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'
];

export class PlanetShaderRenderer {
  constructor() {
    this.textures = new Map();       // bodyId -> { width, height, data: Uint8ClampedArray }
    this.ringTexture = null;         // { width, height, data }
    this.cacheCanvases = new Map();  // bodyId -> { canvas, key, timestamp }
    this._offscreen = document.createElement('canvas');
    this._offCtx = this._offscreen.getContext('2d', { willReadFrequently: true });

    // Initialize immediate procedural bitmap buffers so rendering works from frame 0,
    // then upgrade seamlessly as assets/textures/*.png finish loading.
    this._initFallbackTextures();
    this.loadBitmapTextures();
  }

  _initFallbackTextures() {
    const w = 256;
    const h = 128;
    for (const id of BODY_LIST) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        const v = y / h;
        const lat = (0.5 - v) * Math.PI;
        for (let x = 0; x < w; x++) {
          const u = x / w;
          const lon = u * Math.PI * 2;
          const idx = (y * w + x) * 4;
          const n1 = Math.sin(lon * 3 + Math.cos(lat * 4)) * 0.5 + 0.5;
          const n2 = Math.cos(lon * 7 - Math.sin(lat * 6)) * 0.5 + 0.5;
          let r = 200, g = 200, b = 200;

          if (id === 'Sun') {
            const gran = Math.sin(lon * 18) * Math.cos(lat * 18) * 18;
            r = 255; g = Math.min(255, 200 + gran); b = Math.max(40, 85 + gran);
          } else if (id === 'Moon') {
            const maria = Math.max(0, Math.sin(lon * 2.2 + 0.4) * Math.cos(lat * 2.1 - 0.2));
            const base = 175 - maria * 65 + (n2 - 0.5) * 28;
            r = base; g = base * 0.98; b = base * 0.94;
          } else if (id === 'Mercury') {
            const c = 155 + (n1 - 0.5) * 35 + (n2 - 0.5) * 25;
            r = c * 1.02; g = c * 0.97; b = c * 0.90;
          } else if (id === 'Venus') {
            const swirl = Math.sin(lat * 5 + Math.sin(lon * 2) * 0.6) * 18;
            r = 238 + swirl * 0.5; g = 205 + swirl * 0.5; b = 145 + swirl * 0.4;
          } else if (id === 'Earth') {
            const land = Math.sin(lon * 2.5 + 1.1) * Math.cos(lat * 3.0) > 0.15;
            if (Math.abs(lat) > 1.25) {
              r = 240; g = 245; b = 250;
            } else if (land) {
              r = 75 + n1 * 50; g = 135 + n2 * 40; b = 65;
            } else {
              r = 35; g = 85 + n1 * 25; b = 175 + n2 * 35;
            }
          } else if (id === 'Mars') {
            const dark = Math.max(0, Math.sin(lon * 3 - 0.5) * Math.cos(lat * 3.5));
            if (Math.abs(lat) > 1.38) {
              r = 245; g = 240; b = 235;
            } else {
              r = 215 - dark * 55; g = 112 - dark * 35; b = 68 - dark * 22;
            }
          } else if (id === 'Jupiter') {
            const band = Math.sin(lat * 18) * 28 + Math.cos(lat * 9) * 15;
            // Great Red Spot near lat -22 deg (-0.38 rad), lon ~ 200 deg
            const dLon = Math.atan2(Math.sin(lon - 3.5), Math.cos(lon - 3.5));
            const dLat = lat + 0.38;
            const grs = Math.exp(-(dLon * dLon * 18 + dLat * dLat * 65));
            r = Math.min(255, 215 + band + grs * 40);
            g = Math.max(80, 180 + band * 0.8 - grs * 55);
            b = Math.max(60, 140 + band * 0.6 - grs * 65);
          } else if (id === 'Saturn') {
            const band = Math.sin(lat * 14) * 16 + Math.cos(lat * 7) * 10;
            r = 232 + band; g = 204 + band * 0.85; b = 150 + band * 0.6;
          } else if (id === 'Uranus') {
            const band = Math.cos(lat * 6) * 8;
            r = 155 + band; g = 222 + band; b = 232 + band;
          } else if (id === 'Neptune') {
            const band = Math.sin(lat * 10) * 12;
            r = 62 + band; g = 112 + band; b = 225 + band;
          }

          data[idx] = Math.max(0, Math.min(255, r));
          data[idx + 1] = Math.max(0, Math.min(255, g));
          data[idx + 2] = Math.max(0, Math.min(255, b));
          data[idx + 3] = 255;
        }
      }
      this.textures.set(id, { width: w, height: h, data });
    }

    // Fallback radial ring texture (256x1)
    const rw = 256;
    const rData = new Uint8ClampedArray(rw * 4);
    for (let x = 0; x < rw; x++) {
      const t = x / (rw - 1); // 0 = inner edge (1.2 Rs), 1 = outer edge (2.3 Rs)
      let alpha = 0;
      let r = 225, g = 202, b = 162;
      if (t >= 0.05 && t < 0.28) {
        // C Ring (faint crepe ring)
        alpha = 70;
        r = 175; g = 160; b = 138;
      } else if (t >= 0.28 && t < 0.66) {
        // B Ring (bright, dense with ringlets)
        alpha = 225 + Math.sin(t * 95) * 20;
        r = 238; g = 215; b = 172;
      } else if (t >= 0.66 && t < 0.73) {
        // Cassini Division
        alpha = 18;
      } else if (t >= 0.73 && t <= 0.98) {
        // A Ring (with Encke gap at 0.91)
        alpha = Math.abs(t - 0.91) < 0.012 ? 25 : 175;
        r = 216; g = 196; b = 160;
      }
      rData[x * 4] = r;
      rData[x * 4 + 1] = g;
      rData[x * 4 + 2] = b;
      rData[x * 4 + 3] = Math.max(0, Math.min(255, alpha));
    }
    this.ringTexture = { width: rw, height: 1, data: rData };
  }

  async loadBitmapTextures() {
    const fileMap = {
      Sun: 'assets/textures/sun.png',
      Moon: 'assets/textures/moon.png',
      Mercury: 'assets/textures/mercury.png',
      Venus: 'assets/textures/venus.png',
      Earth: 'assets/textures/earth.png',
      Mars: 'assets/textures/mars.png',
      Jupiter: 'assets/textures/jupiter.png',
      Saturn: 'assets/textures/saturn.png',
      Uranus: 'assets/textures/uranus.png',
      Neptune: 'assets/textures/neptune.png'
    };

    for (const [bodyId, url] of Object.entries(fileMap)) {
      this._loadSingleTexture(bodyId, url);
    }
    this._loadRingTexture('assets/textures/saturn_rings.png');
  }

  _loadSingleTexture(bodyId, url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 512;
      c.height = img.naturalHeight || 256;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      this.textures.set(bodyId, {
        width: c.width,
        height: c.height,
        data: imgData.data
      });
      this.cacheCanvases.delete(bodyId);
    };
    img.src = url;
  }

  _loadRingTexture(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 256;
      c.height = Math.max(1, img.naturalHeight || 16);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, c.width, 1);
      this.ringTexture = {
        width: c.width,
        height: 1,
        data: imgData.data
      };
      this.cacheCanvases.delete('Saturn');
    };
    img.src = url;
  }

  /**
   * Render a solar system body onto target ctx at (screenX, screenY) with given disk radiusPx.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} bodyId - 'Sun'|'Moon'|'Mercury'|'Venus'|'Earth'|'Mars'|'Jupiter'|'Saturn'|'Uranus'|'Neptune'
   * @param {number} screenX
   * @param {number} screenY
   * @param {number} radiusPx - Apparent or magnified radius in pixels
   * @param {object} ephem - { phaseAngleDeg, paLimbDeg, cML, subEarthLatDeg, ringTiltDeg, nightVision }
   */
  drawBody(ctx, bodyId, screenX, screenY, radiusPx, ephem = {}) {
    const nightVision = !!ephem.nightVision;

    // For tiny disks (< 3.5 px), render clean crisp disk + glow
    if (radiusPx < 3.5) {
      this._drawSmallBody(ctx, bodyId, screenX, screenY, Math.max(2.2, radiusPx), ephem, nightVision);
      return;
    }

    // Clamp shader resolution for performance (24px to 180px diameter)
    const diskR = Math.min(96, Math.max(12, Math.round(radiusPx)));
    const isSaturn = bodyId === 'Saturn';
    const canvasHalfW = isSaturn ? Math.ceil(diskR * 2.5) : Math.ceil(diskR * 1.15);
    const canvasHalfH = isSaturn ? Math.ceil(diskR * 1.6) : Math.ceil(diskR * 1.15);
    const cw = canvasHalfW * 2;
    const ch = canvasHalfH * 2;

    const phaseDeg = ephem.phaseAngleDeg ?? 0;
    const paLimb = ephem.paLimbDeg ?? 270;
    const cML = ephem.cML ?? 0;
    const subLat = ephem.subEarthLatDeg ?? 0;
    const ringTilt = ephem.ringTiltDeg ?? (isSaturn ? 14 : 0);

    // Cache key quantized to avoid re-shading every frame when static
    const key = `${diskR}|${Math.round(phaseDeg)}|${Math.round(paLimb / 2)}|${Math.round(cML / 2)}|${Math.round(ringTilt)}|${nightVision ? 1 : 0}`;
    let cached = this.cacheCanvases.get(bodyId);
    if (!cached || cached.key !== key) {
      const offCanvas = cached ? cached.canvas : document.createElement('canvas');
      offCanvas.width = cw;
      offCanvas.height = ch;
      this._shadeOrthographicBody(offCanvas, bodyId, diskR, {
        phaseDeg,
        paLimb,
        cML,
        subLat,
        ringTilt,
        nightVision
      });
      cached = { canvas: offCanvas, key };
      this.cacheCanvases.set(bodyId, cached);
    }

    // Solar corona glow behind the Sun
    if (bodyId === 'Sun') {
      const glowR = radiusPx * 2.4;
      const grad = ctx.createRadialGradient(screenX, screenY, radiusPx * 0.85, screenX, screenY, glowR);
      if (nightVision) {
        grad.addColorStop(0, 'rgba(255, 50, 30, 0.55)');
        grad.addColorStop(0.5, 'rgba(180, 20, 10, 0.18)');
        grad.addColorStop(1, 'rgba(120, 0, 0, 0)');
      } else {
        grad.addColorStop(0, 'rgba(255, 240, 175, 0.72)');
        grad.addColorStop(0.4, 'rgba(255, 185, 70, 0.22)');
        grad.addColorStop(1, 'rgba(255, 140, 20, 0)');
      }
      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(screenX, screenY, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const scale = radiusPx / diskR;
    const drawW = cw * scale;
    const drawH = ch * scale;
    ctx.drawImage(cached.canvas, screenX - drawW * 0.5, screenY - drawH * 0.5, drawW, drawH);
  }

  _drawSmallBody(ctx, bodyId, x, y, r, ephem, nightVision) {
    const colors = {
      Sun: '#ffe875',
      Moon: '#e8e4d8',
      Mercury: '#c7b8a1',
      Venus: '#fff1c9',
      Earth: '#5da4ff',
      Mars: '#ef7b4d',
      Jupiter: '#f2d09b',
      Saturn: '#ebd29b',
      Uranus: '#9be7f2',
      Neptune: '#6999ff'
    };
    const col = nightVision ? '#ff3828' : (colors[bodyId] || '#ffffff');
    ctx.save();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Per-pixel orthographic ray-sphere + ring intersection shader
   */
  _shadeOrthographicBody(canvas, bodyId, diskR, params) {
    const tex = this.textures.get(bodyId);
    if (!tex) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(w, h);
    const out = imgData.data;

    const texW = tex.width;
    const texH = tex.height;
    const texData = tex.data;

    const isSun = bodyId === 'Sun';
    const isMoon = bodyId === 'Moon';
    const isSaturn = bodyId === 'Saturn';
    const oblateness = isSaturn ? 0.902 : (bodyId === 'Jupiter' ? 0.935 : 1.0);

    // Illumination vector in camera space:
    // phaseDeg = 0 -> full (sun behind observer: sz = +1)
    // phaseDeg = 90 -> quarter, phaseDeg = 180 -> new (sz = -1)
    const phaseRad = (params.phaseDeg || 0) * DEG2RAD;
    const limbRad = ((params.paLimb || 270) - 90) * DEG2RAD;
    const sinPhase = Math.sin(phaseRad);
    const cosPhase = Math.cos(phaseRad);
    const sx = sinPhase * Math.cos(limbRad);
    const sy = sinPhase * Math.sin(limbRad);
    const sz = cosPhase;

    // Rotation parameters
    const lon0 = (params.cML || 0) * DEG2RAD;
    const subLat = (params.subLat || (isSaturn ? params.ringTilt : 0)) * DEG2RAD;
    const sinSubLat = Math.sin(subLat);
    const cosSubLat = Math.cos(subLat);

    // Saturn ring plane tilt B
    const ringTiltRad = (params.ringTilt || 14) * DEG2RAD;
    const sinB = Math.sin(ringTiltRad);
    const cosB = Math.cos(ringTiltRad);
    const ringInnerR = 1.22;
    const ringOuterR = 2.32;
    const ringTex = this.ringTexture;

    const invR = 1 / diskR;

    for (let py = 0; py < h; py++) {
      const nyScreen = (py - cy) * invR;
      for (let px = 0; px < w; px++) {
        const nxScreen = (px - cx) * invR;
        const outIdx = (py * w + px) * 4;

        // Check sphere intersection (accounting for polar oblateness)
        const nyOblate = nyScreen / oblateness;
        const r2 = nxScreen * nxScreen + nyOblate * nyOblate;
        const hitsGlobe = r2 <= 1.0;

        // Check Saturn ring intersection if applicable
        let ringColor = null;
        let ringInFront = false;
        if (isSaturn && Math.abs(sinB) > 0.015 && ringTex) {
          // Ray at (nxScreen, nyScreen, z) hits tilted ring plane y_ring = 0:
          // Ring plane normal is (0, cosB, sinB) -> z_ring = -nyScreen / tan(B)
          const zRing = -nyScreen * (cosB / sinB);
          const rRing = Math.hypot(nxScreen, zRing);
          if (rRing >= ringInnerR && rRing <= ringOuterR) {
            const tRing = (rRing - ringInnerR) / (ringOuterR - ringInnerR);
            const rIdx = Math.min(ringTex.width - 1, Math.max(0, Math.floor(tRing * ringTex.width))) * 4;
            const ra = ringTex.data[rIdx + 3] / 255;
            if (ra > 0.02) {
              // Check if Saturn's globe casts shadow onto this ring point
              // Point on ring is P = (nxScreen, nyScreen, zRing); project along sun vector S
              const dotPS = nxScreen * sx + nyScreen * sy + zRing * sz;
              let shadowFactor = 1.0;
              if (dotPS < 0) {
                const perpX = nxScreen - dotPS * sx;
                const perpY = (nyScreen - dotPS * sy) / oblateness;
                const perpZ = zRing - dotPS * sz;
                const distToAxis2 = perpX * perpX + perpY * perpY + perpZ * perpZ;
                if (distToAxis2 < 0.98) {
                  shadowFactor = 0.14; // Umbra of Saturn on the rings
                }
              }
              ringColor = {
                r: ringTex.data[rIdx] * shadowFactor,
                g: ringTex.data[rIdx + 1] * shadowFactor,
                b: ringTex.data[rIdx + 2] * shadowFactor,
                a: ra
              };
              // zRing > 0 means the ring element is closer to the observer than z = 0
              ringInFront = zRing > 0;
            }
          }
        }

        let finalR = 0, finalG = 0, finalB = 0, finalA = 0;

        if (hitsGlobe) {
          const nz = Math.sqrt(Math.max(0, 1.0 - r2));
          // Anti-aliased edge feathering
          const edgeAlpha = Math.min(1.0, (1.0 - Math.sqrt(r2)) * diskR * 1.4);

          // Rotate surface normal by sub-Earth latitude to get planetocentric coordinates
          const xPlanet = nxScreen;
          const yPlanet = nyOblate * cosSubLat - nz * sinSubLat;
          const zPlanet = nyOblate * sinSubLat + nz * cosSubLat;

          const lat = Math.asin(Math.max(-1, Math.min(1, -yPlanet)));
          const lon = Math.atan2(xPlanet, zPlanet) + lon0;

          const u = ((lon / (Math.PI * 2)) % 1 + 1) % 1;
          const v = 0.5 - lat / Math.PI;

          const tx = Math.min(texW - 1, Math.floor(u * texW));
          const ty = Math.min(texH - 1, Math.floor(v * texH));
          const tIdx = (ty * texW + tx) * 4;

          let tr = texData[tIdx];
          let tg = texData[tIdx + 1];
          let tb = texData[tIdx + 2];

          if (isSun) {
            // Linear solar limb darkening: I(μ) = 1 - u*(1 - μ), u = 0.6 (Neckel & Labs 1994)
            const limb = 1.0 - 0.6 * (1.0 - nz);
            finalR = tr * limb;
            finalG = tg * limb;
            finalB = tb * limb;
            finalA = edgeAlpha * 255;
          } else {
            // Incident cosine μ0 and emission cosine μ = nz
            const mu0 = nxScreen * sx + nyOblate * sy + nz * sz;
            const mu = nz;
            const isRegolith = isMoon || bodyId === 'Mercury' || bodyId === 'Mars';
            let light = 0;
            if (mu0 > -0.04) {
              const effMu0 = Math.max(0, (mu0 + 0.04) / 1.04);
              if (isRegolith) {
                // Lommel-Seeliger law for regolith-covered globes: I ∝ μ0 / (μ0 + μ)
                // (Seeliger 1887; Hapke 1993 §8; McEwen 1991, LPSC XXII, 1135)
                const ls = (2.0 * effMu0) / Math.max(1e-4, effMu0 + mu);
                light = isMoon ? ls * (0.78 + 0.22 * effMu0) : ls * (0.65 + 0.35 * effMu0);
              } else {
                // Venus and gas giants: Lambert's law with limb darkening
                light = Math.pow(effMu0, 0.78) * Math.pow(mu, 0.25);
              }
            }

            // Earthshine on the unlit lunar crescent (lumière cendrée)
            const ambient = isMoon ? 0.055 : 0.028;
            const illum = Math.max(ambient, light);

            finalR = tr * illum;
            finalG = tg * illum;
            finalB = tb * illum;
            finalA = edgeAlpha * 255;
          }
        }

        // Composite Saturn's rings (either behind or in front of the globe)
        if (ringColor) {
          if (!hitsGlobe) {
            finalR = ringColor.r;
            finalG = ringColor.g;
            finalB = ringColor.b;
            finalA = ringColor.a * 255;
          } else if (ringInFront) {
            const ra = ringColor.a;
            finalR = ringColor.r * ra + finalR * (1 - ra);
            finalG = ringColor.g * ra + finalG * (1 - ra);
            finalB = ringColor.b * ra + finalB * (1 - ra);
          }
        }

        if (finalA > 0) {
          if (params.nightVision) {
            const lum = 0.299 * finalR + 0.587 * finalG + 0.114 * finalB;
            out[outIdx] = Math.min(255, lum * 1.05);
            out[outIdx + 1] = Math.min(255, lum * 0.12);
            out[outIdx + 2] = Math.min(255, lum * 0.08);
            out[outIdx + 3] = finalA;
          } else {
            out[outIdx] = Math.min(255, finalR);
            out[outIdx + 1] = Math.min(255, finalG);
            out[outIdx + 2] = Math.min(255, finalB);
            out[outIdx + 3] = finalA;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }
}
