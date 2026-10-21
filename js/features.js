/**
 * Central Feature Registry for the Planetarium
 * Single source of truth for views, display toggles, time actions, panels/modals,
 * themes, and keyboard shortcuts.
 */

export const VIEWS = [
  {
    id: 'terrestrial',
    key: '1',
    code: 'Digit1',
    i18nKey: 'views.terrestrial',
    descKey: 'views.terrestrialDesc',
    icon: 'horizon',
    defaultFov: 60,
    minFov: 0.2,
    maxFov: 120
  },
  {
    id: 'celestial',
    key: '2',
    code: 'Digit2',
    i18nKey: 'views.celestial',
    descKey: 'views.celestialDesc',
    icon: 'globe',
    defaultFov: 60,
    minFov: 0.2,
    maxFov: 120
  },
  {
    id: 'telescope',
    key: '3',
    code: 'Digit3',
    i18nKey: 'views.telescope',
    descKey: 'views.telescopeDesc',
    icon: 'telescope',
    defaultFov: 1.5,
    minFov: 0.05,
    maxFov: 10
  },
  {
    id: 'solarsystem',
    key: '4',
    code: 'Digit4',
    i18nKey: 'views.solarsystem',
    descKey: 'views.solarsystemDesc',
    icon: 'orrery',
    defaultFov: 45,
    minFov: 5,
    maxFov: 90
  }
];

export const THEMES = [
  {
    id: 'meridien',
    i18nKey: 'themes.meridien',
    descKey: 'themes.meridienDesc',
    default: true,
    colors: {
      bgPrimary: '#0c1017',
      bgSecondary: '#141b26',
      bgPanel: 'rgba(16, 22, 32, 0.88)',
      accent: '#d4a853',
      accentHover: '#e5be6d',
      textPrimary: '#e8ecf2',
      textMuted: '#8a99ad',
      border: 'rgba(212, 168, 83, 0.25)'
    }
  },
  {
    id: 'classique',
    i18nKey: 'themes.classique',
    descKey: 'themes.classiqueDesc',
    default: false,
    colors: {
      bgPrimary: '#081221',
      bgSecondary: '#0f1f38',
      bgPanel: 'rgba(11, 24, 44, 0.88)',
      accent: '#38bdf8',
      accentHover: '#7dd3fc',
      textPrimary: '#f0f6fc',
      textMuted: '#7d96b5',
      border: 'rgba(56, 189, 248, 0.25)'
    }
  },
  {
    id: 'observatoire',
    i18nKey: 'themes.observatoire',
    descKey: 'themes.observatoireDesc',
    default: false,
    colors: {
      bgPrimary: '#0e0e10',
      bgSecondary: '#18181c',
      bgPanel: 'rgba(20, 20, 24, 0.90)',
      accent: '#f59e0b',
      accentHover: '#fbbf24',
      textPrimary: '#ececee',
      textMuted: '#8e8e99',
      border: 'rgba(245, 158, 11, 0.25)'
    }
  },
  {
    id: 'celeste',
    i18nKey: 'themes.celeste',
    descKey: 'themes.celesteDesc',
    default: false,
    colors: {
      bgPrimary: '#0c0b1d',
      bgSecondary: '#151332',
      bgPanel: 'rgba(18, 16, 42, 0.88)',
      accent: '#a78bfa',
      accentHover: '#c4b5fd',
      textPrimary: '#eeecff',
      textMuted: '#8f8ab8',
      border: 'rgba(167, 139, 250, 0.25)'
    }
  },
  {
    id: 'almanach',
    i18nKey: 'themes.almanach',
    descKey: 'themes.almanachDesc',
    default: false,
    colors: {
      bgPrimary: '#1a1612',
      bgSecondary: '#26201a',
      bgPanel: 'rgba(34, 28, 22, 0.90)',
      accent: '#c88a4b',
      accentHover: '#dca165',
      textPrimary: '#efe6d5',
      textMuted: '#9e8f7a',
      border: 'rgba(200, 138, 75, 0.28)'
    }
  },
  {
    id: 'nocturne',
    i18nKey: 'themes.nocturne',
    descKey: 'themes.nocturneDesc',
    default: false,
    nightVision: true,
    colors: {
      bgPrimary: '#090000',
      bgSecondary: '#120000',
      bgPanel: 'rgba(14, 0, 0, 0.92)',
      accent: '#ff2222',
      accentHover: '#ff4444',
      textPrimary: '#ff2222',
      textMuted: '#991111',
      border: 'rgba(255, 34, 34, 0.35)'
    }
  }
];

