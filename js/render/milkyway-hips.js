/**
 * js/render/milkyway-hips.js
 * 1) Milky Way equirectangular panorama mapped via inverse transformation (with adjustable brightness)
 * 2) HiPS DSS2 Color sky survey tile loader & HEALPix renderer (CDS Strasbourg)
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// J2000 Equatorial to Galactic rotation matrix (IAU 1958 / Hipparcos)
const R_EQ2GAL = [
  -0.0548755604, -0.8734370902, -0.4838350155,
   0.4941094279, -0.4448296300,  0.7469822445,
  -0.8676661490, -0.1980763734,  0.4559837762
];

function eqUnitToGalacticUV(xEq, yEq, zEq) {
  const gx = R_EQ2GAL[0] * xEq + R_EQ2GAL[1] * yEq + R_EQ2GAL[2] * zEq;
  const gy = R_EQ2GAL[3] * xEq + R_EQ2GAL[4] * yEq + R_EQ2GAL[5] * zEq;
  const gz = R_EQ2GAL[6] * xEq + R_EQ2GAL[7] * yEq + R_EQ2GAL[8] * zEq;

  const b = Math.asin(Math.max(-1, Math.min(1, gz)));
  const l = Math.atan2(gy, gx); // -PI..PI, with l=0 at Galactic Center (Sagittarius)
  const u = ((l / (Math.PI * 2)) + 0.5 + 1) % 1;
  const v = 0.5 - b / Math.PI;
  return { u, v };
}

export class MilkyWayAndHipsRenderer {
  constructor() {
    // Milky Way equirectangular bitmap buffer (in Galactic coordinates u: l=-180..+180, v: b=+90..-90)
    this.mwWidth = 512;
    this.mwHeight = 256;
    this.mwData = new Uint8ClampedArray(this.mwWidth * this.mwHeight * 4);
    this._buildProceduralMilkyWay();
    this._loadMilkyWayBitmap('assets/textures/milkyway.png');

    // Offscreen low-res buffer for fast inverse-projection rendering
    this.bufCanvas = document.createElement('canvas');
    this.bufCtx = this.bufCanvas.getContext('2d');

    // HiPS DSS2 Color tile cache (CDS Strasbourg)
    this.hipsBaseUrl = 'https://alasky.cds.unistra.fr/DSS/DSSColor';
    this.tileCache = new Map(); // key "order/npix" -> { status: 'loading'|'ready'|'error', img }
    this.maxCachedTiles = 600;
    this.onTileLoaded = null;
  }

  _buildProceduralMilkyWay() {
    const w = this.mwWidth;
    const h = this.mwHeight;
    const data = this.mwData;

    for (let y = 0; y < h; y++) {
      const bDeg = (0.5 - y / h) * 180; // +90 to -90
      for (let x = 0; x < w; x++) {
        const lDeg = (x / w - 0.5) * 360; // -180 to +180 (0 = Galactic Center)
        const lRad = lDeg * DEG2RAD;

        // Main galactic disk profile + bulge at l=0, b=0
        const bulge = Math.exp(-(lDeg * lDeg) / 1400 - (bDeg * bDeg) / 110) * 1.15;
        const diskWidth = 8.5 + 3.5 * Math.cos(lRad) + 1.8 * Math.sin(lRad * 3);
        const warp = 1.4 * Math.sin(lRad * 2 - 0.5);
        const bEff = bDeg - warp;
        const disk = Math.exp(-(bEff * bEff) / (2 * diskWidth * diskWidth)) * (0.45 + 0.38 * Math.cos(lRad * 0.5));

        // Great Rift / dark dust lane along the galactic plane
        const dustWidth = 2.6 + 0.9 * Math.sin(lRad * 4);
        const dustOffset = 0.7 * Math.cos(lRad * 3);
        const dust = Math.exp(-((bEff - dustOffset) ** 2) / (2 * dustWidth * dustWidth))
          * (0.58 + 0.25 * Math.cos(lRad));

        // Cygnus star cloud (l ~ 80°), Carina (l ~ -75°), Scutum (l ~ 28°)
        const cygnus = 0.35 * Math.exp(-((lDeg - 78) ** 2) / 180 - ((bDeg - 1) ** 2) / 28);
        const carina = 0.42 * Math.exp(-((lDeg + 76) ** 2) / 160 - ((bDeg + 1) ** 2) / 25);
        const scutum = 0.38 * Math.exp(-((lDeg - 27) ** 2) / 110 - ((bDeg + 2) ** 2) / 22);

        // Large & Small Magellanic Clouds (LMC: l=-79.5°, b=-32.9°; SMC: l=-57.2°, b=-44.3°)
        const lmc = 0.52 * Math.exp(-((lDeg + 79.5) ** 2) / 22 - ((bDeg + 32.9) ** 2) / 14);
        const smc = 0.34 * Math.exp(-((lDeg + 57.2) ** 2) / 10 - ((bDeg + 44.3) ** 2) / 8);

        // Subtle mottled star-cloud texture
        const cloudNoise = 0.85 + 0.15 * Math.sin(lDeg * 0.42 + Math.cos(bDeg * 0.55) * 2.2)
          * Math.cos(bDeg * 0.37 - Math.sin(lDeg * 0.29) * 1.7);

        const rawIntensity = Math.max(0, (bulge + disk + cygnus + carina + scutum) * (1 - dust * 0.68) + lmc + smc) * cloudNoise;
        const val = Math.min(1, rawIntensity);

        // Color tint: warm golden-cream in bulge, cool blue-white in spiral arms
        const bulgeWeight = Math.min(1, bulge * 0.9);
        const r = val * (175 + bulgeWeight * 65);
        const g = val * (188 + bulgeWeight * 32);
        const b = val * (235 - bulgeWeight * 25);

        const idx = (y * w + x) * 4;
        data[idx] = Math.min(255, r);
        data[idx + 1] = Math.min(255, g);
        data[idx + 2] = Math.min(255, b);
        data[idx + 3] = Math.min(255, val * 240);
      }
    }
  }

  _loadMilkyWayBitmap(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 512;
      c.height = img.naturalHeight || 256;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const id = ctx.getImageData(0, 0, c.width, c.height);
      this.mwWidth = c.width;
      this.mwHeight = c.height;
      this.mwData = id.data;
    };
    img.src = url;
  }

  /**
   * Render the Milky Way panorama via inverse screen-to-sky transformation
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {SkyViewport} viewport
   * @param {object} astroState - { lstDeg, latDeg, sunAltDeg, brightness, nightVision }
   */
  renderMilkyWay(ctx, viewport, astroState) {
    const brightness = astroState.brightness ?? 1.0;
    if (brightness <= 0.01) return;

    // Fade Milky Way during daylight / bright civil twilight
    const sunAlt = astroState.sunAltDeg ?? -25;
    let skyDarkness = 1.0;
    if (viewport.viewMode === 'terrestrial' && astroState.atmosphereEnabled !== false) {
      if (sunAlt > -4) return;
      if (sunAlt > -16) {
        skyDarkness = Math.max(0, Math.min(1, (-4 - sunAlt) / 12));
      }
    }

    const effBrightness = brightness * skyDarkness;
    if (effBrightness <= 0.02) return;

    // Inverse transformation grid resolution (e.g. 1/6th of screen resolution for 60 FPS smooth shading)
    const step = 6;
    const bw = Math.max(32, Math.ceil(viewport.width / step));
    const bh = Math.max(32, Math.ceil(viewport.height / step));

    if (this.bufCanvas.width !== bw || this.bufCanvas.height !== bh) {
      this.bufCanvas.width = bw;
      this.bufCanvas.height = bh;
    }

    const imgData = this.bufCtx.createImageData(bw, bh);
    const out = imgData.data;

    const lstRad = (astroState.lstDeg || 0) * DEG2RAD;
    const latRad = (astroState.latDeg || 48.85) * DEG2RAD;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLST = Math.sin(lstRad);
    const cosLST = Math.cos(lstRad);

    const mwW = this.mwWidth;
    const mwH = this.mwHeight;
    const mwData = this.mwData;
    const nightVision = !!astroState.nightVision;

    for (let by = 0; by < bh; by++) {
      const sy = (by + 0.5) * step;
      for (let bx = 0; bx < bw; bx++) {
        const sx = (bx + 0.5) * step;
        const outIdx = (by * bw + bx) * 4;

        let xEq, yEq, zEq;

        if (viewport.viewMode === 'celestial') {
          const eq = viewport.unprojectCelestialGlobe(sx, sy);
          if (!eq) continue;
          const ra = eq.raDeg * DEG2RAD;
          const dec = eq.decDeg * DEG2RAD;
          const cosD = Math.cos(dec);
          xEq = cosD * Math.cos(ra);
          yEq = cosD * Math.sin(ra);
          zEq = Math.sin(dec);
        } else {
          const hor = viewport.unprojectAltAz(sx, sy);
          if (viewport.viewMode === 'terrestrial' && astroState.groundEnabled !== false && hor.altDeg < -2) {
            continue;
          }
          const alt = hor.altDeg * DEG2RAD;
          const az = hor.azDeg * DEG2RAD;
          const sinAlt = Math.sin(alt);
          const cosAlt = Math.cos(alt);
          const cosAz = Math.cos(az);
          const sinAz = Math.sin(az);

          // Horizontal -> Equatorial unit vector
          const sinDec = sinAlt * sinLat + cosAlt * cosLat * cosAz;
          const z = Math.max(-1, Math.min(1, sinDec));
          const cosDecSinHA = -cosAlt * sinAz;
          const cosDecCosHA = sinAlt * cosLat - cosAlt * sinLat * cosAz;

          // RA = LST - HA => cos(RA)*cos(Dec) = cos(LST)*cosDecCosHA + sin(LST)*cosDecSinHA
          xEq = cosLST * cosDecCosHA + sinLST * cosDecSinHA;
          yEq = sinLST * cosDecCosHA - cosLST * cosDecSinHA;
          zEq = z;
        }

        const { u, v } = eqUnitToGalacticUV(xEq, yEq, zEq);
        const tx = Math.min(mwW - 1, Math.max(0, Math.floor(u * mwW)));
        const ty = Math.min(mwH - 1, Math.max(0, Math.floor(v * mwH)));
        const tIdx = (ty * mwW + tx) * 4;

        const a = mwData[tIdx + 3] * effBrightness * 0.55;
        if (a <= 1) continue;

        if (nightVision) {
          const lum = 0.3 * mwData[tIdx] + 0.59 * mwData[tIdx + 1] + 0.11 * mwData[tIdx + 2];
          out[outIdx] = Math.min(255, lum * 0.9);
          out[outIdx + 1] = Math.min(255, lum * 0.08);
          out[outIdx + 2] = Math.min(255, lum * 0.05);
          out[outIdx + 3] = Math.min(255, a);
        } else {
          out[outIdx] = mwData[tIdx];
          out[outIdx + 1] = mwData[tIdx + 1];
          out[outIdx + 2] = mwData[tIdx + 2];
          out[outIdx + 3] = Math.min(255, a);
        }
      }
    }

    this.bufCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bufCanvas, 0, 0, viewport.width, viewport.height);
    ctx.restore();
  }

  /**
   * Render HiPS DSS2 Color photographic sky survey tiles from CDS Strasbourg
   * Loaded on demand as the user navigates!
   */
  renderHipsDSS2(ctx, viewport, projectRaDecFn, nightVision = false) {
    // Choose HEALPix Norder based on current FOV (Norder 3 = 768 tiles across sky, up to Norder 6)
    let norder = 3;
    if (viewport.fov < 45) norder = 4;
    if (viewport.fov < 14) norder = 5;
    if (viewport.fov < 4.5) norder = 6;

    const nside = 1 << norder;
    const npixTotal = 12 * nside * nside;

    // Dense screen-grid sampling + neighbor expansion so zero visible tiles are missed
    const visiblePixels = new Set();
    const gridN = 28;
    for (let gy = 0; gy <= gridN; gy++) {
      const sy = (gy / gridN) * viewport.height;
      for (let gx = 0; gx <= gridN; gx++) {
        const sx = (gx / gridN) * viewport.width;
        const eq = viewport.unprojectEqAtScreen ? viewport.unprojectEqAtScreen(sx, sy) : null;
        if (eq) {
          const ipix = ang2pixNest(nside, (90 - eq.decDeg) * DEG2RAD, eq.raDeg * DEG2RAD);
          if (ipix >= 0 && ipix < npixTotal) {
            visiblePixels.add(ipix);
            // Also include immediate in-face neighbors to cover edge grazes
            const { ix, iy, faceNum } = nest2xyf(nside, ipix);
            for (let dy = -1; dy <= 1; dy++) {
              const ny = iy + dy;
              if (ny < 0 || ny >= nside) continue;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = ix + dx;
                if (nx < 0 || nx >= nside) continue;
                visiblePixels.add(xyf2nest(nside, nx, ny, faceNum));
              }
            }
          }
        }
      }
    }

    // For Norder 3, also check all 768 base tiles so wide-field views have complete coverage
    if (norder === 3) {
      for (let ipix = 0; ipix < 768; ipix++) {
        const center = pix2angNestCenter(nside, ipix);
        const p = projectRaDecFn(center.raDeg, center.decDeg);
        if (p && p.visible) visiblePixels.add(ipix);
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (nightVision) {
      ctx.filter = 'sepia(100%) hue-rotate(-50deg) saturate(400%) brightness(0.7)';
    }

    const subDiv = norder <= 3 ? 3 : 2;
    const maxSpanLimit = Math.max(viewport.width, viewport.height) * 0.85;

    for (const ipix of visiblePixels) {
      const tile = this._getOrLoadHipsTile(norder, ipix);
      if (tile && tile.status === 'ready' && tile.img) {
        this._drawHipsTileSubdivided(
          ctx,
          tile.img,
          nside,
          ipix,
          projectRaDecFn,
          subDiv,
          maxSpanLimit,
          0,
          0,
          1,
          1
        );
      } else if (norder > 3) {
        // Fallback to parent tile (Norder - 1 or Norder 3) while high-res tile loads
        for (let parentOrder = norder - 1; parentOrder >= 3; parentOrder--) {
          const shift = (norder - parentOrder) * 2;
          const parentIpix = ipix >>> shift;
          const parentKey = `${parentOrder}/${parentIpix}`;
          const parentTile = this.tileCache.get(parentKey);
          if (parentTile && parentTile.status === 'ready' && parentTile.img) {
            const parentNside = 1 << parentOrder;
            const childRel = ipix & ((1 << shift) - 1);
            const subScale = 1 / (1 << (norder - parentOrder));
            const relX = compactBits(childRel) * subScale;
            const relY = compactBits(childRel >>> 1) * subScale;
            this._drawHipsTileSubdivided(
              ctx,
              parentTile.img,
              nside,
              ipix,
              projectRaDecFn,
              1,
              maxSpanLimit,
              relY,
              relX,
              subScale,
              subScale
            );
            break;
          }
        }
      }
    }

    ctx.restore();
  }

  /**
   * Subdivide a HEALPix tile (ix, iy, faceNum) into subDiv x subDiv curvilinear cells
   * and map each cell to CDS HiPS UV coordinates:
   *   In CDS HiPS JPEG tiles, image u (0 -> w) runs along HEALPix y (South -> West)
   *   and image v (0 -> h) runs along HEALPix x (South -> East).
   */
  _drawHipsTileSubdivided(
    ctx,
    img,
    nside,
    ipix,
    projectRaDecFn,
    subDiv,
    maxSpanLimit,
    uvOffsetU = 0,
    uvOffsetV = 0,
    uvScaleU = 1,
    uvScaleV = 1
  ) {
    const { ix, iy, faceNum } = nest2xyf(nside, ipix);
    const w = img.naturalWidth || 512;
    const h = img.naturalHeight || 512;

    // Precompute (subDiv + 1) x (subDiv + 1) grid of projected screen points
    const gridPts = new Array((subDiv + 1) * (subDiv + 1));
    for (let sx = 0; sx <= subDiv; sx++) {
      const fx = ix + sx / subDiv;
      for (let sy = 0; sy <= subDiv; sy++) {
        const fy = iy + sy / subDiv;
        const ang = xyf2ang(nside, fx, fy, faceNum);
        gridPts[sx * (subDiv + 1) + sy] = projectRaDecFn(ang.raDeg, ang.decDeg);
      }
    }

    for (let sx = 0; sx < subDiv; sx++) {
      const v0 = (uvOffsetV + (sx / subDiv) * uvScaleV) * h;
      const v1 = (uvOffsetV + ((sx + 1) / subDiv) * uvScaleV) * h;
      for (let sy = 0; sy < subDiv; sy++) {
        const u0 = (uvOffsetU + (sy / subDiv) * uvScaleU) * w;
        const u1 = (uvOffsetU + ((sy + 1) / subDiv) * uvScaleU) * w;

        // 4 corners of sub-cell:
        // p00 = (fx0, fy0) -> (u0, v0)
        // p01 = (fx0, fy1) -> (u1, v0)
        // p11 = (fx1, fy1) -> (u1, v1)
        // p10 = (fx1, fy0) -> (u0, v1)
        const p00 = gridPts[sx * (subDiv + 1) + sy];
        const p01 = gridPts[sx * (subDiv + 1) + (sy + 1)];
        const p11 = gridPts[(sx + 1) * (subDiv + 1) + (sy + 1)];
        const p10 = gridPts[(sx + 1) * (subDiv + 1) + sy];

        if (!p00 || !p01 || !p11 || !p10) continue;
        if (!p00.visible || !p01.visible || !p11.visible || !p10.visible) continue;

        const span = Math.max(
          Math.hypot(p00.x - p11.x, p00.y - p11.y),
          Math.hypot(p01.x - p10.x, p01.y - p10.y)
        );
        if (span > maxSpanLimit) continue;

        this._drawTriangle(ctx, img, p00.x, p00.y, p01.x, p01.y, p11.x, p11.y, u0, v0, u1, v0, u1, v1);
        this._drawTriangle(ctx, img, p00.x, p00.y, p11.x, p11.y, p10.x, p10.y, u0, v0, u1, v1, u0, v1);
      }
    }
  }

  _getOrLoadHipsTile(norder, ipix) {
    const key = `${norder}/${ipix}`;
    if (this.tileCache.has(key)) {
      return this.tileCache.get(key);
    }

    // Evict oldest if cache full
    if (this.tileCache.size >= this.maxCachedTiles) {
      const oldestKey = this.tileCache.keys().next().value;
      this.tileCache.delete(oldestKey);
    }

    const dir = Math.floor(ipix / 10000) * 10000;
    const url = `${this.hipsBaseUrl}/Norder${norder}/Dir${dir}/Npix${ipix}.jpg`;
    const entry = { status: 'loading', img: null };
    this.tileCache.set(key, entry);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      entry.status = 'ready';
      entry.img = img;
      if (this.onTileLoaded) this.onTileLoaded();
    };
    img.onerror = () => {
      entry.status = 'error';
    };
    img.src = url;
    return entry;
  }

  _drawTriangle(ctx, img, x0, y0, x1, y1, x2, y2, u0, v0, u1, v1, u2, v2) {
    const denom = u0 * (v2 - v1) - u1 * v2 + u2 * v1 + (u1 - u2) * v0;
    if (Math.abs(denom) < 1e-5) return;

    // Expand clipping triangle slightly outward (~0.65px) from centroid to prevent canvas anti-aliasing hairline seams
    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    const expand = 0.65;
    const d0 = Math.hypot(x0 - cx, y0 - cy) || 1;
    const d1 = Math.hypot(x1 - cx, y1 - cy) || 1;
    const d2 = Math.hypot(x2 - cx, y2 - cy) || 1;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0 + ((x0 - cx) / d0) * expand, y0 + ((y0 - cy) / d0) * expand);
    ctx.lineTo(x1 + ((x1 - cx) / d1) * expand, y1 + ((y1 - cy) / d1) * expand);
    ctx.lineTo(x2 + ((x2 - cx) / d2) * expand, y2 + ((y2 - cy) / d2) * expand);
    ctx.closePath();
    ctx.clip();

    const m11 = -(v0 * (x2 - x1) - v1 * x2 + v2 * x1 + (v1 - v2) * x0) / denom;
    const m12 = (v1 * y2 + v0 * (y1 - y2) - v2 * y1 + (v2 - v1) * y0) / denom;
    const m21 = (u0 * (x2 - x1) - u1 * x2 + u2 * x1 + (u1 - u2) * x0) / denom;
    const m22 = -(u1 * y2 + u0 * (y1 - y2) - u2 * y1 + (u2 - u1) * y0) / denom;
    const dx = (u0 * (v2 * x1 - v1 * x2) + v0 * (u1 * x2 - u2 * x1) + (u2 * v1 - u1 * v2) * x0) / denom;
    const dy = (u0 * (v2 * y1 - v1 * y2) + v0 * (u1 * y2 - u2 * y1) + (u2 * v1 - u1 * v2) * y0) / denom;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.globalAlpha = 0.88;
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}

