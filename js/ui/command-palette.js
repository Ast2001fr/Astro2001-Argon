/**
 * js/ui/command-palette.js
 * Unified Command Palette (⌘K / Ctrl-K) searching:
 * - Actions, Views, Display Toggles & Themes (with keyboard shortcuts generated from `js/features.js`)
 * - Solar System bodies (Sun, Moon, 8 Planets, Jovian & Saturnian Moons, 8 Bright Asteroids)
 * - Stars (3,428 proper names + Bayer/Flamsteed + HD / HIP designations)
 * - Deep Sky Objects (15,618 OpenNGC objects: Messier, NGC, IC, common names)
 * - Satellites (177 SGP4 satellites including ISS)
 * - 88 Official IAU Constellations
 */

export class CommandPaletteUI {
  constructor(app) {
    this.app = app;
    this.overlay = document.getElementById('cmd-palette-overlay');
    this.input = document.getElementById('cmd-palette-input');
    this.resultsEl = document.getElementById('cmd-palette-results');
    this.isOpen = false;
    this.selectedIndex = 0;
    this.currentItems = [];

    this._bindEvents();
  }

  _bindEvents() {
    this.overlay?.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this.input?.addEventListener('input', () => {
      this.selectedIndex = 0;
      this._updateResults(this.input.value);
    });

    this.input?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.currentItems.length > 0) {
          this.selectedIndex = (this.selectedIndex + 1) % this.currentItems.length;
          this._renderHighlight();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.currentItems.length > 0) {
          this.selectedIndex = (this.selectedIndex - 1 + this.currentItems.length) % this.currentItems.length;
          this._renderHighlight();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = this.currentItems[this.selectedIndex];
        if (item) this._executeItem(item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (!this.overlay || !this.input) return;
    this.isOpen = true;
    this.overlay.classList.remove('hidden');
    this.input.value = '';
    this.selectedIndex = 0;
    this._updateResults('');
    setTimeout(() => this.input.focus(), 10);
  }

  close() {
    if (!this.overlay) return;
    this.isOpen = false;
    this.overlay.classList.add('hidden');
  }

  _updateResults(rawQuery) {
    const q = rawQuery.trim();
    this.currentItems = this.app.searchCommandPalette(q, 32);
    this._renderList();
  }

  _renderList() {
    if (!this.resultsEl) return;
    if (this.currentItems.length === 0) {
      this.resultsEl.innerHTML = `<div class="cmd-empty">Aucun résultat correspondant.</div>`;
      return;
    }

    this.resultsEl.innerHTML = this.currentItems.map((item, idx) => `
      <div class="cmd-item ${idx === this.selectedIndex ? 'active' : ''}" data-cmd-idx="${idx}">
        <div class="cmd-item-left">
          <span class="cmd-item-icon">${item.icon || '✦'}</span>
          <div>
            <div class="cmd-item-title">${item.title}</div>
            <div class="cmd-item-sub">${item.subtitle || ''}</div>
          </div>
        </div>
        <div class="cmd-item-right">
          ${item.badge ? `<span class="badge-subtle">${item.badge}</span>` : ''}
          ${item.shortcut ? `<kbd>${item.shortcut}</kbd>` : ''}
        </div>
      </div>
    `).join('');

    this.resultsEl.querySelectorAll('.cmd-item').forEach(el => {
      el.addEventListener('mouseenter', () => {
        this.selectedIndex = Number(el.getAttribute('data-cmd-idx'));
        this._renderHighlight();
      });
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-cmd-idx'));
        const item = this.currentItems[idx];
        if (item) this._executeItem(item);
      });
    });
  }

  _renderHighlight() {
    if (!this.resultsEl) return;
    const nodes = this.resultsEl.querySelectorAll('.cmd-item');
    nodes.forEach((n, idx) => {
      n.classList.toggle('active', idx === this.selectedIndex);
      if (idx === this.selectedIndex) {
        n.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  _executeItem(item) {
    this.close();
    if (item.actionFn) {
      item.actionFn();
    }
  }
}
