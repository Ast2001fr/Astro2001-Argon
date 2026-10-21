/**
 * js/ui/panels.js
 * Complete suite of interactive panels for the Web Planetarium:
 * - Visibilité — nuit prochaine (Altitude curves Frise / Tableau, summary banner, true night band, "now" marker, prev/next night)
 * - Crépuscules (Dedicated civil, nautical, astronomical twilight panel)
 * - Météo (Open-Meteo hourly cloud cover today + tomorrow; silent when offline)
 * - ISS et 177 satellites (4-day pass predictions, visible/day/eclipsed tags, trajectory plot, Simuler, Celestrak TLE refresh)
 * - Éclipses, 13 essaims de météores (solar longitude peaks) & calendrier d'événements ("Simuler" sets date, location & centers object)
 * - Choix du lieu (33,848 cities search, GPS, manual lat/lon/alt)
 * - Mon horizon (4 cardinal + intercardinal obstruction profile shifting rise/set times & drawing relief)
 * - Télescope et oculaires (12 brands / 78 models / 10 eyepieces + manual focal lengths)
 * - Hors ligne (PWA Service Worker + optional Wikipedia packs with disk quota check)
 * - Palette de commandes (⌘K / Ctrl-K) & Manuel utilisateur
 */

export class PanelsUI {
  constructor(app) {
    this.app = app;
    this.modalOverlay = document.getElementById('modal-overlay');
    this.modalTitle = document.getElementById('modal-title');
    this.modalBody = document.getElementById('modal-body');
    this.activePanelId = null;

    // Tonight visibility panel state
    this.tonightDayOffset = 0;
    this.tonightMode = 'frise'; // 'frise' | 'tableau'
    this.tonightCategory = 'all';

    // Events panel state
    this.eventsYear = new Date().getFullYear();
    this.eventsTab = 'calendar'; // 'calendar' | 'eclipses' | 'meteors'

    // Satellites panel state
    this.selectedSatNorad = 25544; // ISS (ZARYA)
    this.satSearchQuery = '';

    // Weather cache (keyed by "lat,lon")
    this.weatherCache = new Map();

    this._bindGlobalModalEvents();
  }

  _bindGlobalModalEvents() {
    document.getElementById('modal-close')?.addEventListener('click', () => this.closePanel());
    document.getElementById('modal-close-btn')?.addEventListener('click', () => this.closePanel());
    document.getElementById('drawer-fold-btn')?.addEventListener('click', () => this.closePanel());
  }

  t(key, fallback) {
    return this.app.t ? this.app.t(key, fallback) : (fallback || key);
  }