/**
 * HEALPix nested indexing helpers (ang2pix_nest & continuous xyf2ang)
 */
function spreadBits(x) {
  let r = x & 0xffff;
  r = (r | (r << 8)) & 0x00ff00ff;
  r = (r | (r << 4)) & 0x0f0f0f0f;
  r = (r | (r << 2)) & 0x33333333;
  r = (r | (r << 1)) & 0x55555555;
  return r;
}

function compactBits(x) {
  let r = x & 0x55555555;
  r = (r | (r >>> 1)) & 0x33333333;
  r = (r | (r >>> 2)) & 0x0f0f0f0f;
  r = (r | (r >>> 4)) & 0x00ff00ff;
  r = (r | (r >>> 8)) & 0x0000ffff;
  return r;
}

function xyf2nest(nside, ix, iy, faceNum) {
  return (faceNum * nside * nside) + (spreadBits(ix) | (spreadBits(iy) << 1));
}

function nest2xyf(nside, ipix) {
  const npface = nside * nside;
  const faceNum = Math.floor(ipix / npface);
  const rem = ipix % npface;
  const ix = compactBits(rem);
  const iy = compactBits(rem >>> 1);
  return { ix, iy, faceNum };
}

const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];

export function ang2pixNest(nside, theta, phi) {
  const z = Math.cos(theta);
  const za = Math.abs(z);
  let tt = ((phi / (Math.PI * 0.5)) % 4 + 4) % 4;
  let faceNum, ix, iy;

  if (za <= 2 / 3) {
    const temp1 = nside * (0.5 + tt);
    const temp2 = nside * (z * 0.75);
    const jp = Math.floor(temp1 - temp2);
    const jm = Math.floor(temp1 + temp2);
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    if (ifp === ifm) {
      faceNum = (ifp === 4) ? 4 : ifp + 4;
    } else if (ifp < ifm) {
      faceNum = ifp;
    } else {
      faceNum = ifm + 8;
    }
    ix = jm & (nside - 1);
    iy = nside - (jp & (nside - 1)) - 1;
  } else {
    const ntt = Math.min(3, Math.floor(tt));
    const tp = tt - ntt;
    const tmp = nside * Math.sqrt(3 * (1 - za));
    let jp = Math.floor(tp * tmp);
    let jm = Math.floor((1.0 - tp) * tmp);
    jp = Math.min(nside - 1, jp);
    jm = Math.min(nside - 1, jm);
    if (z >= 0) {
      faceNum = ntt;
      ix = nside - jm - 1;
      iy = nside - jp - 1;
    } else {
      faceNum = ntt + 8;
      ix = jp;
      iy = jm;
    }
  }
  return xyf2nest(nside, ix, iy, faceNum);
}

