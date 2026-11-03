/**
 * js/render/sky-renderer.js
 * Complete multi-view sky renderer supporting:
 * 1) Terrestrial View (dome + atmosphere + ground + custom horizon relief)
 * 2) Celestial Sphere (3D celestial globe)
 * 3) Telescope View (circular eyepiece field + surface brightness + Finder scope inset)
 * 4) Solar System View (3D orbitable heliocentric system with planets & 8 asteroids)
 */

import { PlanetShaderRenderer } from './planet-shader.js?v=11';
import { MilkyWayAndHipsRenderer } from './milkyway-hips.js?v=11';
import { WebGLSkyAccelerator } from './webgl-sky.js?v=11';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Selenographic catalog of major Lunar structures (IAU coordinates: lat° N/S, lon° E/W)
 * Progressive zoom tiers via `minRadiusPx` (apparent Moon radius in pixels on screen):
 * - Tier 1 (minRadiusPx: 26): Major Maria, Oceanus & iconic rayed craters
 * - Tier 2 (minRadiusPx: 58): Secondary Maria, Sinus, Mountain ranges & large craters
 * - Tier 3 (minRadiusPx: 115): Detailed craters, Ptolemaeus-Alphonsus-Arzachel trio & Apollo sites
 */
export const LUNAR_FEATURES = [
  // Tier 1 — Major Maria & Oceanus
  { id: 'LUN:Procellarum', name: 'Océan des Tempêtes', latin: 'Oceanus Procellarum', kind: 'mare', lat: 18.4, lon: -57.4, diamKm: 2568, minRadiusPx: 26, priority: 92 },
  { id: 'LUN:Imbrium', name: 'Mer des Pluies', latin: 'Mare Imbrium', kind: 'mare', lat: 32.8, lon: -15.6, diamKm: 1145, minRadiusPx: 24, priority: 95 },
  { id: 'LUN:Serenitatis', name: 'Mer de la Sérénité', latin: 'Mare Serenitatis', kind: 'mare', lat: 28.0, lon: 17.5, diamKm: 674, minRadiusPx: 26, priority: 94 },
  { id: 'LUN:Tranquillitatis', name: 'Mer de la Tranquillité', latin: 'Mare Tranquillitatis', kind: 'mare', lat: 8.5, lon: 31.4, diamKm: 875, minRadiusPx: 24, priority: 95 },
  { id: 'LUN:Crisium', name: 'Mer des Crises', latin: 'Mare Crisium', kind: 'mare', lat: 17.0, lon: 59.1, diamKm: 555, minRadiusPx: 26, priority: 91 },
  { id: 'LUN:Fecunditatis', name: 'Mer de la Fécondité', latin: 'Mare Fecunditatis', kind: 'mare', lat: -7.8, lon: 51.3, diamKm: 840, minRadiusPx: 28, priority: 89 },
  { id: 'LUN:Nubium', name: 'Mer des Nuées', latin: 'Mare Nubium', kind: 'mare', lat: -21.3, lon: -16.6, diamKm: 715, minRadiusPx: 28, priority: 90 },
  { id: 'LUN:Humorum', name: 'Mer des Humeurs', latin: 'Mare Humorum', kind: 'mare', lat: -24.4, lon: -38.6, diamKm: 425, minRadiusPx: 32, priority: 87 },
  // Tier 1 — Iconic Craters
  { id: 'LUN:Tycho', name: 'Tycho', latin: 'Tycho', kind: 'crater', lat: -43.31, lon: -11.36, diamKm: 85, minRadiusPx: 26, priority: 93 },
  { id: 'LUN:Copernicus', name: 'Copernic', latin: 'Copernicus', kind: 'crater', lat: 9.62, lon: -20.08, diamKm: 93, minRadiusPx: 26, priority: 93 },
  { id: 'LUN:Plato', name: 'Platon', latin: 'Plato', kind: 'crater', lat: 51.6, lon: -9.3, diamKm: 101, minRadiusPx: 32, priority: 88 },
  { id: 'LUN:Aristarchus', name: 'Aristarque', latin: 'Aristarchus', kind: 'crater', lat: 23.7, lon: -47.4, diamKm: 40, minRadiusPx: 34, priority: 86 },
  { id: 'LUN:Kepler', name: 'Kepler', latin: 'Kepler', kind: 'crater', lat: 8.1, lon: -38.0, diamKm: 32, minRadiusPx: 38, priority: 84 },

  // Tier 2 — Secondary Maria, Sinus, Mountains & Classic Craters
  { id: 'LUN:Frigoris', name: 'Mer du Froid', latin: 'Mare Frigoris', kind: 'mare', lat: 56.0, lon: 1.4, diamKm: 1446, minRadiusPx: 48, priority: 82 },
  { id: 'LUN:Nectaris', name: 'Mer du Nectar', latin: 'Mare Nectaris', kind: 'mare', lat: -15.2, lon: 35.5, diamKm: 333, minRadiusPx: 48, priority: 83 },
  { id: 'LUN:Vaporum', name: 'Mer des Vapeurs', latin: 'Mare Vaporum', kind: 'mare', lat: 13.3, lon: 3.6, diamKm: 242, minRadiusPx: 58, priority: 78 },
  { id: 'LUN:Cognitum', name: 'Mer Connue', latin: 'Mare Cognitum', kind: 'mare', lat: -10.0, lon: -23.1, diamKm: 376, minRadiusPx: 65, priority: 76 },
  { id: 'LUN:SinusIridum', name: 'Golfe des Iris', latin: 'Sinus Iridum', kind: 'sinus', lat: 44.1, lon: -31.5, diamKm: 249, minRadiusPx: 52, priority: 81 },
  { id: 'LUN:Apenninus', name: 'Monts Apennins', latin: 'Montes Apenninus', kind: 'montes', lat: 19.9, lon: -0.1, diamKm: 600, minRadiusPx: 52, priority: 83 },
  { id: 'LUN:Alpes', name: 'Monts Alpes', latin: 'Montes Alpes', kind: 'montes', lat: 46.4, lon: -0.8, diamKm: 281, minRadiusPx: 62, priority: 77 },
  { id: 'LUN:Carpatus', name: 'Monts Carpates', latin: 'Montes Carpatus', kind: 'montes', lat: 14.5, lon: -24.4, diamKm: 361, minRadiusPx: 72, priority: 74 },
  { id: 'LUN:Clavius', name: 'Clavius', latin: 'Clavius', kind: 'crater', lat: -58.4, lon: -14.4, diamKm: 231, minRadiusPx: 48, priority: 82 },
  { id: 'LUN:Archimedes', name: 'Archimède', latin: 'Archimedes', kind: 'crater', lat: 29.7, lon: -4.0, diamKm: 81, minRadiusPx: 58, priority: 79 },
  { id: 'LUN:Grimaldi', name: 'Grimaldi', latin: 'Grimaldi', kind: 'crater', lat: -5.2, lon: -68.6, diamKm: 173, minRadiusPx: 58, priority: 77 },
  { id: 'LUN:Gassendi', name: 'Gassendi', latin: 'Gassendi', kind: 'crater', lat: -17.5, lon: -39.9, diamKm: 111, minRadiusPx: 62, priority: 76 },
  { id: 'LUN:Theophilus', name: 'Théophile', latin: 'Theophilus', kind: 'crater', lat: -11.4, lon: 26.4, diamKm: 100, minRadiusPx: 58, priority: 79 },
  { id: 'LUN:Posidonius', name: 'Posidonius', latin: 'Posidonius', kind: 'crater', lat: 31.8, lon: 29.9, diamKm: 95, minRadiusPx: 65, priority: 75 },
  { id: 'LUN:Langrenus', name: 'Langrenus', latin: 'Langrenus', kind: 'crater', lat: -8.9, lon: 60.9, diamKm: 132, minRadiusPx: 65, priority: 75 },
  { id: 'LUN:Petavius', name: 'Pétavius', latin: 'Petavius', kind: 'crater', lat: -25.3, lon: 60.4, diamKm: 177, minRadiusPx: 65, priority: 74 },

  // Tier 3 — High-Zoom Craters & Historic Apollo Landing Sites
  { id: 'LUN:Ptolemaeus', name: 'Ptolémée', latin: 'Ptolemaeus', kind: 'crater', lat: -9.2, lon: -1.8, diamKm: 154, minRadiusPx: 95, priority: 73 },
  { id: 'LUN:Alphonsus', name: 'Alphonse', latin: 'Alphonsus', kind: 'crater', lat: -13.4, lon: -2.8, diamKm: 111, minRadiusPx: 110, priority: 71 },
  { id: 'LUN:Arzachel', name: 'Arzachel', latin: 'Arzachel', kind: 'crater', lat: -18.2, lon: -1.9, diamKm: 97, minRadiusPx: 115, priority: 70 },
  { id: 'LUN:Albategnius', name: 'Albategnius', latin: 'Albategnius', kind: 'crater', lat: -11.2, lon: 4.1, diamKm: 131, minRadiusPx: 105, priority: 71 },
  { id: 'LUN:Eratosthenes', name: 'Ératosthène', latin: 'Eratosthenes', kind: 'crater', lat: 14.5, lon: -11.3, diamKm: 59, minRadiusPx: 100, priority: 72 },
  { id: 'LUN:Aristoteles', name: 'Aristote', latin: 'Aristoteles', kind: 'crater', lat: 50.2, lon: 17.4, diamKm: 88, minRadiusPx: 105, priority: 70 },
  { id: 'LUN:Eudoxus', name: 'Eudoxe', latin: 'Eudoxus', kind: 'crater', lat: 44.3, lon: 16.3, diamKm: 67, minRadiusPx: 115, priority: 68 },
  { id: 'LUN:Schickard', name: 'Schickard', latin: 'Schickard', kind: 'crater', lat: -44.4, lon: -55.1, diamKm: 212, minRadiusPx: 105, priority: 69 },
  { id: 'LUN:Bullialdus', name: 'Bullialdus', latin: 'Bullialdus', kind: 'crater', lat: -20.7, lon: -22.2, diamKm: 61, minRadiusPx: 110, priority: 68 },
  { id: 'LUN:Catharina', name: 'Catherine', latin: 'Catharina', kind: 'crater', lat: -18.0, lon: 23.6, diamKm: 100, minRadiusPx: 120, priority: 67 },
  { id: 'LUN:Cyrillus', name: 'Cyrille', latin: 'Cyrillus', kind: 'crater', lat: -13.2, lon: 24.0, diamKm: 98, minRadiusPx: 125, priority: 66 },
  { id: 'LUN:Piccolomini', name: 'Piccolomini', latin: 'Piccolomini', kind: 'crater', lat: -29.7, lon: 32.2, diamKm: 88, minRadiusPx: 115, priority: 67 },
  { id: 'LUN:Apollo11', name: 'Apollo 11', latin: 'Statio Tranquillitatis (1969)', kind: 'landing', lat: 0.67, lon: 23.47, diamKm: 1, minRadiusPx: 95, priority: 75 }
];

/**
 * Localized French common names for iconic Deep Sky Objects (matching Astro2001 cartography)
 */
const FRENCH_DSO_NAMES = {
  M1: 'Nébuleuse du Crabe',
  M8: 'Nébuleuse de la Lagune',
  M11: 'Amas du Canard sauvage',
  M13: 'Grand Amas d’Hercule',
  M16: 'Nébuleuse de l’Aigle',
  M17: 'Nébuleuse Oméga',
  M20: 'Nébuleuse Trifide',
  M24: 'Petit Nuage stellaire du Sagittaire',
  M27: 'Nébuleuse de l’Haltère',
  M31: 'Galaxie d’Andromède',
  M33: 'Galaxie du Triangle',
  M42: 'Grande Nébuleuse d’Orion',
  M44: 'Amas de la Crèche (Praesepe)',
  M45: 'Les Pléiades',
  M51: 'Galaxie du Tourbillon',
  M57: 'Nébuleuse de la Lyre',
  M63: 'Galaxie du Tournesol',
  M64: 'Galaxie de l’Œil noir',
  M81: 'Galaxie de Bode',
  M82: 'Galaxie du Cigare',
  M83: 'Galaxie du Moulinet austral',
  M97: 'Nébuleuse du Hibou',
  M101: 'Galaxie du Moulinet',
  M104: 'Galaxie du Sombrero',
  NGC0869: 'h Per (Double Amas Ouest)',
  NGC0884: 'χ Per (Double Amas Est)',
  NGC1499: 'Nébuleuse Californie',
  NGC2237: 'Nébuleuse de la Rosette',
  NGC3372: 'Nébuleuse de la Carène',
  NGC4565: 'Galaxie de l’Aiguille',
  NGC5128: 'Centaurus A',
  NGC5139: 'Omega Centauri',
  NGC6888: 'Nébuleuse du Croissant',
  NGC6960: 'Dentelles du Cygne (Ouest)',
  NGC6992: 'Dentelles du Cygne (Est)',
  NGC7000: 'Nébuleuse de l’Amérique du Nord',
  NGC7293: 'Nébuleuse de l’Hélice',
  NGC7635: 'Nébuleuse de la Bulle',
  IC1805: 'Nébuleuse du Cœur',
  IC1848: 'Nébuleuse de l’Âme',
  IC0434: 'Nébuleuse de la Tête de Cheval'
};

/**
 * Format catalog IDs with clean cartographic spacing (e.g., "M16" -> "M 16", "NGC0869" -> "NGC 869", "PGC00094" -> "PGC 94")
 */
function formatCatalogCode(code) {
  if (!code) return '';
  const trimmed = String(code).trim();
  const m = trimmed.match(/^(M|NGC|IC|PGC|UGC|C|B|LDN|LBN|vdB|Abell|HCG)\s*0*(\d+[A-Za-z]?)$/i);
  if (m) {
    const prefix = m[1].toUpperCase() === 'VDB' ? 'vdB' : m[1].toUpperCase() === 'ABELL' ? 'Abell' : m[1].toUpperCase();
    return `${prefix} ${m[2]}`;
  }
  return trimmed;
}

/**
 * Format star labels concisely for the sky chart:
 * - Real IAU proper names ("Sirius", "Vindemiatrix", "Spica", "Denebola", "Diadem") win over Bayer/Flamsteed.
 * - Stars without a proper name use their Greek Bayer or Flamsteed designation + 3-letter IAU constellation code ("β Com", "γ Com", "43 Com").
 * - Never outputs internal HD/HIP numbers on the chart.
 */