  _syncRailActiveState() {
    document.querySelectorAll('.rail-btn[data-panel], .rail-btn[data-open-panel]').forEach(btn => {
      const pid = btn.getAttribute('data-panel') || btn.getAttribute('data-open-panel');
      const isMatch = pid === this.activePanelId ||
        (pid === 'tonight' && ['tonight', 'twilight', 'weather', 'events', 'satellites'].includes(this.activePanelId)) ||
        (pid === 'location' && ['location', 'horizon'].includes(this.activePanelId));
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
  }

  openPanel(panelId, forceOpen = false) {
    if (!this.modalOverlay || !this.modalBody) return;
    if (!forceOpen && this.activePanelId === panelId && !this.modalOverlay.classList.contains('hidden')) {
      this.closePanel();
      return;
    }
    this.activePanelId = panelId;
    this.modalOverlay.classList.remove('hidden');
    this._syncRailActiveState();

    switch (panelId) {
      case 'tonight':
        this.renderTonightPanel();
        break;
      case 'layers':
        this.renderLayersPanel();
        break;
      case 'twilight':
        this.renderTwilightPanel();
        break;
      case 'weather':
        this.renderWeatherPanel();
        break;
      case 'satellites':
        this.renderSatellitesPanel();
        break;
      case 'events':
        this.renderEventsPanel();
        break;
      case 'location':
        this.renderLocationPanel();
        break;
      case 'horizon':
        this.renderHorizonPanel();
        break;
      case 'telescope':
        this.renderTelescopePanel();
        break;
      case 'offline':
        this.renderOfflinePanel();
        break;
      case 'manual':
        this.renderManualPanel();
        break;
      default:
        break;
    }
  }

  closePanel() {
    this.activePanelId = null;
    this.modalOverlay?.classList.add('hidden');
    this._syncRailActiveState();
  }

  /* ==========================================================================
   * 0. PANNEAU « CALQUES & PROFILS » (Découvrir, Observer, Cartographier + Fond DSS2/Intégré)
   * ========================================================================== */
  renderLayersPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.layersTitle', 'Calques & Profils d’affichage');

    const toggles = this.app.state.toggles;
    const activeProfile = this.app.state.activeLayerProfile || this.app.state.activeProfile || 'observe';
    const dssOn = !!toggles.dssHips;
    const mwBri = Math.round((this.app.state.milkyWayBrightness ?? 1.0) * 100);

    const profiles = [
      {
        id: 'discover',
        title: 'Découvrir',
        sub: 'Œil nu & repérage',
        desc: 'Le ciel tel qu’on le voit à l’œil nu : figures des constellations, Voie lactée, planètes et astres brillants.'
      },
      {
        id: 'observe',
        title: 'Observer',
        sub: 'Soirée à l’instrument',
        desc: 'Ciel profond au complet, étoiles doubles (WDS) et variables (GCVS), essaims, astéroïdes et satellites.'
      },
      {
        id: 'chart',
        title: 'Cartographier',
        sub: 'Atlas de précision',
        desc: 'Grille équatoriale, limites officielles UAI des 88 constellations, écliptique, sans atmosphère.'
      }
    ];

    const layerGroups = [
      {
        group: 'Ciel & Catalogues',
        items: [
          { key: 'stars', label: 'Étoiles (ATHYG · 871 136)', kbd: 'S' },
          { key: 'dso', label: 'Ciel profond (OpenNGC · 15 618)', kbd: 'N' },
          { key: 'dsoPhotos', label: 'Photographies DSO (135)', kbd: 'I' },
          { key: 'doubleStars', label: 'Étoiles doubles (WDS · 3 309)', kbd: 'W' },
          { key: 'variableStars', label: 'Variables (GCVS · 882)', kbd: 'Y' },
          { key: 'milkyWay', label: 'Panorama Voie lactée', kbd: 'M' },
          { key: 'dssHips', label: 'Relevé photographique DSS2 (CDS)', kbd: 'D' }
        ]
      },
      {
        group: 'Constellations & Grilles',
        items: [
          { key: 'constellationLines', label: 'Figures des constellations', kbd: 'C' },
          { key: 'constellationNames', label: 'Noms des constellations', kbd: 'V' },
          { key: 'constellationBounds', label: 'Limites officielles UAI', kbd: 'B' },
          { key: 'gridAzimuthal', label: 'Grille azimutale (Alt/Az)', kbd: 'Z' },
          { key: 'gridEquatorial', label: 'Grille équatoriale (AD/Déc)', kbd: 'E' },
          { key: 'ecliptic', label: 'Ligne de l’écliptique', kbd: ',' }
        ]
      },
      {
        group: 'Système solaire, Satellites & Site',
        items: [
          { key: 'planets', label: 'Soleil, Lune & Planètes', kbd: 'P' },
          { key: 'realPlanetSizes', label: 'Tailles planétaires réelles / lisibles', kbd: 'U' },
          { key: 'asteroids', label: 'Astéroïdes brillants (8)', kbd: 'A' },
          { key: 'satellites', label: 'ISS & Satellites SGP4 (177)', kbd: 'O' },
          { key: 'meteors', label: 'Essaims de météores (13)', kbd: 'R' },
          { key: 'atmosphere', label: 'Atmosphère, crépuscule & Bortle', kbd: 'F' },
          { key: 'ground', label: 'Sol opaque', kbd: 'G' },
          { key: 'horizonProfile', label: 'Relief « Mon horizon »', kbd: 'H' },
          { key: 'cardinals', label: 'Points cardinaux', kbd: 'Q' }
        ]
      }
    ];

    this.modalBody.innerHTML = `
      <div class="drawer-section">
        <div class="drawer-sec-title">Trois profils expliqués</div>
        <div class="profile-cards-grid">
          ${profiles.map(p => `
            <button type="button" class="profile-card ${activeProfile === p.id ? 'active' : ''}" data-profile="${p.id}">
              <div class="profile-card-top">
                <strong>${p.title}</strong>
                <span>${p.sub}</span>
              </div>
              <p>${p.desc}</p>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="drawer-section">
        <div class="drawer-sec-title">Fond photographique du ciel</div>
        <div class="seg-control">
          <button type="button" class="seg-btn ${!dssOn ? 'active' : ''}" id="bg-mode-local">
            Intégré (Voie lactée + 135 photos · sans réseau)
          </button>
          <button type="button" class="seg-btn ${dssOn ? 'active' : ''}" id="bg-mode-dss">
            En ligne (Tuiles HiPS DSS2 couleur · CDS)
          </button>
        </div>
        <div class="slider-inline-row" style="margin-top:10px;">
          <span>Luminosité Voie lactée</span>
          <input type="range" id="mw-brightness-slider" min="0" max="150" step="5" value="${mwBri}">
          <span class="mono" id="mw-brightness-val">${mwBri}%</span>
        </div>
      </div>

      ${layerGroups.map(g => `
        <div class="drawer-section">
          <div class="drawer-sec-title">${g.group}</div>
          <div class="layer-tiles-grid">
            ${g.items.map(item => `
              <button type="button" class="layer-tile ${toggles[item.key] ? 'active' : ''}" data-layer-key="${item.key}">
                <span class="layer-tile-dot"></span>
                <span class="layer-tile-label">${item.label}</span>
                <kbd class="layer-tile-kbd">${item.kbd}</kbd>
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    `;

    this.modalBody.querySelectorAll('[data-profile]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.getAttribute('data-profile');
        this.app.applyLayerProfile(pid);
        this.renderLayersPanel();
      });
    });

    this.modalBody.querySelector('#bg-mode-local')?.addEventListener('click', () => {
      this.app.state.toggles.dssHips = false;
      this.app.state.toggles.milkyWay = true;
      this.app.state.toggles.dsoPhotos = true;
      this.app.syncToggleButtons();
      this.app.saveSettings();
      this.app.requestRender();
      this.renderLayersPanel();
    });

    this.modalBody.querySelector('#bg-mode-dss')?.addEventListener('click', () => {
      this.app.state.toggles.dssHips = true;
      this.app.syncToggleButtons();
      this.app.saveSettings();
      this.app.requestRender();
      this.renderLayersPanel();
    });

    this.modalBody.querySelector('#mw-brightness-slider')?.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      this.app.state.milkyWayBrightness = v / 100;
      const lbl = this.modalBody.querySelector('#mw-brightness-val');
      if (lbl) lbl.textContent = `${v}%`;
      this.app.saveSettings();
      this.app.requestRender();
    });

    this.modalBody.querySelectorAll('[data-layer-key]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-layer-key');
        this.app.toggleLayer(k);
        this.renderLayersPanel();
      });
    });
  }

  /* ==========================================================================
   * 1. PANNEAU « ÉPHÉMÉRIDES & VISIBILITÉ — NUIT PROCHAINE » (Frise / Tableau)
   * ========================================================================== */
  renderTonightPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.tonightTitle', 'Éphémérides & Visibilité — Cette nuit');

    const baseDate = new Date(this.app.state.date.getTime() + this.tonightDayOffset * 86400000);
    const nightData = this.app.computeTonightVisibilityData(baseDate, this.tonightCategory);
    const moonPct = Math.round(nightData.moonIllum * 100);
    const bortle = this.app.state.bortleClass || 4;
    const nightSentence = moonPct < 22
      ? `Une nuit idéale pour le ciel profond : Lune discrète (${moonPct}%), vraie nuit noire ${nightData.twilight.astroDuskStr} → ${nightData.twilight.astroDawnStr}.`
      : moonPct < 65
        ? `Une nuit partagée entre planètes et ciel profond : Lune à ${moonPct}% (${nightData.moonPhaseLabel}), nuit noire ${nightData.twilight.astroDuskStr} → ${nightData.twilight.astroDawnStr}.`
        : `Une nuit de Lune (${moonPct}%) et de planètes brillantes : privilégiez les amas ouverts, étoiles doubles et planètes.`;

    this.modalBody.innerHTML = `
      <div class="eph-subnav">
        <button class="eph-tab active" data-open-sub="tonight">La nuit</button>
        <button class="eph-tab" data-open-sub="twilight">Crépuscules</button>
        <button class="eph-tab" data-open-sub="weather">Conditions & Météo</button>
        <button class="eph-tab" data-open-sub="events">Éclipses & Calendrier</button>
        <button class="eph-tab" data-open-sub="satellites">Stations ISS & SGP4</button>
      </div>

      <div class="night-sentence-card">
        <div class="night-sentence-text">« ${nightSentence} »</div>
        <div class="night-sentence-meta">
          <span>Site : <strong>${this.app.state.observer.name}</strong></span>
          <span>·</span>
          <span>Bortle <strong>${bortle}</strong></span>
          <span>·</span>
          <span>Durée noire : <strong>${nightData.twilight.darkDurationStr}</strong></span>
        </div>
      </div>

      <div class="panel-toolbar">
        <div class="btn-group">
          <button class="btn-secondary" id="tonight-prev" title="Nuit précédente">‹ 1 j</button>
          <button class="btn-secondary" id="tonight-reset">${nightData.dateLabel}</button>
          <button class="btn-secondary" id="tonight-next" title="Nuit suivante">1 j ›</button>
        </div>
        <div class="btn-group">
          <select id="tonight-cat-select" class="select-input">
            <option value="all" ${this.tonightCategory === 'all' ? 'selected' : ''}>${t('tonight.catAll', 'Toutes les cibles')}</option>
            <option value="planets" ${this.tonightCategory === 'planets' ? 'selected' : ''}>${t('tonight.catPlanets', 'Planètes & Lune')}</option>
            <option value="messier" ${this.tonightCategory === 'messier' ? 'selected' : ''}>${t('tonight.catMessier', 'Ciel profond')}</option>
            <option value="stars" ${this.tonightCategory === 'stars' ? 'selected' : ''}>${t('tonight.catStars', 'Étoiles brillantes')}</option>
          </select>
          <button class="btn-toggle ${this.tonightMode === 'frise' ? 'active' : ''}" id="tonight-mode-frise">
            ${t('tonight.frise', 'Frise')}
          </button>
          <button class="btn-toggle ${this.tonightMode === 'tableau' ? 'active' : ''}" id="tonight-mode-tableau">
            ${t('tonight.tableau', 'Tableau')}
          </button>
        </div>
      </div>

      <!-- Bandeau résumé de la nuit -->
      <div class="tonight-summary-banner">
        <div class="summary-chip">
          <span class="chip-label">${t('twilight.sunset', 'Coucher du Soleil')}</span>
          <strong class="mono">${nightData.twilight.sunsetStr}</strong>
        </div>
        <div class="summary-chip highlight">
          <span class="chip-label">${t('tonight.trueNight', 'Vraie nuit noire')}</span>
          <strong class="mono">${nightData.twilight.astroDuskStr} → ${nightData.twilight.astroDawnStr}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('twilight.sunrise', 'Lever du Soleil')}</span>
          <strong class="mono">${nightData.twilight.sunriseStr}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('tonight.moonIllum', 'Lune')}</span>
          <strong>${moonPct}% (${nightData.moonPhaseLabel})</strong>
        </div>
      </div>

      ${this.tonightMode === 'frise' ? `
        <div class="tonight-chart-wrap">
          <canvas id="tonight-altitude-canvas" width="840" height="360"></canvas>
          <div class="tonight-legend">
            <span class="legend-item"><i class="swatch night-civil"></i> ${t('twilight.civil', 'Crépuscule civil')}</span>
            <span class="legend-item"><i class="swatch night-nautical"></i> ${t('twilight.nautical', 'Nautique')}</span>
            <span class="legend-item"><i class="swatch night-true"></i> ${t('tonight.trueNightBand', 'Bande de vraie nuit (<-18°)')}</span>
            <span class="legend-item"><i class="swatch now-line"></i> ${t('tonight.nowMarker', 'Repère « maintenant »')}</span>
          </div>
        </div>
      ` : `
        <div class="table-scroll">
          <table class="astro-table">
            <thead>
              <tr>
                <th>${t('table.object', 'Objet')}</th>
                <th>${t('table.type', 'Type')}</th>
                <th>${t('table.mag', 'Mag')}</th>
                <th>${t('objectCard.rise', 'Lever')}</th>
                <th>${t('objectCard.transit', 'Culmination')}</th>
                <th>${t('table.maxAlt', 'Hauteur max')}</th>
                <th>${t('objectCard.set', 'Coucher')}</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${nightData.items.map(item => `
                <tr>
                  <td><strong>${item.name}</strong></td>
                  <td><span class="badge-subtle">${item.typeLabel}</span></td>
                  <td class="mono">${item.mag !== undefined ? item.mag.toFixed(1) : '—'}</td>
                  <td class="mono">${item.rts.riseStr}</td>
                  <td class="mono">${item.rts.transitStr}</td>
                  <td class="mono"><strong>${item.rts.maxAltStr}</strong></td>
                  <td class="mono">${item.rts.setStr}</td>
                  <td>
                    <button class="btn-xs" data-select-obj="${item.id}">${t('actions.center', 'Centrer')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    this.modalBody.querySelector('#tonight-prev')?.addEventListener('click', () => {
      this.tonightDayOffset -= 1;
      this.renderTonightPanel();
    });
    this.modalBody.querySelector('#tonight-reset')?.addEventListener('click', () => {
      this.tonightDayOffset = 0;
      this.renderTonightPanel();
    });
    this.modalBody.querySelector('#tonight-next')?.addEventListener('click', () => {
      this.tonightDayOffset += 1;
      this.renderTonightPanel();
    });
    this.modalBody.querySelector('#tonight-cat-select')?.addEventListener('change', (e) => {
      this.tonightCategory = e.target.value;
      this.renderTonightPanel();
    });
    this.modalBody.querySelector('#tonight-mode-frise')?.addEventListener('click', () => {
      this.tonightMode = 'frise';
      this.renderTonightPanel();
    });
    this.modalBody.querySelector('#tonight-mode-tableau')?.addEventListener('click', () => {
      this.tonightMode = 'tableau';
      this.renderTonightPanel();
    });

    this.modalBody.querySelectorAll('[data-select-obj]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-select-obj');
        this.app.findAndCenterObjectById(id);
      });
    });