/**
 * Continuous HEALPix face-coordinate (x, y in [0..nside]) to (raDeg, decDeg)
 * Exact inverse of ang2pixNest for arbitrary fractional corners and sub-grid points.
 */
function xyf2ang(nside, x, y, faceNum) {
  const u = x / nside;
  const v = y / nside;
  const jr = JRLL[faceNum] - u - v;
  let nr, z;
  if (jr < 1.0) {
    nr = jr;
    z = 1.0 - (nr * nr) / 3.0;
  } else if (jr > 3.0) {
    nr = 4.0 - jr;
    z = (nr * nr) / 3.0 - 1.0;
  } else {
    nr = 1.0;
    z = (2.0 - jr) * (2.0 / 3.0);
  }

  const phi = nr < 1e-9 ? 0.0 : (JPLL[faceNum] + (u - v) / nr) * (Math.PI * 0.25);
  const decDeg = Math.asin(Math.max(-1, Math.min(1, z))) * RAD2DEG;
  const raDeg = ((phi * RAD2DEG) % 360 + 360) % 360;
  return { raDeg, decDeg };
}

export function pix2angNestCenter(nside, ipix) {
  const { ix, iy, faceNum } = nest2xyf(nside, ipix);
  return xyf2ang(nside, ix + 0.5, iy + 0.5, faceNum);
}

export function pix2angNestCorners(nside, ipix) {
  const { ix, iy, faceNum } = nest2xyf(nside, ipix);
  return [
    xyf2ang(nside, ix, iy, faceNum),
    xyf2ang(nside, ix, iy + 1, faceNum),
    xyf2ang(nside, ix + 1, iy + 1, faceNum),
    xyf2ang(nside, ix + 1, iy, faceNum)
  ];
}