function formatConciseStarLabel(nameEntry, fov) {
  if (!nameEntry) return '';
  if (typeof nameEntry === 'string') return nameEntry;
  // Schema: [properName, hip, hd, bayerGreek, flamsteed, conCode, distLy, spect]
  const properName = String(nameEntry[0] || '').trim();
  const bayer = String(nameEntry[3] || '').trim();
  const flam = String(nameEntry[4] || '').trim();
  const conCode = String(nameEntry[5] || '').trim();

  if (properName && !/^HD\s*\d+/i.test(properName) && !/^HIP\s*\d+/i.test(properName)) {
    return properName;
  }
  if (bayer && conCode) {
    return `${bayer} ${conCode}`;
  }
  if (flam && conCode && fov < 18) {
    return `${flam} ${conCode}`;
  }
  return '';
}

/**
 * Convert B-V color index (-0.4 to +2.0) to RGB color string
 */
export function bvToRgb(bv, nightVision = false) {
  if (nightVision) {
    return '#ff3b28';
  }
  const t = Math.max(-0.4, Math.min(2.0, bv));
  let r, g, b;
  if (t < 0.0) {
    const f = (t + 0.4) / 0.4;
    r = 165 + f * 40;
    g = 190 + f * 38;
    b = 255;
  } else if (t < 0.4) {
    const f = t / 0.4;
    r = 205 + f * 50;
    g = 228 + f * 27;
    b = 255 - f * 12;
  } else if (t < 0.8) {
    const f = (t - 0.4) / 0.4;
    r = 255;
    g = 255 - f * 20;
    b = 243 - f * 50;
  } else if (t < 1.4) {
    const f = (t - 0.8) / 0.6;
    r = 255;
    g = 235 - f * 45;
    b = 193 - f * 72;
  } else {
    const f = (t - 1.4) / 0.6;
    r = 255;
    g = 190 - f * 38;
    b = 121 - f * 42;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export class SkyRenderer {
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.viewport = viewport;

    this.planetShader = new PlanetShaderRenderer();
    this.mwHips = new MilkyWayAndHipsRenderer();
    this.webglSky = new WebGLSkyAccelerator();

    // DSO Photo Image cache (135 real photos in assets/dso/)
    this.dsoPhotoCache = new Map();

    // Cached text width measurements (font|text -> widthPx)
    this.textWidthCache = new Map();

    // Active screen hit targets populated during each render frame for click/hover selection
    this.screenTargets = [];

    // 2D Screen-Space Label Collision Avoidance Engine
    this.placedLabelBoxes = [];
    this.deferredLabels = [];

    // Telemetry stats for bottom-left Astro2001 status strip
    this.lastRenderMs = 1.2;
    this.lastLimitMag = 6.5;

    // Shooting star particles for active meteor showers
    this.meteorsParticles = [];
    this.lastMeteorSpawn = 0;

    // Finder scope offscreen canvas for Telescope view
    this.finderCanvas = document.createElement('canvas');
    this.finderCanvas.width = 210;
    this.finderCanvas.height = 210;
    this.finderCtx = this.finderCanvas.getContext('2d');
  }

  setOnAsyncAssetLoad(cb) {
    this.mwHips.onTileLoaded = cb;
    this.planetShader.onTextureLoaded = cb;
    this.webglSky.onAssetLoaded = cb;
    this._onAssetLoaded = cb;
  }

  _getDsoPhoto(photoFilename) {
    if (!photoFilename) return null;
    if (this.dsoPhotoCache.has(photoFilename)) {
      return this.dsoPhotoCache.get(photoFilename);
    }
    const entry = { loaded: false, img: null };
    this.dsoPhotoCache.set(photoFilename, entry);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      entry.loaded = true;
      entry.img = img;
      if (this._onAssetLoaded) this._onAssetLoaded();
    };
    img.src = `assets/dso/${photoFilename}?v=9`;
    return entry;
  }

  /**
   * Reset label bounding boxes and deferred label queue at the start of each frame
   */
  _resetLabelEngine() {
    this.placedLabelBoxes = [];
    this.deferredLabels = [];
  }

  /**
   * Reserve a circular/rectangular screen area (e.g. around a planet disk or very bright star)
   * so no text label gets drawn across the body itself.
   */
  _reserveObstacle(x, y, radiusPx) {
    const r = Math.max(3, radiusPx);
    this.placedLabelBoxes.push({
      x1: x - r,
      y1: y - r,
      x2: x + r,
      y2: y + r
    });
  }

  /**
   * Queue a label for prioritized, collision-free screen-space placement
   */
  _queueLabel(opts) {
    this.deferredLabels.push(opts);
  }

  _isBoxCollisionFree(x1, y1, x2, y2) {
    const w = this.viewport.width;
    const h = this.viewport.height;
    // Keep away from top bar, bottom dock, and screen edges
    if (x1 < 14 || x2 > w - 14 || y1 < 54 || y2 > h - 52) {
      return false;
    }
    const boxes = this.placedLabelBoxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Place all queued labels in descending priority order, testing candidate anchor positions
   * so labels never overlap each other or bright objects.
   */
  _flushDeferredLabels(ctx, nightVision) {
    if (!this.deferredLabels.length) return;

    this.deferredLabels.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const maxStarLabels = 24;
    const maxDsoLabels = Math.min(72, Math.max(36, Math.round(36 * (this.viewport.width * this.viewport.height) / (1280 * 800))));
    let starLabelsPlaced = 0;
    let dsoLabelsPlaced = 0;

    let currentFont = '';
    for (let i = 0; i < this.deferredLabels.length; i++) {
      const item = this.deferredLabels[i];
      const text = item.text;
      if (!text) continue;

      if (item.category === 'star' && starLabelsPlaced >= maxStarLabels) continue;
      if (item.category === 'dso' && dsoLabelsPlaced >= maxDsoLabels) continue;

      const fontStr = item.font || '500 11px "IBM Plex Sans", system-ui, -apple-system, sans-serif';
      if (fontStr !== currentFont) {
        ctx.font = fontStr;
        currentFont = fontStr;
      }

      const cacheKey = `${fontStr}|${text}`;
      let textW = this.textWidthCache.get(cacheKey);
      if (textW === undefined) {
        textW = Math.ceil(ctx.measureText(text).width);
        if (this.textWidthCache.size > 4000) this.textWidthCache.clear();
        this.textWidthCache.set(cacheKey, textW);
      }

      const textH = item.heightPx || 11;
      const padX = item.padX ?? 6;
      const padY = item.padY ?? 4;
      const off = item.offsetPx ?? 6;
      const ax = item.x;
      const ay = item.y;

      let candidates;
      if (item.centered) {
        candidates = [
          { tx: ax, ty: ay, align: 'center', x1: ax - textW * 0.5 - padX, y1: ay - textH - padY, x2: ax + textW * 0.5 + padX, y2: ay + padY },
          { tx: ax, ty: ay - 14, align: 'center', x1: ax - textW * 0.5 - padX, y1: ay - 14 - textH - padY, x2: ax + textW * 0.5 + padX, y2: ay - 14 + padY },
          { tx: ax, ty: ay + 16, align: 'center', x1: ax - textW * 0.5 - padX, y1: ay + 16 - textH - padY, x2: ax + textW * 0.5 + padX, y2: ay + 16 + padY }
        ];
      } else if (item.category === 'star') {
        // Stars: strictly to the right of the star disc (matching Astro2001 drawStars)
        candidates = [
          {
            tx: ax + off,
            ty: ay + 3.5,
            align: 'left',
            x1: ax + off - padX,
            y1: ay + 3.5 - textH - padY,
            x2: ax + off + textW + padX,
            y2: ay + 3.5 + padY
          }
        ];
      } else {
        // DSOs & bodies: primary right, or 1-line vertical shift (matching Astro2001 drawDsoLabels)
        candidates = [
          {
            tx: ax + off,
            ty: ay + 3.5,
            align: 'left',
            x1: ax + off - padX,
            y1: ay + 3.5 - textH - padY,
            x2: ax + off + textW + padX,
            y2: ay + 3.5 + padY
          },
          {
            tx: ax + off,
            ty: ay + 16.5,
            align: 'left',
            x1: ax + off - padX,
            y1: ay + 16.5 - textH - padY,
            x2: ax + off + textW + padX,
            y2: ay + 16.5 + padY
          },
          {
            tx: ax + off,
            ty: ay - 9.5,
            align: 'left',
            x1: ax + off - padX,
            y1: ay - 9.5 - textH - padY,
            x2: ax + off + textW + padX,
            y2: ay - 9.5 + padY
          }
        ];
      }

      let chosen = null;
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c];
        if (this._isBoxCollisionFree(cand.x1, cand.y1, cand.x2, cand.y2)) {
          chosen = cand;
          break;
        }
      }

      if (!chosen) continue;

      if (item.category === 'star') starLabelsPlaced++;
      if (item.category === 'dso') dsoLabelsPlaced++;

      this.placedLabelBoxes.push({
        x1: chosen.x1,
        y1: chosen.y1,
        x2: chosen.x2,
        y2: chosen.y2
      });

      ctx.textAlign = chosen.align;
      ctx.globalAlpha = item.alpha ?? 0.92;

      // Subtle dark cartographic halo for legibility over Milky Way / DSS2 / grids
      ctx.strokeStyle = nightVision ? 'rgba(10, 0, 0, 0.92)' : 'rgba(3, 6, 14, 0.88)';
      ctx.lineWidth = item.haloWidth ?? 2.8;
      ctx.strokeText(text, chosen.tx, chosen.ty);

      ctx.fillStyle = item.color || (nightVision ? '#ff7a60' : '#dce8ff');
      ctx.fillText(text, chosen.tx, chosen.ty);
    }

    ctx.restore();
  }

  /**
   * Main render entry point for all views
   */
  render(state) {
    const t0 = performance.now();
    const { ctx, viewport } = this;
    const w = viewport.width;
    const h = viewport.height;
    const nightVision = state.theme === 'nocturne';
    const isAlmanach = state.theme === 'almanach';

    this.screenTargets = [];
    this._resetLabelEngine();

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (viewport.viewMode === 'solarsystem') {
      this._renderSolarSystemView(ctx, state, nightVision, isAlmanach);
      ctx.restore();
      return;
    }

    // Prepare 3x3 Equatorial->Camera orthonormal basis matrix once per frame
    viewport.prepareFrameMatrices(state.lstDeg, state.observer.lat);

    // Provide helper on viewport for HiPS inverse lookup
    viewport.unprojectEqAtScreen = (sx, sy) => {
      if (viewport.viewMode === 'celestial') {
        return viewport.unprojectCelestialGlobe(sx, sy);
      }
      const hor = viewport.unprojectAltAz(sx, sy);
      return this._horizontalToEquatorial(hor.altDeg, hor.azDeg, state.lstDeg, state.observer.lat);
    };

    const projectRaDec = (raDeg, decDeg) => viewport.projectRaDecFast(raDeg, decDeg);

    // 1. Sky Background & Atmosphere
    this._renderSkyBackground(ctx, state, nightVision, isAlmanach);

    // Clip to Celestial Sphere globe if in 'celestial' mode with wide FOV
    if (viewport.viewMode === 'celestial' && viewport.fov >= 45) {
      const globeRadius = Math.min(w, h) * 0.44 * (90 / Math.max(25, viewport.fov));
      ctx.save();
      ctx.beginPath();
      ctx.arc(viewport.cx, viewport.cy, globeRadius, 0, Math.PI * 2);
      ctx.clip();
    }

    // Clip to circular Telescope Eyepiece if in 'telescope' mode
    let eyepieceRadius = 0;
    if (viewport.viewMode === 'telescope') {
      eyepieceRadius = Math.min(w, h) * 0.43;
      ctx.save();
      ctx.beginPath();
      ctx.arc(viewport.cx, viewport.cy, eyepieceRadius, 0, Math.PI * 2);
      ctx.clip();
    }

    // 2. Photographic Sky Survey (HiPS DSS2 Color) OR GPU Milky Way Panorama
    if (state.toggles.dssHips) {
      this.mwHips.renderHipsDSS2(ctx, viewport, projectRaDec, nightVision);
    } else if (state.toggles.milkyWay) {
      const mwOpts = {
        lstDeg: state.lstDeg,
        latDeg: state.observer.lat,
        sunAltDeg: state.sun ? state.sun.alt : -30,
        brightness: state.milkyWayBrightness ?? 1.0,
        atmosphereEnabled: state.toggles.atmosphere,
        groundEnabled: state.toggles.ground,
        nightVision
      };
      if (!this.webglSky.renderMilkyWay(ctx, viewport, mwOpts)) {
        this.mwHips.renderMilkyWay(ctx, viewport, mwOpts);
      }
    }

    // 2b. Embedded DSO Photos (drawn under stars so field stars shine crisply on top of nebulae)
    if (state.toggles.dso && state.toggles.dsoPhotos && !state.toggles.dssHips && state.catalogs.openngc) {
      this._renderDsoPhotosLayer(ctx, state, projectRaDec, nightVision);
    }

    // 3. Coordinate Grids (Equatorial in fine indigo-violet, Azimuthal in fine emerald-teal, Ecliptic)
    if (state.toggles.gridEquatorial) {
      this._renderEquatorialGrid(ctx, state, projectRaDec, nightVision, isAlmanach);
    }
    if (state.toggles.gridAzimuthal && viewport.viewMode !== 'celestial') {
      this._renderAzimuthalGrid(ctx, state, nightVision, isAlmanach);
    }
    if (state.toggles.ecliptic) {
      this._renderEcliptic(ctx, state, projectRaDec, nightVision, isAlmanach);
    }

    // 4. Constellations (Official IAU Boundaries & Luminous Two-Pass Lines)
    if (state.catalogs.constellations) {
      if (state.toggles.constellationBounds) {
        this._renderConstellationBounds(ctx, state, projectRaDec, nightVision, isAlmanach);
      }
      if (state.toggles.constellationLines) {
        this._renderConstellationLines(ctx, state, projectRaDec, nightVision, isAlmanach);
      }
      if (state.toggles.constellationNames) {
        this._renderConstellationNames(ctx, state, projectRaDec, nightVision, isAlmanach);
      }
    }

    // 5. Stars (871,136 ATHYG v3.2 sorted by magnitude + subtle WDS ticks & GCVS rings)
    if (state.toggles.stars && state.catalogs.starsBin) {
      this._renderStars(ctx, state, projectRaDec, nightVision, isAlmanach);
    }

    // 6. Deep Sky Objects (15,618 OpenNGC symbols & French/catalog labels)
    if (state.toggles.dso && state.catalogs.openngc) {
      this._renderDeepSkyObjects(ctx, state, projectRaDec, nightVision, isAlmanach);
    }

    // 7. Meteor Showers (13 showers + radiants)
    if (state.toggles.meteors && state.activeMeteors) {
      this._renderMeteorShowers(ctx, state, projectRaDec, nightVision);
    }

    // 8. Asteroids (8 bright asteroids)
    if (state.toggles.asteroids && state.asteroids) {
      this._renderAsteroids(ctx, state, projectRaDec, nightVision);
    }

    // 9. Planets, Sun, Moon & Jovian/Saturnian Moons
    if (state.toggles.planets && state.solarSystem) {
      this._renderSolarSystemBodiesOnSky(ctx, state, projectRaDec, nightVision);
    }

    // 10. Satellites (177 SGP4 satellites + previewed 4-day pass trajectory)
    if (state.toggles.satellites && state.satellites) {
      this._renderSatellites(ctx, state, projectRaDec, nightVision);
    }

    // 11. Object Trajectory Trace (if user enabled trace or pass preview)
    if (state.tracedTrajectory && state.tracedTrajectory.length > 1) {
      this._renderObjectTrace(ctx, state.tracedTrajectory, projectRaDec, nightVision);
    }

    // 11b. Flush all queued sky labels with 2D bounding-box collision avoidance!
    this._flushDeferredLabels(ctx, nightVision);

    // 12. Ground & « Mon horizon » 360° Custom Relief Silhouette + Cardinals (in Terrestrial / Zenith views)
    if (viewport.viewMode === 'terrestrial') {
      if (state.toggles.ground || state.toggles.horizonProfile) {
        this._renderGroundAndHorizonRelief(ctx, state, nightVision, isAlmanach);
      }
      if (state.toggles.cardinals) {
        this._renderCardinals(ctx, state, nightVision, isAlmanach);
      }
    } else if (viewport.viewMode === 'zenith') {
      this._renderZenithPlanisphereRim(ctx, state, nightVision, isAlmanach);
    }

    // 12b. Instrument Field Frame ("Tracer sur le ciel" from Matériel)
    if (state.showInstrumentFrame && viewport.viewMode !== 'telescope' && viewport.viewMode !== 'solarsystem') {
      this._renderInstrumentFieldFrame(ctx, state, projectRaDec, nightVision);
    }

    // 13. Selection Reticle
    if (state.selectedObject) {
      this._renderSelectionReticle(ctx, state, projectRaDec, nightVision);
    }

    // Restore Celestial Sphere or Telescope clip
    if (viewport.viewMode === 'celestial' && viewport.fov >= 45) {
      ctx.restore();
      this._renderCelestialGlobeRim(ctx, state, nightVision);
    } else if (viewport.viewMode === 'telescope') {
      ctx.restore();
      this._renderTelescopeOverlayAndFinder(ctx, state, eyepieceRadius, nightVision);
    }

    // 14. Bottom-left Astro2001 cartographic telemetry strip
    const dtMs = performance.now() - t0;
    this.lastRenderMs = this.lastRenderMs * 0.8 + dtMs * 0.2;
    this._renderCartographicTelemetry(ctx, state, nightVision);

    ctx.restore();
  }

  /**
   * Bottom-left Astro2001 telemetry line:
   * e.g. "FOV 19,9° · statique · ciel 3,9 ms · m≤8,5 · 871 136 étoiles · 15 618 objets profonds"
   */
  _renderCartographicTelemetry(ctx, state, nightVision) {
    const { viewport } = this;
    if (viewport.width < 640) return;

    const fovStr = viewport.fov < 10
      ? viewport.fov.toFixed(2).replace('.', ',')
      : viewport.fov.toFixed(1).replace('.', ',');
    const modeStr = state.isPlaying ? `×${state.timeRate || 1}` : 'statique';
    const msStr = this.lastRenderMs.toFixed(1).replace('.', ',');
    const magStr = (this.lastLimitMag || 6.5).toFixed(1).replace('.', ',');

    const text = `FOV ${fovStr}° · ${modeStr} · ciel ${msStr} ms · m≤${magStr} · 871 136 étoiles · 15 618 objets profonds`;

    ctx.save();
    ctx.font = '400 10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const x = 14;
    const y = viewport.height - 8;

    ctx.strokeStyle = nightVision ? 'rgba(8, 0, 0, 0.88)' : 'rgba(3, 6, 12, 0.82)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(text, x, y);

    ctx.fillStyle = nightVision ? 'rgba(215, 70, 52, 0.72)' : 'rgba(155, 175, 205, 0.68)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  _equatorialToHorizontal(raDeg, decDeg, lstDeg, latDeg) {
    const ha = (lstDeg - raDeg) * DEG2RAD;
    const dec = decDeg * DEG2RAD;
    const lat = latDeg * DEG2RAD;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinDec = Math.sin(dec);
    const cosDec = Math.cos(dec);
    const cosHA = Math.cos(ha);
    const sinHA = Math.sin(ha);

    const sinAlt = sinDec * sinLat + cosDec * cosLat * cosHA;
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD2DEG;
    const y = -cosDec * sinHA;
    const x = sinDec * cosLat - cosDec * sinLat * cosHA;
    const az = ((Math.atan2(y, x) * RAD2DEG) % 360 + 360) % 360;
    return { alt, az };
  }

  _horizontalToEquatorial(altDeg, azDeg, lstDeg, latDeg) {
    const alt = altDeg * DEG2RAD;
    const az = azDeg * DEG2RAD;
    const lat = latDeg * DEG2RAD;
    const sinAlt = Math.sin(alt);
    const cosAlt = Math.cos(alt);
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const cosAz = Math.cos(az);
    const sinAz = Math.sin(az);

    const sinDec = sinAlt * sinLat + cosAlt * cosLat * cosAz;
    const decDeg = Math.asin(Math.max(-1, Math.min(1, sinDec))) * RAD2DEG;
    const y = -cosAlt * sinAz;
    const x = sinAlt * cosLat - cosAlt * sinLat * cosAz;
    const haDeg = Math.atan2(y, x) * RAD2DEG;
    const raDeg = ((lstDeg - haDeg) % 360 + 360) % 360;
    return { raDeg, decDeg };
  }

  /**
   * 1. Sky Background & Realistic Twilight/Daylight Atmosphere
   */
  _renderSkyBackground(ctx, state, nightVision, isAlmanach) {
    const { viewport } = this;
    const w = viewport.width;
    const h = viewport.height;

    if (nightVision) {
      ctx.fillStyle = '#070000';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    if (isAlmanach && viewport.viewMode !== 'telescope') {
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
      grad.addColorStop(0, '#141924');
      grad.addColorStop(1, '#0a0e16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const sunAlt = (state.toggles.atmosphere && viewport.viewMode === 'terrestrial' && state.sun)
      ? state.sun.alt
      : -30;

    // Deep, velvet observatory night gradient matching Astro2001
    let topColor = '#02040a';
    let midColor = '#050a16';
    let horColor = '#0a1326';

    if (sunAlt > 10) {
      topColor = '#1c56a8';
      midColor = '#3a7bd5';
      horColor = '#89b9f0';
    } else if (sunAlt > -1) {
      const t = (sunAlt + 1) / 11;
      topColor = this._lerpHex('#0d224c', '#1c56a8', t);
      midColor = this._lerpHex('#354b7c', '#3a7bd5', t);
      horColor = this._lerpHex('#d97143', '#89b9f0', t);
    } else if (sunAlt > -6) {
      const t = (sunAlt + 6) / 5;
      topColor = this._lerpHex('#060f26', '#0d224c', t);
      midColor = this._lerpHex('#14254b', '#354b7c', t);
      horColor = this._lerpHex('#7e3d4a', '#d97143', t);
    } else if (sunAlt > -12) {
      const t = (sunAlt + 12) / 6;
      topColor = this._lerpHex('#030712', '#060f26', t);
      midColor = this._lerpHex('#081124', '#14254b', t);
      horColor = this._lerpHex('#1f2644', '#7e3d4a', t);
    } else if (sunAlt > -18) {
      const t = (sunAlt + 18) / 6;
      topColor = this._lerpHex('#02040a', '#030712', t);
      midColor = this._lerpHex('#050a16', '#081124', t);
      horColor = this._lerpHex('#0a1326', '#1f2644', t);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.58, midColor);
    grad.addColorStop(1, horColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  _lerpHex(h1, h2, t) {
    const f = Math.max(0, Math.min(1, t));
    const c1 = parseInt(h1.slice(1), 16);
    const c2 = parseInt(h2.slice(1), 16);
    const r = Math.round(((c1 >> 16) & 255) * (1 - f) + ((c2 >> 16) & 255) * f);
    const g = Math.round(((c1 >> 8) & 255) * (1 - f) + ((c2 >> 8) & 255) * f);
    const b = Math.round((c1 & 255) * (1 - f) + (c2 & 255) * f);
    return `rgb(${r},${g},${b})`;
  }

  /**
   * 3. Coordinate Grids:
   * - Equatorial (RA/Dec): Fine indigo-violet hairlines matching Astro2001 (`rgba(142, 118, 232, 0.34)`)
   * - Azimuthal (Alt/Az): Fine emerald-teal hairlines matching Astro2001 (`rgba(68, 185, 138, 0.32)`)
   */
  _renderEquatorialGrid(ctx, state, projectRaDec, nightVision, isAlmanach) {
    const { viewport } = this;
    const fov = viewport.fov;

    ctx.save();
    ctx.strokeStyle = nightVision
      ? 'rgba(210, 42, 32, 0.28)'
      : isAlmanach
      ? 'rgba(185, 155, 110, 0.28)'
      : 'rgba(142, 118, 232, 0.34)';
    ctx.fillStyle = nightVision ? 'rgba(245, 75, 55, 0.72)' : 'rgba(176, 156, 248, 0.78)';
    ctx.lineWidth = 0.75;
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';

    const raStep = fov < 12 ? 5 : fov < 32 ? 10 : 15;
    const decStep = fov < 12 ? 2.5 : fov < 32 ? 5 : 15;
    const maxJump = Math.max(viewport.width, viewport.height) * 0.35;

    // Declination parallels
    for (let dec = -80; dec <= 80; dec += decStep) {
      if (Math.abs(dec) > 85) continue;
      ctx.beginPath();
      let prev = null;
      let labelPt = null;
      for (let ra = 0; ra <= 360; ra += 2) {
        const p = projectRaDec(ra % 360, dec);
        if (p.visible) {
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < maxJump) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }
          prev = p;
          if (!labelPt && p.x > 70 && p.x < viewport.width - 90 && p.y > 75 && p.y < viewport.height - 75) {
            labelPt = p;
          }
        } else {
          prev = null;
        }
      }
      if (dec === 0) {
        ctx.save();
        ctx.lineWidth = 1.15;
        ctx.strokeStyle = nightVision ? 'rgba(250, 60, 40, 0.45)' : 'rgba(168, 145, 250, 0.52)';
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
      if (labelPt) {
        const decTxt = `${dec > 0 ? '+' : ''}${Number.isInteger(dec) ? dec : dec.toFixed(1)}°`;
        ctx.fillText(decTxt, labelPt.x + 4, labelPt.y - 4);
      }
    }

    // Right Ascension meridians
    for (let ra = 0; ra < 360; ra += raStep) {
      ctx.beginPath();
      let prev = null;
      let labelPt = null;
      for (let dec = -85; dec <= 85; dec += 2) {
        const p = projectRaDec(ra, dec);
        if (p.visible) {
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < maxJump) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }
          prev = p;
          if (!labelPt && p.x > 75 && p.x < viewport.width - 85 && p.y > viewport.height * 0.35 && p.y < viewport.height * 0.72) {
            labelPt = p;
          }
        } else {
          prev = null;
        }
      }
      ctx.stroke();
      if (labelPt) {
        const totalHours = ra / 15;
        const hoursStr = Number.isInteger(totalHours)
          ? `${totalHours}h`
          : `${totalHours.toFixed(1)}h`;
        ctx.fillText(hoursStr, labelPt.x + 4, labelPt.y + 11);
      }
    }
    ctx.restore();
  }

  _renderAzimuthalGrid(ctx, state, nightVision, isAlmanach) {
    const { viewport } = this;
    const fov = viewport.fov;

    ctx.save();
    ctx.strokeStyle = nightVision
      ? 'rgba(195, 48, 28, 0.26)'
      : isAlmanach
      ? 'rgba(130, 175, 145, 0.28)'
      : 'rgba(68, 185, 138, 0.32)';
    ctx.fillStyle = nightVision ? 'rgba(235, 72, 45, 0.70)' : 'rgba(105, 218, 172, 0.78)';
    ctx.lineWidth = 0.75;
    ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';

    const altStep = fov < 12 ? 2.5 : fov < 32 ? 5 : 15;
    const azStep = fov < 12 ? 5 : fov < 32 ? 10 : 15;
    const maxJump = Math.max(viewport.width, viewport.height) * 0.35;

    // Altitude circles
    for (let alt = 0; alt <= 85; alt += altStep) {
      ctx.beginPath();
      let prev = null;
      let labelPt = null;
      for (let az = 0; az <= 360; az += 2) {
        const p = viewport.projectAltAz(alt, az % 360);
        if (p.visible) {
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < maxJump) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }
          prev = p;
          if (!labelPt && p.x > viewport.width * 0.22 && p.x < viewport.width * 0.78 && p.y > 65 && p.y < viewport.height - 70) {
            labelPt = p;
          }
        } else {
          prev = null;
        }
      }
      ctx.stroke();
      if (labelPt && alt > 0) {
        const altTxt = `+${Number.isInteger(alt) ? alt : alt.toFixed(1)}°`;
        ctx.fillText(altTxt, labelPt.x + 4, labelPt.y - 4);
      }
    }

    // Azimuth verticals
    for (let az = 0; az < 360; az += azStep) {
      ctx.beginPath();
      let prev = null;
      let labelPt = null;
      for (let alt = 0; alt <= 85; alt += 2) {
        const p = viewport.projectAltAz(alt, az);
        if (p.visible) {
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < maxJump) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }
          prev = p;
          if (!labelPt && alt >= 5 && p.x > 65 && p.x < viewport.width - 75 && p.y > viewport.height * 0.55 && p.y < viewport.height - 65) {
            labelPt = p;
          }
        } else {
          prev = null;
        }
      }
      ctx.stroke();
      if (labelPt) {
        ctx.fillText(`${az}°`, labelPt.x + 4, labelPt.y - 4);
      }
    }
    ctx.restore();
  }

  _renderEcliptic(ctx, state, projectRaDec, nightVision) {
    const eps = 23.43929 * DEG2RAD;
    const sinEps = Math.sin(eps);
    const cosEps = Math.cos(eps);
    const maxJump = Math.max(this.viewport.width, this.viewport.height) * 0.35;

    ctx.save();
    ctx.strokeStyle = nightVision ? 'rgba(255, 80, 40, 0.42)' : 'rgba(235, 190, 78, 0.42)';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();

    let prev = null;
    for (let lon = 0; lon <= 360; lon += 2) {
      const l = (lon % 360) * DEG2RAD;
      const sinL = Math.sin(l);
      const cosL = Math.cos(l);
      const dec = Math.asin(sinL * sinEps) * RAD2DEG;
      const ra = ((Math.atan2(sinL * cosEps, cosL) * RAD2DEG) % 360 + 360) % 360;
      const p = projectRaDec(ra, dec);
      if (p.visible) {
        if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < maxJump) {
          ctx.lineTo(p.x, p.y);
        } else {
          ctx.moveTo(p.x, p.y);
        }
        prev = p;
      } else {
        prev = null;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 4. Constellations: Official IAU Boundaries, Two-Pass Luminous Lines, and Translated Names
   */
  _getUniqueIauBoundarySegments(list) {
    if (this._cachedIauSegments && this._cachedIauListRef === list) {
      return this._cachedIauSegments;
    }
    const edgeSet = new Set();
    const segments = [];

    for (const con of list) {
      const rings = Array.isArray(con.boundRings) && con.boundRings.length > 0
        ? con.boundRings
        : (Array.isArray(con.bounds) && con.bounds.length >= 3 ? [con.bounds] : []);

      for (const ring of rings) {
        if (!ring || ring.length < 2) continue;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const ka = `${Math.round(a[0] * 100)},${Math.round(a[1] * 100)}`;
          const kb = `${Math.round(b[0] * 100)},${Math.round(b[1] * 100)}`;
          if (ka === kb) continue;

          const p0 = ka < kb ? a : b;
          const p1 = ka < kb ? b : a;
          const edgeKey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          if (edgeSet.has(edgeKey)) continue;
          edgeSet.add(edgeKey);

          const ra0 = p0[0];
          const dec0 = p0[1];
          const dec1 = p1[1];
          const dRa = ((p1[0] - ra0 + 540) % 360) - 180;
          const dDec = dec1 - dec0;
          const meanDecRad = ((dec0 + dec1) * 0.5) * DEG2RAD;
          const arcSpan = Math.max(Math.abs(dRa) * Math.max(0.15, Math.cos(meanDecRad)), Math.abs(dDec));
          const steps = Math.max(1, Math.min(28, Math.ceil(arcSpan / 2.5)));

          // Precompute 3D Cartesian unit vectors (ux, uy, uz) for zero-trig projection
          const pts3d = new Float32Array((steps + 1) * 3);
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const raRad = (((ra0 + dRa * t) % 360 + 360) % 360) * DEG2RAD;
            const decRad = (dec0 + dDec * t) * DEG2RAD;
            const cosD = Math.cos(decRad);
            const idx = s * 3;
            pts3d[idx] = cosD * Math.cos(raRad);
            pts3d[idx + 1] = cosD * Math.sin(raRad);
            pts3d[idx + 2] = Math.sin(decRad);
          }
          segments.push(pts3d);
        }
      }
    }

    this._cachedIauListRef = list;
    this._cachedIauSegments = segments;
    return segments;
  }

  _getConstellationLines3D(list) {
    if (this._cachedConLines3D && this._cachedConLinesRef === list) {
      return this._cachedConLines3D;
    }
    const polylines = [];
    for (const con of list) {
      if (!con.lines) continue;
      for (const poly of con.lines) {
        const nVerts = Math.floor(poly.length / 2);
        if (nVerts < 2) continue;
        const pts3d = new Float32Array(nVerts * 3);
        for (let i = 0; i < nVerts; i++) {
          const raRad = poly[i * 2] * DEG2RAD;
          const decRad = poly[i * 2 + 1] * DEG2RAD;
          const cosD = Math.cos(decRad);
          const idx = i * 3;
          pts3d[idx] = cosD * Math.cos(raRad);
          pts3d[idx + 1] = cosD * Math.sin(raRad);
          pts3d[idx + 2] = Math.sin(decRad);
        }
        polylines.push(pts3d);
      }
    }
    this._cachedConLinesRef = list;
    this._cachedConLines3D = polylines;
    return polylines;
  }

  _renderConstellationBounds(ctx, state, projectRaDec, nightVision) {
    const list = state.catalogs.constellations;
    if (!Array.isArray(list)) return;

    const { viewport } = this;
    const segments = this._getUniqueIauBoundarySegments(list);
    const maxJump = Math.max(viewport.width, viewport.height) * 0.35;

    ctx.save();
    ctx.strokeStyle = nightVision ? 'rgba(195, 40, 28, 0.32)' : 'rgba(205, 148, 78, 0.26)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();

    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s];
      let prevX = 0, prevY = 0, hasPrev = false;
      for (let i = 0; i < seg.length; i += 3) {
        const p = viewport.projectUnitVec(seg[i], seg[i + 1], seg[i + 2]);
        if (p.visible) {
          if (hasPrev && Math.hypot(p.x - prevX, p.y - prevY) < maxJump) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }
          prevX = p.x;
          prevY = p.y;
          hasPrev = true;
        } else {
          hasPrev = false;
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  _renderConstellationLines(ctx, state, projectRaDec, nightVision, isAlmanach) {
    const list = state.catalogs.constellations;
    if (!Array.isArray(list)) return;

    const { viewport } = this;
    const polylines = this._getConstellationLines3D(list);
    const maxJump = Math.max(viewport.width, viewport.height) * 0.42;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let pIdx = 0; pIdx < polylines.length; pIdx++) {
      const poly = polylines[pIdx];
      let prevX = 0, prevY = 0, hasPrev = false;
      for (let i = 0; i < poly.length; i += 3) {
        const p = viewport.projectUnitVec(poly[i], poly[i + 1], poly[i + 2]);
        if (p.visible) {
          if (hasPrev && Math.hypot(p.x - prevX, p.y - prevY) < maxJump) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }
          prevX = p.x;
          prevY = p.y;
          hasPrev = true;
        } else {
          hasPrev = false;
        }
      }
    }

    // Pass 1: Soft outer luminous glow (pure vector stroke, no costly shadowBlur!)
    ctx.strokeStyle = nightVision
      ? 'rgba(220, 35, 25, 0.14)'
      : isAlmanach
      ? 'rgba(215, 180, 110, 0.14)'
      : 'rgba(92, 150, 255, 0.16)';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // Pass 2: Crisp celestial blue core line
    ctx.strokeStyle = nightVision
      ? 'rgba(240, 58, 40, 0.58)'
      : isAlmanach
      ? 'rgba(230, 195, 128, 0.62)'
      : 'rgba(142, 192, 255, 0.68)';
    ctx.lineWidth = 1.05;
    ctx.stroke();

    ctx.restore();
  }

  _renderConstellationNames(ctx, state, projectRaDec, nightVision, isAlmanach) {
    const list = state.catalogs.constellations;
    if (!Array.isArray(list)) return;

    const color = nightVision
      ? 'rgba(235, 78, 58, 0.68)'
      : isAlmanach
      ? 'rgba(230, 200, 142, 0.72)'
      : 'rgba(148, 190, 245, 0.68)';

    for (const con of list) {
      const p = projectRaDec(con.ra, con.dec);
      if (!p.visible) continue;
      if (this.viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < 2) continue;

      const label = state.getConstellationName
        ? state.getConstellationName(con.code)
        : (con.name || con.latin || con.code);

      this._queueLabel({
        text: label.toUpperCase(),
        x: p.x,
        y: p.y,
        centered: true,
        priority: 18,
        font: '600 11px "IBM Plex Sans", system-ui, -apple-system, sans-serif',
        color,
        alpha: 0.78,
        heightPx: 11,
        padX: 8,
        padY: 4
      });
    }
  }

  /**
   * Build precomputed 3D unit vectors (ux, uy, uz), magnitude-sorted index array (_dsoByMag),
   * and photo index list for all OpenNGC objects once.
   */
  _ensureDsoUnitVectors(rows) {
    if (this._dsoUnitVecs && this._dsoRowsRef === rows) {
      return;
    }
    const n = rows.length;
    const uVecs = new Float32Array(n * 3);
    const photoIndices = [];
    const withMag = [];
    const noMag = [];

    for (let i = 0; i < n; i++) {
      const r = rows[i];
      const raRad = (r[4] || 0) * DEG2RAD;
      const decRad = (r[5] || 0) * DEG2RAD;
      const cosD = Math.cos(decRad);
      const off = i * 3;
      uVecs[off] = cosD * Math.cos(raRad);
      uVecs[off + 1] = cosD * Math.sin(raRad);
      uVecs[off + 2] = Math.sin(decRad);
      if (r[13]) {
        photoIndices.push(i);
      }
      const type = r[3];
      // Skip historical OpenNGC single/double stars and plate flaws ('*', '**', '?')
      if (type === '*' || type === '**' || type === '?') continue;
      if (r[6] != null && Number.isFinite(r[6])) {
        withMag.push(i);
      } else {
        noMag.push(i);
      }
    }

    withMag.sort((a, b) => rows[a][6] - rows[b][6]);

    this._dsoRowsRef = rows;
    this._dsoUnitVecs = uVecs;
    this._dsoPhotoIndices = photoIndices;
    this._dsoByMag = Int32Array.from(withMag);
    this._dsoNoMag = Int32Array.from(noMag);
  }

  /**
   * 2b. Embedded DSO Photos Layer (rendered beneath stars so stars remain sharp on top of nebulae)
   */
  _renderDsoPhotosLayer(ctx, state, projectRaDec, nightVision) {
    const dsoCatalog = state.catalogs.openngc;
    if (!dsoCatalog || !dsoCatalog.rows) return;

    const { viewport } = this;
    const rows = dsoCatalog.rows;
    this._ensureDsoUnitVectors(rows);

    const fov = viewport.fov;
    const degToPx = Math.min(viewport.width, viewport.height) / fov;
    const photoIndices = this._dsoPhotoIndices;
    const uVecs = this._dsoUnitVecs;

    // Only iterate over the 135 objects that actually have a photo (instead of all 15,618 rows!)
    for (let k = 0; k < photoIndices.length; k++) {
      const i = photoIndices[k];
      const row = rows[i];
      const majArcmin = row[8] || 8;
      const approxRadiusPx = (majArcmin / 60) * degToPx * 0.5;
      if (approxRadiusPx < 4.5) continue;

      const uOff = i * 3;
      const p = viewport.projectUnitVec(uVecs[uOff], uVecs[uOff + 1], uVecs[uOff + 2]);
      if (!p.visible) continue;
      if (viewport.viewMode === 'terrestrial' && state.toggles.ground && p.sinAlt < -0.035) continue;

      const photoEntry = this._getDsoPhoto(row[13]);
      if (!photoEntry || !photoEntry.loaded || !photoEntry.img) continue;

      const ra = row[4];
      const dec = row[5];
      const minArcmin = row[9] || majArcmin;
      const paDeg = row[10] ?? 0;

      const stepDeg = 0.08;
      const stepArcmin = stepDeg * 60;
      const signN = dec <= 89.5 ? 1 : -1;
      const pN = projectRaDec(ra, dec + signN * stepDeg);
      const cosDec = Math.max(0.05, Math.cos(dec * DEG2RAD));
      const pE = projectRaDec((ra + stepDeg / cosDec) % 360, dec);
      if (!pN.visible || !pE.visible) continue;

      const nX = ((pN.x - p.x) * signN) / stepArcmin;
      const nY = ((pN.y - p.y) * signN) / stepArcmin;
      const eX = (pE.x - p.x) / stepArcmin;
      const eY = (pE.y - p.y) / stepArcmin;

      const paRad = paDeg * DEG2RAD;
      const cosPA = Math.cos(paRad);
      const sinPA = Math.sin(paRad);
      const majVecX = cosPA * nX + sinPA * eX;
      const majVecY = cosPA * nY + sinPA * eY;
      const minVecX = -sinPA * nX + cosPA * eX;
      const minVecY = -sinPA * nY + cosPA * eY;

      const semiMajPx = Math.hypot(majVecX, majVecY) * majArcmin * 0.5;
      if (semiMajPx < 4.5) continue;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      if (nightVision) {
        ctx.filter = 'sepia(100%) hue-rotate(-50deg) saturate(400%)';
      }
      const padScale = 1.23;
      const effMaj = Math.max(majArcmin, 14 / Math.max(0.05, Math.hypot(majVecX, majVecY)));
      const effMin = effMaj * Math.max(0.22, Math.min(1.0, minArcmin / Math.max(0.1, majArcmin)));
      ctx.transform(majVecX, majVecY, minVecX, minVecY, p.x, p.y);
      ctx.globalAlpha = Math.min(0.85, 0.42 + Math.log10(Math.max(1, semiMajPx / 5)) * 0.32);
      ctx.drawImage(
        photoEntry.img,
        -effMaj * 0.5 * padScale,
        -effMin * 0.5 * padScale,
        effMaj * padScale,
        effMin * padScale
      );
      ctx.restore();
    }
  }

  /**
   * 6. Deep Sky Objects (OpenNGC real catalog, sorted by magnitude with Astro2001 effLimitDSO + instrumental/sky reach)
   */
  _renderDeepSkyObjects(ctx, state, projectRaDec, nightVision) {
    const dsoCatalog = state.catalogs.openngc;
    if (!dsoCatalog || !dsoCatalog.rows) return;

    const { viewport } = this;
    const rows = dsoCatalog.rows;
    this._ensureDsoUnitVectors(rows);
    const uVecs = this._dsoUnitVecs;
    const byMag = this._dsoByMag;
    const camZ = viewport.camZ;
    const horZ = viewport.horZ;
    const fov = viewport.fov;
    const clipGround = viewport.viewMode === 'terrestrial' && state.toggles.ground;

    // Fast frustum cone threshold cos(theta_max)
    const maxConeRad = Math.min(Math.PI * 0.95, fov * DEG2RAD * 1.15);
    const minCosC = fov < 135 ? Math.cos(maxConeRad) : -0.95;

    // 1. Zoom-dependent display ceiling (exact Astro2001 effLimitDSO formula: 8.2 at 60°, 9.79 at 24°)
    const zoomBonus = 4 * Math.log10(60 / Math.max(0.035, fov));
    let limDSO = 8.2 + zoomBonus;

    // 2. Instrumental & sky brightness reach (Telescope aperture + Bortle sky SQM)
    const BORTLE_SKY_SB = [null, 21.85, 21.6, 21.4, 20.85, 19.75, 18.8, 18.25, 17.75, 17.2];
    const bortle = Math.min(9, Math.max(1, Math.round(state.bortleClass || 4)));
    const skySb = BORTLE_SKY_SB[bortle] || 20.85;
    const apMm = state.telescopeConfig?.apertureMm || 72;
    const scopeLimMag = 2.0 + 5 * Math.log10(Math.max(7, apMm)) - Math.max(0, (21.5 - skySb) * 0.38);

    // Cap DSO limiting magnitude by instrument capability when atmosphere is active
    if (state.toggles.atmosphere) {
      limDSO = Math.min(limDSO, scopeLimMag + 0.3);
    }

    const degToPx = Math.min(viewport.width, viewport.height) / fov;
    const showLabels = fov < 35;

    // Spatial deduplication grid to prevent two symbols on the exact same pixel cell
    const symbolCellSize = 14;
    const occupiedSymbolCells = new Set();

    ctx.save();

    for (let k = 0; k < byMag.length; k++) {
      const i = byMag[k];
      const row = rows[i];
      // Schema: [id, m, name, type, ra, dec, mag, sb, maj, min, pa, con, dist, photo, hubble]
      const mag = row[6];
      if (mag > limDSO) break; // Sorted by magnitude ascending: stop immediately at limit!

      // 3-multiply dot-product frustum culling BEFORE full projection
      const uOff = i * 3;
      const ux = uVecs[uOff];
      const uy = uVecs[uOff + 1];
      const uz = uVecs[uOff + 2];
      const cosC = camZ[0] * ux + camZ[1] * uy + camZ[2] * uz;
      if (cosC < minCosC) continue;
      if (clipGround && (horZ[0] * ux + horZ[1] * uy + horZ[2] * uz) < -0.02) continue;

      const p = viewport.projectUnitVec(ux, uy, uz);
      if (!p.visible) continue;

      const id = row[0] || '';
      const messier = row[1] || '';
      const type = row[3] || 'G';
      const sb = row[7];
      const hubble = row[14] || '';
      const isMessier = !!messier;
      const isGalaxy = (type === 'G' || type === 'Gx');

      // Surface-brightness & instrument reach check (Sérsic/Plummer core concentration)
      let horsPortee = false;
      if (state.toggles.atmosphere) {
        if (mag > scopeLimMag - 0.15) {
          horsPortee = true;
        } else if (sb != null && type !== 'OCl' && type !== 'OC') {
          let coreBoost = 1.4;
          if (isGalaxy) {
            if (hubble.startsWith('E') || hubble.startsWith('S0') || hubble.startsWith('Sa')) coreBoost = 2.3;
            else if (hubble.startsWith('Sb')) coreBoost = 1.7;
            else coreBoost = 1.1;
          } else if (type === 'GCl' || type === 'GC') {
            coreBoost = 2.0;
          }
          if ((sb - coreBoost) > skySb + 1.4) {
            horsPortee = true;
          }
        }
      }

      const cellKey = `${Math.floor(p.x / symbolCellSize)},${Math.floor(p.y / symbolCellSize)}`;
      if (!isMessier && occupiedSymbolCells.has(cellKey)) {
        continue;
      }
      occupiedSymbolCells.add(cellKey);

      const ra = row[4];
      const dec = row[5];
      const majArcmin = row[8] || 5;
      const minArcmin = row[9] || majArcmin;
      const paDeg = row[10];

      let majVecX = degToPx / 60;
      let majVecY = 0;
      let minVecX = 0;
      let minVecY = degToPx / 60;

      if ((isGalaxy || majArcmin >= 10) && paDeg != null) {
        const stepDeg = 0.05;
        const stepArcmin = stepDeg * 60;
        const signN = dec <= 89.5 ? 1 : -1;
        const pN = projectRaDec(ra, dec + signN * stepDeg);
        const cosDec = Math.max(0.05, Math.cos(dec * DEG2RAD));
        const pE = projectRaDec((ra + stepDeg / cosDec) % 360, dec);

        if (pN.visible && pE.visible) {
          const nX = ((pN.x - p.x) * signN) / stepArcmin;
          const nY = ((pN.y - p.y) * signN) / stepArcmin;
          const eX = (pE.x - p.x) / stepArcmin;
          const eY = (pE.y - p.y) / stepArcmin;
          const paRad = paDeg * DEG2RAD;
          const cosPA = Math.cos(paRad);
          const sinPA = Math.sin(paRad);
          majVecX = cosPA * nX + sinPA * eX;
          majVecY = cosPA * nY + sinPA * eY;
          minVecX = -sinPA * nX + cosPA * eX;
          minVecY = -sinPA * nY + cosPA * eY;
        }
      }

      const semiMajPx = Math.max(4.0, Math.hypot(majVecX, majVecY) * majArcmin * 0.5);
      const semiMinPx = (row[8] && row[9] && paDeg != null)
        ? Math.max(2.6, Math.hypot(minVecX, minVecY) * minArcmin * 0.5)
        : semiMajPx;

      const prevAlpha = ctx.globalAlpha;
      if (horsPortee) {
        ctx.globalAlpha = prevAlpha * 0.30; // DSO_OUT_ALPHA = 0.30
      }

      const dsoColor = this._drawDsoSymbol(
        ctx,
        p.x,
        p.y,
        semiMajPx,
        semiMinPx,
        majVecX,
        majVecY,
        type,
        nightVision,
        id,
        messier
      );
      ctx.globalAlpha = prevAlpha;

      // Reserve symbol obstacle so no label is drawn across the symbol
      this._reserveObstacle(p.x, p.y, Math.min(14, Math.max(4.5, semiMinPx * 0.5)));

      // Queue label only when in reach and FOV < 35° (matching Astro2001 drawDSO)
      if (showLabels && !horsPortee) {
        const commonName = FRENCH_DSO_NAMES[messier] || FRENCH_DSO_NAMES[id] || row[2] || '';
        const cleanCode = formatCatalogCode(messier || id);
        const labelText = commonName || cleanCode;
        const hasCommonName = !!commonName;

        const rLabelOff = Math.min(26, Math.max(6, Math.min(semiMajPx, semiMinPx) * 0.65 + 4));
        const priority = (hasCommonName ? 56 : isMessier ? 52 : 34) + Math.max(0, 14 - mag) * 1.5;

        this._queueLabel({
          category: 'dso',
          text: labelText,
          x: p.x,
          y: p.y,
          offsetPx: rLabelOff,
          priority,
          font: (hasCommonName || isMessier)
            ? '500 11px "IBM Plex Sans", system-ui, -apple-system, sans-serif'
            : '400 10.5px "IBM Plex Sans", system-ui, -apple-system, sans-serif',
          color: dsoColor,
          alpha: 0.90,
          heightPx: 11
        });
      }

      this.screenTargets.push({
        type: 'dso',
        id: row[0],
        messier: row[1],
        name: FRENCH_DSO_NAMES[messier] || FRENCH_DSO_NAMES[id] || row[2] || formatCatalogCode(messier || id),
        x: p.x,
        y: p.y,
        hitRadius: Math.max(10, Math.min(54, semiMajPx + 4)),
        priority: isMessier ? 28 : 16,
        data: row
      });
    }
    ctx.restore();
  }

  /**
   * Astro2001 Cartographic DSO Symbols:
   * - Diffuse / Emission / Reflection Nebulae & SNR: Luminous green contour (`#73da78`)
   * - Open Clusters (`OCl`): Warm ochre-yellow dashed circle (`#e8c46c`)
   * - Globular Clusters (`GCl`): Warm gold crossed circle (`#f2ca5c`)
   * - Planetary Nebulae (`PN`): Emerald-teal circle with 4 external cardinal ticks (`#69e1af`)
   * - Galaxies (`G`): Coral-salmon oriented ellipse (`#e47a60`)
   */
  _drawDsoSymbol(ctx, x, y, semiMajPx, semiMinPx, majVecX, majVecY, type, nightVision, id = '', messier = '') {
    ctx.save();
    ctx.lineWidth = 1.15;
    let labelColor = nightVision ? '#ff7052' : '#9ee6b8';

    if (type === 'G' || type === 'Gx') {
      const aAngle = Math.atan2(majVecY, majVecX);
      const rx = Math.min(52, Math.max(5, semiMajPx));
      const ry = Math.min(36, Math.max(2.6, semiMinPx));
      const col = nightVision ? 'rgba(255, 78, 54, 0.82)' : 'rgba(230, 124, 96, 0.85)';
      labelColor = nightVision ? '#ff785a' : '#f09c84';
      ctx.translate(x, y);
      ctx.rotate(aAngle);
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'GCl' || type === 'GC') {
      const r = Math.min(22, Math.max(5.5, semiMajPx * 0.65));
      const col = nightVision ? '#ff6442' : '#f2ca5c';
      labelColor = nightVision ? '#ff7c5c' : '#f5d77f';
      ctx.translate(x, y);
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.stroke();
    } else if (type === 'OCl' || type === 'OC') {
      const r = Math.min(28, Math.max(5.5, semiMajPx * 0.68));
      const col = nightVision ? '#ff6848' : '#e8c46c';
      labelColor = nightVision ? '#ff8060' : '#f0d284';
      ctx.translate(x, y);
      ctx.strokeStyle = col;
      ctx.setLineDash([2.8, 2.6]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'PN') {
      const r = Math.min(18, Math.max(4.8, semiMajPx * 0.6));
      const col = nightVision ? '#ff5840' : '#69e1af';
      labelColor = nightVision ? '#ff7658' : '#85ecc0';
      ctx.translate(x, y);
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
      ctx.moveTo(-r * 1.18, 0); ctx.lineTo(-r * 0.68, 0);
      ctx.moveTo(r * 0.68, 0); ctx.lineTo(r * 1.18, 0);
      ctx.moveTo(0, -r * 1.18); ctx.lineTo(0, -r * 0.68);
      ctx.moveTo(0, r * 0.68); ctx.lineTo(0, r * 1.18);
      ctx.stroke();
    } else {
      // Diffuse / Emission / Reflection Nebula / HII / Cl+N / SNR:
      // Astro2001 luminous green contour (organic isophote contour for large nebulae, crisp rounded contour for compact ones)
      const r = Math.min(44, Math.max(5.5, semiMajPx * 0.72));
      const col = nightVision ? '#ff523a' : '#73da78';
      labelColor = nightVision ? '#ff7458' : '#88e88d';
      ctx.translate(x, y);
      ctx.strokeStyle = col;

      if (r >= 11) {
        // Organic deterministic 10-vertex isophote contour seeded by catalog ID (like Astro2001 nebula outlines)
        const seedStr = messier || id || 'NEB';
        let seed = 0;
        for (let s = 0; s < seedStr.length; s++) {
          seed = (seed * 31 + seedStr.charCodeAt(s)) & 0xffff;
        }
        const nPts = 12;
        const rx = r;
        const ry = Math.max(r * 0.58, Math.min(r, semiMinPx * 0.72));
        const pts = [];
        for (let k = 0; k < nPts; k++) {
          const ang = (k / nPts) * Math.PI * 2;
          const wave = 0.84 + 0.24 * Math.sin(ang * 2 + (seed % 7)) + 0.12 * Math.cos(ang * 3 + (seed % 13));
          pts.push({
            px: Math.cos(ang) * rx * wave,
            py: Math.sin(ang) * ry * wave
          });
        }
        ctx.beginPath();
        for (let k = 0; k < nPts; k++) {
          const p0 = pts[k];
          const p1 = pts[(k + 1) % nPts];
          const mx = (p0.px + p1.px) * 0.5;
          const my = (p0.py + p1.py) * 0.5;
          if (k === 0) {
            ctx.moveTo(mx, my);
          } else {
            ctx.quadraticCurveTo(p0.px, p0.py, mx, my);
          }
        }
        const first = pts[0];
        const second = pts[1];
        ctx.quadraticCurveTo(first.px, first.py, (first.px + second.px) * 0.5, (first.py + second.py) * 0.5);
        ctx.closePath();
        ctx.stroke();
      } else {
        const s = r * 0.82;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(-s, -s, s * 2, s * 2, 2.2);
        } else {
          ctx.rect(-s, -s, s * 2, s * 2);
        }
        ctx.stroke();
      }
    }

    ctx.restore();
    return labelColor;
  }

  /**
   * 5. Stars (871,136 ATHYG v3.2 sorted by magnitude in stars.bin)
   *    Rendered on GPU via WebGLSkyAccelerator + 3D unit-vector frustum culling for WDS/GCVS/labels/targets.
   */
  _renderStars(ctx, state, projectRaDec, nightVision, isAlmanach) {
    const starsView = state.catalogs.starsBin;
    if (!starsView) return;

    const { viewport } = this;
    const fov = viewport.fov;

    // Smooth continuous limiting magnitude formula (like Astro2001: m<=8.5 at FOV 19.9°)
    let limitMag = Math.min(11.0, Math.max(5.3, 11.15 - 2.02 * Math.log10(Math.max(0.4, fov))));

    // Daylight suppression in terrestrial view
    if (viewport.viewMode === 'terrestrial' && state.toggles.atmosphere && state.sun) {
      if (state.sun.alt > 2) {
        limitMag = -1.5;
      } else if (state.sun.alt > -6) {
        limitMag = Math.min(limitMag, 2.5 - state.sun.alt * 0.5);
      }
    }
    this.lastLimitMag = limitMag;

    // Upload all 871,136 stars once to GPU VBO & build Float32Array of 3D unit vectors
    this.webglSky.ensureStarsUploaded(starsView);
    const gpuRendered = this.webglSky.renderStars(ctx, viewport, state, limitMag, nightVision, isAlmanach);

    const starCount = this.webglSky.getStarCountForLimitMag(limitMag);
    const uVecs = this.webglSky.starUnitVectors;
    const camZ = viewport.camZ;
    const horZ = viewport.horZ;
    const clipGround = viewport.viewMode === 'terrestrial' && state.toggles.ground;

    // Fast frustum cone threshold cos(theta_max)
    const maxConeRad = Math.min(Math.PI * 0.95, fov * DEG2RAD * 1.12);
    const minCosC = fov < 135 ? Math.cos(maxConeRad) : -0.95;

    const meta = state.catalogs.starMeta || {};
    const namesMap = meta.names || {};
    const wdsMap = meta.wds || {};
    const gcvsMap = meta.gcvs || {};

    const showDoubles = !!state.toggles.doubleStars;
    const showVariables = !!state.toggles.variableStars;

    // Spatial deduplication grid for WDS/GCVS markers so open clusters stay clean
    const markerCellSize = 24;
    const occupiedMarkerCells = new Set();

    ctx.save();

    for (let i = 0; i < starCount; i++) {
      // When GPU rendered the starfield and FOV >= 20°, faint unannotated stars (mag > 5.2, index >= 2200)
      // need neither CPU drawing nor label/target registration
      if (gpuRendered && fov >= 20 && i >= 2200 && !namesMap[i] && !(showDoubles && wdsMap[i]) && !(showVariables && gcvsMap[i])) {
        continue;
      }

      // 3-multiply dot-product frustum culling BEFORE any byte-unpacking or projection!
      const uOff = i * 3;
      const ux = uVecs[uOff];
      const uy = uVecs[uOff + 1];
      const uz = uVecs[uOff + 2];
      const cosC = camZ[0] * ux + camZ[1] * uy + camZ[2] * uz;
      if (cosC < minCosC) continue;
      if (clipGround && (horZ[0] * ux + horZ[1] * uy + horZ[2] * uz) < -0.02) continue;

      const p = viewport.projectUnitVec(ux, uy, uz);
      if (!p.visible) continue;

      const offset = i * 8;
      const magI16 = starsView.getInt16(offset + 4, true);
      const bvI8 = starsView.getInt8(offset + 6);
      const mag = magI16 * 0.001;
      const bv = bvI8 * 0.02;

      const radius = Math.max(0.55, Math.min(5.2, 0.58 + Math.pow(Math.max(0, 6.2 - mag), 1.28) * 0.38));

      // Fallback CPU star drawing only if WebGL is unavailable
      if (!gpuRendered) {
        const magDiff = limitMag - mag;
        const alpha = Math.max(0.16, Math.min(1.0, magDiff * 0.46));
        const color = bvToRgb(bv, nightVision);

        if (mag < 3.4) {
          const haloR = radius * (mag < 1.5 ? 3.8 : 2.6);
          const grad = ctx.createRadialGradient(p.x, p.y, radius * 0.35, p.x, p.y, haloR);
          grad.addColorStop(0, nightVision ? 'rgba(255, 75, 55, 0.42)' : 'rgba(235, 244, 255, 0.36)');
          grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.globalAlpha = Math.min(1, alpha);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Reserve obstacle box for bright stars so no label is drawn right on top of a bright star disk
      if (mag < 3.8) {
        this._reserveObstacle(p.x, p.y, radius + 2.5);
      }

      // Subtle WDS Double Star & GCVS Variable Star cartographic markers (Astro2001 style)
      if ((showDoubles && wdsMap[i]) || (showVariables && gcvsMap[i])) {
        const markerMagThreshold = fov < 15 ? 7.8 : fov < 35 ? 6.2 : 4.8;
        if (mag <= markerMagThreshold) {
          const mCell = `${Math.floor(p.x / markerCellSize)},${Math.floor(p.y / markerCellSize)}`;
          if (!occupiedMarkerCells.has(mCell)) {
            occupiedMarkerCells.add(mCell);

            // WDS Double Star: delicate horizontal side-ticks (—•—) without any cluttering circle
            if (showDoubles && wdsMap[i]) {
              const inner = radius + 1.4;
              const tickLen = 2.8;
              ctx.globalAlpha = 0.78;
              ctx.strokeStyle = nightVision ? 'rgba(255, 95, 70, 0.78)' : 'rgba(165, 205, 255, 0.75)';
              ctx.lineWidth = 0.9;
              ctx.beginPath();
              ctx.moveTo(p.x - inner - tickLen, p.y);
              ctx.lineTo(p.x - inner, p.y);
              ctx.moveTo(p.x + inner, p.y);
              ctx.lineTo(p.x + inner + tickLen, p.y);
              ctx.stroke();
            }

            // GCVS Variable Star: delicate thin concentric lavender ring
            if (showVariables && gcvsMap[i]) {
              const rVar = Math.max(3.6, radius + 2.4);
              ctx.globalAlpha = 0.72;
              ctx.strokeStyle = nightVision ? 'rgba(255, 85, 60, 0.72)' : 'rgba(214, 165, 238, 0.70)';
              ctx.lineWidth = 0.85;
              ctx.beginPath();
              ctx.arc(p.x, p.y, rVar, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      // Queue concise Star Name / Bayer designation label for collision-free placement (matching Astro2001 nameLim)
      const nameEntry = namesMap[i];
      if (nameEntry) {
        const nameLim = 2.5 + Math.max(0, limitMag - 5.8);
        if (mag <= nameLim) {
          const conciseLabel = formatConciseStarLabel(nameEntry, fov);
          if (conciseLabel) {
            const isProperName = !(/^[α-ωΑ-Ω0-9]/.test(conciseLabel));
            this._queueLabel({
              category: 'star',
              text: conciseLabel,
              x: p.x,
              y: p.y,
              offsetPx: radius + 4.5,
              priority: (isProperName ? 64 : 48) - mag * 5,
              font: mag < 2.3
                ? '600 11.5px "IBM Plex Sans", system-ui, -apple-system, sans-serif'
                : '400 10.5px "IBM Plex Sans", system-ui, -apple-system, sans-serif',
              color: nightVision ? '#ff8064' : (mag < 2.3 ? '#f0f5ff' : 'rgba(206, 220, 246, 0.78)'),
              alpha: mag < 2.5 ? 0.92 : 0.76,
              heightPx: 11
            });
          }
        }
      }

      // Register clickable target for bright or zoomed stars
      if (mag < 5.2 || fov < 20 || nameEntry || wdsMap[i] || gcvsMap[i]) {
        const raU16 = starsView.getUint16(offset, true);
        const decI16 = starsView.getInt16(offset + 2, true);
        const conIdx = starsView.getUint8(offset + 7);
        const dispName = formatConciseStarLabel(nameEntry, 1)
          || (Array.isArray(nameEntry) && nameEntry[2] ? `HD ${nameEntry[2]}` : '')
          || (Array.isArray(nameEntry) && nameEntry[1] ? `HIP ${nameEntry[1]}` : `Étoile #${i}`);
        this.screenTargets.push({
          type: 'star',
          starIdx: i,
          id: `STAR:${i}`,
          name: dispName,
          ra: (raU16 / 65535) * 360,
          dec: (decI16 / 32767) * 90,
          mag,
          bv,
          conIdx,
          x: p.x,
          y: p.y,
          hitRadius: Math.max(8, radius + 4),
          priority: Math.max(1, Math.round(12 - mag))
        });
      }
    }
    ctx.restore();
  }

  /**
   * 7. Meteor Showers (13 showers: radiant markers + collision-free labels)
   */
  _renderMeteorShowers(ctx, state, projectRaDec, nightVision) {
    ctx.save();

    for (const m of state.activeMeteors) {
      const p = projectRaDec(m.ra, m.dec);
      if (!p.visible) continue;
      if (this.viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < 0) continue;

      const isActive = m.currentZHR >= 1.5;
      const r = isActive ? 7.5 : 5;
      const col = nightVision ? '#ff5538' : (isActive ? '#70ffe0' : 'rgba(130, 215, 210, 0.62)');

      ctx.strokeStyle = col;
      ctx.lineWidth = isActive ? 1.25 : 0.95;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        ctx.moveTo(p.x + Math.cos(ang) * 2.2, p.y + Math.sin(ang) * 2.2);
        ctx.lineTo(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
      }
      ctx.stroke();

      const label = isActive ? `${m.name} (${Math.round(m.currentZHR)}/h)` : m.name;
      this._queueLabel({
        text: label,
        x: p.x,
        y: p.y,
        offsetPx: r + 4,
        priority: isActive ? 58 : 26,
        font: '500 10px "IBM Plex Sans", system-ui, -apple-system, sans-serif',
        color: col,
        alpha: 0.9,
        heightPx: 10
      });

      this.screenTargets.push({
        type: 'meteor',
        id: `MET:${m.code}`,
        name: m.name,
        x: p.x,
        y: p.y,
        hitRadius: 12,
        priority: 18,
        data: m
      });
    }
    ctx.restore();
  }

  /**
   * 8. Asteroids (8 bright asteroids propagated from JPL SBDB osculating elements)
   */
  _renderAsteroids(ctx, state, projectRaDec, nightVision) {
    ctx.save();

    for (const ast of state.asteroids) {
      const p = projectRaDec(ast.ra, ast.dec);
      if (!p.visible) continue;
      if (this.viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < -1) continue;

      const col = nightVision ? '#ff6a45' : '#e2c590';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.15;

      const r = 4.0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      ctx.stroke();

      this._queueLabel({
        text: ast.name,
        x: p.x,
        y: p.y,
        offsetPx: 6.5,
        priority: 62,
        font: '500 10.5px "IBM Plex Sans", system-ui, -apple-system, sans-serif',
        color: col,
        alpha: 0.92,
        heightPx: 11
      });

      this.screenTargets.push({
        type: 'asteroid',
        id: ast.id || ast.name,
        name: ast.name,
        x: p.x,
        y: p.y,
        hitRadius: 12,
        priority: 28,
        data: ast
      });
    }
    ctx.restore();
  }

  /**
   * 9. Planets, Sun, Moon & Moons of Jupiter/Saturn on the Sky
   */
  _renderSolarSystemBodiesOnSky(ctx, state, projectRaDec, nightVision) {
    const { viewport } = this;
    const degToPx = Math.min(viewport.width, viewport.height) / viewport.fov;
    const realSizes = !!state.toggles.realPlanetSizes;

    for (const body of state.solarSystem) {
      if (body.id === 'Earth') continue;
      const p = projectRaDec(body.ra, body.dec);
      if (!p.visible) continue;
      if (viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < -2) continue;

      const trueRadiusPx = ((body.angDiamArcsec || 20) / 3600) * degToPx * 0.5;
      let drawRadiusPx = trueRadiusPx;

      if (!realSizes) {
        if (body.id === 'Moon') {
          const boost = viewport.fov > 3 ? 1 + 0.55 * Math.min(1, (viewport.fov - 3) / 15) : 1.0;
          drawRadiusPx = Math.max(10, trueRadiusPx * boost);
        } else if (body.id === 'Sun') {
          drawRadiusPx = Math.max(9.5, trueRadiusPx);
        } else {
          const minPlanetR = Math.max(4.5, 7.5 - (body.mag || 1) * 0.6);
          drawRadiusPx = Math.max(minPlanetR, trueRadiusPx);
        }
      } else {
        drawRadiusPx = Math.max(1.8, trueRadiusPx);
      }

      this.planetShader.drawBody(ctx, body.id, p.x, p.y, drawRadiusPx, {
        phaseAngleDeg: body.phaseAngleDeg,
        paLimbDeg: body.paLimbDeg,
        cML: body.cML,
        subEarthLatDeg: body.subEarthLatDeg,
        ringTiltDeg: body.ringTiltDeg,
        nightVision
      });

      this._reserveObstacle(p.x, p.y, drawRadiusPx + 4);

      // Render Selenographic Lunar Structures (Maria, Craters, Mountains, Apollo 11) when zooming onto the Moon
      if (body.id === 'Moon' && drawRadiusPx >= 24) {
        this._renderLunarFeaturesOnDisk(ctx, state, body, p.x, p.y, drawRadiusPx, nightVision);
      }

      // Render Galilean moons of Jupiter and main moons of Saturn when zoomed in (< 4° FOV)
      if ((body.id === 'Jupiter' || body.id === 'Saturn') && body.moons && viewport.fov < 4.5) {
        ctx.save();
        for (const moon of body.moons) {
          const mx = p.x + moon.dx * drawRadiusPx;
          const my = p.y - moon.dy * drawRadiusPx;
          if (moon.occulted || moon.eclipsed) continue;

          ctx.fillStyle = nightVision ? '#ff6a50' : '#ffe9b8';
          ctx.beginPath();
          ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
          ctx.fill();

          if (viewport.fov < 1.5) {
            this._queueLabel({
              text: moon.name,
              x: mx,
              y: my,
              offsetPx: 4.5,
              priority: 72,
              font: '500 9.5px "IBM Plex Sans", system-ui, sans-serif',
              color: nightVision ? '#ff6a50' : '#ffe9b8',
              heightPx: 10
            });
          }

          this.screenTargets.push({
            type: 'moon',
            id: `MOON:${moon.name}`,
            name: moon.name,
            parentPlanet: body.id,
            x: mx,
            y: my,
            hitRadius: 8,
            priority: 32,
            data: moon
          });
        }
        ctx.restore();
      }

      const labelOffset = (body.id === 'Saturn' ? drawRadiusPx * 1.9 : drawRadiusPx) + 5;
      this._queueLabel({
        text: body.localizedName || body.name || body.id,
        x: p.x,
        y: p.y,
        offsetPx: labelOffset,
        priority: 95,
        font: '600 11.5px "IBM Plex Sans", system-ui, -apple-system, sans-serif',
        color: nightVision ? '#ff8568' : '#fff2c8',
        alpha: 0.98,
        heightPx: 12
      });

      this.screenTargets.push({
        type: 'planet',
        id: body.id,
        name: body.localizedName || body.name || body.id,
        x: p.x,
        y: p.y,
        hitRadius: Math.max(14, drawRadiusPx + 6),
        priority: 40,
        data: body
      });
    }
  }

  /**
   * 9b. Selenographic Lunar Nomenclature Overlay when zooming onto the Moon
   * Projects exact IAU selenographic coordinates (lat, lon) onto the orthographic lunar disk
   * accounting for optical libration in longitude (cML = -librationLonDeg) and latitude (subEarthLatDeg).
   */
  _renderLunarFeaturesOnDisk(ctx, state, moonBody, cx, cy, radiusPx, nightVision) {
    const lon0 = (moonBody.cML || 0) * DEG2RAD;
    const subLat = (moonBody.subEarthLatDeg || 0) * DEG2RAD;
    const sinSubLat = Math.sin(subLat);
    const cosSubLat = Math.cos(subLat);
    const lang = state.lang || 'fr';

    // Dedicated collision boxes on the lunar disk so selenographic labels never overlap each other
    const lunarBoxes = [];
    const isLunarBoxFree = (x1, y1, x2, y2) => {
      for (let i = 0; i < lunarBoxes.length; i++) {
        const b = lunarBoxes[i];
        if (x1 < b.x2 && x2 > b.x1 && y1 < b.y2 && y2 > b.y1) return false;
      }
      return true;
    };

    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    for (let i = 0; i < LUNAR_FEATURES.length; i++) {
      const feat = LUNAR_FEATURES[i];
      if (radiusPx < feat.minRadiusPx) continue;

      const latRad = feat.lat * DEG2RAD;
      const lonRad = feat.lon * DEG2RAD - lon0;
      const cosLat = Math.cos(latRad);
      const sinLat = Math.sin(latRad);

      const xPlanet = cosLat * Math.sin(lonRad);
      const yPlanet = -sinLat;
      const zPlanet = cosLat * Math.cos(lonRad);

      // Inverse of planet-shader.js sub-Earth latitude tilt
      const nxScreen = xPlanet;
      const nyScreen = yPlanet * cosSubLat + zPlanet * sinSubLat;
      const nz = -yPlanet * sinSubLat + zPlanet * cosSubLat;

      // Skip features too close to the foreshortened lunar limb
      if (nz < 0.24) continue;

      const sx = cx + nxScreen * radiusPx;
      const sy = cy + nyScreen * radiusPx;

      // Draw subtle cartographic marker for craters, mountains, and landing sites
      if (feat.kind === 'crater') {
        const craterR = Math.max(2.0, Math.min(9.0, (feat.diamKm / 3474.8) * radiusPx));
        ctx.strokeStyle = nightVision ? 'rgba(255, 95, 70, 0.82)' : 'rgba(255, 232, 165, 0.78)';
        ctx.lineWidth = 0.95;
        ctx.beginPath();
        ctx.arc(sx, sy, craterR, 0, Math.PI * 2);
        ctx.stroke();
        lunarBoxes.push({ x1: sx - craterR - 1, y1: sy - craterR - 1, x2: sx + craterR + 1, y2: sy + craterR + 1 });
      } else if (feat.kind === 'landing') {
        const r = 3.2;
        ctx.strokeStyle = nightVision ? '#ff6044' : '#5cffb8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - r);
        ctx.lineTo(sx + r, sy);
        ctx.lineTo(sx, sy + r);
        ctx.lineTo(sx - r, sy);
        ctx.closePath();
        ctx.stroke();
      } else if (feat.kind === 'montes') {
        ctx.fillStyle = nightVision ? '#ff7658' : '#f2ca78';
        ctx.beginPath();
        ctx.moveTo(sx, sy - 3);
        ctx.lineTo(sx + 2.8, sy + 2);
        ctx.lineTo(sx - 2.8, sy + 2);
        ctx.closePath();
        ctx.fill();
      }

      // Typography by lunar feature category
      const labelText = lang === 'fr' ? feat.name : feat.latin;
      let font, color;
      if (feat.kind === 'mare' || feat.kind === 'sinus') {
        const fSize = radiusPx >= 110 ? 11 : 9.8;
        font = `italic 600 ${fSize}px "IBM Plex Sans", system-ui, sans-serif`;
        color = nightVision ? '#ff8266' : '#a8deff';
      } else if (feat.kind === 'montes') {
        font = '600 9.8px "IBM Plex Sans", system-ui, sans-serif';
        color = nightVision ? '#ff7c5e' : '#f5d084';
      } else if (feat.kind === 'landing') {
        font = '600 9.8px "IBM Plex Mono", monospace';
        color = nightVision ? '#ff6a4e' : '#68ffc0';
      } else {
        font = '500 10px "IBM Plex Sans", system-ui, sans-serif';
        color = nightVision ? '#ff8e72' : '#fff3cc';
      }

      ctx.font = font;
      const textW = Math.ceil(ctx.measureText(labelText).width);
      const textH = 10;
      const padX = 3;
      const padY = 2;

      let candidates;
      if (feat.kind === 'mare' || feat.kind === 'sinus') {
        candidates = [
          { tx: sx, ty: sy + 3, align: 'center', x1: sx - textW * 0.5 - padX, y1: sy + 3 - textH - padY, x2: sx + textW * 0.5 + padX, y2: sy + 3 + padY },
          { tx: sx, ty: sy - 7, align: 'center', x1: sx - textW * 0.5 - padX, y1: sy - 7 - textH - padY, x2: sx + textW * 0.5 + padX, y2: sy - 7 + padY },
          { tx: sx, ty: sy + 13, align: 'center', x1: sx - textW * 0.5 - padX, y1: sy + 13 - textH - padY, x2: sx + textW * 0.5 + padX, y2: sy + 13 + padY }
        ];
      } else {
        const off = 5;
        candidates = [
          { tx: sx + off, ty: sy + 3, align: 'left', x1: sx + off - padX, y1: sy + 3 - textH - padY, x2: sx + off + textW + padX, y2: sy + 3 + padY },
          { tx: sx - off, ty: sy + 3, align: 'right', x1: sx - off - textW - padX, y1: sy + 3 - textH - padY, x2: sx - off + padX, y2: sy + 3 + padY },
          { tx: sx, ty: sy - 5, align: 'center', x1: sx - textW * 0.5 - padX, y1: sy - 5 - textH - padY, x2: sx + textW * 0.5 + padX, y2: sy - 5 + padY }
        ];
      }

      let chosen = null;
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c];
        if (isLunarBoxFree(cand.x1, cand.y1, cand.x2, cand.y2)) {
          chosen = cand;
          break;
        }
      }

      if (chosen) {
        lunarBoxes.push({ x1: chosen.x1, y1: chosen.y1, x2: chosen.x2, y2: chosen.y2 });
        ctx.textAlign = chosen.align;
        ctx.strokeStyle = nightVision ? 'rgba(8, 0, 0, 0.94)' : 'rgba(4, 7, 15, 0.92)';
        ctx.lineWidth = 2.8;
        ctx.strokeText(labelText, chosen.tx, chosen.ty);
        ctx.fillStyle = color;
        ctx.fillText(labelText, chosen.tx, chosen.ty);
      }

      // Register clickable target on the lunar surface so clicking a crater/mare shows its details
      this.screenTargets.push({
        type: 'planet',
        id: 'Moon',
        lunarFeature: feat,
        name: `${feat.name} (${feat.latin})`,
        x: sx,
        y: sy,
        hitRadius: 10,
        priority: 48,
        data: moonBody
      });
    }

    ctx.restore();
  }

  /**
   * 10. Satellites (177 SGP4 satellites + ISS + 4-day pass trajectory)
   */
  _renderSatellites(ctx, state, projectRaDec, nightVision) {
    const { viewport } = this;
    ctx.save();

    for (const sat of state.satellites) {
      if (!sat.visibleAboveHorizon && viewport.viewMode === 'terrestrial' && state.toggles.ground) {
        continue;
      }
      const p = viewport.viewMode === 'celestial'
        ? projectRaDec(sat.ra, sat.dec)
        : viewport.projectAltAz(sat.alt, sat.az);

      if (!p.visible) continue;

      const isISS = sat.name.includes('ISS') || sat.norad === 25544;
      const col = nightVision
        ? '#ff5838'
        : sat.isEclipsed
        ? 'rgba(150, 165, 195, 0.55)'
        : isISS
        ? '#55ffaa'
        : '#78d8ff';

      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = isISS ? 1.5 : 1.0;

      if (isISS) {
        ctx.strokeRect(p.x - 6, p.y - 4, 3.5, 8);
        ctx.strokeRect(p.x + 2.5, p.y - 4, 3.5, 8);
        ctx.beginPath();
        ctx.moveTo(p.x - 2.5, p.y);
        ctx.lineTo(p.x + 2.5, p.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isISS || sat.mag < 3.5 || viewport.fov < 40) {
        this._queueLabel({
          text: sat.name,
          x: p.x,
          y: p.y,
          offsetPx: isISS ? 8.5 : 5.5,
          priority: isISS ? 85 : 30,
          font: isISS ? '600 10.5px "IBM Plex Sans", system-ui, sans-serif' : '400 10px "IBM Plex Sans", system-ui, sans-serif',
          color: col,
          alpha: 0.9,
          heightPx: 10
        });
      }

      this.screenTargets.push({
        type: 'satellite',
        id: `SAT:${sat.norad}`,
        name: sat.name,
        x: p.x,
        y: p.y,
        hitRadius: isISS ? 14 : 10,
        priority: isISS ? 38 : 22,
        data: sat
      });
    }
    ctx.restore();
  }

  /**
   * 11. Object Trajectory / Satellite Pass Arc
   */
  _renderObjectTrace(ctx, trajectory, projectRaDec, nightVision) {
    ctx.save();
    ctx.strokeStyle = nightVision ? '#ff5538' : '#4effb8';
    ctx.fillStyle = nightVision ? '#ff7050' : '#88ffd2';
    ctx.lineWidth = 1.8;
    ctx.font = '10px system-ui, -apple-system, sans-serif';

    ctx.beginPath();
    let started = false;
    for (let i = 0; i < trajectory.length; i++) {
      const pt = trajectory[i];
      const p = (pt.alt !== undefined && pt.az !== undefined && this.viewport.viewMode !== 'celestial')
        ? this.viewport.projectAltAz(pt.alt, pt.az)
        : projectRaDec(pt.ra, pt.dec);

      if (p.visible) {
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
      } else {
        started = false;
      }
    }
    ctx.stroke();

    // Draw tick labels along the trajectory
    for (let i = 0; i < trajectory.length; i++) {
      const pt = trajectory[i];
      if (!pt.label) continue;
      const p = (pt.alt !== undefined && pt.az !== undefined && this.viewport.viewMode !== 'celestial')
        ? this.viewport.projectAltAz(pt.alt, pt.az)
        : projectRaDec(pt.ra, pt.dec);
      if (p.visible) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(pt.label, p.x + 6, p.y - 4);
      }
    }
    ctx.restore();
  }

  /**
   * 12. Ground & « Mon horizon » Custom 360° Relief Silhouette
   */
  _renderGroundAndHorizonRelief(ctx, state, nightVision, isAlmanach) {
    const { viewport } = this;
    const w = viewport.width;
    const h = viewport.height;

    const getHorizonAlt = (azDeg) => {
      if (!state.toggles.horizonProfile || !state.getHorizonElevationAtAz) return 0;
      return state.getHorizonElevationAtAz(azDeg);
    };

    ctx.save();
    // Sample horizon polygon across visible screen azimuths
    const pts = [];
    const numSamples = 180;
    for (let i = 0; i <= numSamples; i++) {
      const az = (viewport.centerAz - 135 + (i / numSamples) * 270 + 360) % 360;
      const hAlt = getHorizonAlt(az);
      const p = viewport.projectAltAz(hAlt, az);
      pts.push({ x: p.x, y: p.y, az, hAlt });
    }

    // Fill ground below the custom horizon profile
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.lineTo(w + 400, h + 600);
    ctx.lineTo(-400, h + 600);
    ctx.closePath();

    if (nightVision) {
      ctx.fillStyle = '#050000';
    } else if (isAlmanach) {
      ctx.fillStyle = '#0a0d12';
    } else {
      const grad = ctx.createLinearGradient(0, viewport.cy, 0, h);
      grad.addColorStop(0, '#0a1219');
      grad.addColorStop(1, '#04070b');
      ctx.fillStyle = grad;
    }
    ctx.fill();

    // Draw custom horizon ridge line + subtle mathematical flat 0° horizon reference
    if (state.toggles.horizonProfile) {
      ctx.strokeStyle = nightVision ? 'rgba(220, 45, 30, 0.45)' : 'rgba(95, 145, 120, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const az = (viewport.centerAz - 120 + (i / 90) * 240 + 360) % 360;
        const p0 = viewport.projectAltAz(0, az);
        if (i === 0) ctx.moveTo(p0.x, p0.y);
        else ctx.lineTo(p0.x, p0.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = nightVision ? '#b52218' : '#28453a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _renderCardinals(ctx, state, nightVision) {
    const { viewport } = this;
    const cardinals = [
      { az: 0, key: 'N', major: true },
      { az: 45, key: 'NE', major: false },
      { az: 90, key: 'E', major: true },
      { az: 135, key: 'SE', major: false },
      { az: 180, key: 'S', major: true },
      { az: 225, key: 'SW', major: false },
      { az: 270, key: 'W', major: true },
      { az: 315, key: 'NW', major: false }
    ];

    ctx.save();
    ctx.textAlign = 'center';
    for (const c of cardinals) {
      const hAlt = (state.toggles.horizonProfile && state.getHorizonElevationAtAz)
        ? state.getHorizonElevationAtAz(c.az)
        : 0;
      const p = viewport.projectAltAz(hAlt, c.az);
      if (!p.visible) continue;

      const label = state.cardinalLabels ? (state.cardinalLabels[c.key] || c.key) : c.key;
      ctx.font = c.major ? '700 13px system-ui, -apple-system, sans-serif' : '600 10.5px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = nightVision
        ? (c.major ? '#ff5038' : 'rgba(220, 60, 40, 0.7)')
        : (c.key === 'N' ? '#ff7665' : c.major ? '#f2d399' : 'rgba(210, 225, 245, 0.68)');
      ctx.fillText(label, p.x, p.y + 18);
    }
    ctx.restore();
  }

  /**
   * 13. Selection Reticle
   */
  _renderSelectionReticle(ctx, state, projectRaDec, nightVision) {
    const sel = state.selectedObject;
    if (!sel) return;

    let p;
    if (sel.alt !== undefined && sel.az !== undefined && this.viewport.viewMode !== 'celestial') {
      p = this.viewport.projectAltAz(sel.alt, sel.az);
    } else if (sel.ra !== undefined && sel.dec !== undefined) {
      p = projectRaDec(sel.ra, sel.dec);
    }
    if (!p || !p.visible) return;

    const r = 15;
    const col = nightVision ? '#ff4428' : '#ffd15c';
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;

    // Animated or crisp 4-corner astronomical reticle
    for (let k = 0; k < 4; k++) {
      const a0 = k * (Math.PI * 0.5) + 0.22;
      const a1 = (k + 1) * (Math.PI * 0.5) - 0.22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, a0, a1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * View 2: Celestial Sphere Rim
   */
  _renderCelestialGlobeRim(ctx, state, nightVision) {
    const { viewport } = this;
    const globeRadius = Math.min(viewport.width, viewport.height) * 0.44 * (90 / Math.max(25, viewport.fov));
    ctx.save();
    ctx.strokeStyle = nightVision ? '#b82518' : 'rgba(130, 185, 255, 0.55)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(viewport.cx, viewport.cy, globeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * View 5: Zenith All-Sky Planisphere Rim (calculation-rules.html §1)
   * Stereographic projection centered on the zenith: horizon (z = 90°) is a circle.
   */
  _renderZenithPlanisphereRim(ctx, state, nightVision) {
    const { viewport } = this;
    const pts = [];
    for (let i = 0; i <= 180; i++) {
      const az = (i / 180) * 360;
      const hAlt = (state.toggles.horizonProfile && state.getHorizonElevationAtAz)
        ? state.getHorizonElevationAtAz(az)
        : 0;
      pts.push(viewport.projectAltAz(hAlt, az));
    }

    ctx.save();
    // Mask outside horizon circle
    ctx.fillStyle = nightVision ? 'rgba(6, 0, 0, 0.88)' : 'rgba(5, 8, 15, 0.86)';
    ctx.beginPath();
    ctx.rect(0, 0, viewport.width, viewport.height);
    if (pts.length > 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
    }
    ctx.fill('evenodd');

    // Graduated planisphere ring
    ctx.strokeStyle = nightVision ? '#a82218' : 'rgba(212, 168, 83, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (pts.length > 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
    }
    ctx.stroke();

    // Degree ticks and Cardinal labels around the planisphere horizon circle
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    for (let az = 0; az < 360; az += 15) {
      const p0 = viewport.projectAltAz(0, az);
      const dx = p0.x - viewport.cx;
      const dy = p0.y - viewport.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const isCard = cardinals[az] !== undefined;
      const tickLen = isCard ? 8 : 4;
      ctx.strokeStyle = nightVision ? 'rgba(220, 45, 30, 0.6)' : 'rgba(212, 168, 83, 0.45)';
      ctx.lineWidth = isCard ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p0.x + ux * tickLen, p0.y + uy * tickLen);
      ctx.stroke();

      if (isCard) {
        const lbl = state.cardinalLabels?.[cardinals[az]] || cardinals[az];
        ctx.font = (az % 90 === 0) ? '700 12px "IBM Plex Sans", system-ui, sans-serif' : '500 10px "IBM Plex Mono", monospace';
        ctx.fillStyle = nightVision
          ? '#ff5038'
          : az === 0
            ? '#ff7665'
            : az % 90 === 0
              ? '#e8b44f'
              : 'rgba(215, 226, 242, 0.72)';
        ctx.fillText(lbl, p0.x + ux * 19, p0.y + uy * 19);
      }
    }
    ctx.restore();
  }

  /**
   * 12b. Instrument Field Frame ("Tracer sur le ciel" — True scale FOV circle on the sky)
   */
  _renderInstrumentFieldFrame(ctx, state, projectRaDec, nightVision) {
    const { viewport } = this;
    const scope = state.telescope || { apertureMm: 200, focalMm: 1000, model: '200/1000' };
    const ep = state.eyepiece || { focalMm: 14, afovDeg: 82, name: '14 mm' };
    const mag = Math.max(1, scope.focalMm / Math.max(1, ep.focalMm));
    const tfovDeg = ep.afovDeg / mag;

    let cx = viewport.cx;
    let cy = viewport.cy;
    if (state.selectedObject) {
      const sel = state.selectedObject;
      const p = (sel.alt !== undefined && sel.az !== undefined && viewport.viewMode !== 'celestial')
        ? viewport.projectAltAz(sel.alt, sel.az)
        : (sel.ra !== undefined && sel.dec !== undefined ? projectRaDec(sel.ra, sel.dec) : null);
      if (p && p.visible) {
        cx = p.x;
        cy = p.y;
      }
    }

    const rPx = 2 * viewport.focal * Math.tan((tfovDeg * DEG2RAD) * 0.25);
    if (rPx < 4 || rPx > Math.max(viewport.width, viewport.height) * 1.2) return;

    ctx.save();
    ctx.strokeStyle = nightVision ? 'rgba(255, 65, 45, 0.85)' : 'rgba(232, 180, 79, 0.88)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small cardinal ticks on the field circle
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (rPx - 4), cy + Math.sin(a) * (rPx - 4));
      ctx.lineTo(cx + Math.cos(a) * (rPx + 4), cy + Math.sin(a) * (rPx + 4));
      ctx.stroke();
    }

    ctx.font = '500 10.5px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = nightVision ? '#ff6548' : '#e8b44f';
    ctx.textAlign = 'center';
    const fovLabel = tfovDeg >= 1 ? `${tfovDeg.toFixed(2)}°` : `${(tfovDeg * 60).toFixed(1)}′`;
    ctx.fillText(`${scope.model || `${scope.apertureMm}/${scope.focalMm}`} · ×${Math.round(mag)} · ${fovLabel}`, cx, cy - rPx - 8);
    ctx.restore();
  }

  /**
   * View 3: Telescope Eyepiece Mask, Optical Telemetry & Finder Scope (Chercheur) Inset
   */
  _renderTelescopeOverlayAndFinder(ctx, state, eyepieceRadius, nightVision) {
    const { viewport } = this;
    const w = viewport.width;
    const h = viewport.height;

    ctx.save();
    // Dark mask outside the circular eyepiece field stop
    ctx.fillStyle = nightVision ? 'rgba(6, 0, 0, 0.92)' : 'rgba(3, 5, 10, 0.92)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(viewport.cx, viewport.cy, eyepieceRadius, 0, Math.PI * 2, true);
    ctx.fill();

    // Eyepiece metallic field ring + subtle illuminated reticle
    ctx.strokeStyle = nightVision ? '#aa2218' : 'rgba(165, 195, 235, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(viewport.cx, viewport.cy, eyepieceRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Subtle illuminated crosshair with central gap
    ctx.strokeStyle = nightVision ? 'rgba(255, 40, 25, 0.28)' : 'rgba(255, 90, 70, 0.24)';
    ctx.lineWidth = 1;
    const gap = 18;
    ctx.beginPath();
    ctx.moveTo(viewport.cx - eyepieceRadius, viewport.cy);
    ctx.lineTo(viewport.cx - gap, viewport.cy);
    ctx.moveTo(viewport.cx + gap, viewport.cy);
    ctx.lineTo(viewport.cx + eyepieceRadius, viewport.cy);
    ctx.moveTo(viewport.cx, viewport.cy - eyepieceRadius);
    ctx.lineTo(viewport.cx, viewport.cy - gap);
    ctx.moveTo(viewport.cx, viewport.cy + gap);
    ctx.lineTo(viewport.cx, viewport.cy + eyepieceRadius);
    ctx.stroke();

    // Render Finder Scope (Chercheur 8x50 — 5.2° field of view) in bottom-left or top-left inset
    const finderSize = 190;
    const fx = 24 + finderSize * 0.5;
    const fy = h - 78 - finderSize * 0.5;
    const finderR = finderSize * 0.46;

    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, finderR, 0, Math.PI * 2);
    ctx.fillStyle = nightVision ? '#090000' : '#050b18';
    ctx.fill();
    ctx.clip();

    // Project bright stars and DSOs into the 5.5° Finder Scope around current telescope center
    const finderFovDeg = Math.max(5.0, viewport.fov * 4.0);
    const pxPerDeg = (finderR * 2) / finderFovDeg;
    const centerEq = this._horizontalToEquatorial(viewport.centerAlt, viewport.centerAz, state.lstDeg, state.observer.lat);

    if (state.catalogs.starsBin) {
      const starsView = state.catalogs.starsBin;
      const maxCheck = Math.min(18000, Math.floor(starsView.byteLength / 8));
      for (let i = 0; i < maxCheck; i++) {
        const off = i * 8;
        const mag = starsView.getInt16(off + 4, true) / 1000;
        if (mag > 8.6) break;
        const ra = (starsView.getUint16(off, true) / 65535) * 360;
        const dec = (starsView.getInt16(off + 2, true) / 32767) * 90;
        let dRA = (ra - centerEq.raDeg) * Math.cos(centerEq.decDeg * DEG2RAD);
        if (dRA > 180) dRA -= 360;
        if (dRA < -180) dRA += 360;
        const dDec = dec - centerEq.decDeg;
        if (Math.abs(dRA) > finderFovDeg || Math.abs(dDec) > finderFovDeg) continue;

        const sx = fx - dRA * pxPerDeg;
        const sy = fy - dDec * pxPerDeg;
        const sr = Math.max(0.8, (8.8 - mag) * 0.45);
        ctx.fillStyle = nightVision ? '#ff5038' : '#dce8ff';
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Finder scope reticle + circle representing the main eyepiece TFOV
    const mainFovRadiusInFinder = Math.max(4, (viewport.fov * 0.5) * pxPerDeg);
    ctx.strokeStyle = nightVision ? '#ff4428' : '#ff6b55';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(fx, fy, mainFovRadiusInFinder, 0, Math.PI * 2);
    ctx.moveTo(fx - finderR, fy); ctx.lineTo(fx - mainFovRadiusInFinder - 4, fy);
    ctx.moveTo(fx + mainFovRadiusInFinder + 4, fy); ctx.lineTo(fx + finderR, fy);
    ctx.moveTo(fx, fy - finderR); ctx.lineTo(fx, fy - mainFovRadiusInFinder - 4);
    ctx.moveTo(fx, fy + mainFovRadiusInFinder + 4); ctx.lineTo(fx, fy + finderR);
    ctx.stroke();
    ctx.restore();

    // Finder scope bezel & label
    ctx.strokeStyle = nightVision ? '#b82518' : 'rgba(140, 185, 240, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx, fy, finderR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = nightVision ? '#ff7055' : '#b8d4ff';
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const finderTitle = state.finderLabel || 'Chercheur 8×50';
    ctx.fillText(`${finderTitle} (${finderFovDeg.toFixed(1)}°)`, fx, fy - finderR - 8);
    ctx.restore();
  }

  /**
   * View 4: 3D Heliocentric Orbitable Solar System View
   */
  _renderSolarSystemView(ctx, state, nightVision, isAlmanach) {
    const { viewport } = this;
    const w = viewport.width;
    const h = viewport.height;

    ctx.fillStyle = nightVision ? '#060000' : isAlmanach ? '#0e121b' : '#030712';
    ctx.fillRect(0, 0, w, h);

    // Draw subtle ecliptic reference circles in AU (0.4, 1.0, 1.5, 2.8, 5.2, 9.5, 19.2, 30.1 AU)
    const refAUs = [1, 2.8, 5.2, 9.5, 19.2, 30.1];
    ctx.strokeStyle = nightVision ? 'rgba(180, 30, 20, 0.16)' : 'rgba(90, 140, 210, 0.14)';
    ctx.lineWidth = 1;
    for (const au of refAUs) {
      ctx.beginPath();
      for (let deg = 0; deg <= 360; deg += 5) {
        const rad = deg * DEG2RAD;
        const p = viewport.projectHelio3D(au * Math.cos(rad), au * Math.sin(rad), 0);
        if (deg === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Draw Sun at heliocentric origin (0, 0, 0)
    const sunPt = viewport.projectHelio3D(0, 0, 0);
    this.planetShader.drawBody(ctx, 'Sun', sunPt.x, sunPt.y, 13, { nightVision });
    this.screenTargets.push({
      type: 'planet',
      id: 'Sun',
      name: state.sun?.localizedName || 'Soleil',
      x: sunPt.x,
      y: sunPt.y,
      hitRadius: 18,
      priority: 45,
      data: state.sun
    });

    // Draw 8 Bright Asteroids orbits & positions
    if (state.toggles.asteroids && state.asteroids) {
      for (const ast of state.asteroids) {
        if (ast.orbitPoints) {
          ctx.strokeStyle = nightVision ? 'rgba(200, 50, 30, 0.25)' : 'rgba(215, 185, 125, 0.24)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ast.orbitPoints.forEach((pt, idx) => {
            const p = viewport.projectHelio3D(pt.x, pt.y, pt.z);
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (ast.helio) {
          const p = viewport.projectHelio3D(ast.helio.x, ast.helio.y, ast.helio.z);
          ctx.fillStyle = nightVision ? '#ff6548' : '#e5c687';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = '10px system-ui, -apple-system, sans-serif';
          ctx.fillText(ast.name, p.x + 6, p.y + 3);

          this.screenTargets.push({
            type: 'asteroid',
            id: ast.id || ast.name,
            name: ast.name,
            x: p.x,
            y: p.y,
            hitRadius: 10,
            priority: 25,
            data: ast
          });
        }
      }
    }

    // Draw Planetary Orbits & Bodies (Mercury through Neptune)
    const orbitColors = {
      Mercury: '#b8aa96',
      Venus: '#f2d594',
      Earth: '#55a8ff',
      Mars: '#ef764a',
      Jupiter: '#f0c486',
      Saturn: '#e5ca8c',
      Uranus: '#8ce3f0',
      Neptune: '#6595ff'
    };

    if (state.solarSystem) {
      let earthScreen = null;
      for (const body of state.solarSystem) {
        if (body.id === 'Sun' || body.id === 'Moon') continue;
        const col = nightVision ? '#ff4a32' : (orbitColors[body.id] || '#a0c4ff');

        if (body.orbitPoints && body.orbitPoints.length > 0) {
          ctx.strokeStyle = nightVision ? 'rgba(220, 45, 30, 0.42)' : `${col}66`;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          body.orbitPoints.forEach((pt, idx) => {
            const p = viewport.projectHelio3D(pt.x, pt.y, pt.z);
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.stroke();
        }

        if (body.helio) {
          const p = viewport.projectHelio3D(body.helio.x, body.helio.y, body.helio.z);
          if (body.id === 'Earth') earthScreen = p;

          const r = body.id === 'Jupiter' || body.id === 'Saturn' ? 7.5 : 5.5;
          this.planetShader.drawBody(ctx, body.id, p.x, p.y, r, {
            phaseAngleDeg: 25,
            ringTiltDeg: 18,
            nightVision
          });

          ctx.fillStyle = nightVision ? '#ff8065' : '#e8f1ff';
          ctx.font = '600 11px system-ui, -apple-system, sans-serif';
          ctx.fillText(body.localizedName || body.name || body.id, p.x + r + 5, p.y + 4);

          this.screenTargets.push({
            type: 'planet',
            id: body.id,
            name: body.localizedName || body.name || body.id,
            x: p.x,
            y: p.y,
            hitRadius: 14,
            priority: 40,
            data: body
          });
        }
      }

      // If an object is selected, draw the line-of-sight vector from Earth to that object!
      if (earthScreen && state.selectedObject) {
        const target = this.screenTargets.find(t => t.id === state.selectedObject.id);
        if (target && target.id !== 'Earth') {
          ctx.save();
          ctx.strokeStyle = nightVision ? 'rgba(255, 80, 50, 0.65)' : 'rgba(255, 215, 90, 0.65)';
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(earthScreen.x, earthScreen.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  /**
   * Pick the best object near screen coordinates (x, y)
   */
  pickObjectAt(x, y) {
    let best = null;
    let bestScore = Infinity;

    for (const target of this.screenTargets) {
      const d = Math.hypot(x - target.x, y - target.y);
      if (d <= target.hitRadius) {
        // Weight distance by priority so planets/bright stars beat faint field stars
        const score = d - (target.priority || 10) * 0.25;
        if (score < bestScore) {
          bestScore = score;
          best = target;
        }
      }
    }
    return best;
  }
}