export const FEATURES = [
  // === VIEWS ===
  {
    id: 'view.terrestrial',
    category: 'views',
    type: 'view',
    viewId: 'terrestrial',
    key: '1',
    i18nKey: 'views.terrestrial',
    descKey: 'views.terrestrialDesc',
    icon: 'horizon',
    toolbarGroup: 'views'
  },
  {
    id: 'view.celestial',
    category: 'views',
    type: 'view',
    viewId: 'celestial',
    key: '2',
    i18nKey: 'views.celestial',
    descKey: 'views.celestialDesc',
    icon: 'globe',
    toolbarGroup: 'views'
  },
  {
    id: 'view.telescope',
    category: 'views',
    type: 'view',
    viewId: 'telescope',
    key: '3',
    i18nKey: 'views.telescope',
    descKey: 'views.telescopeDesc',
    icon: 'telescope',
    toolbarGroup: 'views'
  },
  {
    id: 'view.solarsystem',
    category: 'views',
    type: 'view',
    viewId: 'solarsystem',
    key: '4',
    i18nKey: 'views.solarsystem',
    descKey: 'views.solarsystemDesc',
    icon: 'orrery',
    toolbarGroup: 'views'
  },

  // === DISPLAY TOGGLES: CONSTELLATIONS & GRIDS ===
  {
    id: 'toggle.constellationLines',
    category: 'constellations',
    type: 'toggle',
    stateKey: 'constellationLines',
    defaultState: true,
    key: 'C',
    i18nKey: 'toggles.constellationLines',
    descKey: 'toggles.constellationLinesDesc',
    icon: 'constellation-lines',
    toolbarGroup: 'sky'
  },
  {
    id: 'toggle.constellationNames',
    category: 'constellations',
    type: 'toggle',
    stateKey: 'constellationNames',
    defaultState: true,
    key: 'V',
    i18nKey: 'toggles.constellationNames',
    descKey: 'toggles.constellationNamesDesc',
    icon: 'constellation-names',
    toolbarGroup: 'sky'
  },
  {
    id: 'toggle.constellationBounds',
    category: 'constellations',
    type: 'toggle',
    stateKey: 'constellationBounds',
    defaultState: false,
    key: 'B',
    i18nKey: 'toggles.constellationBounds',
    descKey: 'toggles.constellationBoundsDesc',
    icon: 'constellation-bounds',
    toolbarGroup: 'sky'
  },
  {
    id: 'toggle.gridAzimuthal',
    category: 'grids',
    type: 'toggle',
    stateKey: 'gridAzimuthal',
    defaultState: false,
    key: 'Z',
    i18nKey: 'toggles.gridAzimuthal',
    descKey: 'toggles.gridAzimuthalDesc',
    icon: 'grid-az',
    toolbarGroup: 'grids'
  },
  {
    id: 'toggle.gridEquatorial',
    category: 'grids',
    type: 'toggle',
    stateKey: 'gridEquatorial',
    defaultState: false,
    key: 'E',
    i18nKey: 'toggles.gridEquatorial',
    descKey: 'toggles.gridEquatorialDesc',
    icon: 'grid-eq',
    toolbarGroup: 'grids'
  },
  {
    id: 'toggle.ecliptic',
    category: 'grids',
    type: 'toggle',
    stateKey: 'ecliptic',
    defaultState: true,
    key: ',',
    i18nKey: 'toggles.ecliptic',
    descKey: 'toggles.eclipticDesc',
    icon: 'ecliptic',
    toolbarGroup: 'grids'
  },

  // === DISPLAY TOGGLES: DEEP SKY & STARS ===
  {
    id: 'toggle.milkyWay',
    category: 'catalog',
    type: 'toggle',
    stateKey: 'milkyWay',
    defaultState: true,
    key: 'M',
    i18nKey: 'toggles.milkyWay',
    descKey: 'toggles.milkyWayDesc',
    icon: 'milky-way',
    toolbarGroup: 'objects'
  },
  {
    id: 'toggle.dssHips',
    category: 'catalog',
    type: 'toggle',
    stateKey: 'dssHips',
    defaultState: false,
    key: 'D',
    i18nKey: 'toggles.dssHips',
    descKey: 'toggles.dssHipsDesc',
    icon: 'dss-hips',
    toolbarGroup: 'objects'
  },
  {
    id: 'toggle.dso',
    category: 'catalog',
    type: 'toggle',
    stateKey: 'dso',
    defaultState: true,
    key: 'N',
    i18nKey: 'toggles.dso',
    descKey: 'toggles.dsoDesc',
    icon: 'dso',
    toolbarGroup: 'objects'
  },
  {
    id: 'toggle.dsoPhotos',
    category: 'catalog',
    type: 'toggle',
    stateKey: 'dsoPhotos',
    defaultState: true,
    key: 'I',
    i18nKey: 'toggles.dsoPhotos',
    descKey: 'toggles.dsoPhotosDesc',
    icon: 'dso-photos',
    toolbarGroup: 'objects'
  },
  {
    id: 'toggle.stars',
    category: 'catalog',
    type: 'toggle',
    stateKey: 'stars',
    defaultState: true,
    key: 'S',
    i18nKey: 'toggles.stars',
    descKey: 'toggles.starsDesc',
    icon: 'stars',
    toolbarGroup: 'objects'
  },
  {
    id: 'toggle.doubleStars',
    category: 'catalog',
    type: 'toggle',
    stateKey: 'doubleStars',
    defaultState: false,
    key: 'W',
    i18nKey: 'toggles.doubleStars',
    descKey: 'toggles.doubleStarsDesc',
    icon: 'double-stars',
    toolbarGroup: 'objects'
  },
  {
    id: 'toggle.variableStars',
    category: 'catalog',
    type: 'toggle',
    stateKey: 'variableStars',
    defaultState: false,
    key: 'Y',
    i18nKey: 'toggles.variableStars',
    descKey: 'toggles.variableStarsDesc',
    icon: 'variable-stars',
    toolbarGroup: 'objects'
  },

  // === DISPLAY TOGGLES: SOLAR SYSTEM & ORBITAL ===
  {
    id: 'toggle.planets',
    category: 'solarsystem',
    type: 'toggle',
    stateKey: 'planets',
    defaultState: true,
    key: 'P',
    i18nKey: 'toggles.planets',
    descKey: 'toggles.planetsDesc',
    icon: 'planet',
    toolbarGroup: 'solarsystem'
  },
  {
    id: 'toggle.asteroids',
    category: 'solarsystem',
    type: 'toggle',
    stateKey: 'asteroids',
    defaultState: true,
    key: 'A',
    i18nKey: 'toggles.asteroids',
    descKey: 'toggles.asteroidsDesc',
    icon: 'asteroid',
    toolbarGroup: 'solarsystem'
  },
  {
    id: 'toggle.satellites',
    category: 'solarsystem',
    type: 'toggle',
    stateKey: 'satellites',
    defaultState: true,
    key: 'O',
    i18nKey: 'toggles.satellites',
    descKey: 'toggles.satellitesDesc',
    icon: 'satellite',
    toolbarGroup: 'solarsystem'
  },
  {
    id: 'toggle.meteors',
    category: 'solarsystem',
    type: 'toggle',
    stateKey: 'meteors',
    defaultState: true,
    key: 'R',
    i18nKey: 'toggles.meteors',
    descKey: 'toggles.meteorsDesc',
    icon: 'meteor',
    toolbarGroup: 'solarsystem'
  },
  {
    id: 'toggle.realPlanetSizes',
    category: 'solarsystem',
    type: 'toggle',
    stateKey: 'realPlanetSizes',
    defaultState: false,
    key: 'U',
    i18nKey: 'toggles.realPlanetSizes',
    descKey: 'toggles.realPlanetSizesDesc',
    icon: 'planet-scale',
    toolbarGroup: 'solarsystem'
  },

  // === DISPLAY TOGGLES: ENVIRONMENT & HORIZON ===
  {
    id: 'toggle.atmosphere',
    category: 'environment',
    type: 'toggle',
    stateKey: 'atmosphere',
    defaultState: true,
    key: 'F',
    i18nKey: 'toggles.atmosphere',
    descKey: 'toggles.atmosphereDesc',
    icon: 'atmosphere',
    toolbarGroup: 'environment'
  },
  {
    id: 'toggle.ground',
    category: 'environment',
    type: 'toggle',
    stateKey: 'ground',
    defaultState: true,
    key: 'G',
    i18nKey: 'toggles.ground',
    descKey: 'toggles.groundDesc',
    icon: 'ground',
    toolbarGroup: 'environment'
  },
  {
    id: 'toggle.horizonProfile',
    category: 'environment',
    type: 'toggle',
    stateKey: 'horizonProfile',
    defaultState: true,
    key: 'H',
    i18nKey: 'toggles.horizonProfile',
    descKey: 'toggles.horizonProfileDesc',
    icon: 'horizon-profile',
    toolbarGroup: 'environment'
  },
  {
    id: 'toggle.cardinals',
    category: 'environment',
    type: 'toggle',
    stateKey: 'cardinals',
    defaultState: true,
    key: 'Q',
    i18nKey: 'toggles.cardinals',
    descKey: 'toggles.cardinalsDesc',
    icon: 'compass',
    toolbarGroup: 'environment'
  },

  // === TIME ACTIONS ===
  {
    id: 'time.playPause',
    category: 'time',
    type: 'action',
    key: 'Space',
    i18nKey: 'time.playPause',
    descKey: 'time.playPauseDesc',
    icon: 'play-pause'
  },
  {
    id: 'time.now',
    category: 'time',
    type: 'action',
    key: 'J',
    i18nKey: 'time.now',
    descKey: 'time.nowDesc',
    icon: 'clock-now'
  },
  {
    id: 'time.reverse',
    category: 'time',
    type: 'action',
    key: 'K',
    i18nKey: 'time.reverse',
    descKey: 'time.reverseDesc',
    icon: 'reverse'
  },
  {
    id: 'time.speedUp',
    category: 'time',
    type: 'action',
    key: 'L',
    i18nKey: 'time.speedUp',
    descKey: 'time.speedUpDesc',
    icon: 'fast-forward'
  },
  {
    id: 'time.slowDown',
    category: 'time',
    type: 'action',
    key: 'Shift+L',
    altKey: '[',
    i18nKey: 'time.slowDown',
    descKey: 'time.slowDownDesc',
    icon: 'rewind'
  },
  {
    id: 'time.stepForward',
    category: 'time',
    type: 'action',
    key: ']',
    i18nKey: 'time.stepForward',
    descKey: 'time.stepForwardDesc',
    icon: 'step-forward'
  },
  {
    id: 'time.stepBackward',
    category: 'time',
    type: 'action',
    key: '[',
    i18nKey: 'time.stepBackward',
    descKey: 'time.stepBackwardDesc',
    icon: 'step-backward'
  },

  // === PANELS & MODALS ===
  {
    id: 'panel.objectCard',
    category: 'panels',
    type: 'panel',
    panelId: 'objectCard',
    key: 'Enter',
    i18nKey: 'panels.objectCard',
    descKey: 'panels.objectCardDesc',
    icon: 'info-card',
    sections: [
      'tonight',
      'physics',
      'position',
      'identity',
      'eyepiece',
      'learnMore'
    ]
  },
  {
    id: 'panel.tonight',
    category: 'panels',
    type: 'panel',
    panelId: 'tonight',
    key: 'T',
    i18nKey: 'panels.tonight',
    descKey: 'panels.tonightDesc',
    icon: 'tonight',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.twilight',
    category: 'panels',
    type: 'panel',
    panelId: 'twilight',
    key: 'Shift+T',
    i18nKey: 'panels.twilight',
    descKey: 'panels.twilightDesc',
    icon: 'twilight',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.weather',
    category: 'panels',
    type: 'panel',
    panelId: 'weather',
    key: 'Shift+W',
    i18nKey: 'panels.weather',
    descKey: 'panels.weatherDesc',
    icon: 'weather',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.satellites',
    category: 'panels',
    type: 'panel',
    panelId: 'satellites',
    key: 'Shift+S',
    i18nKey: 'panels.satellites',
    descKey: 'panels.satellitesDesc',
    icon: 'satellite-passes',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.events',
    category: 'panels',
    type: 'panel',
    panelId: 'events',
    key: 'Shift+E',
    i18nKey: 'panels.events',
    descKey: 'panels.eventsDesc',
    icon: 'eclipse',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.location',
    category: 'panels',
    type: 'panel',
    panelId: 'location',
    key: 'Shift+G',
    i18nKey: 'panels.location',
    descKey: 'panels.locationDesc',
    icon: 'location',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.horizon',
    category: 'panels',
    type: 'panel',
    panelId: 'horizon',
    key: 'Shift+H',
    i18nKey: 'panels.horizon',
    descKey: 'panels.horizonDesc',
    icon: 'horizon-editor',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.telescope',
    category: 'panels',
    type: 'panel',
    panelId: 'telescope',
    key: 'Shift+O',
    i18nKey: 'panels.telescope',
    descKey: 'panels.telescopeDesc',
    icon: 'eyepiece',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.offline',
    category: 'panels',
    type: 'panel',
    panelId: 'offline',
    key: 'Shift+D',
    i18nKey: 'panels.offline',
    descKey: 'panels.offlineDesc',
    icon: 'offline-packs',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.manual',
    category: 'panels',
    type: 'panel',
    panelId: 'manual',
    key: '?',
    i18nKey: 'panels.manual',
    descKey: 'panels.manualDesc',
    icon: 'help',
    toolbarGroup: 'panels'
  },
  {
    id: 'panel.commandPalette',
    category: 'panels',
    type: 'panel',
    panelId: 'commandPalette',
    key: 'Ctrl+K',
    macKey: '⌘K',
    i18nKey: 'panels.commandPalette',
    descKey: 'panels.commandPaletteDesc',
    icon: 'search',
    toolbarGroup: 'search'
  }
];