    this._bindEphSubnav();

    if (this.tonightMode === 'frise') {
      this._drawTonightAltitudeChart(nightData);
    }
  }

  _renderEphSubnav(activeId) {
    const tabs = [
      { id: 'tonight', label: 'La nuit' },
      { id: 'twilight', label: 'Crépuscules' },
      { id: 'weather', label: 'Météo 48 h' },
      { id: 'events', label: 'Éclipses & Calendrier' },
      { id: 'satellites', label: 'ISS & Satellites' }
    ];
    return `
      <div class="eph-subnav">
        ${tabs.map(tab => `
          <button class="eph-tab ${tab.id === activeId ? 'active' : ''}" data-open-sub="${tab.id}">${tab.label}</button>
        `).join('')}
      </div>
    `;
  }

  _bindEphSubnav() {
    this.modalBody.querySelectorAll('[data-open-sub]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-open-sub');
        if (target && target !== this.activePanelId) {
          this.openPanel(target, true);
        }
      });
    });
  }

  _drawTonightAltitudeChart(nightData) {
    const canvas = this.modalBody.querySelector('#tonight-altitude-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const padL = 44, padR = 24, padT = 22, padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const nightVision = this.app.state.theme === 'nocturne';

    ctx.clearRect(0, 0, w, h);

    const samples = nightData.skySamples;
    for (let i = 0; i < samples.length - 1; i++) {
      const s = samples[i];
      const x0 = padL + (i / (samples.length - 1)) * plotW;
      const x1 = padL + ((i + 1) / (samples.length - 1)) * plotW;
      let fill = '#244b82';
      if (nightVision) {
        fill = s.sunAlt < -18 ? '#0a0000' : s.sunAlt < -6 ? '#1c0402' : '#300805';
      } else if (s.sunAlt <= -18) {
        fill = '#050a16';
      } else if (s.sunAlt <= -12) {
        fill = '#0b152b';
      } else if (s.sunAlt <= -6) {
        fill = '#152547';
      } else if (s.sunAlt <= 0) {
        fill = '#2a3963';
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x0, padT, x1 - x0 + 1, plotH);
    }

    ctx.strokeStyle = nightVision ? 'rgba(200, 40, 30, 0.25)' : 'rgba(150, 185, 235, 0.18)';
    ctx.fillStyle = nightVision ? '#d95540' : '#9ab4d8';
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;

    for (let alt = 0; alt <= 90; alt += 15) {
      const y = padT + plotH * (1 - alt / 90);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      if (alt % 30 === 0) {
        ctx.fillText(`${alt}°`, 8, y + 4);
      }
    }

    samples.forEach((s, idx) => {
      if (idx % 4 === 0) {
        const x = padL + (idx / (samples.length - 1)) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        ctx.fillText(s.hourLabel, x - 14, h - 10);
      }
    });

    const palette = nightVision
      ? ['#ff4428', '#ff6848', '#ff8866', '#d9321e', '#ff9980', '#e05038', '#ffa890']
      : ['#ffd15c', '#5ce1ff', '#ff7e6b', '#7dffb3', '#d094ff', '#ffb86c', '#9ec5ff', '#ff85b3'];

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    nightData.items.slice(0, 10).forEach((item, idx) => {
      const col = palette[idx % palette.length];
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();

      let peakPt = null;
      let started = false;
      item.curve.forEach((pt, j) => {
        const x = padL + (j / (item.curve.length - 1)) * plotW;
        const y = padT + plotH * (1 - pt.alt / 90);
        if (pt.alt >= -2) {
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
          if (!peakPt || pt.alt > peakPt.alt) {
            peakPt = { x, y, alt: pt.alt };
          }
        } else {
          started = false;
        }
      });
      ctx.stroke();

      if (peakPt && peakPt.alt > 8) {
        ctx.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
        ctx.fillText(item.name, Math.min(padL + plotW - 65, Math.max(padL + 6, peakPt.x - 16)), Math.max(padT + 14, peakPt.y - 6));
      }
    });

    if (nightData.nowFraction !== null && nightData.nowFraction >= 0 && nightData.nowFraction <= 1) {
      const nowX = padL + nightData.nowFraction * plotW;
      ctx.strokeStyle = nightVision ? '#ff2211' : '#ff4d4d';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(nowX, padT);
      ctx.lineTo(nowX, padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = nightVision ? '#ff5540' : '#ff6b6b';
      ctx.font = '700 10.5px "IBM Plex Sans", system-ui, sans-serif';
      ctx.fillText(this.t('tonight.now', 'Maintenant'), Math.min(padL + plotW - 65, nowX + 5), padT + 14);
    }

    ctx.restore();

    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = w / rect.width;
      const mx = (e.clientX - rect.left) * scaleX;
      const frac = (mx - padL) / plotW;
      if (frac >= 0 && frac <= 1) {
        const targetTimeMs = nightData.startMs + frac * (nightData.endMs - nightData.startMs);
        this.app.setDate(new Date(targetTimeMs));
        this.renderTonightPanel();
      }
    };
  }

  /* ==========================================================================
   * 2. PANNEAU DÉDIÉ « CRÉPUSCULES » (Civil, Nautique, Astronomique)
   * ========================================================================== */
  renderTwilightPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.twilightTitle', 'Crépuscules — Civil, Nautique & Astronomique');

    const tw = this.app.computeTwilightsForCurrentDate();

    this.modalBody.innerHTML = `
      ${this._renderEphSubnav('twilight')}

      <div class="twilight-grid">
        <div class="twilight-card">
          <h4>${t('twilight.evening', 'Soir (Coucher → Nuit noire)')}</h4>
          <div class="obj-kv-list">
            <div class="obj-kv-row">
              <span>${t('twilight.sunset', 'Coucher du Soleil (0°)')}</span>
              <strong class="mono">${tw.sunsetStr}</strong>
            </div>
            <div class="obj-kv-row">
              <span>${t('twilight.civilDusk', 'Crépuscule civil (−6°)')}</span>
              <strong class="mono">${tw.civilDuskStr}</strong>
            </div>
            <div class="obj-kv-row">
              <span>${t('twilight.nauticalDusk', 'Crépuscule nautique (−12°)')}</span>
              <strong class="mono">${tw.nauticalDuskStr}</strong>
            </div>
            <div class="obj-kv-row highlight-row">
              <span>${t('twilight.astroDusk', 'Début vraie nuit astronomique (−18°)')}</span>
              <strong class="mono">${tw.astroDuskStr}</strong>
            </div>
          </div>
        </div>

        <div class="twilight-card">
          <h4>${t('twilight.morning', 'Matin (Nuit noire → Lever)')}</h4>
          <div class="obj-kv-list">
            <div class="obj-kv-row highlight-row">
              <span>${t('twilight.astroDawn', 'Fin vraie nuit astronomique (−18°)')}</span>
              <strong class="mono">${tw.astroDawnStr}</strong>
            </div>
            <div class="obj-kv-row">
              <span>${t('twilight.nauticalDawn', 'Aube nautique (−12°)')}</span>
              <strong class="mono">${tw.nauticalDawnStr}</strong>
            </div>
            <div class="obj-kv-row">
              <span>${t('twilight.civilDawn', 'Aube civile (−6°)')}</span>
              <strong class="mono">${tw.civilDawnStr}</strong>
            </div>
            <div class="obj-kv-row">
              <span>${t('twilight.sunrise', 'Lever du Soleil (0°)')}</span>
              <strong class="mono">${tw.sunriseStr}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="tonight-summary-banner" style="margin-top: 14px;">
        <div class="summary-chip">
          <span class="chip-label">${t('twilight.solarMidnight', 'Minuit solaire (anti-culmination)')}</span>
          <strong class="mono">${tw.solarMidnightStr} (${tw.minSunAlt.toFixed(1)}°)</strong>
        </div>
        <div class="summary-chip highlight">
          <span class="chip-label">${t('twilight.darkDuration', 'Durée de vraie nuit noire')}</span>
          <strong class="mono">${tw.darkDurationStr}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('twilight.currentSunAlt', 'Hauteur actuelle du Soleil')}</span>
          <strong class="mono">${tw.currentSunAlt.toFixed(2)}° (${tw.currentRegimeLabel})</strong>
        </div>
      </div>
    `;
    this._bindEphSubnav();
  }

  /* ==========================================================================
   * 3. PANNEAU « MÉTÉO » (Open-Meteo nébulosité horaire aujourd'hui + demain, silencieux hors ligne)
   * ========================================================================== */
  async renderWeatherPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.weatherTitle', 'Météo astronomique — Open-Meteo (48 h)');

    const obs = this.app.state.observer;
    const key = `${obs.lat.toFixed(2)},${obs.lon.toFixed(2)}`;

    if (!navigator.onLine && !this.weatherCache.has(key)) {
      this.modalBody.innerHTML = `
        ${this._renderEphSubnav('weather')}
        <div class="offline-quiet-notice">
          <p>${t('weather.offlineSilent', 'Mode hors ligne : les prévisions de nébulosité Open-Meteo reprendront automatiquement dès le retour de la connexion.')}</p>
        </div>
      `;
      this._bindEphSubnav();
      return;
    }

    this.modalBody.innerHTML = `
      ${this._renderEphSubnav('weather')}
      <p class="muted">${t('weather.loading', 'Récupération de la nébulosité horaire Open-Meteo…')}</p>
    `;
    this._bindEphSubnav();

    let data = this.weatherCache.get(key);
    if (!data) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${obs.lat.toFixed(4)}&longitude=${obs.lon.toFixed(4)}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,wind_speed_10m&forecast_days=2&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('open-meteo non-200');
        data = await res.json();
        this.weatherCache.set(key, data);
      } catch (_) {
        this.modalBody.innerHTML = `
          ${this._renderEphSubnav('weather')}
          <div class="offline-quiet-notice">
            <p>${t('weather.offlineSilent', 'Prévisions météo Open-Meteo indisponibles hors ligne.')}</p>
          </div>
        `;
        this._bindEphSubnav();
        return;
      }
    }

    const hourly = data.hourly || {};
    const times = hourly.time || [];
    const total = hourly.cloud_cover || [];
    const low = hourly.cloud_cover_low || [];
    const mid = hourly.cloud_cover_mid || [];
    const high = hourly.cloud_cover_high || [];
    const hum = hourly.relative_humidity_2m || [];

    const rowsHtml = times.slice(0, 48).map((iso, i) => {
      const hm = iso.slice(11, 16);
      const dayPart = iso.slice(5, 10);
      const cc = total[i] ?? 0;
      const qualClass = cc <= 20 ? 'good' : cc <= 55 ? 'fair' : 'poor';
      const qualLabel = cc <= 20
        ? t('weather.clear', 'Ciel clair')
        : cc <= 55
        ? t('weather.partial', 'Voiles')
        : t('weather.overcast', 'Couvert');
      return `
        <tr>
          <td class="mono">${dayPart} <strong>${hm}</strong></td>
          <td>
            <div class="cloud-bar-wrap">
              <div class="cloud-bar ${qualClass}" style="width: ${cc}%"></div>
              <span class="mono">${cc}%</span>
            </div>
          </td>
          <td class="mono">${low[i] ?? 0}% / ${mid[i] ?? 0}% / ${high[i] ?? 0}%</td>
          <td class="mono">${hum[i] ?? '—'}%</td>
          <td><span class="badge-detect ${qualClass}">${qualLabel}</span></td>
        </tr>
      `;
    }).join('');

    this.modalBody.innerHTML = `
      ${this._renderEphSubnav('weather')}
      <div class="tonight-summary-banner">
        <div class="summary-chip">
          <span class="chip-label">${t('location.place', 'Lieu observé')}</span>
          <strong>${obs.name} (${obs.lat.toFixed(2)}°, ${obs.lon.toFixed(2)}°)</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('weather.source', 'Source')}</span>
          <strong>Open-Meteo (${t('weather.todayTomorrow', 'Aujourd\'hui + Demain')})</strong>
        </div>
      </div>
      <div class="table-scroll" style="max-height: 440px;">
        <table class="astro-table">
          <thead>
            <tr>
              <th>${t('weather.hour', 'Heure')}</th>
              <th>${t('weather.totalCloud', 'Nébulosité')}</th>
              <th>${t('weather.layers', 'Basse/Moy/Haute')}</th>
              <th>${t('weather.humidity', 'Humid.')}</th>
              <th>${t('weather.quality', 'Ciel')}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
    this._bindEphSubnav();
  }

  /* ==========================================================================
   * 4. PANNEAU « ISS ET 177 SATELLITES » (Passages sur 4 jours + Celestrak)
   * ========================================================================== */
  renderSatellitesPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.satellitesTitle', 'ISS & 177 Satellites brillants (SGP4 — 4 jours)');

    const sats = this.app.state.catalogs.satellitesTle || [];
    const q = this.satSearchQuery.trim().toLowerCase();
    const filteredSats = q
      ? sats.filter(s => s.name.toLowerCase().includes(q) || String(s.norad).includes(q))
      : sats;

    const currentSat = sats.find(s => s.norad === this.selectedSatNorad) || sats[0];
    const passes = currentSat ? this.app.computeSatellitePasses4Days(currentSat) : [];

    this.modalBody.innerHTML = `
      ${this._renderEphSubnav('satellites')}

      <div class="panel-toolbar">
        <div class="btn-group" style="flex: 1;">
          <input type="text" id="sat-search-input" class="text-input" placeholder="${t('satellites.searchPlaceholder', 'Filtrer parmi les 177 satellites (ISS, HST, Tiangong, Starlink…)')}" value="${this.satSearchQuery}">
          <select id="sat-select" class="select-input" style="max-width: 240px;">
            ${filteredSats.map(s => `
              <option value="${s.norad}" ${s.norad === (currentSat?.norad) ? 'selected' : ''}>
                ${s.name} (#${s.norad})
              </option>
            `).join('')}
          </select>
        </div>
        <button class="btn-secondary" id="btn-refresh-tle">
          ↻ ${t('satellites.updateCelestrak', 'Celestrak TLE')}
        </button>
      </div>

      <div id="tle-status-msg" class="muted" style="margin-bottom: 8px; font-size: 12px;">
        ${sats.length} ${t('satellites.loadedCount', 'satellites brillants chargés en SGP4')} · ${currentSat ? currentSat.name : ''}
      </div>

      <div class="table-scroll" style="max-height: 410px;">
        <table class="astro-table">
          <thead>
            <tr>
              <th>${t('satellites.date', 'Début')}</th>
              <th>${t('satellites.maxTime', 'Max')}</th>
              <th>${t('satellites.maxElev', 'Élév.')}</th>
              <th>${t('satellites.azArc', 'Azimut')}</th>
              <th>${t('satellites.condition', 'État')}</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${passes.length === 0 ? `
              <tr><td colspan="6" class="muted">${t('satellites.noPasses', 'Aucun passage au-dessus de l\'horizon sur les 4 prochains jours.')}</td></tr>
            ` : passes.map((p, idx) => `
              <tr>
                <td class="mono">${p.startStr}</td>
                <td class="mono"><strong>${p.maxStr}</strong></td>
                <td class="mono"><strong>${p.maxAlt.toFixed(1)}°</strong></td>
                <td class="mono">${Math.round(p.startAz)}°→${Math.round(p.maxAz)}°→${Math.round(p.endAz)}°</td>
                <td>
                  <span class="sat-tag tag-${p.tag}">
                    ${p.tag === 'visible'
                      ? t('satellites.tagVisible', 'Visible')
                      : p.tag === 'daylight'
                      ? t('satellites.tagDay', 'Jour')
                      : t('satellites.tagEclipsed', 'Éclipsé')}
                  </span>
                </td>
                <td>
                  <button class="btn-xs" data-plot-pass="${idx}">${t('actions.trace', 'Tracer')}</button>
                  <button class="btn-xs primary" data-sim-pass="${idx}">${t('actions.simulate', 'Simuler')}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    this._bindEphSubnav();

    this.modalBody.querySelector('#sat-search-input')?.addEventListener('input', (e) => {
      this.satSearchQuery = e.target.value;
      const firstMatch = sats.find(s =>
        s.name.toLowerCase().includes(this.satSearchQuery.toLowerCase()) ||
        String(s.norad).includes(this.satSearchQuery)
      );
      if (firstMatch) this.selectedSatNorad = firstMatch.norad;
      this.renderSatellitesPanel();
      const input = this.modalBody.querySelector('#sat-search-input');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    this.modalBody.querySelector('#sat-select')?.addEventListener('change', (e) => {
      this.selectedSatNorad = Number(e.target.value);
      this.renderSatellitesPanel();
    });

    this.modalBody.querySelector('#btn-refresh-tle')?.addEventListener('click', async () => {
      const msgEl = this.modalBody.querySelector('#tle-status-msg');
      if (msgEl) msgEl.textContent = t('satellites.updating', 'Connexion à Celestrak en cours…');
      const updated = await this.app.refreshSatellitesFromCelestrak();
      if (msgEl) {
        msgEl.textContent = updated
          ? t('satellites.updateSuccess', 'TLE actualisés avec succès depuis Celestrak !')
          : t('satellites.updateFallback', 'Hors ligne ou Celestrak indisponible — utilisation des 177 TLE embarqués.');
      }
    });

    this.modalBody.querySelectorAll('[data-plot-pass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-plot-pass'));
        const pass = passes[idx];
        if (pass) {
          this.app.plotSatellitePass(currentSat, pass);
        }
      });
    });

    this.modalBody.querySelectorAll('[data-sim-pass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-sim-pass'));
        const pass = passes[idx];
        if (pass) {
          this.app.simulateSatellitePass(currentSat, pass);
        }
      });
    });
  }

  /* ==========================================================================
   * 5. PANNEAU « ÉCLIPSES, ESSAIMS DE MÉTÉORES & CALENDRIER D'ÉVÉNEMENTS »
   * ========================================================================== */
  renderEventsPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.eventsTitle', 'Éclipses, Essaims & Calendrier d\'événements');

    const events = this.app.computeEventsForYear(this.eventsYear);
    const meteors = this.app.computeMeteorsForYear(this.eventsYear);

    const filteredEvents = this.eventsTab === 'eclipses'
      ? events.filter(e => e.category === 'eclipse')
      : events;

    this.modalBody.innerHTML = `
      ${this._renderEphSubnav('events')}

      <div class="panel-toolbar">
        <div class="btn-group">
          <button class="btn-secondary" id="ev-prev-year">‹ ${this.eventsYear - 1}</button>
          <strong class="mono" style="padding: 6px 10px;">${this.eventsYear}</strong>
          <button class="btn-secondary" id="ev-next-year">${this.eventsYear + 1} ›</button>
        </div>
        <div class="btn-group">
          <button class="btn-toggle ${this.eventsTab === 'calendar' ? 'active' : ''}" id="ev-tab-cal">
            ${t('events.allEvents', 'Calendrier')}
          </button>
          <button class="btn-toggle ${this.eventsTab === 'eclipses' ? 'active' : ''}" id="ev-tab-ecl">
            ${t('events.eclipsesOnly', 'Éclipses')}
          </button>
          <button class="btn-toggle ${this.eventsTab === 'meteors' ? 'active' : ''}" id="ev-tab-met">
            ${t('events.meteorsTab', '13 Essaims')}
          </button>
        </div>
      </div>

      ${this.eventsTab === 'meteors' ? `
        <p class="muted" style="margin-bottom: 10px; font-size: 12px;">
          ${t('events.meteorsNote', 'Dates de pic des 13 essaims calculées par longitude solaire (λ☉) pour l\'année sélectionnée.')}
        </p>
        <div class="table-scroll" style="max-height: 410px;">
          <table class="astro-table">
            <thead>
              <tr>
                <th>${t('events.showerName', 'Essaim')}</th>
                <th>${t('events.solarLon', 'λ☉')}</th>
                <th>${t('events.peakDate', 'Pic')} (${this.eventsYear})</th>
                <th>${t('events.zhr', 'ZHR')}</th>
                <th>${t('events.radiant', 'Radiant')}</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${meteors.map((m, idx) => `
                <tr>
                  <td><strong>${m.name}</strong> <span class="muted">(${m.code})</span></td>
                  <td class="mono">${m.solarLonPeak.toFixed(1)}°</td>
                  <td class="mono"><strong>${m.peakDateStr}</strong></td>
                  <td class="mono"><strong>${m.zhr}/h</strong></td>
                  <td class="mono">${m.ra.toFixed(0)}° / ${m.dec >= 0 ? '+' : ''}${m.dec.toFixed(0)}°</td>
                  <td>
                    <button class="btn-xs primary" data-sim-meteor="${idx}">${t('actions.simulate', 'Simuler')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="table-scroll" style="max-height: 420px;">
          <table class="astro-table">
            <thead>
              <tr>
                <th>${t('events.date', 'Date & Heure')}</th>
                <th>${t('events.type', 'Type')}</th>
                <th>${t('events.event', 'Événement')}</th>
                <th>${t('events.details', 'Détails & Lieu')}</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${filteredEvents.map((ev, idx) => `
                <tr>
                  <td class="mono">${ev.dateStr}</td>
                  <td><span class="badge-subtle cat-${ev.category}">${ev.typeBadge}</span></td>
                  <td><strong>${ev.title}</strong></td>
                  <td>${ev.details}</td>
                  <td>
                    <button class="btn-xs primary" data-sim-event="${idx}">${t('actions.simulate', 'Simuler')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

    this._bindEphSubnav();

    this.modalBody.querySelector('#ev-prev-year')?.addEventListener('click', () => {
      this.eventsYear -= 1;
      this.renderEventsPanel();
    });
    this.modalBody.querySelector('#ev-next-year')?.addEventListener('click', () => {
      this.eventsYear += 1;
      this.renderEventsPanel();
    });
    this.modalBody.querySelector('#ev-tab-cal')?.addEventListener('click', () => {
      this.eventsTab = 'calendar';
      this.renderEventsPanel();
    });
    this.modalBody.querySelector('#ev-tab-ecl')?.addEventListener('click', () => {
      this.eventsTab = 'eclipses';
      this.renderEventsPanel();
    });
    this.modalBody.querySelector('#ev-tab-met')?.addEventListener('click', () => {
      this.eventsTab = 'meteors';
      this.renderEventsPanel();
    });

    this.modalBody.querySelectorAll('[data-sim-event]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-sim-event'));
        const ev = filteredEvents[idx];
        if (ev) {
          this.app.simulateAstronomicalEvent(ev);
        }
      });
    });

    this.modalBody.querySelectorAll('[data-sim-meteor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-sim-meteor'));
        const m = meteors[idx];
        if (m) {
          this.app.simulateMeteorShowerPeak(m);
        }
      });
    });
  }

  /* ==========================================================================
   * 6. PANNEAU « CHOIX DU LIEU & QUALITÉ DU CIEL (BORTLE 1–9) »
   * ========================================================================== */
  renderLocationPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.locationTitle', 'Lieu d\'observation & Qualité du ciel');

    const obs = this.app.state.observer;
    const totalCities = this.app.state.catalogs.cities?.rows?.length || 33848;
    const bortle = this.app.state.bortleClass || 4;
    const bortleLabels = {
      1: '1 · Excellent site noir (SQM 21.9)',
      2: '2 · Site vraiment noir (SQM 21.7)',
      3: '3 · Ciel rural (SQM 21.5)',
      4: '4 · Transition rurale/périurbaine (SQM 20.8)',
      5: '5 · Ciel périurbain (SQM 19.8)',
      6: '6 · Périurbain lumineux (SQM 19.1)',
      7: '7 · Transition périurbain/urbain (SQM 18.5)',
      8: '8 · Ciel urbain (SQM 18.0)',
      9: '9 · Cœur de métropole (SQM 17.3)'
    };

    this.modalBody.innerHTML = `
      <div class="eph-subnav">
        <button class="eph-tab active" data-loc-tab="location">Lieu & Ciel (Bortle)</button>
        <button class="eph-tab" data-loc-tab="horizon">Mon horizon (360° & PeakFinder)</button>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-title">Qualité du ciel nocturne — Échelle de Bortle (1–9)</div>
        <div class="bortle-bar">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(b => `
            <button class="bortle-step b-${b} ${b === bortle ? 'active' : ''}" data-bortle="${b}" title="${bortleLabels[b]}">${b}</button>
          `).join('')}
        </div>
        <div class="muted" style="font-size: 11.5px; margin-top: 6px;">
          Actif : <strong>Classe ${bortleLabels[bortle]}</strong> — ajuste la brillance du fond de ciel (Krisciunas & Schaefer 1991) et les verdicts de visibilité (Crumey 2014).
        </div>
      </div>

      <div class="location-grid">
        <div class="location-search-col">
          <h4>${t('location.searchCity', 'Rechercher parmi')} ${totalCities.toLocaleString()} ${t('location.cities', 'villes & observatoires')}</h4>
          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <input type="text" id="city-search-input" class="text-input" placeholder="${t('location.searchPlaceholder', 'Paris, Pic du Midi, Paranal, Montréal, Tokyo…')}">
            <button class="btn-secondary" id="btn-use-gps">GPS</button>
          </div>
          <div id="city-search-results" class="city-list-box"></div>
        </div>

        <div class="location-manual-col">
          <h4>${t('location.manualCoords', 'Coordonnées manuelles & Altitude')}</h4>
          <div class="form-group">
            <label>${t('location.name', 'Nom du lieu')}</label>
            <input type="text" id="loc-name-input" class="text-input" value="${obs.name}">
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('location.latitude', 'Latitude (° N+/S−)')}</label>
              <input type="number" step="0.0001" min="-90" max="90" id="loc-lat-input" class="text-input mono" value="${obs.lat}">
            </div>
            <div class="form-group">
              <label>${t('location.longitude', 'Longitude (° E+/O−)')}</label>
              <input type="number" step="0.0001" min="-180" max="180" id="loc-lon-input" class="text-input mono" value="${obs.lon}">
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('location.altitude', 'Altitude (m)')}</label>
              <input type="number" step="1" min="-400" max="9000" id="loc-alt-input" class="text-input mono" value="${obs.alt || 0}">
            </div>
            <div class="form-group">
              <label>${t('location.timezone', 'Fuseau horaire (IANA)')}</label>
              <input type="text" id="loc-tz-input" class="text-input mono" value="${obs.tz || 'Europe/Paris'}">
            </div>
          </div>
          <button class="btn-primary" id="btn-apply-location" style="width:100%; margin-top:10px;">
            ${t('location.apply', 'Appliquer ce lieu')}
          </button>
        </div>
      </div>
    `;

    this.modalBody.querySelector('[data-loc-tab="horizon"]')?.addEventListener('click', () => {
      this.openPanel('horizon');
    });

    this.modalBody.querySelectorAll('[data-bortle]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.app.state.bortleClass = Number(btn.getAttribute('data-bortle'));
        this.app.saveSettings();
        this.app.requestRender();
        if (this.app.state.selectedObject) {
          this.app.refreshSelectedObjectCard();
        }
        this.renderLocationPanel();
      });
    });

    const updateCityList = (query) => {
      const resultsEl = this.modalBody.querySelector('#city-search-results');
      if (!resultsEl) return;
      const matches = this.app.searchCities(query, 40);
      resultsEl.innerHTML = matches.map((c, idx) => `
        <div class="city-item" data-city-idx="${idx}">
          <div>
            <strong>${c.name}</strong> <span class="muted">(${c.country})</span>
          </div>
          <div class="mono muted">${c.lat.toFixed(2)}°, ${c.lon.toFixed(2)}° · ${c.alt}m · ${c.tz}</div>
        </div>
      `).join('');

      resultsEl.querySelectorAll('.city-item').forEach(el => {
        el.addEventListener('click', () => {
          const c = matches[Number(el.getAttribute('data-city-idx'))];
          if (c) {
            this.app.setObserverLocation(c);
            this.renderLocationPanel();
          }
        });
      });
    };

    updateCityList('');

    this.modalBody.querySelector('#city-search-input')?.addEventListener('input', (e) => {
      updateCityList(e.target.value);
    });

    this.modalBody.querySelector('#btn-use-gps')?.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const alt = Math.round(pos.coords.altitude || 50);
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        this.app.setObserverLocation({ name: 'Position GPS', country: '', lat, lon, alt, tz });
        this.renderLocationPanel();
      });
    });

    this.modalBody.querySelector('#btn-apply-location')?.addEventListener('click', () => {
      const name = this.modalBody.querySelector('#loc-name-input').value || 'Lieu personnalisé';
      const lat = parseFloat(this.modalBody.querySelector('#loc-lat-input').value) || 0;
      const lon = parseFloat(this.modalBody.querySelector('#loc-lon-input').value) || 0;
      const alt = parseFloat(this.modalBody.querySelector('#loc-alt-input').value) || 0;
      const tz = this.modalBody.querySelector('#loc-tz-input').value || 'UTC';
      this.app.setObserverLocation({ name, country: '', lat, lon, alt, tz });
    });
  }

  /* ==========================================================================
   * 7. PANNEAU « MON HORIZON » (Profil 360° + Règle graduée à bras tendu + PeakFinder)
   * ========================================================================== */
  renderHorizonPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.horizonTitle', 'Mon horizon — Masque d\'obstruction 360°');

    const hp = this.app.state.horizonProfile;

    this.modalBody.innerHTML = `
      <div class="eph-subnav">
        <button class="eph-tab" data-loc-tab="location">Lieu & Ciel (Bortle)</button>
        <button class="eph-tab active" data-loc-tab="horizon">Mon horizon (360° & PeakFinder)</button>
      </div>

      <p class="muted" style="margin-bottom: 10px; font-size: 12.5px;">
        ${t('horizon.description', 'Indiquez la hauteur angulaire (°) des obstacles autour de vous (arbres, bâtiments, relief). Ce profil dessine la silhouette sur le ciel ET décale l\'heure effective de lever et de coucher de tous les astres.')}
      </p>

      <!-- Règle graduée à bras tendu (Astro2001 tour) -->
      <div class="arm-ruler-banner">
        <span class="arm-ruler-title">Repère à bras tendu :</span>
        <button class="arm-chip" data-arm-deg="3" title="Appliquer 3° (2 doigts)">2 doigts ≈ <strong>3°</strong></button>
        <button class="arm-chip" data-arm-deg="5" title="Appliquer 5° (3 doigts)">3 doigts ≈ <strong>5°</strong></button>
        <button class="arm-chip" data-arm-deg="10" title="Appliquer 10° (1 poing fermé)">1 poing ≈ <strong>10°</strong></button>
        <button class="arm-chip" data-arm-deg="20" title="Appliquer 20° (main ouverte)">Empan ≈ <strong>20°</strong></button>
      </div>

      <div class="panel-toolbar" style="margin-top: 10px;">
        <div class="btn-group">
          <button class="btn-secondary" data-hz-preset="flat">${t('horizon.presetFlat', 'Plaine (0°)')}</button>
          <button class="btn-secondary" data-hz-preset="garden">${t('horizon.presetGarden', 'Jardin (8–15°)')}</button>
          <button class="btn-secondary" data-hz-preset="urban">${t('horizon.presetUrban', 'Cour urbaine (18–28°)')}</button>
          <button class="btn-secondary" data-hz-preset="alpine">${t('horizon.presetAlpine', 'Vallée alpine')}</button>
        </div>
        <label class="btn-secondary" style="cursor:pointer;">
          Importer PeakFinder (.txt)
          <input type="file" id="peakfinder-file-input" accept=".txt,.hor,.csv" style="display:none;">
        </label>
      </div>

      <div class="horizon-sliders-grid">
        ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map(dir => `
          <div class="hz-slider-card">
            <label><strong>${dir}</strong> (<span id="hz-val-${dir}" class="mono">${hp[dir] ?? 0}</span>°)</label>
            <input type="range" min="0" max="65" step="1" value="${hp[dir] ?? 0}" data-hz-dir="${dir}">
          </div>
        `).join('')}
      </div>

      <div class="tonight-chart-wrap" style="margin-top:12px;">
        <canvas id="horizon-preview-canvas" width="780" height="175"></canvas>
      </div>
    `;

    this.modalBody.querySelector('[data-loc-tab="location"]')?.addEventListener('click', () => {
      this.openPanel('location');
    });

    const drawPreview = () => {
      const c = this.modalBody.querySelector('#horizon-preview-canvas');
      if (!c) return;
      const ctx = c.getContext('2d');
      const w = c.width;
      const h = c.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#070c16';
      ctx.fillRect(0, 0, w, h);

      // Reference altitude lines at 10° (1 poing), 20° (empan), 40°
      ctx.strokeStyle = 'rgba(130, 165, 220, 0.16)';
      ctx.fillStyle = 'rgba(160, 190, 235, 0.55)';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      [10, 20, 40].forEach(deg => {
        const y = h - 24 - (deg / 70) * (h - 38);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillText(`${deg}° (${deg / 10} poing${deg > 10 ? 's' : ''})`, 8, y - 3);
      });

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) {
        const az = (x / w) * 360;
        const elev = this.app.getHorizonElevationAtAz(az);
        const y = h - 24 - (elev / 70) * (h - 38);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(26, 52, 42, 0.85)';
      ctx.fill();
      ctx.strokeStyle = '#52b788';
      ctx.lineWidth = 2;
      ctx.stroke();

      const dirs = [
        { az: 0, l: 'N' }, { az: 45, l: 'NE' }, { az: 90, l: 'E' }, { az: 135, l: 'SE' },
        { az: 180, l: 'S' }, { az: 225, l: 'SO' }, { az: 270, l: 'O' }, { az: 315, l: 'NO' }, { az: 360, l: 'N' }
      ];
      ctx.fillStyle = '#d8e8ff';
      ctx.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      dirs.forEach(d => {
        const x = (d.az / 360) * w;
        ctx.fillText(d.l, Math.min(w - 12, Math.max(12, x)), h - 6);
      });
    };

    drawPreview();

    this.modalBody.querySelectorAll('[data-hz-dir]').forEach(input => {
      input.addEventListener('input', () => {
        const dir = input.getAttribute('data-hz-dir');
        const val = Number(input.value);
        this.app.state.horizonProfile[dir] = val;
        const span = this.modalBody.querySelector(`#hz-val-${dir}`);
        if (span) span.textContent = String(val);
        this.app.saveSettings();
        this.app.requestRender();
        drawPreview();
      });
    });

    this.modalBody.querySelectorAll('[data-arm-deg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const deg = Number(btn.getAttribute('data-arm-deg'));
        ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach(d => {
          this.app.state.horizonProfile[d] = deg;
        });
        this.app.saveSettings();
        this.app.requestRender();
        this.renderHorizonPanel();
      });
    });

    this.modalBody.querySelectorAll('[data-hz-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-hz-preset');
        const presets = {
          flat: { N: 0, NE: 0, E: 0, SE: 0, S: 0, SW: 0, W: 0, NW: 0 },
          garden: { N: 14, NE: 10, E: 8, SE: 6, S: 5, SW: 9, W: 12, NW: 15 },
          urban: { N: 28, NE: 24, E: 20, SE: 16, S: 14, SW: 18, W: 25, NW: 26 },
          alpine: { N: 32, NE: 26, E: 18, SE: 12, S: 9, SW: 15, W: 28, NW: 35 }
        };
        if (presets[p]) {
          Object.assign(this.app.state.horizonProfile, presets[p]);
          this.app.saveSettings();
          this.app.requestRender();
          this.renderHorizonPanel();
        }
      });
    });

    this.modalBody.querySelector('#peakfinder-file-input')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split(/\r?\n/);
      const pairs = [];
      for (const line of lines) {
        const m = line.trim().match(/^(\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)/);
        if (m) pairs.push({ az: parseFloat(m[1]), alt: Math.max(0, parseFloat(m[2])) });
      }
      if (pairs.length >= 4) {
        const sampleAt = (targetAz) => {
          let best = pairs[0];
          let bestDiff = 999;
          for (const pt of pairs) {
            const diff = Math.abs(((pt.az - targetAz + 540) % 360) - 180);
            if (diff < bestDiff) {
              bestDiff = diff;
              best = pt;
            }
          }
          return Math.round(best.alt);
        };
        const mapDir = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
        for (const [k, az] of Object.entries(mapDir)) {
          this.app.state.horizonProfile[k] = sampleAt(az);
        }
        this.app.saveSettings();
        this.app.requestRender();
        this.renderHorizonPanel();
      }
    });
  }

  /* ==========================================================================
   * 8. PANNEAU « MATÉRIEL : TÉLESCOPE ET OCULAIRES » (12 marques / 78 modèles / 10 oculaires)
   * ========================================================================== */
  renderTelescopePanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.telescopeTitle', 'Matériel — Train optique & Oculaires');

    const telData = this.app.state.catalogs.telescopes || { brands: [], telescopes: [], eyepieces: [] };
    const allModels = telData.telescopes || telData.models || [];
    const cfg = this.app.state.telescopeConfig;
    const brands = telData.brands?.length ? telData.brands : [...new Set(allModels.map(m => m.brand))];
    const currentBrandModels = allModels.filter(m => m.brand === cfg.brand);
    const stats = this.app.computeOpticalStats();
    const orient = this.app.viewport.opticalOrientation || 'erect';
    const showFrame = !!this.app.state.toggles.showFieldFrame;

    this.modalBody.innerHTML = `
      <!-- Carte « Ce soir » du train optique actif -->
      <div class="rig-tonight-card">
        <div class="rig-tonight-head">
          <div>
            <span class="rig-badge">TRAIN OPTIQUE ACTIF</span>
            <h4>${cfg.brand} ${cfg.model} · Oculaire ${cfg.eyepieceFocalMm} mm (${cfg.eyepieceAfovDeg}°)${cfg.barlow !== 1 ? ` · Barlow ${cfg.barlow}×` : ''}</h4>
          </div>
          <label class="field-frame-toggle">
            <input type="checkbox" id="chk-show-field-frame" ${showFrame ? 'checked' : ''}>
            <span>Tracer sur le ciel</span>
          </label>
        </div>
        <div class="rig-metrics-row mono">
          <span><strong>${cfg.apertureMm}/${cfg.focalMm} mm</strong> (f/${stats.fRatio})</span>
          <span>→</span>
          <span class="accent"><strong>×${stats.magnification}</strong></span>
          <span>·</span>
          <span class="accent"><strong>${stats.tfovStr}</strong></span>
          <span>·</span>
          <span>pup. <strong>${stats.exitPupilMm} mm</strong></span>
          <span>·</span>
          <span>lim. <strong>mag ${stats.limitingMag}</strong></span>
          <span>·</span>
          <span>Dawes <strong>${stats.dawesArcsec}″</strong></span>
        </div>
      </div>

      <div class="location-grid" style="margin-top: 12px;">
        <div>
          <h4>${t('telescope.selectModel', 'Tube optique (12 marques · 78 modèles)')}</h4>
          <div class="form-group">
            <label>${t('telescope.brand', 'Marque')}</label>
            <select id="tel-brand-select" class="select-input" style="width:100%">
              ${brands.map(b => `<option value="${b}" ${b === cfg.brand ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${t('telescope.model', 'Modèle')}</label>
            <select id="tel-model-select" class="select-input" style="width:100%">
              ${currentBrandModels.map(m => `
                <option value="${m.id || m.model}" ${m.model === cfg.model ? 'selected' : ''}>
                  ${m.model} (${m.apertureMm}/${m.focalMm} mm · f/${(m.focalMm / m.apertureMm).toFixed(1)})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('telescope.apertureManual', 'Diamètre D (mm)')}</label>
              <input type="number" id="tel-diam-input" class="text-input mono" min="20" max="2000" value="${cfg.apertureMm}">
            </div>
            <div class="form-group">
              <label>${t('telescope.focalManual', 'Focale F (mm)')}</label>
              <input type="number" id="tel-focal-input" class="text-input mono" min="100" max="15000" value="${cfg.focalMm}">
            </div>
          </div>
        </div>

        <div>
          <h4>${t('telescope.selectEyepiece', 'Oculaire (10 modèles) & Barlow')}</h4>
          <div class="form-group">
            <label>${t('telescope.eyepiecePreset', 'Oculaire de référence')}</label>
            <select id="tel-ep-select" class="select-input" style="width:100%">
              ${telData.eyepieces.map((ep, idx) => `
                <option value="${idx}" ${ep.name === cfg.eyepieceName ? 'selected' : ''}>
                  ${ep.name} (${ep.focalMm} mm · ${ep.afovDeg}°)
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('telescope.epFocalManual', 'Focale oculaire (mm)')}</label>
              <input type="number" step="0.5" min="2" max="55" id="tel-ep-focal" class="text-input mono" value="${cfg.eyepieceFocalMm}">
            </div>
            <div class="form-group">
              <label>${t('telescope.epAfovManual', 'Champ apparent (°)')}</label>
              <input type="number" step="1" min="30" max="120" id="tel-ep-afov" class="text-input mono" value="${cfg.eyepieceAfovDeg}">
            </div>
          </div>
          <div class="form-group">
            <label>${t('telescope.barlow', 'Lentille de Barlow / Réducteur de focale')}</label>
            <select id="tel-barlow-select" class="select-input" style="width:100%">
              <option value="0.63" ${cfg.barlow === 0.63 ? 'selected' : ''}>0.63× (Réducteur SCT)</option>
              <option value="1" ${cfg.barlow === 1 ? 'selected' : ''}>1× (Sans Barlow)</option>
              <option value="1.5" ${cfg.barlow === 1.5 ? 'selected' : ''}>1.5× Barlow</option>
              <option value="2" ${cfg.barlow === 2 ? 'selected' : ''}>2× Barlow</option>
              <option value="3" ${cfg.barlow === 3 ? 'selected' : ''}>3× Barlow</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Orientation optique de l'image avec repère visuel R -->
      <div class="drawer-section" style="margin-top: 12px;">
        <div class="drawer-section-title">${t('telescope.orientation', 'Orientation de l\'image à l\'oculaire')}</div>
        <div class="orient-cards-grid">
          <button class="orient-card ${orient === 'erect' ? 'active' : ''}" data-orient="erect">
            <span class="orient-glyph">R</span>
            <strong>Droite</strong>
            <small>Jumelles / Prisme Amici</small>
          </button>
          <button class="orient-card ${orient === 'inverted' ? 'active' : ''}" data-orient="inverted">
            <span class="orient-glyph" style="transform: rotate(180deg);">R</span>
            <strong>Inversée 180°</strong>
            <small>Newton / Dobson</small>
          </button>
          <button class="orient-card ${orient === 'mirror' ? 'active' : ''}" data-orient="mirror">
            <span class="orient-glyph" style="transform: scaleX(-1);">R</span>
            <strong>Miroir G/D</strong>
            <small>Lunette / SCT + renvoi coudé</small>
          </button>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
        <button class="btn-primary" id="btn-switch-telescope-view">
          ${t('telescope.openView', 'Basculer en Vue Télescope (touche 3)')}
        </button>
      </div>
    `;

    this.modalBody.querySelector('#chk-show-field-frame')?.addEventListener('change', (e) => {
      this.app.state.toggles.showFieldFrame = e.target.checked;
      this.app.saveSettings();
      this.app.requestRender();
    });

    this.modalBody.querySelectorAll('[data-orient]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.app.viewport.opticalOrientation = btn.getAttribute('data-orient');
        this.app.applyTelescopeConfig();
        this.renderTelescopePanel();
      });
    });

    this.modalBody.querySelector('#tel-brand-select')?.addEventListener('change', (e) => {
      cfg.brand = e.target.value;
      const firstModel = allModels.find(m => m.brand === cfg.brand);
      if (firstModel) {
        cfg.model = firstModel.model;
        cfg.apertureMm = firstModel.apertureMm;
        cfg.focalMm = firstModel.focalMm;
      }
      this.app.applyTelescopeConfig();
      this.renderTelescopePanel();
    });

    this.modalBody.querySelector('#tel-model-select')?.addEventListener('change', (e) => {
      const m = allModels.find(item => (item.id || item.model) === e.target.value);
      if (m) {
        cfg.model = m.model;
        cfg.apertureMm = m.apertureMm;
        cfg.focalMm = m.focalMm;
        this.app.applyTelescopeConfig();
        this.renderTelescopePanel();
      }
    });

    this.modalBody.querySelector('#tel-ep-select')?.addEventListener('change', (e) => {
      const ep = telData.eyepieces[Number(e.target.value)];
      if (ep) {
        cfg.eyepieceName = ep.name;
        cfg.eyepieceFocalMm = ep.focalMm;
        cfg.eyepieceAfovDeg = ep.afovDeg;
        this.app.applyTelescopeConfig();
        this.renderTelescopePanel();
      }
    });

    const syncManualInputs = () => {
      cfg.apertureMm = Math.max(20, parseFloat(this.modalBody.querySelector('#tel-diam-input').value) || 200);
      cfg.focalMm = Math.max(100, parseFloat(this.modalBody.querySelector('#tel-focal-input').value) || 1000);
      cfg.eyepieceFocalMm = Math.max(2, parseFloat(this.modalBody.querySelector('#tel-ep-focal').value) || 14);
      cfg.eyepieceAfovDeg = Math.max(30, parseFloat(this.modalBody.querySelector('#tel-ep-afov').value) || 68);
      cfg.barlow = parseFloat(this.modalBody.querySelector('#tel-barlow-select').value) || 1;
      this.app.applyTelescopeConfig();
      this.renderTelescopePanel();
    };

    ['#tel-diam-input', '#tel-focal-input', '#tel-ep-focal', '#tel-ep-afov', '#tel-barlow-select'].forEach(sel => {
      this.modalBody.querySelector(sel)?.addEventListener('change', syncManualInputs);
    });

    this.modalBody.querySelector('#btn-switch-telescope-view')?.addEventListener('click', () => {
      this.app.setViewMode('telescope');
      this.closePanel();
    });
  }

  /* ==========================================================================
   * 9. PANNEAU « HORS LIGNE » (Service Worker PWA + Paquets optionnels + Quota disque)
   * ========================================================================== */
  async renderOfflinePanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.offlineTitle', 'Hors ligne (PWA) & Paquets Wikipédia');

    let usedMB = '—';
    let quotaMB = '—';
    let pctUsed = 0;

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        usedMB = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
        quotaMB = ((est.quota || 0) / (1024 * 1024)).toFixed(0);
        pctUsed = est.quota ? Math.min(100, ((est.usage || 0) / est.quota) * 100) : 1;
      } catch (_) {}
    }

    const packs = [
      { id: 'wiki-fr', lang: 'fr', label: 'Français — Résumés encyclopédiques Wikipédia (FR)', size: '420 Ko' },
      { id: 'wiki-en', lang: 'en', label: 'English — Wikipedia Encyclopedic Summaries (EN)', size: '410 Ko' },
      { id: 'wiki-es', lang: 'es', label: 'Español — Resúmenes enciclopédicos de Wikipedia (ES)', size: '395 Ko' },
      { id: 'wiki-de', lang: 'de', label: 'Deutsch — Wikipedia-Zusammenfassungen (DE)', size: '405 Ko' }
    ];

    const installedPacks = this.app.state.installedOfflinePacks || {};

    this.modalBody.innerHTML = `
      <div class="tonight-summary-banner">
        <div class="summary-chip highlight">
          <span class="chip-label">Service Worker PWA</span>
          <strong>${'serviceWorker' in navigator ? t('offline.swActive', 'Actif — Prêt hors ligne') : 'Standard'}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('offline.diskQuota', 'Espace disque utilisé / Quota disponible')}</span>
          <strong class="mono">${usedMB} Mo / ${quotaMB} Mo (${pctUsed.toFixed(2)}%)</strong>
        </div>
      </div>

      <h4 style="margin: 14px 0 8px;">${t('offline.optionalPacks', 'Paquets optionnels téléchargeables (Résumés Wikipédia hors ligne)')}</h4>
      <div class="table-scroll">
        <table class="astro-table">
          <thead>
            <tr>
              <th>Paquet</th>
              <th>Taille</th>
              <th>État</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${packs.map(p => {
              const isInstalled = !!installedPacks[p.lang];
              return `
                <tr>
                  <td><strong>${p.label}</strong></td>
                  <td class="mono">${p.size}</td>
                  <td>
                    <span class="badge-detect ${isInstalled ? 'good' : 'fair'}">
                      ${isInstalled ? t('offline.installed', 'Installé') : t('offline.notInstalled', 'Disponible')}
                    </span>
                  </td>
                  <td>
                    ${isInstalled ? `
                      <button class="btn-xs" data-remove-pack="${p.lang}">${t('offline.remove', 'Supprimer')}</button>
                    ` : `
                      <button class="btn-xs primary" data-dl-pack="${p.lang}">${t('offline.download', 'Télécharger')}</button>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    this.modalBody.querySelectorAll('[data-dl-pack]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lang = btn.getAttribute('data-dl-pack');
        btn.textContent = '…';
        await this.app.downloadOfflineWikiPack(lang);
        this.renderOfflinePanel();
      });
    });

    this.modalBody.querySelectorAll('[data-remove-pack]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lang = btn.getAttribute('data-remove-pack');
        await this.app.removeOfflineWikiPack(lang);
        this.renderOfflinePanel();
      });
    });
  }

  /* ==========================================================================
   * 10. PANNEAU « MANUEL & RACCOURCIS CLAVIER » (engendrés depuis features.js)
   * ========================================================================== */
  renderManualPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.manualTitle', 'Manuel utilisateur & Raccourcis clavier');

    const features = this.app.getFeaturesList();

    this.modalBody.innerHTML = `
      <div class="manual-grid">
        <div>
          <h4>${t('manual.guideTitle', 'Architecture & Principes optiques')}</h4>
          <ul class="manual-list">
            <li><strong>5 Vues synchronisées (1–5)</strong> : <em>Terrestre</em> (horizon + relief), <em>Sphère céleste</em>, <em>Télescope</em> (champ circulaire + chercheur 8×50), <em>Système solaire</em> héliocentrique 3D et <em>Ciel entier</em> (planisphère zénithal).</li>
            <li><strong>Verdict de visibilité (Crumey 2014)</strong> : Chaque fiche calcule le seuil de contraste de la vision humaine sur la région centrale la plus brillante (profil de Sérsic ou Plummer) combiné au modèle de brillance du ciel (Krisciunas & Schaefer 1991 + Patat 2006).</li>
            <li><strong>Palette de commandes (⌘K / Ctrl-K)</strong> : Recherchez instantanément parmi 871 136 étoiles ATHYG, 15 618 objets OpenNGC, planètes, astéroïdes et 177 satellites SGP4.</li>
            <li><strong>Relevé photographique HiPS DSS2</strong> : Touche <kbd>D</kbd> ou panneau <em>Calques</em> pour projeter les tuiles photographiques DSS2 couleur du CDS Strasbourg.</li>
          </ul>
        </div>
        <div>
          <h4>${t('manual.shortcutsTitle', 'Raccourcis clavier (registre features.js)')}</h4>
          <div class="table-scroll" style="max-height: 360px;">
            <table class="astro-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Touche</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><strong>Palette de commandes</strong></td><td><kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd></td></tr>
                ${features.filter(f => f.shortcut).map(f => `
                  <tr>
                    <td>${this.app.getFeatureLabel(f)}</td>
                    <td><kbd>${f.shortcut}</kbd></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }
}
