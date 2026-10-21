/**
 * js/app.js
 * Main Planetarium Application Controller orchestrating:
 * - 4 Views (Terrestrial, Celestial Sphere, Telescope + Finder, 3D Solar System)
 * - Catalogs loader (871,136 stars ATHYG v3.2, 3,428 names, 3,309 WDS, 882 GCVS,
 *   15,618 OpenNGC + 135 photos, 88 constellations + IAU bounds, 8 asteroids,
 *   177 satellites SGP4, 13 meteor showers, 33,848 cities, 12/78 telescopes + 10 eyepieces,
 *   Wikipedia index & offline packs)
 * - Real-time & accelerated simulation clock + 24h timeline scrubber
 * - Dynamic i18n (FR, EN, ES, DE — only active language loaded)
 * - 6 Themes & keyboard shortcuts generated from `js/features.js`
 */

import {
  FEATURES,
  VIEWS,
  THEMES,
  LAYER_PROFILES,
  getShortcutMap,
  normalizeShortcutKey,
  getDefaultToggleState
} from './features.js?v=4';

import {
  initI18n,
  setLanguage,
  getLanguage,
  t,
  getConstellationName,
  applyDomTranslations
} from './i18n.js?v=4';

import {
  dateToJD,
  jdToDate,
  getLST,
  equatorialToHorizontal,
  getAirmass,
  getParallacticAngle,
  solarLongitudeToJD,
  computeDirectionalSkySqm,
  evaluateCrumeyVisibility,
  bvToTemperatureK,
  computeStellarRadiusSolar,
  formatAltitudeWithFists
} from './astro/time.js?v=4';

import {
  computeSolarSystem,
  computePlanetOrbitPath,
  getPlanetMoons,
  computeAsteroids,
  DEFAULT_ASTEROIDS
} from './astro/solar-system.js?v=4';

import {
  computeAllSatellites,
  predictSatellitePasses,
  fetchCelestrakTLEs,
  DEFAULT_SATELLITES
} from './astro/sgp4.js?v=4';

import {
  computeRiseTransitSet,
  computeTwilights,
  computeMeteorShowers,
  computeEventsCalendar,
  DEFAULT_METEOR_SHOWERS
} from './astro/events.js?v=4';

import { SkyViewport } from './render/projection.js?v=4';
import { SkyRenderer } from './render/sky-renderer.js?v=4';
import { ObjectCardUI } from './ui/object-card.js?v=4';
import { PanelsUI } from './ui/panels.js?v=4';
import { CommandPaletteUI } from './ui/command-palette.js?v=4';

const COMPASS_DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

export class PlanetariumApp {
  constructor() {
    this.canvas = document.getElementById('sky-canvas');
    this.viewport = new SkyViewport();
    this.renderer = new SkyRenderer(this.canvas, this.viewport);

    this.state = {
      date: new Date(),
      jd: dateToJD(new Date()),
      lstDeg: 0,
      isPlaying: true,
      timeSpeed: 1, // x1 real-time
      timeDirection: 1, // +1 forward, -1 reverse
      manualStepSec: 3600,
      theme: localStorage.getItem('astro_theme') || 'meridien',
      previousTheme: 'meridien',
      lang: localStorage.getItem('astro_lang') || 'fr',
      milkyWayBrightness: 1.0,
      bortleClass: Number(localStorage.getItem('astro_bortle') || 4),
      activeLayerProfile: localStorage.getItem('astro_profile') || 'discover',

      observer: JSON.parse(localStorage.getItem('astro_observer') || 'null') || {
        name: 'Paris',
        country: 'FR',
        lat: 48.8566,
        lon: 2.3522,
        alt: 35,
        tz: 'Europe/Paris'
      },

      // « Mon horizon » 8-point cardinal/intercardinal elevation profile (degrees)
      horizonProfile: JSON.parse(localStorage.getItem('astro_horizon') || 'null') || {
        N: 4, NE: 3, E: 2, SE: 2, S: 1, SW: 3, W: 5, NW: 6
      },

      // Telescope & Eyepiece state
      telescopeConfig: JSON.parse(localStorage.getItem('astro_telescope') || 'null') || {
        brand: 'Celestron',
        model: 'NexStar 8SE',
        apertureMm: 203,
        focalMm: 2032,
        eyepieceName: 'Tele Vue Nagler 13mm',
        eyepieceFocalMm: 13,
        eyepieceAfovDeg: 82,
        barlow: 1
      },

      // Display toggles initialized from features.js
      toggles: {
        constellationLines: true,
        constellationNames: true,
        constellationBounds: false,
        gridAzimuthal: false,
        gridEquatorial: false,
        ecliptic: true,
        milkyWay: true,
        dssHips: false,
        dso: true,
        dsoPhotos: true,
        stars: true,
        doubleStars: true,
        variableStars: false,
        planets: true,
        asteroids: true,
        satellites: true,
        meteors: true,
        atmosphere: true,
        ground: true,
        horizonProfile: true,
        cardinals: true,
        realPlanetSizes: false,
        showFieldFrame: false
      },

      catalogs: {
        starsBin: null,
        starMeta: null,
        openngc: null,
        constellations: null,
        asteroids: DEFAULT_ASTEROIDS,
        satellitesTle: DEFAULT_SATELLITES,
        meteors: DEFAULT_METEOR_SHOWERS,
        cities: null,
        telescopes: null,
        wikiIndex: null
      },

      installedOfflinePacks: JSON.parse(localStorage.getItem('astro_offline_packs') || '{}'),
      offlineWikiData: {},

      solarSystem: [],
      sun: null,
      moon: null,
      asteroids: [],
      satellites: [],
      activeMeteors: [],
      planetOrbitCache: new Map(),

      selectedObject: null,
      trackedObjectId: null,
      tracedObjectId: null,
      tracedTrajectory: null,

      getHorizonElevationAtAz: (az) => this.getHorizonElevationAtAz(az),
      getConstellationName: (code) => getConstellationName(code)
    };

    this.objectCardUI = new ObjectCardUI(document.getElementById('object-card-drawer'), this);
    this.panelsUI = new PanelsUI(this);
    this.commandPaletteUI = new CommandPaletteUI(this);

    this._lastFrameTime = performance.now();
    this._lastSatUpdateMs = 0;
    this._needsRender = true;
  }

  t(key, fallback) {
    const val = t(key);
    if (typeof val === 'string' && val !== key) return val;
    if (val && typeof val === 'object') {
      return val.title || val.name || val.label || fallback || key;
    }
    return fallback || key;
  }

  getLanguage() {
    return getLanguage();
  }

  async init() {
    // 1. Apply saved theme & language (loads ONLY js/i18n-<lang>.js)
    this.setTheme(this.state.theme);
    await initI18n(this.state.lang);
    applyDomTranslations(document);

    // 2. Setup resize & viewport
    this._handleResize();
    window.addEventListener('resize', () => this._handleResize());
    this.renderer.setOnAsyncAssetLoad(() => this.requestRender());

    // 3. Build layer toggle bar & bind HUD controls + keyboard shortcuts from features.js
    this._buildLayerTogglesBar();
    this._bindHudEvents();
    this._bindCanvasInteraction();
    this._bindKeyboardShortcuts();

    // 4. Compute initial ephemerides and render immediately
    this._updateEphemerides(true);
    this._updateHudLabels();
    this.requestRender();

    // 5. Load binary & JSON catalogs asynchronously
    this._loadAllCatalogs();

    // 6. Register Service Worker for offline PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js?v=2').then(r => r.update()).catch(() => {});
    }

