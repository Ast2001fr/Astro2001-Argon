/**
 * js/render/sky-renderer.js
 * Complete multi-view sky renderer supporting:
 * 1) Terrestrial View (dome + atmosphere + ground + custom horizon relief)
 * 2) Celestial Sphere (3D celestial globe)
 * 3) Telescope View (circular eyepiece field + surface brightness + Finder scope inset)
 * 4) Solar System View (3D orbitable heliocentric system with planets & 8 asteroids)
 */

import { PlanetShaderRenderer } from './planet-shader.js';
import { MilkyWayAndHipsRenderer } from './milkyway-hips.js?v=3';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

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
    r = 155 + f * 45;
    g = 178 + f * 45;
    b = 255;
  } else if (t < 0.4) {
    const f = t / 0.4;
    r = 200 + f * 55;
    g = 223 + f * 32;
    b = 255 - f * 15;
  } else if (t < 0.8) {
    const f = (t - 0.4) / 0.4;
    r = 255;
    g = 255 - f * 22;
    b = 240 - f * 55;
  } else if (t < 1.4) {
    const f = (t - 0.8) / 0.6;
    r = 255;
    g = 233 - f * 48;
    b = 185 - f * 75;
  } else {
    const f = (t - 1.4) / 0.6;
    r = 255;
    g = 185 - f * 40;
    b = 110 - f * 45;
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

    // DSO Photo Image cache (135 real photos in assets/dso/)
    this.dsoPhotoCache = new Map();

    // Active screen hit targets populated during each render frame for click/hover selection
    this.screenTargets = [];

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
    img.src = `assets/dso/${photoFilename}`;
    return entry;
  }

  /**
   * Main render entry point for all 4 views
   */
  render(state) {
    const { ctx, viewport } = this;
    const w = viewport.width;
    const h = viewport.height;
    const nightVision = state.theme === 'nocturne';
    const isAlmanach = state.theme === 'almanach';

    this.screenTargets = [];

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (viewport.viewMode === 'solarsystem') {
      this._renderSolarSystemView(ctx, state, nightVision, isAlmanach);
      ctx.restore();
      return;
    }

    // Provide helper on viewport for HiPS inverse lookup
    viewport.unprojectEqAtScreen = (sx, sy) => {
      if (viewport.viewMode === 'celestial') {
        return viewport.unprojectCelestialGlobe(sx, sy);
      }
      const hor = viewport.unprojectAltAz(sx, sy);
      return this._horizontalToEquatorial(hor.altDeg, hor.azDeg, state.lstDeg, state.observer.lat);
    };

    const projectRaDec = (raDeg, decDeg) => {
      if (viewport.viewMode === 'celestial') {
        return viewport.projectCelestialGlobe(raDeg, decDeg);
      }
      const hor = this._equatorialToHorizontal(raDeg, decDeg, state.lstDeg, state.observer.lat);
      const p = viewport.projectAltAz(hor.alt, hor.az);
      p.alt = hor.alt;
      p.az = hor.az;
      return p;
    };

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

    // 2. Photographic Sky Survey (HiPS DSS2 Color) OR Milky Way Panorama
    if (state.toggles.dssHips) {
      this.mwHips.renderHipsDSS2(ctx, viewport, projectRaDec, nightVision);
    } else if (state.toggles.milkyWay) {
      this.mwHips.renderMilkyWay(ctx, viewport, {
        lstDeg: state.lstDeg,
        latDeg: state.observer.lat,
        sunAltDeg: state.sun ? state.sun.alt : -30,
        brightness: state.milkyWayBrightness ?? 1.0,
        atmosphereEnabled: state.toggles.atmosphere,
        groundEnabled: state.toggles.ground,
        nightVision
      });
    }

    // 3. Coordinate Grids (Equatorial, Azimuthal, Ecliptic)
    if (state.toggles.gridEquatorial) {
      this._renderEquatorialGrid(ctx, state, projectRaDec, nightVision, isAlmanach);
    }
    if (state.toggles.gridAzimuthal && viewport.viewMode !== 'celestial') {
      this._renderAzimuthalGrid(ctx, state, nightVision, isAlmanach);
    }
    if (state.toggles.ecliptic) {
      this._renderEcliptic(ctx, state, projectRaDec, nightVision, isAlmanach);
    }

    // 4. Constellations (Official IAU Boundaries, Lines, Translated Names)
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

    // 5. Deep Sky Objects (15,618 OpenNGC + 135 Real Photos in Additive Blending)
    if (state.toggles.dso && state.catalogs.openngc) {
      this._renderDeepSkyObjects(ctx, state, projectRaDec, nightVision, isAlmanach);
    }

    // 6. Stars (871,136 ATHYG v3.2 sorted by magnitude + 3,428 names + 3,309 WDS + 882 GCVS)
    if (state.toggles.stars && state.catalogs.starsBin) {
      this._renderStars(ctx, state, projectRaDec, nightVision, isAlmanach);
    }

    // 7. Meteor Showers (13 showers + radiants + shooting stars)
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

    // 12. Ground & « Mon horizon » 360° Custom Relief Silhouette + Cardinals (in Terrestrial view)
    if (viewport.viewMode === 'terrestrial') {
      if (state.toggles.ground || state.toggles.horizonProfile) {
        this._renderGroundAndHorizonRelief(ctx, state, nightVision, isAlmanach);
      }
      if (state.toggles.cardinals) {
        this._renderCardinals(ctx, state, nightVision, isAlmanach);
      }
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
      grad.addColorStop(0, '#171d29');
      grad.addColorStop(1, '#0d111a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const sunAlt = (state.toggles.atmosphere && viewport.viewMode === 'terrestrial' && state.sun)
      ? state.sun.alt
      : -30;

    let topColor = '#03060f';
    let midColor = '#070d1d';
    let horColor = '#0e1930';

    if (sunAlt > 10) {
      // Full daylight
      topColor = '#1c56a8';
      midColor = '#3a7bd5';
      horColor = '#89b9f0';
    } else if (sunAlt > -1) {
      // Sunset / Sunrise golden hour
      const t = (sunAlt + 1) / 11;
      topColor = this._lerpHex('#0d224c', '#1c56a8', t);
      midColor = this._lerpHex('#354b7c', '#3a7bd5', t);
      horColor = this._lerpHex('#d97143', '#89b9f0', t);
    } else if (sunAlt > -6) {
      // Civil twilight
      const t = (sunAlt + 6) / 5;
      topColor = this._lerpHex('#060f26', '#0d224c', t);
      midColor = this._lerpHex('#14254b', '#354b7c', t);
      horColor = this._lerpHex('#7e3d4a', '#d97143', t);
    } else if (sunAlt > -12) {
      // Nautical twilight
      const t = (sunAlt + 12) / 6;
      topColor = this._lerpHex('#040814', '#060f26', t);
      midColor = this._lerpHex('#091328', '#14254b', t);
      horColor = this._lerpHex('#23294a', '#7e3d4a', t);
    } else if (sunAlt > -18) {
      // Astronomical twilight
      const t = (sunAlt + 18) / 6;
      topColor = this._lerpHex('#03060f', '#040814', t);
      midColor = this._lerpHex('#070d1d', '#091328', t);
      horColor = this._lerpHex('#0e1930', '#23294a', t);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.55, midColor);
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
   * 3. Coordinate Grids: Equatorial (RA/Dec), Azimuthal (Alt/Az), and Ecliptic
   */
  _renderEquatorialGrid(ctx, state, projectRaDec, nightVision, isAlmanach) {
    ctx.save();
    ctx.strokeStyle = nightVision
      ? 'rgba(220, 40, 30, 0.24)'
      : isAlmanach
      ? 'rgba(215, 180, 110, 0.25)'
      : 'rgba(95, 165, 255, 0.22)';
    ctx.fillStyle = nightVision ? 'rgba(255, 70, 50, 0.65)' : 'rgba(130, 190, 255, 0.68)';
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui, -apple-system, sans-serif';

    const raStep = this.viewport.fov < 25 ? 10 : 15; // 15° = 1h
    const decStep = this.viewport.fov < 25 ? 5 : 15;

    // Declination parallels
    for (let dec = -75; dec <= 75; dec += decStep) {
      ctx.beginPath();
      let started = false;
      let labelPt = null;
      for (let ra = 0; ra <= 360; ra += 4) {
        const p = projectRaDec(ra % 360, dec);
        if (p.visible) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
          if (!labelPt && p.x > 60 && p.x < this.viewport.width - 60 && p.y > 60 && p.y < this.viewport.height - 60) {
            labelPt = p;
          }
        } else {
          started = false;
        }
      }
      if (dec === 0) {
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = nightVision ? 'rgba(255, 60, 40, 0.42)' : 'rgba(120, 195, 255, 0.42)';
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.stroke();
      }
      if (labelPt) {
        ctx.fillText(`${dec > 0 ? '+' : ''}${dec}°`, labelPt.x + 4, labelPt.y - 3);
      }
    }

    // Right Ascension meridians
    for (let ra = 0; ra < 360; ra += raStep) {
      ctx.beginPath();
      let started = false;
      let labelPt = null;
      for (let dec = -85; dec <= 85; dec += 4) {
        const p = projectRaDec(ra, dec);
        if (p.visible) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
          if (dec === 0 && p.x > 50 && p.x < this.viewport.width - 50 && p.y > 50 && p.y < this.viewport.height - 50) {
            labelPt = p;
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      if (labelPt) {
        const hours = Math.floor(ra / 15);
        const mins = Math.round(((ra / 15) - hours) * 60);
        ctx.fillText(mins ? `${hours}h${mins}m` : `${hours}h`, labelPt.x + 4, labelPt.y + 11);
      }
    }
    ctx.restore();
  }

  _renderAzimuthalGrid(ctx, state, nightVision, isAlmanach) {
    const { viewport } = this;
    ctx.save();
    ctx.strokeStyle = nightVision
      ? 'rgba(200, 50, 25, 0.24)'
      : isAlmanach
      ? 'rgba(170, 200, 150, 0.25)'
      : 'rgba(235, 175, 85, 0.22)';
    ctx.fillStyle = nightVision ? 'rgba(240, 75, 45, 0.68)' : 'rgba(245, 195, 110, 0.72)';
    ctx.lineWidth = 1;
    ctx.font = '10px system-ui, -apple-system, sans-serif';

    const altStep = viewport.fov < 25 ? 5 : 15;
    const azStep = viewport.fov < 25 ? 10 : 15;

    // Altitude circles
    for (let alt = 0; alt <= 80; alt += altStep) {
      ctx.beginPath();
      let started = false;
      let labelPt = null;
      for (let az = 0; az <= 360; az += 4) {
        const p = viewport.projectAltAz(alt, az % 360);
        if (p.visible) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
          if (!labelPt && Math.abs(az - viewport.centerAz) < 8 && p.y > 45 && p.y < viewport.height - 45) {
            labelPt = p;
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      if (labelPt && alt > 0) {
        ctx.fillText(`+${alt}°`, labelPt.x + 4, labelPt.y - 3);
      }
    }

    // Azimuth verticals
    for (let az = 0; az < 360; az += azStep) {
      ctx.beginPath();
      let started = false;
      let labelPt = null;
      for (let alt = 0; alt <= 85; alt += 4) {
        const p = viewport.projectAltAz(alt, az);
        if (p.visible) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
          if (alt === 12 && p.x > 45 && p.x < viewport.width - 45 && p.y > 45 && p.y < viewport.height - 45) {
            labelPt = p;
          }
        } else {
          started = false;
        }
      }
      ctx.stroke();
      if (labelPt) {
        ctx.fillText(`${az}°`, labelPt.x + 3, labelPt.y - 3);
      }
    }
    ctx.restore();
  }

  _renderEcliptic(ctx, state, projectRaDec, nightVision) {
    const eps = 23.43929 * DEG2RAD;
    const sinEps = Math.sin(eps);
    const cosEps = Math.cos(eps);

    ctx.save();
    ctx.strokeStyle = nightVision ? 'rgba(255, 80, 40, 0.45)' : 'rgba(255, 210, 80, 0.42)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();

    let started = false;
    for (let lon = 0; lon <= 360; lon += 3) {
      const l = (lon % 360) * DEG2RAD;
      const sinL = Math.sin(l);
      const cosL = Math.cos(l);
      const dec = Math.asin(sinL * sinEps) * RAD2DEG;
      const ra = ((Math.atan2(sinL * cosEps, cosL) * RAD2DEG) % 360 + 360) % 360;
      const p = projectRaDec(ra, dec);
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
    ctx.restore();
  }

  /**
   * 4. Constellations: Official IAU Boundaries, Lines, and Translated Names
   */
  _renderConstellationBounds(ctx, state, projectRaDec, nightVision) {
    const list = state.catalogs.constellations;
    if (!Array.isArray(list)) return;

    ctx.save();
    ctx.strokeStyle = nightVision ? 'rgba(190, 35, 25, 0.32)' : 'rgba(210, 145, 70, 0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (const con of list) {
      const bounds = con.bounds;
      if (!bounds || bounds.length < 3) continue;
      ctx.beginPath();
      let prev = null;
      for (let i = 0; i <= bounds.length; i++) {
        const pt = bounds[i % bounds.length];
        const p = projectRaDec(pt[0], pt[1]);
        if (p.visible) {
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < this.viewport.width * 0.45) {
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
    }
    ctx.restore();
  }

  _renderConstellationLines(ctx, state, projectRaDec, nightVision, isAlmanach) {
    const list = state.catalogs.constellations;
    if (!Array.isArray(list)) return;

    ctx.save();
    ctx.strokeStyle = nightVision
      ? 'rgba(235, 50, 35, 0.45)'
      : isAlmanach
      ? 'rgba(225, 190, 120, 0.48)'
      : 'rgba(110, 175, 255, 0.42)';
    ctx.lineWidth = 1.25;

    for (const con of list) {
      if (!con.lines) continue;
      for (const poly of con.lines) {
        ctx.beginPath();
        let prev = null;
        for (let i = 0; i < poly.length; i += 2) {
          const p = projectRaDec(poly[i], poly[i + 1]);
          if (p.visible) {
            if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < this.viewport.width * 0.5) {
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
      }
    }
    ctx.restore();
  }

  _renderConstellationNames(ctx, state, projectRaDec, nightVision, isAlmanach) {
    const list = state.catalogs.constellations;
    if (!Array.isArray(list)) return;

    ctx.save();
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = nightVision
      ? 'rgba(245, 75, 55, 0.72)'
      : isAlmanach
      ? 'rgba(235, 205, 145, 0.78)'
      : 'rgba(150, 200, 255, 0.72)';

    for (const con of list) {
      const p = projectRaDec(con.ra, con.dec);
      if (!p.visible) continue;
      if (this.viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < 0) continue;

      const label = state.getConstellationName ? state.getConstellationName(con.code) : (con.name || con.latin || con.code);
      ctx.fillText(label.toUpperCase(), p.x, p.y);
    }
    ctx.restore();
  }

  /**
   * 5. Deep Sky Objects (15,618 OpenNGC + 135 Real Photos in Additive Blend)
   */
  _renderDeepSkyObjects(ctx, state, projectRaDec, nightVision) {
    const dsoCatalog = state.catalogs.openngc;
    if (!dsoCatalog || !dsoCatalog.rows) return;

    const { viewport } = this;
    const rows = dsoCatalog.rows;
    // Limiting magnitude for DSOs scales with zoom (FOV)
    const fov = viewport.fov;
    let maxMag = 8.2;
    if (fov < 50) maxMag = 9.8;
    if (fov < 20) maxMag = 11.5;
    if (fov < 8) maxMag = 13.2;
    if (fov < 2.5) maxMag = 15.5;
    if (fov < 0.8) maxMag = 18.0;

    const degToPx = Math.min(viewport.width, viewport.height) / fov;
    const showPhotos = !!state.toggles.dsoPhotos;

    ctx.save();
    ctx.font = '10px system-ui, -apple-system, sans-serif';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Schema: [id, m, name, type, ra, dec, mag, sb, maj, min, pa, con, dist, photo]
      const mag = row[6] ?? 12.5;
      const hasPhoto = !!row[13];
      const isMessier = !!row[1];

      if (!isMessier && !hasPhoto && mag > maxMag) continue;

      const ra = row[4];
      const dec = row[5];
      const p = projectRaDec(ra, dec);
      if (!p.visible) continue;
      if (viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < -2) continue;

      const majArcmin = row[8] || 4;
      const minArcmin = row[9] || majArcmin;
      const paDeg = row[10] || 0;
      const radiusPx = Math.max(4, (majArcmin / 60) * degToPx * 0.5);

      // 135 Real Photos mapped in additive blending ('lighter' / 'screen')
      if (showPhotos && hasPhoto && radiusPx >= 5) {
        const photoEntry = this._getDsoPhoto(row[13]);
        if (photoEntry && photoEntry.loaded && photoEntry.img) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          ctx.translate(p.x, p.y);
          ctx.rotate((paDeg * DEG2RAD));
          if (nightVision) {
            ctx.filter = 'sepia(100%) hue-rotate(-50deg) saturate(400%)';
          }
          const drawMaj = Math.max(18, (majArcmin / 60) * degToPx * 1.35);
          const aspect = Math.max(0.45, Math.min(1.0, minArcmin / Math.max(0.1, majArcmin)));
          const drawMin = drawMaj * aspect;
          ctx.globalAlpha = Math.min(0.92, 0.5 + Math.log10(Math.max(1, drawMaj / 10)) * 0.35);
          ctx.drawImage(photoEntry.img, -drawMaj * 0.5, -drawMin * 0.5, drawMaj, drawMin);
          ctx.restore();
        }
      }

      // Draw DSO astronomical symbol when zoomed or when Messier/bright
      if (isMessier || mag <= maxMag - 0.5 || fov < 15) {
        const type = row[3] || 'G';
        const rSym = Math.min(28, Math.max(4.5, radiusPx * 0.65));
        this._drawDsoSymbol(ctx, p.x, p.y, rSym, type, minArcmin / Math.max(0.1, majArcmin), paDeg, nightVision);

        if ((isMessier && fov < 75) || (mag < 8.5 && fov < 35) || fov < 6) {
          const label = row[1] ? (row[2] ? `${row[1]} · ${row[2]}` : row[1]) : (row[2] || row[0]);
          ctx.fillStyle = nightVision ? 'rgba(255, 95, 70, 0.85)' : 'rgba(155, 225, 200, 0.88)';
          ctx.fillText(label, p.x + rSym + 4, p.y + 3);
        }

        this.screenTargets.push({
          type: 'dso',
          id: row[0],
          messier: row[1],
          name: row[2] || row[1] || row[0],
          x: p.x,
          y: p.y,
          hitRadius: Math.max(10, rSym + 4),
          priority: isMessier ? 25 : 15,
          data: row
        });
      }
    }
    ctx.restore();
  }

  _drawDsoSymbol(ctx, x, y, r, type, aspect, paDeg, nightVision) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.15;

    if (type === 'G' || type === 'Gx') {
      // Galaxy: oriented ellipse
      ctx.rotate(paDeg * DEG2RAD);
      ctx.strokeStyle = nightVision ? '#ff5038' : '#ff9966';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, Math.max(2.5, r * Math.max(0.35, aspect)), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'GCl' || type === 'GC') {
      // Globular cluster: circle with cross
      ctx.strokeStyle = nightVision ? '#ff6040' : '#ffdd66';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.moveTo(-r, 0); ctx.lineTo(r, 0);
      ctx.moveTo(0, -r); ctx.lineTo(0, r);
      ctx.stroke();
    } else if (type === 'OCl' || type === 'OC' || type === 'Cl+N') {
      // Open cluster: dashed circle
      ctx.strokeStyle = nightVision ? '#ff6548' : '#88e2ff';
      ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'PN') {
      // Planetary nebula: circle with outer ticks
      ctx.strokeStyle = nightVision ? '#ff5540' : '#66ffb8';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.moveTo(-r * 1.2, 0); ctx.lineTo(-r * 0.7, 0);
      ctx.moveTo(r * 0.7, 0); ctx.lineTo(r * 1.2, 0);
      ctx.moveTo(0, -r * 1.2); ctx.lineTo(0, -r * 0.7);
      ctx.moveTo(0, r * 0.7); ctx.lineTo(0, r * 1.2);
      ctx.stroke();
    } else {
      // Diffuse / Emission / Reflection Nebula / SNR: rounded square
      ctx.strokeStyle = nightVision ? '#ff4a38' : '#e085ff';
      ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
    }
    ctx.restore();
  }

  /**
   * 6. Stars (871,136 ATHYG v3.2 sorted by magnitude in stars.bin)
   */
  _renderStars(ctx, state, projectRaDec, nightVision) {
    const starsView = state.catalogs.starsBin; // DataView over 871,136 * 8 bytes
    if (!starsView) return;

    const totalStars = Math.floor(starsView.byteLength / 8);
    const { viewport } = this;
    const fov = viewport.fov;

    // Limiting magnitude adapts smoothly to zoom level and daylight
    let limitMag = 5.6;
    if (fov < 70) limitMag = 6.5;
    if (fov < 40) limitMag = 7.6;
    if (fov < 18) limitMag = 8.8;
    if (fov < 7) limitMag = 9.9;
    if (fov < 2.5) limitMag = 10.6;
    if (fov < 1.0) limitMag = 11.05;

    // Daylight suppression in terrestrial view
    if (viewport.viewMode === 'terrestrial' && state.toggles.atmosphere && state.sun) {
      if (state.sun.alt > 2) {
        limitMag = -1.5; // Only extremely bright bodies during day
      } else if (state.sun.alt > -6) {
        limitMag = Math.min(limitMag, 2.5 - state.sun.alt * 0.5);
      }
    }

    const limitMagI16 = Math.round(limitMag * 1000);
    const meta = state.catalogs.starMeta || {};
    const namesMap = meta.names || {};
    const wdsMap = meta.wds || {};
    const gcvsMap = meta.gcvs || {};

    const showDoubles = !!state.toggles.doubleStars;
    const showVariables = !!state.toggles.variableStars;

    ctx.save();
    ctx.font = '11px system-ui, -apple-system, sans-serif';

    for (let i = 0; i < totalStars; i++) {
      const offset = i * 8;
      const magI16 = starsView.getInt16(offset + 4, true);
      // Since stars.bin is strictly sorted by magnitude ascending, we can break immediately!
      if (magI16 > limitMagI16) break;

      const raU16 = starsView.getUint16(offset, true);
      const decI16 = starsView.getInt16(offset + 2, true);
      const bvI8 = starsView.getInt8(offset + 6);
      const conIdx = starsView.getUint8(offset + 7);

      const ra = (raU16 / 65535) * 360;
      const dec = (decI16 / 32767) * 90;

      const p = projectRaDec(ra, dec);
      if (!p.visible) continue;
      if (viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < -1) continue;

      const mag = magI16 / 1000;
      const bv = bvI8 / 50;

      // Apparent star radius & opacity
      const magDiff = limitMag - mag;
      const radius = Math.max(0.65, Math.min(6.2, 0.7 + Math.pow(Math.max(0, 6.5 - mag), 1.32) * 0.42));
      const alpha = Math.max(0.18, Math.min(1.0, magDiff * 0.42));
      const color = bvToRgb(bv, nightVision);

      // Draw star core
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Soft halo + diffraction spikes for very bright stars (mag < 2.2)
      if (mag < 2.2) {
        const haloR = radius * 3.2;
        const grad = ctx.createRadialGradient(p.x, p.y, radius * 0.5, p.x, p.y, haloR);
        grad.addColorStop(0, nightVision ? 'rgba(255, 80, 60, 0.48)' : 'rgba(255, 250, 240, 0.45)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
        ctx.fill();

        if (mag < 1.2) {
          const spikeLen = radius * 4.2;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.75;
          ctx.beginPath();
          ctx.moveTo(p.x - spikeLen, p.y); ctx.lineTo(p.x + spikeLen, p.y);
          ctx.moveTo(p.x, p.y - spikeLen); ctx.lineTo(p.x, p.y + spikeLen);
          ctx.stroke();
        }
      }

      // WDS Double Star indicator (3,309 pairs attached to catalog star)
      if (showDoubles && wdsMap[i] && (mag < 5.5 || fov < 35)) {
        const rDbl = Math.max(4.5, radius + 2.5);
        ctx.strokeStyle = nightVision ? '#ff6644' : '#58d5ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rDbl, 0, Math.PI * 2);
        ctx.moveTo(p.x - rDbl - 2.5, p.y);
        ctx.lineTo(p.x + rDbl + 2.5, p.y);
        ctx.stroke();
      }

      // GCVS Variable Star indicator (882 variables attached to catalog star)
      if (showVariables && gcvsMap[i] && (mag < 5.8 || fov < 35)) {
        const rVar = Math.max(5.5, radius + 3.5);
        ctx.strokeStyle = nightVision ? '#ff5533' : '#ff92c2';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rVar, -0.8, 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x, p.y, rVar, Math.PI - 0.8, Math.PI + 0.8);
        ctx.stroke();
      }

      // Proper Name label (among the 3,428 named stars)
      const nameEntry = namesMap[i];
      if (nameEntry) {
        const properName = Array.isArray(nameEntry) ? nameEntry[0] : (nameEntry.name || nameEntry);
        if (mag < 2.1 || (mag < 3.6 && fov < 65) || (mag < 5.0 && fov < 25) || fov < 6) {
          ctx.globalAlpha = 0.88;
          ctx.fillStyle = nightVision ? '#ff7a60' : '#dce8ff';
          ctx.fillText(properName, p.x + radius + 4, p.y + 3);
        }
      }

      // Register clickable target for bright or zoomed stars
      if (mag < 5.2 || fov < 20 || nameEntry || wdsMap[i] || gcvsMap[i]) {
        this.screenTargets.push({
          type: 'star',
          starIdx: i,
          id: `STAR:${i}`,
          name: nameEntry ? (Array.isArray(nameEntry) ? nameEntry[0] : nameEntry) : `HD ${100000 + i}`,
          ra,
          dec,
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
   * 7. Meteor Showers (13 showers: radiant markers + shooting star animation)
   */
  _renderMeteorShowers(ctx, state, projectRaDec, nightVision) {
    ctx.save();
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';

    for (const m of state.activeMeteors) {
      const p = projectRaDec(m.ra, m.dec);
      if (!p.visible) continue;
      if (this.viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < 0) continue;

      const isActive = m.currentZHR >= 1.5;
      const r = isActive ? 8 : 5.5;
      const col = nightVision ? '#ff5538' : (isActive ? '#70ffe0' : 'rgba(130, 215, 210, 0.55)');

      ctx.strokeStyle = col;
      ctx.lineWidth = isActive ? 1.4 : 1;
      // Radiant starburst symbol
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        ctx.moveTo(p.x + Math.cos(ang) * 2.5, p.y + Math.sin(ang) * 2.5);
        ctx.lineTo(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
      }
      ctx.stroke();

      ctx.fillStyle = col;
      const label = isActive ? `${m.name} (${Math.round(m.currentZHR)}/h)` : m.name;
      ctx.fillText(label, p.x + r + 4, p.y + 3);

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
    ctx.font = '10px system-ui, -apple-system, sans-serif';

    for (const ast of state.asteroids) {
      const p = projectRaDec(ast.ra, ast.dec);
      if (!p.visible) continue;
      if (this.viewport.viewMode === 'terrestrial' && state.toggles.ground && p.alt < -1) continue;

      const col = nightVision ? '#ff6a45' : '#e2c590';
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 1.2;

      // Diamond symbol for asteroids
      const r = 4.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x + r, p.y);
      ctx.lineTo(p.x, p.y + r);
      ctx.lineTo(p.x - r, p.y);
      ctx.closePath();
      ctx.stroke();

      ctx.fillText(ast.name, p.x + 7, p.y + 3);

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

      // True angular radius in pixels:
      const trueRadiusPx = ((body.angDiamArcsec || 20) / 3600) * degToPx * 0.5;
      let drawRadiusPx = trueRadiusPx;

      if (!realSizes) {
        if (body.id === 'Sun' || body.id === 'Moon') {
          drawRadiusPx = Math.max(9, trueRadiusPx);
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

      // Render Galilean moons of Jupiter and main moons of Saturn when zoomed in (< 4° FOV)
      if ((body.id === 'Jupiter' || body.id === 'Saturn') && body.moons && viewport.fov < 4.5) {
        ctx.save();
        ctx.font = '9.5px system-ui, -apple-system, sans-serif';
        for (const moon of body.moons) {
          // Offset in planetary equatorial radii
          const mx = p.x + moon.dx * drawRadiusPx;
          const my = p.y - moon.dy * drawRadiusPx;
          if (moon.occulted || moon.eclipsed) continue;

          ctx.fillStyle = nightVision ? '#ff6a50' : '#ffe9b8';
          ctx.beginPath();
          ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
          ctx.fill();

          if (viewport.fov < 1.5) {
            ctx.fillText(moon.name, mx + 4, my + 3);
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

      // Label
      ctx.save();
      ctx.font = '600 11.5px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = nightVision ? '#ff8568' : '#fff2c8';
      const labelOffset = (body.id === 'Saturn' ? drawRadiusPx * 1.9 : drawRadiusPx) + 5;
      ctx.fillText(body.localizedName || body.name || body.id, p.x + labelOffset, p.y + 4);
      ctx.restore();

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
   * 10. Satellites (177 SGP4 satellites + ISS + 4-day pass trajectory)
   */
  _renderSatellites(ctx, state, projectRaDec, nightVision) {
    const { viewport } = this;
    ctx.save();
    ctx.font = '10px system-ui, -apple-system, sans-serif';

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
      ctx.lineWidth = isISS ? 1.6 : 1.1;

      if (isISS) {
        // Distinct ISS solar-panel H-icon
        ctx.strokeRect(p.x - 6, p.y - 4, 3.5, 8);
        ctx.strokeRect(p.x + 2.5, p.y - 4, 3.5, 8);
        ctx.beginPath();
        ctx.moveTo(p.x - 2.5, p.y);
        ctx.lineTo(p.x + 2.5, p.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isISS || sat.mag < 3.5 || viewport.fov < 45) {
        ctx.fillText(sat.name, p.x + 8, p.y + 3);
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
