/**
 * js/ui/object-card.js
 * Six-section Object Card (Fiche d'objet):
 * 1. Ce soir (Rise, Transit, Set accounting for custom horizon, visibility badge)
 * 2. Physique (Magnitude + visual magnitude scale, B-V, spectral type, size, WDS double / GCVS variable / Planet stats)
 * 3. Position (Alt/Az, RA/Dec J2000 & Date, Hour Angle, Airmass, Official IAU Constellation)
 * 4. Identité (Proper name, Bayer/Flamsteed, Messier, NGC/IC, HIP, HD, WDS, GCVS, NORAD)
 * 5. À l'oculaire (Magnification, TFOV, Exit pupil, Surface brightness detectability, + Jovian/Saturnian Moons Eyepiece Diagram!)
 * 6. En savoir plus (Wikipedia summary strictly from embedded index `data/wiki-index.json`, never guessed + offline pack support)
 */

function formatHMS(raDeg) {
  const totalHours = (((raDeg / 15) % 24) + 24) % 24;
  const h = Math.floor(totalHours);
  const mFull = (totalHours - h) * 60;
  const m = Math.floor(mFull);
  const s = ((mFull - m) * 60).toFixed(1);
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(4, '0')}s`;
}

function formatDMS(deg) {
  const sign = deg >= 0 ? '+' : '−';
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mFull = (abs - d) * 60;
  const m = Math.floor(mFull);
  const s = Math.round((mFull - m) * 60);
  return `${sign}${String(d).padStart(2, '0')}° ${String(m).padStart(2, '0')}′ ${String(s).padStart(2, '0')}″`;
}

export class ObjectCardUI {
  constructor(containerEl, app) {
    this.container = containerEl;
    this.app = app;
    this.wikiCache = new Map();
    this._currentWikiKey = null;
    this.collapsed = false;
  }

  render(obj) {
    if (!this.container) return;
    if (!obj) {
      this.container.classList.add('hidden');
      return;
    }
    this.container.classList.remove('hidden');
    this.container.classList.toggle('collapsed', this.collapsed);

    const t = (k, fallback) => (this.app.t ? this.app.t(k, fallback) : (fallback || k));
    const details = this.app.getObjectFullDetails(obj);

    const magVal = details.mag !== undefined && details.mag !== null ? Number(details.mag) : null;
    const magPercent = magVal !== null
      ? Math.max(0, Math.min(100, ((magVal + 2) / 16) * 100))
      : 50;

    const isJovianOrSaturnian = details.id === 'Jupiter' || details.id === 'Saturn';
    const isTracked = this.app.state.trackedObjectId === details.id;
    const isTraced = this.app.state.tracedObjectId === details.id;
    const isFrameShown = !!this.app.state.toggles?.showFieldFrame;

    this.container.innerHTML = `
      <div class="object-card-header">
        <div class="object-card-title-group">
          <div class="object-card-eyebrow">
            <span class="object-type-badge">${details.typeLabel}</span>
            <span class="object-con-pill">${details.constellationName}</span>
          </div>
          <h2 class="object-card-title">${details.title}</h2>
          <div class="object-card-subtitle">${details.subtitle || ''}</div>
        </div>
        <div class="object-card-head-btns">
          <button type="button" class="icon-btn" id="obj-card-min" title="${this.collapsed ? 'Déplier la fiche' : 'Réduire la fiche'}" aria-expanded="${!this.collapsed}">
            <svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${
              this.collapsed
                ? '<polyline points="6 9 12 15 18 9"/>'
                : '<line x1="6" y1="12" x2="18" y2="12"/>'
            }</svg>
          </button>
          <button type="button" class="icon-btn" id="obj-card-close" title="${t('ui.close', 'Fermer')}">
            <svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>
          </button>
        </div>
      </div>

      <!-- VERDICT D'ABORD (Hors de la zone défilante : reste visible même fiche réduite) -->
      <div class="verdict-banner tone-${details.verdict?.tone || 'ok'}" id="infoState">
        <div class="verdict-head">
          <span class="verdict-dot"></span>
          <strong class="verdict-headline">${details.verdict?.reachText || details.rts.statusText}</strong>
        </div>
        <div class="verdict-sub mono">
          ${details.verdict?.altFistsText || `${t('objectCard.altitudeNow', 'Hauteur')} : ${details.alt.toFixed(1)}° · ${details.compassDir}`}
        </div>
        ${details.verdict?.reasonText ? `<div class="verdict-window">${details.verdict.reasonText}</div>` : ''}
      </div>

      <!-- RANGÉE D'ACTIONS VECTORIELLES -->
      <div class="object-card-actions" id="infoActions">
        <button type="button" class="action-pill ${isTracked ? 'active' : ''}" id="btn-obj-track" title="Centrer et garder au centre">
          <svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="2.6"/></svg>
          <span>${isTracked ? t('actions.tracked', 'Suivi') : t('actions.track', 'Suivre')}</span>
        </button>
        <button type="button" class="action-pill ${isTraced ? 'active' : ''}" id="btn-obj-trace" title="Tracer la trajectoire sur la nuit">
          <svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 18C8 6 16 6 20 18" stroke-dasharray="2.5 2.5"/><circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="20" cy="18" r="1.6" fill="currentColor" stroke="none"/></svg>
          <span>${t('actions.trace', 'Trajet')}</span>
        </button>
        <button type="button" class="action-pill" id="btn-obj-eyepiece" title="Observer en vue Télescope">
          <svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
          <span>${t('views.telescope', 'Oculaire')}</span>
        </button>
        <button type="button" class="action-pill ${isFrameShown ? 'active' : ''}" id="btn-obj-frame" title="Tracer le champ de l'instrument sur le ciel">
          <svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M12 8v8M8 12h8"/></svg>
          <span>Cadre</span>
        </button>
      </div>

      <div class="object-card-body">
        ${details.photoUrl ? `
        <div class="obj-photo-frame">
          <img src="${details.photoUrl}" alt="${details.title}" class="obj-photo-img" loading="lazy">
          <span class="obj-photo-caption">${details.title} · Imagerie intégrée</span>
        </div>
        ` : ''}

        <!-- SECTION 1: CE SOIR -->
        <section class="obj-section">
          <h3 class="obj-section-title">1 · ${t('objectCard.tonight', 'Ce soir')}</h3>
          <div class="obj-kv-grid cols-3">
            <div class="obj-kv-box">
              <span class="kv-label">${t('objectCard.rise', 'Lever')}</span>
              <span class="kv-val">${details.rts.riseStr || '—'}</span>
            </div>
            <div class="obj-kv-box">
              <span class="kv-label">${t('objectCard.transit', 'Culmination')}</span>
              <span class="kv-val">${details.rts.transitStr || '—'} <small>${details.rts.maxAltStr || ''}</small></span>
            </div>
            <div class="obj-kv-box">
              <span class="kv-label">${t('objectCard.set', 'Coucher')}</span>
              <span class="kv-val">${details.rts.setStr || '—'}</span>
            </div>
          </div>
        </section>

        <!-- SECTION 2: PHYSIQUE + ÉCHELLE DE MAGNITUDE -->
        <section class="obj-section">
          <h3 class="obj-section-title">2 · ${t('objectCard.physical', 'Physique')}</h3>
          ${magVal !== null ? `
          <div class="mag-scale-widget">
            <div class="mag-scale-labels">
              <span>${t('objectCard.magnitude', 'Magnitude')} : <strong class="mono">${magVal.toFixed(2)}</strong></span>
              <span class="mag-hint">${magVal <= (details.verdict?.nakedLimit || 6.0) ? t('objectCard.nakedEye', 'Œil nu') : t('objectCard.opticalAid', 'Instrument')}</span>
            </div>
            <div class="mag-scale-bar">
              <div class="mag-scale-Zone naked-eye" style="width: 50%" title="Œil nu (-2 .. +6)"></div>
              <div class="mag-scale-Zone binoculars" style="width: 25%" title="Jumelles (+6 .. +10)"></div>
              <div class="mag-scale-Zone telescope" style="width: 25%" title="Télescope (+10 .. +14)"></div>
              <div class="mag-scale-marker" style="left: ${magPercent}%"></div>
            </div>
            <div class="mag-scale-ticks">
              <span>−2</span><span>+2</span><span>+6 (œil nu)</span><span>+10</span><span>+14</span>
            </div>
          </div>
          ` : ''}
          <div class="obj-kv-list">
            ${details.physicalRows.map(r => `
              <div class="obj-kv-row">
                <span class="kv-label">${r.label}</span>
                <span class="kv-val">${r.value}</span>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- SECTION 3: POSITION -->
        <section class="obj-section">
          <h3 class="obj-section-title">3 · ${t('objectCard.position', 'Position')}</h3>
          <div class="obj-kv-list">
            <div class="obj-kv-row">
              <span class="kv-label">${t('objectCard.altAz', 'Hauteur / Azimut')}</span>
              <span class="kv-val mono">${details.alt >= 0 ? '+' : ''}${details.alt.toFixed(2)}° / ${details.az.toFixed(2)}° (${details.compassDir})</span>
            </div>
            <div class="obj-kv-row">
              <span class="kv-label">${t('objectCard.raDecJ2000', 'AD / Déc (J2000)')}</span>
              <span class="kv-val mono">${formatHMS(details.ra)} · ${formatDMS(details.dec)}</span>
            </div>
            <div class="obj-kv-row">
              <span class="kv-label">${t('objectCard.hourAngle', 'Angle horaire')}</span>
              <span class="kv-val mono">${formatHMS(details.haDeg)}</span>
            </div>
            <div class="obj-kv-row">
              <span class="kv-label">${t('objectCard.airmass', 'Masse d\'air & Extinction')}</span>
              <span class="kv-val mono">${details.airmassStr}</span>
            </div>
            ${details.parallacticStr ? `
            <div class="obj-kv-row">
              <span class="kv-label">Angle parallactique (q)</span>
              <span class="kv-val mono">${details.parallacticStr}</span>
            </div>
            ` : ''}
            <div class="obj-kv-row">
              <span class="kv-label">${t('objectCard.constellation', 'Constellation UAI')}</span>
              <span class="kv-val">${details.constellationName} (${details.constellationCode})</span>
            </div>
          </div>
        </section>

        <!-- SECTION 4: IDENTITÉ -->
        <section class="obj-section">
          <h3 class="obj-section-title">4 · ${t('objectCard.identity', 'Identité')}</h3>
          <div class="obj-kv-list">
            ${details.identityRows.map(r => `
              <div class="obj-kv-row">
                <span class="kv-label">${r.label}</span>
                <span class="kv-val mono">${r.value}</span>
              </div>
            `).join('')}
          </div>
        </section>

        <!-- SECTION 5: À L'OCULAIRE (+ SCHÉMA DES LUNES DE JUPITER / SATURNE) -->
        <section class="obj-section">
          <h3 class="obj-section-title">5 · ${t('objectCard.atEyepiece', 'À l\'oculaire')}</h3>
          <div class="obj-kv-list">
            <div class="obj-kv-row">
              <span class="kv-label">${t('telescope.instrument', 'Instrument actif')}</span>
              <span class="kv-val">${details.optics.instrumentLabel}</span>
            </div>
            <div class="obj-kv-row">
              <span class="kv-label">${t('telescope.magnification', 'Grossissement & Champ')}</span>
              <span class="kv-val mono">×${details.optics.magnification} · ${details.optics.tfovStr}</span>
            </div>
            <div class="obj-kv-row">
              <span class="kv-label">${t('telescope.exitPupil', 'Pupille & Pouvoir séparateur')}</span>
              <span class="kv-val mono">${details.optics.exitPupilMm} mm · Dawes ${details.optics.dawesStr || '0,58″'}</span>
            </div>
            ${details.optics.clarkAdvice ? `
            <div class="obj-kv-row">
              <span class="kv-label">Grossissement optimal (Clark ~100′)</span>
              <span class="kv-val mono">${details.optics.clarkAdvice}</span>
            </div>
            ` : ''}
            <div class="obj-kv-row">
              <span class="kv-label">${t('telescope.detectability', 'Contraste de Crumey (2014)')}</span>
              <span class="kv-val"><span class="badge-detect ${details.optics.detectClass}">${details.optics.detectLabel}</span></span>
            </div>
          </div>
          ${isJovianOrSaturnian ? `
          <div class="moons-eyepiece-box">
            <div class="moons-eyepiece-title">${t('objectCard.moonsDiagram', 'Schéma oculaire des lunes (temps réel)')}</div>
            <canvas id="moons-eyepiece-canvas" width="320" height="110"></canvas>
            <div class="moons-legend" id="moons-eyepiece-legend"></div>
          </div>
          ` : ''}
        </section>

        <!-- SECTION 6: EN SAVOIR PLUS (WIKIPÉDIA) -->
        <section class="obj-section">
          <h3 class="obj-section-title">6 · ${t('objectCard.learnMore', 'En savoir plus (Wikipédia)')}</h3>
          <div id="obj-wiki-content" class="obj-wiki-box">
            <span class="muted">${t('objectCard.loadingWiki', 'Chargement du résumé encyclopédique…')}</span>
          </div>
        </section>
      </div>
    `;

    // Bind button events
    this.container.querySelector('#obj-card-close')?.addEventListener('click', () => {
      this.app.selectObject(null);
    });
    this.container.querySelector('#obj-card-min')?.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.render(this.app.state.selectedObject);
    });
    this.container.querySelector('#btn-obj-track')?.addEventListener('click', () => {
      this.app.centerOnSelectedObject();
      this.app.toggleTrackSelectedObject();
      this.render(this.app.state.selectedObject);
    });
    this.container.querySelector('#btn-obj-trace')?.addEventListener('click', () => {
      this.app.toggleTraceSelectedObject();
      this.render(this.app.state.selectedObject);
    });
    this.container.querySelector('#btn-obj-eyepiece')?.addEventListener('click', () => {
      this.app.centerOnSelectedObject();
      this.app.setViewMode('telescope');
    });
    this.container.querySelector('#btn-obj-frame')?.addEventListener('click', () => {
      this.app.state.toggles.showFieldFrame = !this.app.state.toggles.showFieldFrame;
      this.app.saveSettings();
      this.app.requestRender();
      this.render(this.app.state.selectedObject);
    });

    if (isJovianOrSaturnian) {
      this._drawMoonsEyepieceDiagram(details);
    }

    this._loadWikipediaSummary(details);
  }

  /**
   * Dedicated Eyepiece Schematic for Galilean Moons of Jupiter and Main Moons of Saturn
   */
  _drawMoonsEyepieceDiagram(details) {
    const canvas = this.container.querySelector('#moons-eyepiece-canvas');
    const legendEl = this.container.querySelector('#moons-eyepiece-legend');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const nightVision = this.app.state.theme === 'nocturne';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = nightVision ? '#0c0000' : '#060c18';
    ctx.fillRect(0, 0, w, h);

    // Reference equatorial plane line (West — East)
    ctx.strokeStyle = nightVision ? 'rgba(200, 40, 30, 0.28)' : 'rgba(130, 175, 240, 0.25)';
    ctx.beginPath();
    ctx.moveTo(8, cy);
    ctx.lineTo(w - 8, cy);
    ctx.stroke();

    ctx.fillStyle = nightVision ? '#b83525' : '#7b9ec9';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('E', 10, cy - 5);
    ctx.fillText('W', w - 18, cy - 5);

    const moons = details.moons || [];
    const maxOffset = Math.max(12, ...moons.map(m => Math.abs(m.dx || 0) * 1.15));
    const pxPerRadius = (w * 0.43) / maxOffset;
    const planetR = Math.max(7, pxPerRadius);

    // Draw central planet (Jupiter or Saturn + rings)
    if (details.id === 'Saturn') {
      ctx.strokeStyle = nightVision ? '#ff5538' : '#e6ca8a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, planetR * 2.2, Math.max(2.5, planetR * 0.55), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = nightVision ? '#d93822' : (details.id === 'Jupiter' ? '#ecc78c' : '#e5cb90');
    ctx.beginPath();
    ctx.arc(cx, cy, planetR, 0, Math.PI * 2);
    ctx.fill();

    // Draw each moon and its label
    const badges = [];
    ctx.font = '600 9.5px system-ui, sans-serif';
    ctx.textAlign = 'center';

    moons.forEach((m, idx) => {
      const mx = cx + (m.dx || 0) * pxPerRadius;
      const my = cy - (m.dy || 0) * pxPerRadius;

      let statusTag = '';
      if (m.occulted) statusTag = ' (Occ.)';
      else if (m.eclipsed) statusTag = ' (Écl.)';
      else if (m.inTransit) statusTag = ' (Transit)';
      else if (m.shadowTransit) statusTag = ' (Ombre)';

      ctx.fillStyle = (m.occulted || m.eclipsed)
        ? 'rgba(180, 180, 180, 0.35)'
        : nightVision
        ? '#ff7558'
        : '#fff5d6';
      ctx.beginPath();
      ctx.arc(mx, my, 2.8, 0, Math.PI * 2);
      ctx.fill();

      const labelY = (idx % 2 === 0) ? cy - 14 : cy + 21;
      ctx.fillText(m.name.slice(0, 3), mx, labelY);
      badges.push(`<span><strong>${m.name}</strong>${statusTag}</span>`);
    });

    if (legendEl) {
      legendEl.innerHTML = badges.join(' · ');
    }
  }

  /**
   * Load Wikipedia summary strictly using the embedded title index (`data/wiki-index.json`),
   * NEVER guessing article titles!
   */
  async _loadWikipediaSummary(details) {
    const box = this.container.querySelector('#obj-wiki-content');
    if (!box) return;

    const lang = this.app.getLanguage ? this.app.getLanguage() : 'fr';
    const wikiEntry = this.app.getWikiIndexEntry(details);

    if (!wikiEntry) {
      box.innerHTML = `<p class="wiki-text">${details.fallbackSummary || ''}</p>`;
      return;
    }

    const titlesObj = wikiEntry.titles || wikiEntry;
    const exactTitle = titlesObj[lang] || titlesObj.fr || titlesObj.en || details.title;
    const embeddedSummary =
      (wikiEntry.summaries && (wikiEntry.summaries[lang] || wikiEntry.summaries.fr || wikiEntry.summaries.en)) ||
      (typeof wikiEntry.summary === 'object' ? wikiEntry.summary[lang] : wikiEntry.summary) ||
      details.fallbackSummary ||
      exactTitle;

    const cacheKey = `${lang}:${exactTitle}`;
    this._currentWikiKey = cacheKey;

    // 1. Check downloaded offline Wikipedia pack first
    const offlineSummary = this.app.getOfflineWikiSummary(lang, exactTitle, details.wikiKey);
    if (offlineSummary) {
      this._renderWikiBox(box, exactTitle, lang, offlineSummary);
      return;
    }

    // 2. Check memory cache
    if (this.wikiCache.has(cacheKey)) {
      this._renderWikiBox(box, exactTitle, lang, this.wikiCache.get(cacheKey));
      return;
    }

    // 3. Show immediate embedded summary, then enrich from Wikipedia REST API if online
    if (embeddedSummary) {
      this._renderWikiBox(box, exactTitle, lang, embeddedSummary);
    }

    if (!navigator.onLine) {
      return;
    }

    try {
      const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(exactTitle)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('wiki fetch failed');
      const data = await res.json();
      if (data && data.extract) {
        this.wikiCache.set(cacheKey, data.extract);
        if (this._currentWikiKey === cacheKey) {
          this._renderWikiBox(box, exactTitle, lang, data.extract);
        }
      }
    } catch (_) {
      // Quietly keep embedded summary when offline or unreachable
      this._renderWikiBox(box, exactTitle, lang, embeddedSummary);
    }
  }

  _renderWikiBox(box, exactTitle, lang, extractText) {
    const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(exactTitle.replace(/ /g, '_'))}`;
    box.innerHTML = `
      <p class="wiki-text">${extractText}</p>
      <a class="wiki-link" href="${wikiUrl}" target="_blank" rel="noopener noreferrer">
        Wikipédia : ${exactTitle} ↗
      </a>
    `;
  }
}