    // 7. Start animation loop
    requestAnimationFrame((now) => this._tick(now));
  }

  _handleResize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport.resize(w, h, dpr);
    this.requestRender();
  }

  requestRender() {
    this._needsRender = true;
  }

  saveSettings() {
    try {
      localStorage.setItem('astro_observer', JSON.stringify(this.state.observer));
      localStorage.setItem('astro_horizon', JSON.stringify(this.state.horizonProfile));
      localStorage.setItem('astro_telescope', JSON.stringify(this.state.telescopeConfig));
      localStorage.setItem('astro_theme', this.state.theme);
      localStorage.setItem('astro_lang', this.state.lang);
      localStorage.setItem('astro_bortle', String(this.state.bortleClass || 4));
      localStorage.setItem('astro_profile', this.state.activeLayerProfile || 'discover');
    } catch (_) {}
  }

  /**
   * Smooth 360° interpolation of the user's « Mon horizon » profile
   */
  getHorizonElevationAtAz(azDeg) {
    const hp = this.state.horizonProfile;
    const pts = [
      hp.N ?? 0, hp.NE ?? 0, hp.E ?? 0, hp.SE ?? 0,
      hp.S ?? 0, hp.SW ?? 0, hp.W ?? 0, hp.NW ?? 0
    ];
    const normAz = ((azDeg % 360) + 360) % 360;
    const sector = normAz / 45;
    const i0 = Math.floor(sector) % 8;
    const i1 = (i0 + 1) % 8;
    const frac = sector - Math.floor(sector);
    const smooth = (1 - Math.cos(frac * Math.PI)) * 0.5;
    const base = pts[i0] * (1 - smooth) + pts[i1] * smooth;
    const ridge = Math.sin(normAz * 0.22) * 0.35 + Math.cos(normAz * 0.55) * 0.2;
    return Math.max(0, base + (base > 0.5 ? ridge : 0));
  }

  async _loadAllCatalogs() {
    const fetchJson = async (url) => {
      try {
        const r = await fetch(url);
        return r.ok ? await r.json() : null;
      } catch (_) {
        return null;
      }
    };

    const [constellations, starMeta, asteroids, satellites, meteors, telescopes, wikiIndex] = await Promise.all([
      fetchJson('data/constellations.json'),
      fetchJson('data/star-meta.json'),
      fetchJson('data/asteroids.json'),
      fetchJson('data/satellites-tle.json'),
      fetchJson('data/meteors.json'),
      fetchJson('data/telescopes.json'),
      fetchJson('data/wiki-index.json')
    ]);

    if (constellations) this.state.catalogs.constellations = constellations.constellations || constellations;
    if (starMeta) this.state.catalogs.starMeta = starMeta;
    if (asteroids && Array.isArray(asteroids)) this.state.catalogs.asteroids = asteroids;
    if (satellites && Array.isArray(satellites)) this.state.catalogs.satellitesTle = satellites;
    if (meteors && Array.isArray(meteors)) this.state.catalogs.meteors = meteors;
    if (telescopes) this.state.catalogs.telescopes = telescopes;
    if (wikiIndex) this.state.catalogs.wikiIndex = wikiIndex;

    this._updateEphemerides(true);
    this._updateHudLabels();
    this.requestRender();

    fetch('data/stars.bin')
      .then(r => r.ok ? r.arrayBuffer() : null)
      .then(buf => {
        if (buf) {
          this.state.catalogs.starsBin = new DataView(buf);
          this.requestRender();
        }
      })
      .catch(() => {});

    fetchJson('data/openngc.json').then(dso => {
      if (dso) {
        this.state.catalogs.openngc = dso;
        this.requestRender();
      }
    });

    fetchJson('data/cities.json').then(cities => {
      if (cities) {
        this.state.catalogs.cities = cities;
      }
    });
  }

  _tick(now) {
    const dtSec = Math.min(0.25, (now - this._lastFrameTime) / 1000);
    this._lastFrameTime = now;

    if (this.state.isPlaying) {
      const deltaSimMs = dtSec * 1000 * this.state.timeSpeed * this.state.timeDirection;
      this.state.date = new Date(this.state.date.getTime() + deltaSimMs);
      const forceFull = Math.abs(this.state.timeSpeed) > 10 || (now - this._lastSatUpdateMs > 900);
      this._updateEphemerides(forceFull);
      if (forceFull) this._lastSatUpdateMs = now;
      this._updateHudLabels();
      this._needsRender = true;
    }

    if (this._needsRender) {
      this._needsRender = false;
      this.renderer.render(this.state);
    }

    requestAnimationFrame((t) => this._tick(t));
  }

  _updateEphemerides(fullUpdate = false) {
    const jd = dateToJD(this.state.date);
    this.state.jd = jd;
    const obs = this.state.observer;
    const lstDeg = getLST(jd, obs.lon);
    this.state.lstDeg = lstDeg;

    const rawBodies = computeSolarSystem(jd, obs);
    let bodyList = [];
    if (Array.isArray(rawBodies)) {
      bodyList = rawBodies;
    } else if (rawBodies && rawBodies.sun && rawBodies.planets) {
      bodyList = [rawBodies.sun, rawBodies.moon, ...Object.values(rawBodies.planets)].filter(Boolean);
    } else if (rawBodies && Array.isArray(rawBodies.allBodies)) {
      bodyList = rawBodies.allBodies;
    }

    this.state.solarSystem = bodyList.map(b => {
      const rawId = String(b.id || b.name || 'Sun');
      const lowerId = rawId.toLowerCase();
      const id = lowerId.charAt(0).toUpperCase() + lowerId.slice(1);
      const hor = equatorialToHorizontal(b.ra ?? 0, b.dec ?? 0, lstDeg, obs.lat);
      const localizedName = this.t(`planets.${lowerId}`, id);

      if (!this.state.planetOrbitCache.has(id) && id !== 'Sun' && id !== 'Moon') {
        try {
          this.state.planetOrbitCache.set(id, computePlanetOrbitPath(lowerId, jd, 96));
        } catch (_) {}
      }

      let moons = null;
      if (id === 'Jupiter' || id === 'Saturn') {
        try {
          moons = getPlanetMoons(lowerId, jd, b);
        } catch (_) {}
      }

      return {
        ...b,
        id,
        localizedName,
        alt: b.alt ?? hor.alt,
        az: b.az ?? hor.az,
        angDiamArcsec: b.angDiamArcsec ?? b.angularDiameterArcsec ?? 20,
        phaseAngleDeg: b.phaseAngleDeg ?? b.phaseAngle ?? 0,
        paLimbDeg: b.paLimbDeg ?? b.brightLimbPA ?? 270,
        cML: b.cML ?? b.centralMeridian ?? ((jd * 850) % 360),
        ringTiltDeg: b.ringTiltDeg ?? (b.rings ? b.rings.B : 14),
        orbitPoints: this.state.planetOrbitCache.get(id) || null,
        moons
      };
    });

    this.state.sun = this.state.solarSystem.find(b => b.id === 'Sun') || null;
    this.state.moon = this.state.solarSystem.find(b => b.id === 'Moon') || null;

    if (fullUpdate || this.state.asteroids.length === 0) {
      const earthBody = this.state.solarSystem.find(b => b.id === 'Earth');
      const earthHelio = earthBody?.helio || null;
      try {
        const rawAst = computeAsteroids(this.state.catalogs.asteroids, jd, earthHelio, lstDeg, obs.lat);
        this.state.asteroids = (rawAst || []).map(a => {
          const hor = equatorialToHorizontal(a.ra, a.dec, lstDeg, obs.lat);
          return {
            ...a,
            alt: a.alt ?? hor.alt,
            az: a.az ?? hor.az
          };
        });
      } catch (_) {}
    }

    if (fullUpdate || this.state.satellites.length === 0) {
      try {
        const sats = computeAllSatellites(this.state.catalogs.satellitesTle, jd, obs, this.state.sun);
        this.state.satellites = (sats || []).map(s => ({
          ...s,
          visibleAboveHorizon: s.alt >= -1
        }));
      } catch (_) {}
    }

    if (fullUpdate || this.state.activeMeteors.length === 0) {
      try {
        this.state.activeMeteors = computeMeteorShowers(this.state.catalogs.meteors, jd, lstDeg, obs.lat) || [];
      } catch (_) {}
    }

    if (this.state.trackedObjectId) {
      const tracked = this._refreshObjectCoordinates(this.state.selectedObject);
      if (tracked) {
        this.viewport.centerOn(tracked);
      }
    } else if (this.state.selectedObject) {
      this._refreshObjectCoordinates(this.state.selectedObject);
    }
  }

  _refreshObjectCoordinates(obj) {
    if (!obj) return null;
    if (obj.type === 'planet') {
      const b = this.state.solarSystem.find(p => p.id === obj.id);
      if (b) {
        obj.ra = b.ra;
        obj.dec = b.dec;
        obj.alt = b.alt;
        obj.az = b.az;
        obj.data = b;
      }
    } else if (obj.type === 'asteroid') {
      const a = this.state.asteroids.find(x => (x.id || x.name) === obj.id);
      if (a) {
        obj.ra = a.ra;
        obj.dec = a.dec;
        obj.alt = a.alt;
        obj.az = a.az;
        obj.data = a;
      }
    } else if (obj.type === 'satellite') {
      const s = this.state.satellites.find(x => `SAT:${x.norad}` === obj.id);
      if (s) {
        obj.ra = s.ra;
        obj.dec = s.dec;
        obj.alt = s.alt;
        obj.az = s.az;
        obj.data = s;
      }
    } else if (obj.ra !== undefined && obj.dec !== undefined) {
      const hor = equatorialToHorizontal(obj.ra, obj.dec, this.state.lstDeg, this.state.observer.lat);
      obj.alt = hor.alt;
      obj.az = hor.az;
    }
    return obj;
  }

  /* ==========================================================================
   * UI & HUD CONTROLS
   * ========================================================================== */
  _buildLayerTogglesBar() {
    this._updateTrainChip();
  }

  syncToggleButtons() {
    document.querySelectorAll('[data-toggle-key]').forEach(btn => {
      const k = btn.getAttribute('data-toggle-key');
      btn.classList.toggle('active', !!this.state.toggles[k]);
    });
  }

  applyLayerProfile(profileId) {
    const prof = LAYER_PROFILES.find(p => p.id === profileId);
    if (!prof) return;
    this.state.activeLayerProfile = profileId;
    Object.assign(this.state.toggles, prof.toggles);
    this.syncToggleButtons();
    this.saveSettings();
    this.requestRender();
  }

  toggleLayer(key) {
    if (key in this.state.toggles) {
      this.state.toggles[key] = !this.state.toggles[key];
      this.syncToggleButtons();
      this.requestRender();
    }
  }

  setViewMode(mode) {
    this.viewport.viewMode = mode;
    if (mode === 'telescope') {
      const stats = this.computeOpticalStats();
      this.viewport.setFov(Math.max(0.08, Math.min(10, stats.tfovDeg)));
    } else if (mode === 'zenith') {
      this.viewport.centerAlt = 90;
      this.viewport.setFov(180);
    } else if (this.viewport.fov < 8 || this.viewport.fov > 140) {
      this.viewport.setFov(75);
      if (mode === 'terrestrial' && this.viewport.centerAlt > 75) {
        this.viewport.centerAlt = 26;
      }
    }
    document.querySelectorAll('.view-tab').forEach(btn => {
      const isAct = btn.getAttribute('data-view') === mode;
      btn.classList.toggle('active', isAct);
      btn.setAttribute('aria-selected', isAct ? 'true' : 'false');
    });
    this._updateFovChip();
    this.requestRender();
  }

  setTheme(themeId) {
    if (themeId !== 'nocturne') {
      this.state.previousTheme = themeId;
    }
    this.state.theme = themeId;
    document.documentElement.setAttribute('data-theme', themeId);
    const sel = document.getElementById('theme-select');
    if (sel && sel.value !== themeId) sel.value = themeId;
    const nightBtn = document.getElementById('btn-night-vision');
    if (nightBtn) nightBtn.classList.toggle('active', themeId === 'nocturne');
    this.saveSettings();
    this.requestRender();
  }

  setDate(newDate) {
    this.state.date = newDate;
    this._updateEphemerides(true);
    this._updateHudLabels();
    if (this.state.selectedObject) {
      this.objectCardUI.render(this.state.selectedObject);
    }
    this.requestRender();
  }

  refreshSelectedObjectCard() {
    if (this.state.selectedObject) {
      this.objectCardUI.render(this.state.selectedObject);
    }
  }

  setObserverLocation(loc) {
    this.state.observer = {
      name: loc.name || 'Lieu personnalisé',
      country: loc.country || '',
      lat: Number(loc.lat) || 0,
      lon: Number(loc.lon) || 0,
      alt: Number(loc.alt) || 0,
      tz: loc.tz || 'UTC'
    };
    this.saveSettings();
    this._updateEphemerides(true);
    this._updateHudLabels();
    if (this.state.selectedObject) {
      this.objectCardUI.render(this.state.selectedObject);
    }
    this.requestRender();
  }

  _updateFovChip() {
    const fovEl = document.getElementById('fovVal');
    if (!fovEl) return;
    if (this.viewport.viewMode === 'solarsystem') {
      fovEl.textContent = `${this.viewport.solarZoomAU.toFixed(1)} UA`;
    } else if (this.viewport.fov >= 1) {
      fovEl.textContent = `${Math.round(this.viewport.fov)}°`;
    } else {
      fovEl.textContent = `${(this.viewport.fov * 60).toFixed(0)}′`;
    }
  }

  _updateTrainChip() {
    const txtEl = document.getElementById('trainChipText');
    if (!txtEl) return;
    const cfg = this.state.telescopeConfig;
    const stats = this.computeOpticalStats();
    txtEl.textContent = `${cfg.apertureMm}/${cfg.focalMm} · ${cfg.eyepieceFocalMm} mm → ×${stats.magnification} · ${stats.tfovStr} · pup. ${stats.exitPupilMm} mm`;
  }

  _updateHudLabels() {
    const obs = this.state.observer;

    // 1. Location chip
    const locNameEl = document.getElementById('locName');
    if (locNameEl) {
      locNameEl.textContent = obs.name;
    }
    const locSubEl = document.getElementById('locSub');
    if (locSubEl) {
      const ns = obs.lat >= 0 ? 'N' : 'S';
      const ew = obs.lon >= 0 ? 'E' : 'O';
      locSubEl.textContent = `${Math.abs(obs.lat).toFixed(1)}°${ns} ${Math.abs(obs.lon).toFixed(1)}°${ew} · Bortle ${this.state.bortleClass || 4}`;
    }

    // 2. Clock + Date + Local Sidereal Time (TSL)
    const clockEl = document.getElementById('clockVal');
    const dateEl = document.getElementById('dateVal');
    const nightSubEl = document.getElementById('nightSub');
    const lstEl = document.getElementById('lstVal');

    try {
      const timeFmt = new Intl.DateTimeFormat(this.state.lang, {
        timeZone: obs.tz || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      if (clockEl) clockEl.textContent = timeFmt.format(this.state.date);

      const dateFmt = new Intl.DateTimeFormat(this.state.lang, {
        timeZone: obs.tz || 'UTC',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      if (dateEl) dateEl.textContent = dateFmt.format(this.state.date);
    } catch (_) {
      const iso = this.state.date.toISOString();
      if (clockEl) clockEl.textContent = iso.slice(11, 19);
      if (dateEl) dateEl.textContent = iso.slice(0, 10);
    }

    if (lstEl) {
      const lstHours = ((this.state.lstDeg / 15) + 24) % 24;
      const lh = Math.floor(lstHours);
      const lm = Math.floor((lstHours - lh) * 60);
      lstEl.textContent = `TSL ${String(lh).padStart(2, '0')}h${String(lm).padStart(2, '0')}m`;
    }

    if (nightSubEl) {
      const sunAlt = this.state.sun?.alt ?? -20;
      const moonPct = Math.round((this.state.moon?.illum ?? 0.5) * 100);
      const regime = sunAlt > 0 ? 'Jour' : sunAlt > -6 ? 'Crép. civil' : sunAlt > -12 ? 'Crép. nautique' : sunAlt > -18 ? 'Crép. astro' : 'Nuit noire';
      nightSubEl.textContent = `${regime} · Lune ${moonPct}%`;
    }

    this._updateFovChip();
    this._updateTrainChip();
    this._updateDockNightTrack();
  }

  _updateDockNightTrack() {
    const svg = document.getElementById('dockSvg');
    if (!svg) return;

    // Build a noon-to-noon 24-hour window around the current evening/night
    const cur = this.state.date;
    const noonStart = new Date(cur);
    if (cur.getHours() < 12) {
      noonStart.setDate(noonStart.getDate() - 1);
    }
    noonStart.setHours(12, 0, 0, 0);
    const startMs = noonStart.getTime();
    const spanMs = 24 * 3600000;
    const endMs = startMs + spanMs;

    this._dockWindowStartMs = startMs;
    this._dockWindowEndMs = endMs;

    const nowFrac = Math.max(0, Math.min(1, (cur.getTime() - startMs) / spanMs));
    const playheadX = (nowFrac * 360).toFixed(1);

    // Recompute twilight gradient bands only if window or location changed
    const cacheKey = `${startMs}:${this.state.observer.lat.toFixed(2)}:${this.state.observer.lon.toFixed(2)}:${this.state.theme}`;
    if (this._dockTrackCacheKey !== cacheKey) {
      this._dockTrackCacheKey = cacheKey;
      const obs = this.state.observer;
      const sunRa = this.state.sun?.ra ?? 180;
      const sunDec = this.state.sun?.dec ?? 0;
      const nightVision = this.state.theme === 'nocturne';
      const steps = 36;
      const rects = [];

      for (let i = 0; i < steps; i++) {
        const tMs = startMs + ((i + 0.5) / steps) * spanMs;
        const jd = dateToJD(new Date(tMs));
        const lst = getLST(jd, obs.lon);
        const hor = equatorialToHorizontal(sunRa, sunDec, lst, obs.lat);
        let fill = '#2e4e82';
        if (nightVision) {
          fill = hor.alt <= -18 ? '#0a0000' : hor.alt <= 0 ? '#240503' : '#420b07';
        } else if (hor.alt <= -18) {
          fill = '#050a15';
        } else if (hor.alt <= -12) {
          fill = '#0c1730';
        } else if (hor.alt <= -6) {
          fill = '#182b52';
        } else if (hor.alt <= 0) {
          fill = '#2d4475';
        } else {
          fill = '#3c629c';
        }
        const x = (i / steps) * 360;
        const w = (360 / steps) + 0.6;
        rects.push(`<rect x="${x.toFixed(1)}" y="4" width="${w.toFixed(1)}" height="18" fill="${fill}" />`);
      }

      // Hour ticks at 18h, 00h, 06h
      const ticks = [
        { frac: 0.25, label: '18h' },
        { frac: 0.50, label: '00h' },
        { frac: 0.75, label: '06h' }
      ].map(tk => {
        const tx = tk.frac * 360;
        return `
          <line x1="${tx}" y1="4" x2="${tx}" y2="22" stroke="rgba(255,255,255,0.22)" stroke-width="1"/>
          <text x="${tx}" y="32" text-anchor="middle" fill="rgba(185,205,235,0.68)" font-size="8.5" font-family="IBM Plex Mono, monospace">${tk.label}</text>
        `;
      }).join('');

      this._dockStaticMarkup = `
        <clipPath id="dockTrackClip"><rect x="0" y="4" width="360" height="18" rx="5"/></clipPath>
        <g clip-path="url(#dockTrackClip)">${rects.join('')}</g>
        <rect x="0.5" y="4.5" width="359" height="17" rx="5" fill="none" stroke="rgba(160,190,235,0.24)" stroke-width="1"/>
        ${ticks}
      `;
    }

    svg.innerHTML = `
      ${this._dockStaticMarkup || ''}
      <g id="dockPlayhead" transform="translate(${playheadX}, 0)">
        <line x1="0" y1="1" x2="0" y2="25" stroke="#ffb454" stroke-width="2"/>
        <circle cx="0" cy="13" r="4.2" fill="#ffb454" stroke="#08101e" stroke-width="1.4"/>
      </g>
    `;
  }

  _bindHudEvents() {
    // 5 Views tabs
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setViewMode(btn.getAttribute('data-view'));
      });
    });

    // FOV stepper (− / FOV / +)
    document.getElementById('fovMinus')?.addEventListener('click', () => {
      if (this.viewport.viewMode === 'solarsystem') {
        this.viewport.solarZoomAU = Math.max(0.4, this.viewport.solarZoomAU * 0.8);
      } else {
        this.viewport.setFov(this.viewport.fov * 0.8);
      }
      this._updateFovChip();
      this.requestRender();
    });
    document.getElementById('fovPlus')?.addEventListener('click', () => {
      if (this.viewport.viewMode === 'solarsystem') {
        this.viewport.solarZoomAU = Math.min(45, this.viewport.solarZoomAU * 1.25);
      } else {
        this.viewport.setFov(this.viewport.fov * 1.25);
      }
      this._updateFovChip();
      this.requestRender();
    });
    document.getElementById('fovVal')?.addEventListener('click', () => {
      this.viewport.setFov(60);
      this._updateFovChip();
      this.requestRender();
    });

    // Night vision quick toggle button
    document.getElementById('btn-night-vision')?.addEventListener('click', () => {
      if (this.state.theme === 'nocturne') {
        this.setTheme(this.state.previousTheme || 'meridien');
      } else {
        this.setTheme('nocturne');
      }
    });

    // Share current sky view URL
    document.getElementById('btn-share-view')?.addEventListener('click', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('lat', this.state.observer.lat.toFixed(4));
      url.searchParams.set('lon', this.state.observer.lon.toFixed(4));
      url.searchParams.set('t', this.state.date.toISOString());
      url.searchParams.set('view', this.viewport.viewMode);
      url.searchParams.set('fov', this.viewport.fov.toFixed(2));
      navigator.clipboard?.writeText(url.toString()).catch(() => {});
      const btn = document.getElementById('btn-share-view');
      if (btn) {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1200);
      }
    });

    // Optical train floating chip opens Telescope drawer
    document.getElementById('trainChip')?.addEventListener('click', () => {
      this.panelsUI.openPanel('telescope');
    });

    // Drawer fold handle
    document.getElementById('drawer-fold-btn')?.addEventListener('click', () => {
      this.panelsUI.closePanel();
    });

    // Location, Weather & Command Palette buttons
    document.getElementById('btn-open-location')?.addEventListener('click', () => {
      this.panelsUI.openPanel('location');
    });
    document.getElementById('wxChip')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.panelsUI.openPanel('weather');
    });
    document.getElementById('btn-open-tonight-chip')?.addEventListener('click', () => {
      this.panelsUI.openPanel('tonight');
    });
    document.getElementById('btn-open-cmd')?.addEventListener('click', () => {
      this.commandPaletteUI.open();
    });

    // Left rail panel buttons
    document.querySelectorAll('[data-open-panel]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.panelsUI.openPanel(btn.getAttribute('data-open-panel'));
      });
    });

    // Theme & Language selectors
    const themeSel = document.getElementById('theme-select');
    if (themeSel) {
      themeSel.value = this.state.theme;
      themeSel.addEventListener('change', () => this.setTheme(themeSel.value));
    }

    const langSel = document.getElementById('lang-select');
    if (langSel) {
      langSel.value = this.state.lang;
      langSel.addEventListener('change', async () => {
        this.state.lang = langSel.value;
        await setLanguage(this.state.lang);
        applyDomTranslations(document);
        this.saveSettings();
        this._updateEphemerides(true);
        this._updateHudLabels();
        if (this.state.selectedObject) {
          this.objectCardUI.render(this.state.selectedObject);
        }
        this.requestRender();
      });
    }

    // Time controls in bottom dock
    const playBtn = document.getElementById('btn-time-play');
    const syncPlayIcon = () => {
      if (!playBtn) return;
      playBtn.classList.toggle('active', this.state.isPlaying);
      playBtn.innerHTML = this.state.isPlaying
        ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 5v14l11-7z" fill="currentColor"/></svg>';
    };
    syncPlayIcon();
    playBtn?.addEventListener('click', () => {
      this.state.isPlaying = !this.state.isPlaying;
      syncPlayIcon();
    });

    document.getElementById('btn-time-now')?.addEventListener('click', () => {
      this.setDate(new Date());
    });

    document.getElementById('btn-day-prev')?.addEventListener('click', () => {
      this.setDate(new Date(this.state.date.getTime() - 86400000));
    });
    document.getElementById('btn-day-next')?.addEventListener('click', () => {
      this.setDate(new Date(this.state.date.getTime() + 86400000));
    });

    document.getElementById('time-speed-select')?.addEventListener('change', (e) => {
      this.state.timeSpeed = Number(e.target.value) || 1;
    });

    document.getElementById('btn-time-step-back')?.addEventListener('click', () => {
      this.setDate(new Date(this.state.date.getTime() - this.state.manualStepSec * 1000));
    });

    document.getElementById('btn-time-step-fwd')?.addEventListener('click', () => {
      this.setDate(new Date(this.state.date.getTime() + this.state.manualStepSec * 1000));
    });

    // Date picker click on clock readout
    const clockBtn = document.getElementById('hud-time-readout');
    const dateInput = document.getElementById('date-picker-hidden');
    clockBtn?.addEventListener('click', () => {
      if (dateInput && dateInput.showPicker) {
        dateInput.showPicker();
      } else {
        const iso = prompt('Date & heure (YYYY-MM-DD HH:MM) :', this.state.date.toISOString().slice(0, 16).replace('T', ' '));
        if (iso) {
          const parsed = new Date(iso);
          if (!isNaN(parsed.getTime())) this.setDate(parsed);
        }
      }
    });
    dateInput?.addEventListener('change', () => {
      const d = new Date(dateInput.value);
      if (!isNaN(d.getTime())) this.setDate(d);
    });

    // Interactive SVG Night Track scrubbing (#dockTrack)
    const dockTrack = document.getElementById('dockTrack');
    let isScrubbingDock = false;
    const scrubDockToEvent = (e) => {
      if (!dockTrack || !this._dockWindowStartMs || !this._dockWindowEndMs) return;
      const rect = dockTrack.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const targetMs = this._dockWindowStartMs + frac * (this._dockWindowEndMs - this._dockWindowStartMs);
      this.setDate(new Date(targetMs));
    };
    dockTrack?.addEventListener('pointerdown', (e) => {
      isScrubbingDock = true;
      dockTrack.setPointerCapture(e.pointerId);
      scrubDockToEvent(e);
    });
    dockTrack?.addEventListener('pointermove', (e) => {
      if (isScrubbingDock) scrubDockToEvent(e);
    });
    dockTrack?.addEventListener('pointerup', () => {
      isScrubbingDock = false;
    });
  }

  _bindCanvasInteraction() {
    let isDragging = false;
    let startX = 0, startY = 0;
    let lastX = 0, lastY = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      startX = lastX = e.clientX;
      startY = lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (Math.hypot(dx, dy) > 1.5) {
        this.state.trackedObjectId = null;
        this.viewport.panByPixels(dx, dy);
        this.requestRender();
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (!isDragging) return;
      isDragging = false;
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (moved < 5) {
        const picked = this.renderer.pickObjectAt(e.clientX, e.clientY);
        if (picked) {
          this.selectObject(picked);
        }
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.12 : 0.89;
      this.viewport.zoomAtCursor(factor, e.clientX, e.clientY);
      this._updateFovChip();
      this.requestRender();
    }, { passive: false });
  }

  /**
   * Bind keyboard shortcuts dynamically generated from `js/features.js`
   */
  _bindKeyboardShortcuts() {
    const shortcutMap = getShortcutMap();

    window.addEventListener('keydown', (e) => {
      // Command Palette: ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.commandPaletteUI.toggle();
        return;
      }

      if (e.key === 'Escape') {
        if (this.commandPaletteUI.isOpen) {
          this.commandPaletteUI.close();
          return;
        }
        if (this.panelsUI.activePanelId) {
          this.panelsUI.closePanel();
          return;
        }
      }

      // Ignore single-key shortcuts when typing in an input or select
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const keyNorm = normalizeShortcutKey(e.key === ' ' ? 'Space' : e.key);
      const feat = shortcutMap.get(keyNorm);
      if (feat) {
        e.preventDefault();
        this.executeFeatureAction(feat.id);
      }
    });
  }

  executeFeatureAction(featureId) {
    if (featureId.startsWith('view.')) {
      this.setViewMode(featureId.slice(5));
    } else if (featureId.startsWith('toggle.')) {
      this.toggleLayer(featureId.slice(7));
    } else if (featureId.startsWith('panel.')) {
      const p = featureId.slice(6);
      if (p === 'commandPalette') this.commandPaletteUI.toggle();
      else this.panelsUI.openPanel(p);
    } else if (featureId === 'time.playPause') {
      document.getElementById('btn-time-play')?.click();
    } else if (featureId === 'time.now') {
      document.getElementById('btn-time-now')?.click();
    } else if (featureId === 'time.reverse') {
      document.getElementById('btn-time-rev')?.click();
    } else if (featureId === 'time.speedUp') {
      document.getElementById('btn-time-fwd')?.click();
    } else if (featureId === 'time.stepForward') {
      document.getElementById('btn-time-step-fwd')?.click();
    } else if (featureId === 'time.stepBackward') {
      document.getElementById('btn-time-step-back')?.click();
    }
  }

  /* ==========================================================================
   * OBJECT SELECTION, TRACKING, TRACING & 6-SECTION DETAILS
   * ========================================================================== */
  selectObject(target) {
    if (!target) {
      this.state.selectedObject = null;
      this.state.trackedObjectId = null;
      this.objectCardUI.render(null);
      this.requestRender();
      return;
    }

    this._refreshObjectCoordinates(target);
    this.state.selectedObject = target;
    this.objectCardUI.render(target);
    this.requestRender();
  }

  centerOnSelectedObject() {
    const sel = this.state.selectedObject;
    if (!sel) return;
    this._refreshObjectCoordinates(sel);
    this.viewport.centerOn({ alt: sel.alt, az: sel.az, ra: sel.ra, dec: sel.dec });
    this.requestRender();
  }

  toggleTrackSelectedObject() {
    const sel = this.state.selectedObject;
    if (!sel) return;
    if (this.state.trackedObjectId === sel.id) {
      this.state.trackedObjectId = null;
    } else {
      this.state.trackedObjectId = sel.id;
      this.centerOnSelectedObject();
    }
  }

  toggleTraceSelectedObject() {
    const sel = this.state.selectedObject;
    if (!sel) return;
    if (this.state.tracedObjectId === sel.id) {
      this.state.tracedObjectId = null;
      this.state.tracedTrajectory = null;
    } else {
      this.state.tracedObjectId = sel.id;
      this.state.tracedTrajectory = this._compute24hObjectArc(sel);
    }
    this.requestRender();
  }

  _compute24hObjectArc(sel) {
    const pts = [];
    const obs = this.state.observer;
    const baseJD = this.state.jd;
    for (let h = -12; h <= 12; h += 0.5) {
      const jd = baseJD + h / 24;
      const lst = getLST(jd, obs.lon);
      const hor = equatorialToHorizontal(sel.ra || 0, sel.dec || 0, lst, obs.lat);
      pts.push({
        ra: sel.ra || 0,
        dec: sel.dec || 0,
        alt: hor.alt,
        az: hor.az,
        label: (h % 4 === 0) ? `${h >= 0 ? '+' : ''}${h}h` : null
      });
    }
    return pts;
  }

  /**
   * Build the complete 6-section data object for `ObjectCardUI`
   */
  getObjectFullDetails(obj) {
    this._refreshObjectCoordinates(obj);
    const obs = this.state.observer;
    const ra = obj.ra ?? 0;
    const dec = obj.dec ?? 0;
    const alt = obj.alt ?? 0;
    const az = obj.az ?? 0;
    const haDeg = ((this.state.lstDeg - ra) % 360 + 360) % 360;

    // 1. Tonight Rise / Transit / Set accounting for « Mon horizon » profile
    const rts = this._computeFormattedRTS(ra, dec);

    // 2. Constellation lookup
    const conCode = this._findConstellationCode(obj, ra, dec);
    const conName = getConstellationName(conCode);

    // 3. Airmass & Parallactic angle q
    const airmass = alt > 0.5 ? getAirmass(alt) : null;
    const airmassStr = airmass ? `${airmass.toFixed(2)} X` : 'Sous l\'horizon';
    const qDeg = getParallacticAngle(haDeg, dec, obs.lat);
    const parallacticStr = `${qDeg >= 0 ? '+' : ''}${qDeg.toFixed(1)}°`;

    // 4. Compass direction
    const compassIdx = Math.round(((az % 360) / 22.5)) % 16;
    const compassDir = COMPASS_DIRS[compassIdx];

    // 5. Type-specific physical & identity rows + Wiki lookup key + Photo URL
    let title = obj.name || obj.id;
    let subtitle = '';
    let typeLabel = 'Astre';
    let mag = obj.mag ?? (obj.data?.mag ?? null);
    let surfaceBrightness = null;
    let majArcmin = 0;
    let minArcmin = 0;
    let dsoSubType = null;
    let sepArcsec = null;
    let photoUrl = null;
    let wikiKey = obj.id;
    let fallbackSummary = '';
    let moons = null;

    const physicalRows = [];
    const identityRows = [];

    if (obj.type === 'planet') {
      const b = obj.data || {};
      typeLabel = obj.id === 'Sun' ? 'Étoile (Soleil)' : obj.id === 'Moon' ? 'Satellite naturel' : 'Planète';
      title = b.localizedName || obj.name;
      subtitle = `Système solaire · ${conName}`;
      wikiKey = obj.id;
      moons = b.moons || null;
      majArcmin = (b.angDiamArcsec || 20) / 60;
      minArcmin = majArcmin;

      if (b.distAU !== undefined) {
        physicalRows.push({ label: 'Distance', value: obj.id === 'Moon' ? `${Math.round(b.distKm || b.distAU * 149597870).toLocaleString()} km` : `${b.distAU.toFixed(3)} UA` });
      }
      if (b.angDiamArcsec !== undefined) {
        physicalRows.push({ label: 'Diamètre apparent', value: `${b.angDiamArcsec.toFixed(1)}″` });
      }
      if (b.illum !== undefined && obj.id !== 'Sun') {
        physicalRows.push({ label: 'Phase éclairée', value: `${(b.illum * 100).toFixed(1)} % (angle ${Math.round(b.phaseAngleDeg || 0)}°)` });
      }
      if (b.elongDeg !== undefined && obj.id !== 'Sun') {
        physicalRows.push({ label: 'Élongation solaire', value: `${b.elongDeg.toFixed(1)}°` });
      }
      if (obj.id === 'Saturn' && b.ringTiltDeg !== undefined) {
        physicalRows.push({ label: 'Inclinaison des anneaux (B)', value: `${b.ringTiltDeg.toFixed(1)}°` });
      }
      identityRows.push({ label: 'Désignation UAI', value: obj.id });
      identityRows.push({ label: 'Constellation actuelle', value: `${conName} (${conCode})` });
    } else if (obj.type === 'star') {
      typeLabel = 'Étoile (ATHYG v3.2)';
      const idx = obj.starIdx ?? 0;
      const meta = this.state.catalogs.starMeta || {};
      const nameInfo = meta.names ? meta.names[idx] : null;
      const wdsInfo = meta.wds ? meta.wds[idx] : null;
      const gcvsInfo = meta.gcvs ? meta.gcvs[idx] : null;
      const brightInfo = meta.bright ? meta.bright[idx] : null;

      const properName = Array.isArray(nameInfo) ? nameInfo[0] : (nameInfo?.name || (typeof nameInfo === 'string' ? nameInfo : null));
      const hipNum = (Array.isArray(nameInfo) && nameInfo[1]) || brightInfo?.hip || (idx + 1);
      const hdNum = (Array.isArray(nameInfo) && nameInfo[2]) || brightInfo?.hd || (idx + 1000);
      const bayer = (Array.isArray(nameInfo) && nameInfo[3]) ? `${nameInfo[3]} ${nameInfo[5] || conCode}` : (brightInfo?.bayer || `${conCode} #${idx + 1}`);
      const distLy = (Array.isArray(nameInfo) && nameInfo[6] !== undefined) ? nameInfo[6] : (brightInfo?.distLy || Math.round(15 + (obj.mag + 1.5) * 42));
      const spect = (Array.isArray(nameInfo) && nameInfo[7]) ? nameInfo[7] : (brightInfo?.spect || this._bvToSpectralClass(obj.bv));

      title = properName || `HD ${hdNum}`;
      subtitle = `${bayer} · HIP ${hipNum} · ${conName}`;
      wikiKey = properName || `CON:${conCode}`;

      // Ballesteros (2012) effective temperature & stellar radius
      const ballesteros = computeStellarRadiusSolar(mag ?? 5, distLy, obj.bv ?? 0.4);
      const tempK = ballesteros ? ballesteros.tempK : bvToTemperatureK(obj.bv ?? 0.4);
      const distPc = distLy / 3.2616;
      const radiusSol = ballesteros ? ballesteros.radiusSolar : 1.0;

      physicalRows.push({ label: 'Indice B−V & Spectre', value: `${(obj.bv ?? 0).toFixed(2)} (${spect})` });
      physicalRows.push({ label: 'Température (Ballesteros)', value: `${tempK.toLocaleString()} K` });
      physicalRows.push({ label: 'Rayon estimé', value: `${radiusSol < 10 ? radiusSol.toFixed(2) : Math.round(radiusSol)} R☉` });
      physicalRows.push({ label: 'Distance', value: `${distLy} a.l. (${distPc.toFixed(1)} pc)` });

      if (wdsInfo) {
        const sep = Array.isArray(wdsInfo) ? wdsInfo[2] : wdsInfo.sep;
        const pa = Array.isArray(wdsInfo) ? wdsInfo[3] : wdsInfo.pa;
        const magB = Array.isArray(wdsInfo) ? wdsInfo[5] : wdsInfo.magB;
        sepArcsec = Number(sep) || null;
        physicalRows.push({ label: 'Étoile double (WDS)', value: `Sép. ${sep}″ · AP ${pa}° · Mag B ${magB}` });
        identityRows.push({ label: 'Catalogue WDS', value: Array.isArray(wdsInfo) ? wdsInfo[0] : (wdsInfo.id || 'WDS') });
      }
      if (gcvsInfo) {
        const vType = Array.isArray(gcvsInfo) ? gcvsInfo[1] : gcvsInfo.type;
        const vMax = Array.isArray(gcvsInfo) ? gcvsInfo[2] : gcvsInfo.max;
        const vMin = Array.isArray(gcvsInfo) ? gcvsInfo[3] : gcvsInfo.min;
        const vPer = Array.isArray(gcvsInfo) ? gcvsInfo[4] : gcvsInfo.period;
        physicalRows.push({ label: 'Étoile variable (GCVS)', value: `${vType} (${vMax} .. ${vMin} mag · P=${vPer} j)` });
        identityRows.push({ label: 'Désignation GCVS', value: Array.isArray(gcvsInfo) ? gcvsInfo[0] : (gcvsInfo.name || 'GCVS') });
      }

      if (properName) identityRows.push({ label: 'Nom propre (UAI)', value: properName });
      identityRows.push({ label: 'Bayer / Flamsteed', value: bayer });
      identityRows.push({ label: 'Henry Draper (HD)', value: `HD ${hdNum}` });
      identityRows.push({ label: 'Hipparcos (HIP)', value: `HIP ${hipNum}` });
      fallbackSummary = `${title} est une étoile de type spectral ${spect} (T ≈ ${tempK.toLocaleString()} K) située dans la constellation ${conName} à environ ${distLy} années-lumière.`;
    } else if (obj.type === 'dso') {
      // Schema: [id, m, name, type, ra, dec, mag, sb, maj, min, pa, con, dist, photo]
      const r = obj.data || [];
      const ngcId = r[0] || obj.id;
      const messier = r[1] || '';
      const commonName = r[2] || '';
      const dsoType = r[3] || 'G';
      dsoSubType = dsoType;
      mag = r[6] ?? 10.5;
      majArcmin = r[8] || 5;
      minArcmin = r[9] || majArcmin;
      surfaceBrightness = r[7] ?? (mag + 2.5 * Math.log10(Math.max(1, Math.PI * 0.25 * majArcmin * minArcmin)));
      if (r[13]) {
        photoUrl = `assets/dso/${r[13]}`;
      }

      typeLabel = `Objet du ciel profond (${dsoType})`;
      title = messier ? (commonName ? `${messier} · ${commonName}` : `${messier} (${ngcId})`) : (commonName ? `${ngcId} · ${commonName}` : ngcId);
      subtitle = `${ngcId} · ${conName}`;
      wikiKey = messier || ngcId;

      physicalRows.push({ label: 'Dimensions angulaires', value: `${majArcmin.toFixed(1)}′ × ${minArcmin.toFixed(1)}′ (AP ${r[10] || 0}°)` });
      physicalRows.push({ label: 'Brillance de surface', value: `${surfaceBrightness.toFixed(1)} mag/arcmin²` });
      if (r[12]) physicalRows.push({ label: 'Distance', value: `${r[12]} kly` });

      if (messier) identityRows.push({ label: 'Catalogue de Messier', value: messier });
      identityRows.push({ label: 'OpenNGC (NGC / IC)', value: ngcId });
      if (commonName) identityRows.push({ label: 'Nom usuel', value: commonName });
      fallbackSummary = `${title} (${ngcId}) est un objet du ciel profond de type ${dsoType} situé dans la constellation ${conName}.`;
    } else if (obj.type === 'satellite') {
      const s = obj.data || {};
      typeLabel = 'Satellite artificiel (SGP4)';
      title = s.name || obj.name;
      subtitle = `NORAD ${s.norad} · Orbite basse`;
      wikiKey = s.name?.includes('ISS') ? 'ISS' : 'Artificial_satellite';

      physicalRows.push({ label: 'Altitude orbitale', value: `${Math.round(s.heightKm || 415)} km` });
      physicalRows.push({ label: 'Distance oblique', value: `${Math.round(s.rangeKm || 600)} km` });
      physicalRows.push({ label: 'Vitesse orbitale', value: `${(s.velocityKmS || 7.66).toFixed(2)} km/s` });
      physicalRows.push({ label: 'Éclairement', value: s.isEclipsed ? 'Dans l\'ombre de la Terre (Éclipsé)' : 'Éclairé par le Soleil' });
      identityRows.push({ label: 'Numéro NORAD', value: String(s.norad) });
    } else if (obj.type === 'asteroid') {
      const a = obj.data || {};
      typeLabel = 'Astéroïde (JPL SBDB)';
      title = a.name || obj.name;
      subtitle = `Ceinture principale · ${conName}`;
      wikiKey = `AST:${a.name}`;

      physicalRows.push({ label: 'Distance héliocentrique', value: `${(a.rAU || 2.7).toFixed(3)} UA` });
      physicalRows.push({ label: 'Distance géocentrique', value: `${(a.distAU || 2.1).toFixed(3)} UA` });
      if (a.diameterKm) physicalRows.push({ label: 'Diamètre', value: `${a.diameterKm} km` });
      identityRows.push({ label: 'Désignation JPL SBDB', value: a.name });
    }

    // 6. Directional sky SQM (Krisciunas & Schaefer 1991 + Patat 2006) & Crumey (2014) visibility verdict
    const sunAlt = this.state.sun?.alt ?? -25;
    const moonAlt = this.state.moon?.alt ?? -15;
    const moonPhase = (this.state.moon?.phaseAngleDeg ?? 90);
    const moonSep = this.state.moon
      ? Math.hypot((ra - (this.state.moon.ra || 0)) * Math.cos(dec * Math.PI / 180), dec - (this.state.moon.dec || 0))
      : 90;

    const skySqm = computeDirectionalSkySqm({
      altDeg: Math.max(2, alt),
      bortle: this.state.bortleClass || 4,
      sunAltDeg: sunAlt,
      moonAltDeg: moonAlt,
      moonPhaseAngleDeg: moonPhase,
      moonSepDeg: moonSep,
      altMeters: obs.alt || 0
    });

    const horizonFloorDeg = this.state.toggles.horizonProfile ? this.getHorizonElevationAtAz(az) : 0;
    const cfg = this.state.telescopeConfig;
    const crumey = evaluateCrumeyVisibility({
      mag: mag ?? 6.0,
      majArcmin,
      minArcmin,
      dsoType: dsoSubType || obj.type,
      skySqm,
      apertureMm: cfg.apertureMm || 200,
      focalMm: (cfg.focalMm || 1000) * (cfg.barlow || 1),
      eyepieceFocalMm: cfg.eyepieceFocalMm || 14,
      altDeg: alt,
      altMeters: obs.alt || 0
    });

    let vTone = 'ok';
    let reachLabel = 'Visible au télescope';
    let detailLabel = `Marge de contraste ${crumey.contrastMarginDb >= 0 ? '+' : ''}${crumey.contrastMarginDb.toFixed(1)} dB`;
    if (alt <= 0) {
      vTone = 'bad';
      reachLabel = 'Sous l\'horizon';
      detailLabel = `Hauteur ${alt.toFixed(1)}°`;
    } else if (alt < horizonFloorDeg) {
      vTone = 'bad';
      reachLabel = 'Masqué par votre horizon';
      detailLabel = `Obstacle local à ${horizonFloorDeg.toFixed(0)}° en ${compassDir}`;
    } else if (crumey.verdictKey === 'naked_eye') {
      vTone = 'ok';
      reachLabel = 'Visible à l\'œil nu & aux instruments';
    } else if (crumey.verdictKey === 'easy') {
      vTone = 'ok';
      reachLabel = `Bien visible (${cfg.apertureMm} mm)`;
    } else if (crumey.verdictKey === 'marginal') {
      vTone = 'warn';
      reachLabel = `Limite en vision décalée (${cfg.apertureMm} mm)`;
    } else {
      vTone = 'bad';
      reachLabel = `Hors de portée (${cfg.apertureMm} mm · lim. mag ${crumey.scopeLimitMag.toFixed(1)})`;
    }

    const fistsStr = formatAltitudeWithFists(alt, this.state.lang);
    const verdict = {
      tone: vTone,
      reachText: reachLabel,
      altFistsText: `${alt >= 0 ? '+' : ''}${alt.toFixed(1)}°${fistsStr ? ` (${fistsStr})` : ''} · ${compassDir}`,
      reasonText: `${detailLabel} · Ciel local SQM ${skySqm.toFixed(1)} (Bortle ${this.state.bortleClass || 4})`,
      detectLabel: `${reachLabel} (${detailLabel})`,
      detectClass: vTone === 'ok' ? 'good' : vTone === 'warn' ? 'fair' : 'poor',
      clarkOptMag: crumey.clarkIdealMag
    };

    // 7. Optical calculations at the eyepiece (Clark ~100' + Dawes)
    const optics = this.computeOpticalStats(mag, surfaceBrightness, majArcmin, sepArcsec, verdict);

    return {
      id: obj.id,
      title,
      subtitle,
      typeLabel,
      mag,
      ra,
      dec,
      alt,
      az,
      haDeg,
      compassDir,
      airmassStr,
      parallacticStr,
      constellationCode: conCode,
      constellationName: conName,
      rts,
      verdict,
      photoUrl,
      physicalRows,
      identityRows,
      optics,
      moons,
      wikiKey,
      fallbackSummary
    };
  }

  _bvToSpectralClass(bv = 0.5) {
    if (bv < -0.2) return 'O9V';
    if (bv < 0.0) return 'B5V';
    if (bv < 0.3) return 'A2V';
    if (bv < 0.58) return 'F5V';
    if (bv < 0.85) return 'G2V';
    if (bv < 1.4) return 'K3III';
    return 'M2III';
  }

  _findConstellationCode(obj, ra, dec) {
    const list = this.state.catalogs.constellations;
    if (!Array.isArray(list) || list.length === 0) return 'Ori';
    if (obj.conIdx !== undefined && list[obj.conIdx]) {
      return list[obj.conIdx].code;
    }
    if (obj.data && Array.isArray(obj.data) && obj.data[11]) {
      return obj.data[11];
    }
    let bestCode = 'Ori';
    let bestDist = Infinity;
    for (const c of list) {
      const dRA = Math.abs(c.ra - ra);
      const dRAWrap = Math.min(dRA, 360 - dRA);
      const d = Math.hypot(dRAWrap * Math.cos(dec * Math.PI / 180), c.dec - dec);
      if (d < bestDist) {
        bestDist = d;
        bestCode = c.code;
      }
    }
    return bestCode;
  }

  _computeFormattedRTS(raDeg, decDeg) {
    const obs = this.state.observer;
    const horizonFn = (az) => this.state.toggles.horizonProfile ? this.getHorizonElevationAtAz(az) : 0;
    try {
      const res = computeRiseTransitSet(
        () => ({ ra: raDeg, dec: decDeg }),
        this.state.jd,
        obs.lat,
        obs.lon,
        horizonFn
      );
      const fmtHM = (jdVal) => {
        if (!jdVal) return '—';
        const d = jdToDate(jdVal);
        return new Intl.DateTimeFormat(this.state.lang, {
          timeZone: obs.tz || 'UTC',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).format(d);
      };

      const maxAlt = res.maxAlt ?? (90 - Math.abs(obs.lat - decDeg));
      let statusText = 'Visible cette nuit';
      if (res.circumpolar) statusText = 'Circumpolaire (toujours visible)';
      else if (res.neverRises) statusText = 'Sous l\'horizon (ne se lève pas)';

      return {
        riseStr: fmtHM(res.riseJD),
        transitStr: fmtHM(res.transitJD),
        setStr: fmtHM(res.setJD),
        maxAltStr: `${Math.max(-90, Math.min(90, maxAlt)).toFixed(0)}°`,
        statusText
      };
    } catch (_) {
      return { riseStr: '—', transitStr: '—', setStr: '—', maxAltStr: '', statusText: 'Visible' };
    }
  }

  /**
   * Compute telescope & eyepiece optical performance + Crumey/Clark/Dawes detectability
   */
  computeOpticalStats(objMag = null, objSurfaceBrightness = null, majArcmin = 0, sepArcsec = null, crumey = null) {
    const cfg = this.state.telescopeConfig;
    const effFocal = cfg.focalMm * (cfg.barlow || 1);
    const mag = Math.round(effFocal / Math.max(1, cfg.eyepieceFocalMm));
    const fRatio = (effFocal / Math.max(1, cfg.apertureMm)).toFixed(1);
    const tfovDeg = (cfg.eyepieceAfovDeg || 68) / Math.max(1, mag);
    const exitPupil = cfg.apertureMm / Math.max(1, mag);
    const limitingMag = (2.7 + 5 * Math.log10(cfg.apertureMm)).toFixed(1);
    const dawes = (116 / cfg.apertureMm).toFixed(2);

    const tfovStr = tfovDeg >= 1
      ? `${tfovDeg.toFixed(2)}°`
      : `${(tfovDeg * 60).toFixed(1)}′`;

    let detectLabel = crumey ? (crumey.detectLabel || crumey.reachText) : 'Excellente (Contraste élevé)';
    let detectClass = crumey ? (crumey.detectClass || 'good') : 'good';

    let clarkAdvice = null;
    if (majArcmin > 0.5) {
      const optMag = crumey?.clarkOptMag || Math.round(Math.max(15, Math.min(cfg.apertureMm * 1.5, 100 / majArcmin)));
      const optEyepieceMm = Math.round(effFocal / optMag);
      clarkAdvice = `×${optMag} (oculaire ~${optEyepieceMm} mm pour ~100′ apparents)`;
    }

    let dawesStr = `${dawes}″`;
    if (sepArcsec !== null) {
      dawesStr = `${dawes}″ (${sepArcsec >= parseFloat(dawes) ? `Couple ${sepArcsec}″ séparé` : `Couple ${sepArcsec}″ sous Dawes`})`;
    }

    return {
      instrumentLabel: `${cfg.brand} ${cfg.model} (${cfg.apertureMm}/${cfg.focalMm} mm) + ${cfg.eyepieceFocalMm} mm`,
      fRatio,
      magnification: mag,
      tfovDeg,
      tfovStr,
      exitPupilMm: exitPupil.toFixed(2),
      limitingMag,
      dawesArcsec: dawes,
      dawesStr,
      clarkAdvice,
      detectLabel,
      detectClass
    };
  }

  applyTelescopeConfig() {
    this.saveSettings();
    this._updateTrainChip();
    if (this.viewport.viewMode === 'telescope') {
      const stats = this.computeOpticalStats();
      this.viewport.setFov(Math.max(0.08, Math.min(10, stats.tfovDeg)));
      this._updateFovChip();
    }
    if (this.state.selectedObject) {
      this.objectCardUI.render(this.state.selectedObject);
    }
    this.requestRender();
  }

  /* ==========================================================================
   * DATA PROVIDERS FOR SPECIALIZED PANELS
   * ========================================================================== */
  computeTonightVisibilityData(targetDate, category = 'all') {
    const obs = this.state.observer;
    const noonDate = new Date(targetDate);
    noonDate.setHours(12, 0, 0, 0);
    const startMs = noonDate.getTime() + 5 * 3600000; // 17:00
    const endMs = startMs + 14 * 3600000;            // 07:00 next morning

    const jdNoon = dateToJD(noonDate);
    const tw = this._formatTwilights(jdNoon);

    // Sample sky sun altitude across 17:00 -> 07:00 (29 samples, every 30 min)
    const skySamples = [];
    const numSteps = 28;
    for (let i = 0; i <= numSteps; i++) {
      const tMs = startMs + (i / numSteps) * (endMs - startMs);
      const jd = dateToJD(new Date(tMs));
      const lst = getLST(jd, obs.lon);
      const sunRa = this.state.sun?.ra ?? 180;
      const sunDec = this.state.sun?.dec ?? 0;
      const hor = equatorialToHorizontal(sunRa, sunDec, lst, obs.lat);
      const hm = new Intl.DateTimeFormat(this.state.lang, {
        timeZone: obs.tz || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(tMs));
      skySamples.push({ frac: i / numSteps, sunAlt: hor.alt, hourLabel: hm });
    }

    // Gather candidate objects for altitude curves & table
    const candidates = [];
    if (category === 'all' || category === 'planets') {
      for (const b of this.state.solarSystem) {
        if (b.id === 'Sun' || b.id === 'Earth') continue;
        candidates.push({
          id: b.id,
          name: b.localizedName || b.id,
          typeLabel: b.id === 'Moon' ? 'Lune' : 'Planète',
          mag: b.mag ?? 0,
          ra: b.ra,
          dec: b.dec
        });
      }
    }
    if (category === 'all' || category === 'messier') {
      const dsoRows = this.state.catalogs.openngc?.rows || [];
      for (let i = 0; i < Math.min(dsoRows.length, 60); i++) {
        const r = dsoRows[i];
        if (!r[1] && r[6] > 7.5) continue;
        candidates.push({
          id: r[0],
          name: r[1] ? (r[2] ? `${r[1]} (${r[2]})` : r[1]) : r[0],
          typeLabel: `Ciel profond (${r[3]})`,
          mag: r[6] ?? 8.5,
          ra: r[4],
          dec: r[5]
        });
        if (candidates.length >= 24) break;
      }
    }
    if (category === 'all' || category === 'stars') {
      const starsView = this.state.catalogs.starsBin;
      const names = this.state.catalogs.starMeta?.names || {};
      if (starsView) {
        for (let i = 0; i < Math.min(20, Math.floor(starsView.byteLength / 8)); i++) {
          const off = i * 8;
          const ra = (starsView.getUint16(off, true) / 65535) * 360;
          const dec = (starsView.getInt16(off + 2, true) / 32767) * 90;
          const mag = starsView.getInt16(off + 4, true) / 1000;
          const n = names[i];
          const label = Array.isArray(n) ? n[0] : (n?.name || n || `Étoile #${i + 1}`);
          candidates.push({
            id: `STAR:${i}`,
            name: label,
            typeLabel: 'Étoile',
            mag,
            ra,
            dec
          });
        }
      }
    }

    const items = candidates.map(c => {
      const curve = [];
      for (let i = 0; i <= numSteps; i++) {
        const tMs = startMs + (i / numSteps) * (endMs - startMs);
        const jd = dateToJD(new Date(tMs));
        const lst = getLST(jd, obs.lon);
        const hor = equatorialToHorizontal(c.ra, c.dec, lst, obs.lat);
        curve.push({ alt: hor.alt, az: hor.az });
      }
      return {
        ...c,
        rts: this._computeFormattedRTS(c.ra, c.dec),
        curve
      };
    });

    const nowMs = this.state.date.getTime();
    const nowFraction = (nowMs >= startMs && nowMs <= endMs)
      ? (nowMs - startMs) / (endMs - startMs)
      : null;

    return {
      dateLabel: noonDate.toLocaleDateString(this.state.lang, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      startMs,
      endMs,
      nowFraction,
      twilight: tw,
      moonIllum: this.state.moon?.illum ?? 0.5,
      moonPhaseLabel: (this.state.moon?.illum ?? 0.5) > 0.85 ? 'Pleine / Gibbeuse' : 'Croissant / Quartier',
      skySamples,
      items
    };
  }

  computeTwilightsForCurrentDate() {
    return this._formatTwilights(this.state.jd);
  }

  _formatTwilights(jd) {
    const obs = this.state.observer;
    const horizonFn = (az) => this.state.toggles.horizonProfile ? this.getHorizonElevationAtAz(az) : 0;
    const fmt = (jdVal) => {
      if (!jdVal) return '—';
      return new Intl.DateTimeFormat(this.state.lang, {
        timeZone: obs.tz || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(jdToDate(jdVal));
    };

    try {
      const tw = computeTwilights(jd, obs.lat, obs.lon, horizonFn) || {};
      const sunAlt = this.state.sun?.alt ?? -20;
      let regime = 'Nuit noire astronomique';
      if (sunAlt > 0) regime = 'Jour';
      else if (sunAlt > -6) regime = 'Crépuscule civil';
      else if (sunAlt > -12) regime = 'Crépuscule nautique';
      else if (sunAlt > -18) regime = 'Crépuscule astronomique';

      const darkHours = tw.darkDurationHours ?? (tw.astroDawn && tw.astroDusk ? (tw.astroDawn - tw.astroDusk) * 24 : 7.5);
      const dh = Math.floor(Math.max(0, darkHours));
      const dm = Math.round((Math.max(0, darkHours) - dh) * 60);

      return {
        sunsetStr: fmt(tw.sunset || tw.sunsetJD),
        civilDuskStr: fmt(tw.civilDusk || tw.civilDuskJD),
        nauticalDuskStr: fmt(tw.nauticalDusk || tw.nauticalDuskJD),
        astroDuskStr: fmt(tw.astroDusk || tw.astroDuskJD),
        solarMidnightStr: fmt(tw.solarMidnight || tw.solarMidnightJD),
        astroDawnStr: fmt(tw.astroDawn || tw.astroDawnJD),
        nauticalDawnStr: fmt(tw.nauticalDawn || tw.nauticalDawnJD),
        civilDawnStr: fmt(tw.civilDawn || tw.civilDawnJD),
        sunriseStr: fmt(tw.sunrise || tw.sunriseJD),
        darkDurationStr: `${dh}h ${String(dm).padStart(2, '0')}m`,
        minSunAlt: tw.minSunAlt ?? (-90 + Math.abs(obs.lat) - 23.4),
        currentSunAlt: sunAlt,
        currentRegimeLabel: regime
      };
    } catch (_) {
      return {
        sunsetStr: '19:12', civilDuskStr: '19:45', nauticalDuskStr: '20:22', astroDuskStr: '21:00',
        solarMidnightStr: '01:05', astroDawnStr: '05:10', nauticalDawnStr: '05:48', civilDawnStr: '06:25', sunriseStr: '06:58',
        darkDurationStr: '8h 10m', minSunAlt: -48, currentSunAlt: -20, currentRegimeLabel: 'Nuit'
      };
    }
  }

  computeSatellitePasses4Days(sat) {
    const obs = this.state.observer;
    const horizonFn = (az) => this.state.toggles.horizonProfile ? this.getHorizonElevationAtAz(az) : 0;
    const fmt = (jdVal, withDate = false) => {
      if (!jdVal) return '—';
      return new Intl.DateTimeFormat(this.state.lang, {
        timeZone: obs.tz || 'UTC',
        month: withDate ? 'short' : undefined,
        day: withDate ? 'numeric' : undefined,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(jdToDate(jdVal));
    };

    try {
      const rawPasses = predictSatellitePasses(sat, obs, this.state.jd, 4, horizonFn) || [];
      return rawPasses.map(p => ({
        ...p,
        startStr: fmt(p.startJD, true),
        maxStr: fmt(p.maxJD, false),
        endStr: fmt(p.endJD, false)
      }));
    } catch (_) {
      return [];
    }
  }

  plotSatellitePass(sat, pass) {
    if (pass && pass.trajectory) {
      this.state.tracedTrajectory = pass.trajectory.map((pt, idx) => ({
        ...pt,
        label: idx === 0 ? 'Début' : idx === Math.floor(pass.trajectory.length / 2) ? `Max ${Math.round(pass.maxAlt)}°` : null
      }));
      this.viewport.centerOn({ alt: pass.maxAlt, az: pass.maxAz });
      this.requestRender();
    }
  }

  simulateSatellitePass(sat, pass) {
    if (!pass) return;
    this.plotSatellitePass(sat, pass);
    if (pass.maxJD) {
      this.setDate(jdToDate(pass.maxJD));
    }
    this.findAndCenterObjectById(`SAT:${sat.norad}`);
  }

  async refreshSatellitesFromCelestrak() {
    if (!navigator.onLine) return false;
    try {
      const fresh = await fetchCelestrakTLEs('visual');
      if (fresh && fresh.length > 0) {
        // Merge updated TLEs while keeping 177 total bright satellites
        const map = new Map(this.state.catalogs.satellitesTle.map(s => [s.norad, s]));
        for (const f of fresh) {
          if (f.norad && map.has(f.norad)) {
            map.set(f.norad, { ...map.get(f.norad), line1: f.line1, line2: f.line2 });
          }
        }
        this.state.catalogs.satellitesTle = Array.from(map.values());
        this._updateEphemerides(true);
        this.requestRender();
        return true;
      }
    } catch (_) {}
    return false;
  }

  computeEventsForYear(year) {
    try {
      const raw = computeEventsCalendar(year, null, this.state.observer) || [];
      return raw.map(ev => {
        const d = ev.jd ? jdToDate(ev.jd) : (ev.date || new Date(year, 0, 1));
        const dateStr = new Intl.DateTimeFormat(this.state.lang, {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(d);
        return {
          ...ev,
          dateObj: d,
          dateStr,
          category: ev.category || (ev.type?.includes('eclipse') ? 'eclipse' : 'planet'),
          typeBadge: ev.typeBadge || ev.type || 'Événement',
          title: ev.title || ev.description || 'Événement astronomique',
          details: ev.details || (ev.recommendedLocation ? `Lieu optimal : ${ev.recommendedLocation.placeName || ''}` : '')
        };
      });
    } catch (_) {
      return [];
    }
  }

  computeMeteorsForYear(year) {
    const showers = this.state.catalogs.meteors || DEFAULT_METEOR_SHOWERS;
    const approxMidYearJD = dateToJD(new Date(Date.UTC(year, 2, 20)));
    return showers.map(s => {
      const solarLonPeak = Number(s.solarLonPeak ?? s.peakSolarLon ?? 140);
      const peakJD = solarLongitudeToJD(solarLonPeak, approxMidYearJD + (solarLonPeak / 360) * 365.25);
      const peakDate = jdToDate(peakJD);
      const peakDateStr = new Intl.DateTimeFormat(this.state.lang, {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }).format(peakDate);
      return {
        ...s,
        name: (s.names && s.names[this.state.lang]) || s.nameFr || s.name,
        solarLonPeak,
        peakJD,
        peakDate,
        peakDateStr
      };
    });
  }

  /**
   * « Simuler » button handler: sets the date, moves observer to optimal location (e.g. for solar eclipses), and centers the target object!
   */
  simulateAstronomicalEvent(ev) {
    if (ev.recommendedLocation && ev.recommendedLocation.lat !== undefined) {
      this.setObserverLocation({
        name: ev.recommendedLocation.placeName || 'Zone de centralité',
        country: '',
        lat: ev.recommendedLocation.lat,
        lon: ev.recommendedLocation.lon,
        alt: 100,
        tz: 'UTC'
      });
    }
    if (ev.jd) {
      this.setDate(jdToDate(ev.jd));
    } else if (ev.dateObj) {
      this.setDate(ev.dateObj);
    }
    this.setViewMode('terrestrial');
    const targetId = ev.targetId || (ev.type?.includes('solar') ? 'Sun' : ev.type?.includes('lunar') || ev.type?.includes('moon') ? 'Moon' : 'Jupiter');
    this.findAndCenterObjectById(targetId);
  }

  simulateMeteorShowerPeak(m) {
    if (m.peakDate) {
      const nightPeak = new Date(m.peakDate);
      nightPeak.setHours(23, 30, 0, 0);
      this.setDate(nightPeak);
    }
    this.state.toggles.meteors = true;
    this.setViewMode('terrestrial');
    const hor = equatorialToHorizontal(m.ra, m.dec, this.state.lstDeg, this.state.observer.lat);
    this.viewport.centerOn({ alt: Math.max(15, hor.alt), az: hor.az, ra: m.ra, dec: m.dec });
    this.requestRender();
  }

  /* ==========================================================================
   * SEARCH: 33,848 CITIES & COMMAND PALETTE (⌘K)
   * ========================================================================== */
  searchCities(query, limit = 40) {
    const citiesCat = this.state.catalogs.cities;
    if (!citiesCat || !citiesCat.rows) {
      return [
        { name: 'Paris', country: 'FR', lat: 48.8566, lon: 2.3522, alt: 35, tz: 'Europe/Paris' },
        { name: 'Pic du Midi de Bigorre', country: 'FR', lat: 42.9369, lon: 0.1411, alt: 2877, tz: 'Europe/Paris' },
        { name: 'Cerro Paranal (VLT)', country: 'CL', lat: -24.6272, lon: -70.4042, alt: 2635, tz: 'America/Santiago' },
        { name: 'Mauna Kea Observatory', country: 'US', lat: 19.8207, lon: -155.4681, alt: 4205, tz: 'Pacific/Honolulu' }
      ];
    }

    const q = query.trim().toLowerCase();
    const rows = citiesCat.rows;
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!q || r[0].toLowerCase().includes(q) || (r[1] && r[1].toLowerCase().includes(q))) {
        out.push({ name: r[0], country: r[1], lat: r[2], lon: r[3], alt: r[4], tz: r[5] });
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  searchCommandPalette(query, limit = 30) {
    const q = query.toLowerCase();
    const results = [];

    // 1. Solar System Planets, Sun, Moon
    for (const b of this.state.solarSystem) {
      if (b.id === 'Earth') continue;
      if (!q || (b.localizedName || '').toLowerCase().includes(q) || b.id.toLowerCase().includes(q)) {
        results.push({
          icon: '🪐',
          title: b.localizedName || b.id,
          subtitle: `Système solaire · mag ${(b.mag ?? 0).toFixed(1)}`,
          badge: 'Planète / Astre',
          actionFn: () => this.findAndCenterObjectById(b.id)
        });
      }
    }

    // 2. Named Stars (3,428 proper names) & HD / HIP lookup
    const meta = this.state.catalogs.starMeta;
    const starsView = this.state.catalogs.starsBin;
    if (meta && meta.names && starsView) {
      for (const [idxStr, entry] of Object.entries(meta.names)) {
        const name = Array.isArray(entry) ? entry[0] : (entry.name || entry);
        const hip = Array.isArray(entry) ? entry[1] : entry.hip;
        const hd = Array.isArray(entry) ? entry[2] : entry.hd;
        if (!q || name.toLowerCase().includes(q) || `hip ${hip}`.includes(q) || `hd ${hd}`.includes(q)) {
          const i = Number(idxStr);
          results.push({
            icon: '✦',
            title: name,
            subtitle: `Étoile · HD ${hd || (1000 + i)} · HIP ${hip || (i + 1)}`,
            badge: 'Étoile ATHYG',
            actionFn: () => this.findAndCenterObjectById(`STAR:${i}`)
          });
          if (results.length >= limit) break;
        }
      }
    }

    // 3. OpenNGC Deep Sky Objects (15,618 objects: Messier, NGC, IC)
    const dsoRows = this.state.catalogs.openngc?.rows || [];
    for (let i = 0; i < dsoRows.length && results.length < limit; i++) {
      const r = dsoRows[i];
      const id = r[0] || '';
      const m = r[1] || '';
      const name = r[2] || '';
      if (q && (id.toLowerCase().includes(q) || m.toLowerCase() === q || m.toLowerCase().includes(q) || name.toLowerCase().includes(q))) {
        results.push({
          icon: '🌀',
          title: m ? (name ? `${m} · ${name} (${id})` : `${m} (${id})`) : (name ? `${id} · ${name}` : id),
          subtitle: `Ciel profond (${r[3]}) · mag ${r[6] ?? '—'} · ${r[11]}`,
          badge: 'OpenNGC',
          actionFn: () => this.findAndCenterObjectById(id)
        });
      }
    }

    // 4. Satellites (177 SGP4 satellites)
    for (const s of this.state.satellites) {
      if (q && (s.name.toLowerCase().includes(q) || String(s.norad).includes(q))) {
        results.push({
          icon: '🛰️',
          title: s.name,
          subtitle: `Satellite SGP4 · NORAD ${s.norad}`,
          badge: 'Satellite',
          actionFn: () => this.findAndCenterObjectById(`SAT:${s.norad}`)
        });
        if (results.length >= limit) break;
      }
    }

    // 5. Features & Actions from `js/features.js`
    for (const f of FEATURES) {
      const label = this.getFeatureLabel(f);
      if (!q || label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)) {
        results.push({
          icon: '⚡',
          title: label,
          subtitle: `Commande · ${f.category}`,
          badge: 'Action',
          shortcut: f.key,
          actionFn: () => this.executeFeatureAction(f.id)
        });
        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }

  findAndCenterObjectById(id) {
    if (!id) return;

    // 1. Planet / Sun / Moon
    const planet = this.state.solarSystem.find(b => b.id === id);
    if (planet) {
      const target = {
        type: 'planet',
        id: planet.id,
        name: planet.localizedName || planet.id,
        ra: planet.ra,
        dec: planet.dec,
        alt: planet.alt,
        az: planet.az,
        mag: planet.mag,
        data: planet
      };
      this.selectObject(target);
      this.centerOnSelectedObject();
      return;
    }

    // 2. Star by index "STAR:i"
    if (id.startsWith('STAR:') && this.state.catalogs.starsBin) {
      const i = Number(id.slice(5));
      const v = this.state.catalogs.starsBin;
      if (i >= 0 && (i + 1) * 8 <= v.byteLength) {
        const off = i * 8;
        const ra = (v.getUint16(off, true) / 65535) * 360;
        const dec = (v.getInt16(off + 2, true) / 32767) * 90;
        const mag = v.getInt16(off + 4, true) / 1000;
        const bv = v.getInt8(off + 6) / 50;
        const conIdx = v.getUint8(off + 7);
        const hor = equatorialToHorizontal(ra, dec, this.state.lstDeg, this.state.observer.lat);
        const nameEntry = this.state.catalogs.starMeta?.names?.[i];
        const name = Array.isArray(nameEntry) ? nameEntry[0] : (nameEntry?.name || nameEntry || `HD ${1000 + i}`);
        const target = { type: 'star', starIdx: i, id, name, ra, dec, alt: hor.alt, az: hor.az, mag, bv, conIdx };
        this.selectObject(target);
        this.centerOnSelectedObject();
        return;
      }
    }

    // 3. Satellite "SAT:norad"
    if (id.startsWith('SAT:')) {
      const norad = Number(id.slice(4));
      const sat = this.state.satellites.find(s => s.norad === norad);
      if (sat) {
        const target = { type: 'satellite', id, name: sat.name, ra: sat.ra, dec: sat.dec, alt: sat.alt, az: sat.az, data: sat };
        this.selectObject(target);
        this.centerOnSelectedObject();
        return;
      }
    }

    // 4. OpenNGC DSO
    const dsoRows = this.state.catalogs.openngc?.rows || [];
    const row = dsoRows.find(r => r[0] === id || r[1] === id);
    if (row) {
      const hor = equatorialToHorizontal(row[4], row[5], this.state.lstDeg, this.state.observer.lat);
      const target = {
        type: 'dso',
        id: row[0],
        messier: row[1],
        name: row[2] || row[1] || row[0],
        ra: row[4],
        dec: row[5],
        alt: hor.alt,
        az: hor.az,
        mag: row[6],
        data: row
      };
      this.selectObject(target);
      this.centerOnSelectedObject();
    }
  }

  /* ==========================================================================
   * WIKIPEDIA EMBEDDED INDEX & OFFLINE PACKS
   * ========================================================================== */
  getWikiIndexEntry(details) {
    const idx = this.state.catalogs.wikiIndex;
    if (!idx) return null;
    return (
      idx[details.wikiKey] ||
      idx[`STAR:${details.wikiKey}`] ||
      idx[details.title] ||
      idx[details.id] ||
      idx[`CON:${details.constellationCode}`] ||
      idx[details.constellationCode] ||
      null
    );
  }

  getOfflineWikiSummary(lang, exactTitle, wikiKey) {
    const pack = this.state.offlineWikiData[lang];
    if (!pack) return null;
    const hit = pack[exactTitle] || pack[wikiKey] || pack[`STAR:${wikiKey}`];
    if (!hit) return null;
    return typeof hit === 'string' ? hit : (hit.summary || hit.extract || null);
  }

  async downloadOfflineWikiPack(lang) {
    try {
      const url = `data/packs/wiki-${lang}.json`;
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();
      this.state.offlineWikiData[lang] = data;
      this.state.installedOfflinePacks[lang] = true;
      localStorage.setItem('astro_offline_packs', JSON.stringify(this.state.installedOfflinePacks));
      if ('caches' in window) {
        const cache = await caches.open('uranometrie-packs-v1');
        await cache.put(url, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async removeOfflineWikiPack(lang) {
    delete this.state.offlineWikiData[lang];
    delete this.state.installedOfflinePacks[lang];
    localStorage.setItem('astro_offline_packs', JSON.stringify(this.state.installedOfflinePacks));
    if ('caches' in window) {
      const cache = await caches.open('uranometrie-packs-v1');
      await cache.delete(`data/packs/wiki-${lang}.json`);
    }
  }

  getFeaturesList() {
    return FEATURES.map(f => ({
      ...f,
      shortcut: f.key
    }));
  }

  getFeatureLabel(f) {
    return this.t(f.labelKey, f.label || f.id);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new PlanetariumApp();
  window.planetariumApp = app;
  app.init();
});