/**
 * Automatically generated list of keyboard shortcuts from FEATURES.
 */
export const SHORTCUTS = FEATURES.filter((f) => Boolean(f.key)).map((f) => ({
  id: f.id,
  key: f.key,
  macKey: f.macKey || f.key,
  altKey: f.altKey || null,
  category: f.category,
  type: f.type,
  i18nKey: f.i18nKey,
  descKey: f.descKey
}));

const featureIndex = new Map(FEATURES.map((f) => [f.id, f]));

/**
 * Look up a feature definition by its ID.
 * @param {string} id - Feature ID (e.g., 'toggle.constellationLines')
 * @returns {object|undefined}
 */
export function getFeatureById(id) {
  return featureIndex.get(id);
}

/**
 * Group features by category for menus, command palette, and manual generation.
 * @returns {Record<string, Array<object>>}
 */
export function getFeaturesByCategory() {
  const categories = {};
  for (const feature of FEATURES) {
    if (!categories[feature.category]) {
      categories[feature.category] = [];
    }
    categories[feature.category].push(feature);
  }
  return categories;
}

/**
 * Returns a normalized shortcut lookup map from key string to feature object.
 * Keys are normalized (e.g. 'c', 'shift+t', 'ctrl+k', 'space', '1', ',').
 * @returns {Map<string, object>}
 */
export function getShortcutMap() {
  const map = new Map();
  for (const feature of FEATURES) {
    if (!feature.key) continue;
    const normalized = normalizeShortcutKey(feature.key);
    map.set(normalized, feature);
    if (feature.altKey) {
      map.set(normalizeShortcutKey(feature.altKey), feature);
    }
  }
  return map;
}

/**
 * Helper to normalize key strings for matching KeyboardEvents.
 * @param {string} keyStr
 * @returns {string}
 */
export function normalizeShortcutKey(keyStr) {
  if (!keyStr) return '';
  const trimmed = keyStr.trim();
  if (trimmed === ' ') return 'space';
  return trimmed.toLowerCase();
}

/**
 * Default display state dictionary derived directly from toggle features.
 * @returns {Record<string, boolean>}
 */
export function getDefaultToggleState() {
  const state = {};
  for (const feature of FEATURES) {
    if (feature.type === 'toggle' && feature.stateKey) {
      state[feature.stateKey] = Boolean(feature.defaultState);
    }
  }
  return state;
}
