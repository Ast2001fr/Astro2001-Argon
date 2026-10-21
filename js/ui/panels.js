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
    this.modalOverlay?.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) this.closePanel();
    });
  }

  t(key, fallback) {
    return this.app.t ? this.app.t(key, fallback) : (fallback || key);
  }

  openPanel(panelId) {
    if (!this.modalOverlay || !this.modalBody) return;
    this.activePanelId = panelId;
    this.modalOverlay.classList.remove('hidden');

    switch (panelId) {
      case 'tonight':
        this.renderTonightPanel();
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
  }

  /* ==========================================================================
   * 1. PANNEAU « VISIBILITÉ — NUIT PROCHAINE » (Frise / Tableau)
   * ========================================================================== */
  renderTonightPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.tonightTitle', 'Visibilité — nuit prochaine');

    const baseDate = new Date(this.app.state.date.getTime() + this.tonightDayOffset * 86400000);
    const nightData = this.app.computeTonightVisibilityData(baseDate, this.tonightCategory);

    this.modalBody.innerHTML = `
      <div class="panel-toolbar">
        <div class="btn-group">
          <button class="btn-secondary" id="tonight-prev">◀ ${t('tonight.prevNight', 'Nuit précédente')}</button>
          <button class="btn-secondary" id="tonight-reset">${ nightData.dateLabel }</button>
          <button class="btn-secondary" id="tonight-next">${t('tonight.nextNight', 'Nuit suivante')} ▶</button>
        </div>
        <div class="btn-group">
          <select id="tonight-cat-select" class="select-input">
            <option value="all" ${this.tonightCategory === 'all' ? 'selected' : ''}>${t('tonight.catAll', 'Tous les astres')}</option>
            <option value="planets" ${this.tonightCategory === 'planets' ? 'selected' : ''}>${t('tonight.catPlanets', 'Planètes & Lune')}</option>
            <option value="messier" ${this.tonightCategory === 'messier' ? 'selected' : ''}>${t('tonight.catMessier', 'Ciel profond (Messier / NGC)')}</option>
            <option value="stars" ${this.tonightCategory === 'stars' ? 'selected' : ''}>${t('tonight.catStars', 'Étoiles brillantes')}</option>
          </select>
          <button class="btn-toggle ${this.tonightMode === 'frise' ? 'active' : ''}" id="tonight-mode-frise">
            📈 ${t('tonight.frise', 'Frise')}
          </button>
          <button class="btn-toggle ${this.tonightMode === 'tableau' ? 'active' : ''}" id="tonight-mode-tableau">
            📋 ${t('tonight.tableau', 'Tableau')}
          </button>
        </div>
      </div>

      <!-- Bandeau résumé de la nuit -->
      <div class="tonight-summary-banner">
        <div class="summary-chip">
          <span class="chip-label">🌅 ${t('twilight.sunset', 'Coucher du Soleil')}</span>
          <strong>${nightData.twilight.sunsetStr}</strong>
        </div>
        <div class="summary-chip highlight">
          <span class="chip-label">🌌 ${t('tonight.trueNight', 'Vraie nuit (astronomique)')}</span>
          <strong>${nightData.twilight.astroDuskStr} → ${nightData.twilight.astroDawnStr} (${nightData.twilight.darkDurationStr})</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">🌄 ${t('twilight.sunrise', 'Lever du Soleil')}</span>
          <strong>${nightData.twilight.sunriseStr}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">🌙 ${t('tonight.moonIllum', 'Lune')}</span>
          <strong>${Math.round(nightData.moonIllum * 100)}% (${nightData.moonPhaseLabel})</strong>
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
        this.closePanel();
      });
    });

    if (this.tonightMode === 'frise') {
      this._drawTonightAltitudeChart(nightData);
    }
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

    // Draw twilight & true night background bands across the 14-hour span (17:00 to 07:00)
    const samples = nightData.skySamples; // array of { frac, sunAlt, hourLabel }
    for (let i = 0; i < samples.length - 1; i++) {
      const s = samples[i];
      const x0 = padL + (i / (samples.length - 1)) * plotW;
      const x1 = padL + ((i + 1) / (samples.length - 1)) * plotW;
      let fill = '#244b82';
      if (nightVision) {
        fill = s.sunAlt < -18 ? '#0a0000' : s.sunAlt < -6 ? '#1c0402' : '#300805';
      } else if (s.sunAlt <= -18) {
        fill = '#050a16'; // Vraie nuit astronomique
      } else if (s.sunAlt <= -12) {
        fill = '#0b152b'; // Nautique
      } else if (s.sunAlt <= -6) {
        fill = '#152547'; // Civil
      } else if (s.sunAlt <= 0) {
        fill = '#2a3963';
      }
      ctx.fillStyle = fill;
      ctx.fillRect(x0, padT, x1 - x0 + 1, plotH);
    }

    // Horizontal altitude grid lines (0°, 30°, 60°, 90°)
    ctx.strokeStyle = nightVision ? 'rgba(200, 40, 30, 0.25)' : 'rgba(150, 185, 235, 0.18)';
    ctx.fillStyle = nightVision ? '#d95540' : '#9ab4d8';
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;

    for (let alt = 0; alt <= 90; alt += 15) {
      const y = padT + plotH * (1 - alt / 90);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      if (alt % 30 === 0) {
        ctx.fillText(`${alt}°`, 10, y + 4);
      }
    }

    // Vertical hour ticks
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

    // Plot each object's altitude curve
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
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(item.name, Math.min(padL + plotW - 65, Math.max(padL + 6, peakPt.x - 16)), Math.max(padT + 14, peakPt.y - 6));
      }
    });

    // Draw "Maintenant" vertical marker if current simulation time falls within this night window
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
      ctx.font = '700 10.5px system-ui, sans-serif';
      ctx.fillText(this.t('tonight.now', 'Maintenant'), Math.min(padL + plotW - 65, nowX + 5), padT + 14);
    }

    ctx.restore();

    // Click on chart to jump simulation time to clicked hour!
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
      <div class="twilight-grid">
        <div class="twilight-card">
          <h4>🌇 ${t('twilight.evening', 'Soir (Coucher → Nuit)')}</h4>
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
          <h4>🌄 ${t('twilight.morning', 'Matin (Nuit → Lever)')}</h4>
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
          <strong>${tw.solarMidnightStr} (${tw.minSunAlt.toFixed(1)}°)</strong>
        </div>
        <div class="summary-chip highlight">
          <span class="chip-label">${t('twilight.darkDuration', 'Durée de vraie nuit noire')}</span>
          <strong>${tw.darkDurationStr}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('twilight.currentSunAlt', 'Hauteur actuelle du Soleil')}</span>
          <strong>${tw.currentSunAlt.toFixed(2)}° (${tw.currentRegimeLabel})</strong>
        </div>
      </div>
    `;
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
        <div class="offline-quiet-notice">
          <p>☁️ ${t('weather.offlineSilent', 'Mode hors ligne : les prévisions de nébulosité Open-Meteo reprendront automatiquement dès le retour de la connexion.')}</p>
        </div>
      `;
      return;
    }

    this.modalBody.innerHTML = `<p class="muted">${t('weather.loading', 'Récupération de la nébulosité horaire Open-Meteo…')}</p>`;

    let data = this.weatherCache.get(key);
    if (!data) {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${obs.lat.toFixed(4)}&longitude=${obs.lon.toFixed(4)}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,wind_speed_10m&forecast_days=2&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('open-meteo non-200');
        data = await res.json();
        this.weatherCache.set(key, data);
      } catch (_) {
        // Stay cleanly silent on error/offline
        this.modalBody.innerHTML = `
          <div class="offline-quiet-notice">
            <p>☁️ ${t('weather.offlineSilent', 'Prévisions météo Open-Meteo indisponibles hors ligne.')}</p>
          </div>
        `;
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
        ? t('weather.partial', 'Voiles / Partiel')
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
      <div class="table-scroll" style="max-height: 410px;">
        <table class="astro-table">
          <thead>
            <tr>
              <th>${t('weather.hour', 'Date & Heure')}</th>
              <th>${t('weather.totalCloud', 'Nébulosité totale')}</th>
              <th>${t('weather.layers', 'Basse / Moy. / Haute')}</th>
              <th>${t('weather.humidity', 'Humidité')}</th>
              <th>${t('weather.quality', 'Qualité astro')}</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  }

  /* ==========================================================================
   * 4. PANNEAU « ISS ET 177 SATELLITES » (Passages sur 4 jours + Celestrak)
   * ========================================================================== */
  renderSatellitesPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.satellitesTitle', 'ISS & 177 Satellites brillants (SGP4 — Passages sur 4 jours)');

    const sats = this.app.state.catalogs.satellitesTle || [];
    const q = this.satSearchQuery.trim().toLowerCase();
    const filteredSats = q
      ? sats.filter(s => s.name.toLowerCase().includes(q) || String(s.norad).includes(q))
      : sats;

    const currentSat = sats.find(s => s.norad === this.selectedSatNorad) || sats[0];
    const passes = currentSat ? this.app.computeSatellitePasses4Days(currentSat) : [];

    this.modalBody.innerHTML = `
      <div class="panel-toolbar">
        <div class="btn-group" style="flex: 1;">
          <input type="text" id="sat-search-input" class="text-input" placeholder="${t('satellites.searchPlaceholder', 'Filtrer parmi les 177 satellites (ISS, HST, Tiangong, Starlink…)')}" value="${this.satSearchQuery}">
          <select id="sat-select" class="select-input" style="max-width: 260px;">
            ${filteredSats.map(s => `
              <option value="${s.norad}" ${s.norad === (currentSat?.norad) ? 'selected' : ''}>
                ${s.name} (NORAD ${s.norad})
              </option>
            `).join('')}
          </select>
        </div>
        <button class="btn-secondary" id="btn-refresh-tle">
          ↻ ${t('satellites.updateCelestrak', 'Actualiser TLE (Celestrak)')}
        </button>
      </div>

      <div id="tle-status-msg" class="muted" style="margin-bottom: 8px; font-size: 12px;">
        ${sats.length} ${t('satellites.loadedCount', 'satellites brillants chargés en SGP4')} · ${currentSat ? currentSat.name : ''}
      </div>

      <div class="table-scroll" style="max-height: 390px;">
        <table class="astro-table">
          <thead>
            <tr>
              <th>${t('satellites.date', 'Date & Début')}</th>
              <th>${t('satellites.maxTime', 'Maximum')}</th>
              <th>${t('satellites.maxElev', 'Élév. max')}</th>
              <th>${t('satellites.azArc', 'Trajectoire (Az)')}</th>
              <th>${t('satellites.condition', 'Visibilité')}</th>
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
                <td class="mono">${Math.round(p.startAz)}° → ${Math.round(p.maxAz)}° → ${Math.round(p.endAz)}°</td>
                <td>
                  <span class="sat-tag tag-${p.tag}">
                    ${p.tag === 'visible'
                      ? t('satellites.tagVisible', 'Visible (Nuit)')
                      : p.tag === 'daylight'
                      ? t('satellites.tagDay', 'Jour')
                      : t('satellites.tagEclipsed', 'Éclipsé')}
                  </span>
                </td>
                <td>
                  <button class="btn-xs" data-plot-pass="${idx}">↝ ${t('actions.trace', 'Trajectoire')}</button>
                  <button class="btn-xs primary" data-sim-pass="${idx}">▶ ${t('actions.simulate', 'Simuler')}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

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
          this.closePanel();
        }
      });
    });

    this.modalBody.querySelectorAll('[data-sim-pass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-sim-pass'));
        const pass = passes[idx];
        if (pass) {
          this.app.simulateSatellitePass(currentSat, pass);
          this.closePanel();
        }
      });
    });
  }

  /* ==========================================================================
   * 5. PANNEAU « ÉCLIPSES, ESSAIMS DE MÉTÉORES & CALENDRIER D'ÉVÉNEMENTS »
   * ========================================================================== */
  renderEventsPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.eventsTitle', 'Éclipses, essaims de météores & calendrier d\'événements');

    const events = this.app.computeEventsForYear(this.eventsYear);
    const meteors = this.app.computeMeteorsForYear(this.eventsYear);

    const filteredEvents = this.eventsTab === 'eclipses'
      ? events.filter(e => e.category === 'eclipse')
      : events;

    this.modalBody.innerHTML = `
      <div class="panel-toolbar">
        <div class="btn-group">
          <button class="btn-secondary" id="ev-prev-year">◀ ${this.eventsYear - 1}</button>
          <strong style="padding: 6px 12px;">${this.eventsYear}</strong>
          <button class="btn-secondary" id="ev-next-year">${this.eventsYear + 1} ▶</button>
        </div>
        <div class="btn-group">
          <button class="btn-toggle ${this.eventsTab === 'calendar' ? 'active' : ''}" id="ev-tab-cal">
            📅 ${t('events.allEvents', 'Calendrier complet')}
          </button>
          <button class="btn-toggle ${this.eventsTab === 'eclipses' ? 'active' : ''}" id="ev-tab-ecl">
            🌑 ${t('events.eclipsesOnly', 'Éclipses (Soleil & Lune)')}
          </button>
          <button class="btn-toggle ${this.eventsTab === 'meteors' ? 'active' : ''}" id="ev-tab-met">
            ☄️ ${t('events.meteorsTab', '13 Essaims de météores')}
          </button>
        </div>
      </div>

      ${this.eventsTab === 'meteors' ? `
        <p class="muted" style="margin-bottom: 10px;">
          ${t('events.meteorsNote', 'Les dates de pic des 13 essaims sont calculées dynamiquement à partir de la longitude solaire (λ☉) pour l\'année sélectionnée.')}
        </p>
        <div class="table-scroll" style="max-height: 400px;">
          <table class="astro-table">
            <thead>
              <tr>
                <th>${t('events.showerName', 'Essaim')}</th>
                <th>${t('events.solarLon', 'Pic λ☉')}</th>
                <th>${t('events.peakDate', 'Date du pic')} (${this.eventsYear})</th>
                <th>${t('events.zhr', 'Taux horaire (ZHR)')}</th>
                <th>${t('events.radiant', 'Radiant (AD / Déc)')}</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${meteors.map((m, idx) => `
                <tr>
                  <td><strong>${m.name}</strong> <span class="muted">(${m.code})</span></td>
                  <td class="mono">${m.solarLonPeak.toFixed(1)}°</td>
                  <td class="mono"><strong>${m.peakDateStr}</strong></td>
                  <td class="mono"><strong>${m.zhr} / h</strong></td>
                  <td class="mono">${m.ra.toFixed(0)}° / ${m.dec >= 0 ? '+' : ''}${m.dec.toFixed(0)}°</td>
                  <td>
                    <button class="btn-xs primary" data-sim-meteor="${idx}">▶ ${t('actions.simulate', 'Simuler')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="table-scroll" style="max-height: 410px;">
          <table class="astro-table">
            <thead>
              <tr>
                <th>${t('events.date', 'Date & Heure (UTC/Local)')}</th>
                <th>${t('events.type', 'Catégorie')}</th>
                <th>${t('events.event', 'Événement')}</th>
                <th>${t('events.details', 'Détails & Lieu optimal')}</th>
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
                    <button class="btn-xs primary" data-sim-event="${idx}">▶ ${t('actions.simulate', 'Simuler')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;

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
          this.closePanel();
        }
      });
    });

    this.modalBody.querySelectorAll('[data-sim-meteor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-sim-meteor'));
        const m = meteors[idx];
        if (m) {
          this.app.simulateMeteorShowerPeak(m);
          this.closePanel();
        }
      });
    });
  }

  /* ==========================================================================
   * 6. PANNEAU « CHOIX DU LIEU » (33 848 villes, GPS, Coordonnées manuelles, Altitude)
   * ========================================================================== */
  renderLocationPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.locationTitle', 'Choix du lieu d\'observation (33 848 villes, GPS & Manuel)');

    const obs = this.app.state.observer;
    const totalCities = this.app.state.catalogs.cities?.rows?.length || 33848;

    this.modalBody.innerHTML = `
      <div class="location-grid">
        <div class="location-search-col">
          <h4>🔍 ${t('location.searchCity', 'Rechercher parmi')} ${totalCities.toLocaleString()} ${t('location.cities', 'villes & observatoires')}</h4>
          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <input type="text" id="city-search-input" class="text-input" placeholder="${t('location.searchPlaceholder', 'Paris, Pic du Midi, Paranal, Montréal, Tokyo…')}">
            <button class="btn-secondary" id="btn-use-gps">📍 GPS</button>
          </div>
          <div id="city-search-results" class="city-list-box"></div>
        </div>

        <div class="location-manual-col">
          <h4>🌐 ${t('location.manualCoords', 'Coordonnées manuelles & Altitude')}</h4>
          <div class="form-group">
            <label>${t('location.name', 'Nom du lieu')}</label>
            <input type="text" id="loc-name-input" class="text-input" value="${obs.name}">
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('location.latitude', 'Latitude (° N+/S−)')}</label>
              <input type="number" step="0.0001" min="-90" max="90" id="loc-lat-input" class="text-input" value="${obs.lat}">
            </div>
            <div class="form-group">
              <label>${t('location.longitude', 'Longitude (° E+/O−)')}</label>
              <input type="number" step="0.0001" min="-180" max="180" id="loc-lon-input" class="text-input" value="${obs.lon}">
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('location.altitude', 'Altitude (m)')}</label>
              <input type="number" step="1" min="-400" max="9000" id="loc-alt-input" class="text-input" value="${obs.alt || 0}">
            </div>
            <div class="form-group">
              <label>${t('location.timezone', 'Fuseau horaire (IANA)')}</label>
              <input type="text" id="loc-tz-input" class="text-input" value="${obs.tz || 'Europe/Paris'}">
            </div>
          </div>
          <button class="btn-primary" id="btn-apply-location" style="width:100%; margin-top:10px;">
            ✓ ${t('location.apply', 'Appliquer ce lieu')}
          </button>
        </div>
      </div>
    `;

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
            this.closePanel();
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
        this.closePanel();
      });
    });

    this.modalBody.querySelector('#btn-apply-location')?.addEventListener('click', () => {
      const name = this.modalBody.querySelector('#loc-name-input').value || 'Lieu personnalisé';
      const lat = parseFloat(this.modalBody.querySelector('#loc-lat-input').value) || 0;
      const lon = parseFloat(this.modalBody.querySelector('#loc-lon-input').value) || 0;
      const alt = parseFloat(this.modalBody.querySelector('#loc-alt-input').value) || 0;
      const tz = this.modalBody.querySelector('#loc-tz-input').value || 'UTC';
      this.app.setObserverLocation({ name, country: '', lat, lon, alt, tz });
      this.closePanel();
    });
  }

  /* ==========================================================================
   * 7. PANNEAU « MON HORIZON » (Profil 4 directions N, E, S, O + relief & heures lever/coucher)
   * ========================================================================== */
  renderHorizonPanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.horizonTitle', 'Mon horizon — Profil d\'obstruction & Relief');

    const hp = this.app.state.horizonProfile; // { N, NE, E, SE, S, SW, W, NW }

    this.modalBody.innerHTML = `
      <p class="muted" style="margin-bottom: 12px;">
        ${t('horizon.description', 'Indiquez la hauteur angulaire (°) des obstacles qui bouchent la vue dans les quatre directions (arbres, bâtiments, collines). Ce profil dessine le relief sur la vue terrestre ET décale automatiquement les heures de lever et de coucher de tous les astres.')}
      </p>

      <div class="panel-toolbar">
        <div class="btn-group">
          <button class="btn-secondary" data-hz-preset="flat">${t('horizon.presetFlat', 'Plaine dégagée (0°)')}</button>
          <button class="btn-secondary" data-hz-preset="garden">${t('horizon.presetGarden', 'Jardin / Haies (8–15°)')}</button>
          <button class="btn-secondary" data-hz-preset="urban">${t('horizon.presetUrban', 'Cour urbaine (18–28°)')}</button>
          <button class="btn-secondary" data-hz-preset="alpine">${t('horizon.presetAlpine', 'Vallée de montagne')}</button>
        </div>
      </div>

      <div class="horizon-sliders-grid">
        ${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map(dir => `
          <div class="hz-slider-card">
            <label><strong>${dir}</strong> (<span id="hz-val-${dir}">${hp[dir] ?? 0}</span>°)</label>
            <input type="range" min="0" max="65" step="1" value="${hp[dir] ?? 0}" data-hz-dir="${dir}">
          </div>
        `).join('')}
      </div>

      <div class="tonight-chart-wrap" style="margin-top:12px;">
        <canvas id="horizon-preview-canvas" width="780" height="170"></canvas>
      </div>
    `;

    const drawPreview = () => {
      const c = this.modalBody.querySelector('#horizon-preview-canvas');
      if (!c) return;
      const ctx = c.getContext('2d');
      const w = c.width;
      const h = c.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#081121';
      ctx.fillRect(0, 0, w, h);

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
      ctx.fillStyle = '#183028';
      ctx.fill();
      ctx.strokeStyle = '#48a878';
      ctx.lineWidth = 2;
      ctx.stroke();

      const dirs = [
        { az: 0, l: 'N' }, { az: 45, l: 'NE' }, { az: 90, l: 'E' }, { az: 135, l: 'SE' },
        { az: 180, l: 'S' }, { az: 225, l: 'SO' }, { az: 270, l: 'O' }, { az: 315, l: 'NO' }, { az: 360, l: 'N' }
      ];
      ctx.fillStyle = '#d8e8ff';
      ctx.font = '600 11px system-ui, sans-serif';
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
  }

  /* ==========================================================================
   * 8. PANNEAU « TÉLESCOPE ET OCULAIRES » (12 marques / 78 modèles / 10 oculaires + saisie manuelle)
   * ========================================================================== */
  renderTelescopePanel() {
    const t = (k, fb) => this.t(k, fb);
    this.modalTitle.textContent = t('panels.telescopeTitle', 'Télescope et oculaires (12 marques / 78 modèles / 10 oculaires)');

    const telData = this.app.state.catalogs.telescopes || { brands: [], telescopes: [], eyepieces: [] };
    const allModels = telData.telescopes || telData.models || [];
    const cfg = this.app.state.telescopeConfig;
    const brands = telData.brands?.length ? telData.brands : [...new Set(allModels.map(m => m.brand))];
    const currentBrandModels = allModels.filter(m => m.brand === cfg.brand);
    const stats = this.app.computeOpticalStats();

    this.modalBody.innerHTML = `
      <div class="location-grid">
        <div>
          <h4>🔭 ${t('telescope.selectModel', 'Sélection du tube optique (12 marques · 78 modèles)')}</h4>
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
                  ${m.model} (${m.apertureMm} mm · F=${m.focalMm} mm · f/${(m.focalMm / m.apertureMm).toFixed(1)})
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('telescope.apertureManual', 'Diamètre D (mm)')}</label>
              <input type="number" id="tel-diam-input" class="text-input" min="20" max="2000" value="${cfg.apertureMm}">
            </div>
            <div class="form-group">
              <label>${t('telescope.focalManual', 'Focale F (mm)')}</label>
              <input type="number" id="tel-focal-input" class="text-input" min="100" max="15000" value="${cfg.focalMm}">
            </div>
          </div>
        </div>

        <div>
          <h4>👁️ ${t('telescope.selectEyepiece', 'Oculaire (10 modèles) & Barlow')}</h4>
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
              <input type="number" step="0.5" min="2" max="55" id="tel-ep-focal" class="text-input" value="${cfg.eyepieceFocalMm}">
            </div>
            <div class="form-group">
              <label>${t('telescope.epAfovManual', 'Champ apparent (°)')}</label>
              <input type="number" step="1" min="30" max="120" id="tel-ep-afov" class="text-input" value="${cfg.eyepieceAfovDeg}">
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-group">
              <label>${t('telescope.barlow', 'Barlow / Réducteur')}</label>
              <select id="tel-barlow-select" class="select-input" style="width:100%">
                <option value="0.63" ${cfg.barlow === 0.63 ? 'selected' : ''}>0.63× (Réducteur)</option>
                <option value="1" ${cfg.barlow === 1 ? 'selected' : ''}>1× (Aucun)</option>
                <option value="1.5" ${cfg.barlow === 1.5 ? 'selected' : ''}>1.5× Barlow</option>
                <option value="2" ${cfg.barlow === 2 ? 'selected' : ''}>2× Barlow</option>
                <option value="3" ${cfg.barlow === 3 ? 'selected' : ''}>3× Barlow</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('telescope.orientation', 'Orientation optique')}</label>
              <select id="tel-orient-select" class="select-input" style="width:100%">
                <option value="erect" ${this.app.viewport.opticalOrientation === 'erect' ? 'selected' : ''}>Redressée (Droite)</option>
                <option value="inverted" ${this.app.viewport.opticalOrientation === 'inverted' ? 'selected' : ''}>Inversée 180° (Newton)</option>
                <option value="mirror" ${this.app.viewport.opticalOrientation === 'mirror' ? 'selected' : ''}>Miroir G/D (Renvoi coudé)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="tonight-summary-banner" style="margin-top: 14px;">
        <div class="summary-chip highlight">
          <span class="chip-label">${t('telescope.magnification', 'Grossissement')}</span>
          <strong>${stats.magnification}×</strong>
        </div>
        <div class="summary-chip highlight">
          <span class="chip-label">${t('telescope.tfov', 'Champ réel (TFOV)')}</span>
          <strong>${stats.tfovStr}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('telescope.exitPupil', 'Pupille de sortie')}</span>
          <strong>${stats.exitPupilMm} mm</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">${t('telescope.limitingMag', 'Mag limite / Dawes')}</span>
          <strong>mag ${stats.limitingMag} · ${stats.dawesArcsec}″</strong>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:12px;">
        <button class="btn-primary" id="btn-switch-telescope-view">
          🔭 ${t('telescope.openView', 'Basculer en Vue Télescope avec ce champ')}
        </button>
      </div>
    `;

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
      this.app.viewport.opticalOrientation = this.modalBody.querySelector('#tel-orient-select').value;
      this.app.applyTelescopeConfig();
      this.renderTelescopePanel();
    };

    ['#tel-diam-input', '#tel-focal-input', '#tel-ep-focal', '#tel-ep-afov', '#tel-barlow-select', '#tel-orient-select'].forEach(sel => {
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
    this.modalTitle.textContent = t('panels.offlineTitle', 'Hors ligne (PWA) & Paquets Wikipédia téléchargeables');

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
          <span class="chip-label">⚡ Service Worker PWA</span>
          <strong>${'serviceWorker' in navigator ? t('offline.swActive', 'Actif — Prêt hors ligne') : 'Standard'}</strong>
        </div>
        <div class="summary-chip">
          <span class="chip-label">💾 ${t('offline.diskQuota', 'Espace disque utilisé / Quota disponible')}</span>
          <strong>${usedMB} Mo / ${quotaMB} Mo (${pctUsed.toFixed(2)}%)</strong>
        </div>
      </div>

      <h4 style="margin: 14px 0 8px;">📦 ${t('offline.optionalPacks', 'Paquets optionnels téléchargeables (Résumés Wikipédia hors ligne)')}</h4>
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
                      ${isInstalled ? t('offline.installed', 'Installé en cache local') : t('offline.notInstalled', 'Disponible')}
                    </span>
                  </td>
                  <td>
                    ${isInstalled ? `
                      <button class="btn-xs" data-remove-pack="${p.lang}">🗑️ ${t('offline.remove', 'Supprimer')}</button>
                    ` : `
                      <button class="btn-xs primary" data-dl-pack="${p.lang}">⬇ ${t('offline.download', 'Télécharger')}</button>
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
    this.modalTitle.textContent = t('panels.manualTitle', 'Manuel utilisateur & Raccourcis clavier (features.js)');

    const features = this.app.getFeaturesList();

    this.modalBody.innerHTML = `
      <div class="manual-grid">
        <div>
          <h4>📖 ${t('manual.guideTitle', 'Guide rapide du Planétarium')}</h4>
          <ul class="manual-list">
            <li><strong>4 Vues synchronisées (1–4)</strong> : Basculez instantanément entre la <em>Vue terrestre</em> (dôme + horizon), la <em>Sphère céleste</em>, le <em>Télescope</em> (champ circulaire + chercheur) et le <em>Système solaire</em> héliocentrique.</li>
            <li><strong>Navigation & Sélection</strong> : Molette pour zoomer vers le curseur, glisser pour orienter, clic sur n'importe quel astre (871 136 étoiles ATHYG, 15 618 objets OpenNGC, planètes, astéroïdes, 177 satellites) pour ouvrir sa fiche complète à 6 sections.</li>
            <li><strong>Palette de commandes (⌘K / Ctrl-K)</strong> : Recherchez n'importe quel objet céleste (M31, Sirius, NGC 7000, ISS, Cérès…) ou déclenchez une action au clavier.</li>
            <li><strong>Relevé photographique HiPS DSS2</strong> : Activez la touche <kbd>D</kbd> pour charger à la demande les vraies tuiles photographiques DSS2 couleur du CDS Strasbourg.</li>
          </ul>
        </div>
        <div>
          <h4>⌨️ ${t('manual.shortcutsTitle', 'Raccourcis clavier (registre features.js)')}</h4>
          <div class="table-scroll" style="max-height: 340px;">
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
