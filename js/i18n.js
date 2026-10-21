/**
 * Dynamic Internationalization (i18n) Loader & Localization Engine
 * Loads only the active language dictionary (`./i18n-${lang}.js`) on demand.
 * Supported languages: 'fr' (default), 'en', 'es', 'de'.
 */

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français', locale: 'fr-FR' },
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'es', label: 'Español', locale: 'es-ES' },
  { code: 'de', label: 'Deutsch', locale: 'de-DE' }
];

const STORAGE_KEY = 'astro_lang';

let currentLang = 'fr';
let currentDict = {};
const loadedDicts = new Map();
const listeners = new Set();

/**
 * Normalize a language code to one of the supported 2-letter codes.
 * @param {string} lang
 * @returns {'fr'|'en'|'es'|'de'}
 */
function normalizeLang(lang) {
  if (!lang || typeof lang !== 'string') return 'fr';
  const short = lang.trim().slice(0, 2).toLowerCase();
  if (SUPPORTED_LANGUAGES.some((l) => l.code === short)) {
    return short;
  }
  return 'fr';
}

/**
 * Dynamically import a language module (`./i18n-${lang}.js`) only when needed.
 * @param {string} lang
 * @returns {Promise<object>}
 */
async function loadLanguageDictionary(lang) {
  const normalized = normalizeLang(lang);
  if (loadedDicts.has(normalized)) {
    return loadedDicts.get(normalized);
  }
  const mod = await import(`./i18n-${normalized}.js`);
  const dict = mod.default || mod;
  loadedDicts.set(normalized, dict);
  return dict;
}

/**
 * Initialize i18n with saved preference or default language ('fr').
 * @param {string} [defaultLang='fr']
 * @returns {Promise<string>} Active language code
 */
export async function initI18n(defaultLang = 'fr') {
  let saved = null;
  try {
    if (typeof localStorage !== 'undefined') {
      saved = localStorage.getItem(STORAGE_KEY);
    }
  } catch (_) {
    // Ignore storage access errors in restricted contexts
  }
  const initialLang = normalizeLang(saved || defaultLang);
  await setLanguage(initialLang);
  return currentLang;
}

/**
 * Switch the active language dynamically, update DOM translations, and notify listeners.
 * @param {string} lang - 'fr', 'en', 'es', or 'de'
 * @returns {Promise<string>} Active language code
 */
export async function setLanguage(lang) {
  const target = normalizeLang(lang);
  const dict = await loadLanguageDictionary(target);
  currentLang = target;
  currentDict = dict;

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, currentLang);
    }
  } catch (_) {
    // Ignore storage access errors
  }

  if (typeof document !== 'undefined') {
    if (document.documentElement) {
      document.documentElement.lang = currentLang;
    }
    applyDomTranslations(document);
  }

  for (const cb of listeners) {
    try {
      cb(currentLang, currentDict);
    } catch (err) {
      console.error('Error in i18n language change listener:', err);
    }
  }

  return currentLang;
}

/**
 * Get the currently active 2-letter language code.
 * @returns {'fr'|'en'|'es'|'de'}
 */
export function getLanguage() {
  return currentLang;
}

/**
 * Resolve a dot-separated key inside a dictionary object.
 * Supports both nested objects (`dict.views.terrestrial`) and flat keys (`dict['views.terrestrial']`).
 * @param {object} dict
 * @param {string} key
 * @returns {*}
 */
function resolveKey(dict, key) {
  if (!dict || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key];
  }
  const parts = key.split('.');
  let cur = dict;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * Translate a key with optional parameter interpolation `{param}` or `{{param}}`.
 * @param {string} key - Dot-notated translation key
 * @param {Record<string, string|number>} [params={}] - Interpolation variables
 * @returns {string}
 */
export function t(key, params = {}) {
  if (!key) return '';
  const raw = resolveKey(currentDict, key);
  if (raw === undefined || raw === null) {
    return key;
  }
  if (typeof raw !== 'string') {
    return raw;
  }
  if (!params || Object.keys(params).length === 0) {
    return raw;
  }
  return raw.replace(/\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}/g, (match, p1) => {
    return Object.prototype.hasOwnProperty.call(params, p1) && params[p1] !== undefined
      ? String(params[p1])
      : match;
  });
}

// Canonical map for case-insensitive 3-letter IAU code lookup
const IAU_CODE_CANONICAL = {
  and: 'And', ant: 'Ant', aps: 'Aps', aqr: 'Aqr', aql: 'Aql', ara: 'Ara',
  ari: 'Ari', aur: 'Aur', boo: 'Boo', cae: 'Cae', cam: 'Cam', cnc: 'Cnc',
  cvn: 'CVn', cma: 'CMa', cmi: 'CMi', cap: 'Cap', car: 'Car', cas: 'Cas',
  cen: 'Cen', cep: 'Cep', cet: 'Cet', cha: 'Cha', cir: 'Cir', col: 'Col',
  com: 'Com', cra: 'CrA', crb: 'CrB', crv: 'Crv', crt: 'Crt', cru: 'Cru',
  cyg: 'Cyg', del: 'Del', dor: 'Dor', dra: 'Dra', equ: 'Equ', eri: 'Eri',
  for: 'For', gem: 'Gem', gru: 'Gru', her: 'Her', hor: 'Hor', hya: 'Hya',
  hyi: 'Hyi', ind: 'Ind', lac: 'Lac', leo: 'Leo', lmi: 'LMi', lep: 'Lep',
  lib: 'Lib', lup: 'Lup', lyn: 'Lyn', lyr: 'Lyr', men: 'Men', mic: 'Mic',
  mon: 'Mon', mus: 'Mus', nor: 'Nor', oct: 'Oct', oph: 'Oph', ori: 'Ori',
  pav: 'Pav', peg: 'Peg', per: 'Per', phe: 'Phe', pic: 'Pic', psc: 'Psc',
  psa: 'PsA', pup: 'Pup', pyx: 'Pyx', ret: 'Ret', sge: 'Sge', sgr: 'Sgr',
  sco: 'Sco', scl: 'Scl', sct: 'Sct', ser: 'Ser', sex: 'Sex', tau: 'Tau',
  tel: 'Tel', tri: 'Tri', tra: 'TrA', tuc: 'Tuc', uma: 'UMa', umi: 'UMi',
  vel: 'Vel', vir: 'Vir', vol: 'Vol', vul: 'Vul'
};

/**
 * Return the translated constellation name for any of the 88 IAU 3-letter codes.
 * Handles both standard casing ('UMa') and uppercase/lowercase variants ('UMA', 'uma').
 * @param {string} code - 3-letter IAU constellation code
 * @returns {string}
 */
export function getConstellationName(code) {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim();
  const canonical = IAU_CODE_CANONICAL[trimmed.toLowerCase()] || trimmed;
  if (currentDict.constellations && currentDict.constellations[canonical]) {
    return currentDict.constellations[canonical];
  }
  return canonical;
}

/**
 * Get the BCP-47 locale tag for the current language.
 * @returns {string}
 */
function getCurrentLocale() {
  const entry = SUPPORTED_LANGUAGES.find((l) => l.code === currentLang);
  return entry ? entry.locale : 'fr-FR';
}

/**
 * Format a Date object or timestamp according to the active language and optional timezone.
 * @param {Date|number|string} date
 * @param {string} [tz] - Optional IANA timezone (e.g., 'Europe/Paris', 'UTC')
 * @param {Intl.DateTimeFormatOptions} [options] - Formatting options
 * @returns {string}
 */
export function formatDateTime(date, tz, options = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';

  const fmtOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options
  };

  if (tz) {
    fmtOptions.timeZone = tz;
  }

  try {
    return new Intl.DateTimeFormat(getCurrentLocale(), fmtOptions).format(d);
  } catch (_) {
    // Fallback if timezone is unrecognized
    const { timeZone, ...fallbackOpts } = fmtOptions;
    return new Intl.DateTimeFormat(getCurrentLocale(), fallbackOpts).format(d);
  }
}

/**
 * Format a numeric value according to the active language's decimal/grouping conventions.
 * @param {number} num
 * @param {number} [decimals] - Optional fixed number of fraction digits
 * @returns {string}
 */
export function formatNumber(num, decimals) {
  if (num === null || num === undefined || Number.isNaN(Number(num))) {
    return '—';
  }
  const value = Number(num);
  const opts = {};
  if (typeof decimals === 'number') {
    opts.minimumFractionDigits = decimals;
    opts.maximumFractionDigits = decimals;
  }
  return new Intl.NumberFormat(getCurrentLocale(), opts).format(value);
}

/**
 * Apply translations to all elements with `data-i18n`, `data-i18n-title`,
 * `data-i18n-placeholder`, or `data-i18n-aria-label` within `root`.
 * @param {Document|Element} [root=document]
 */
export function applyDomTranslations(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const textEls = root.querySelectorAll('[data-i18n]');
  for (const el of textEls) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const val = t(key);
      if (typeof val === 'string' && val !== key) {
        el.textContent = val;
      }
    }
  }

  const htmlEls = root.querySelectorAll('[data-i18n-html]');
  for (const el of htmlEls) {
    const key = el.getAttribute('data-i18n-html');
    if (key) {
      const val = t(key);
      if (typeof val === 'string' && val !== key) {
        el.innerHTML = val;
      }
    }
  }

  const titleEls = root.querySelectorAll('[data-i18n-title]');
  for (const el of titleEls) {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      const val = t(key);
      if (val !== key) {
        el.setAttribute('title', val);
      }
    }
  }

  const placeholderEls = root.querySelectorAll('[data-i18n-placeholder]');
  for (const el of placeholderEls) {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) {
      const val = t(key);
      if (val !== key) {
        el.setAttribute('placeholder', val);
      }
    }
  }

  const ariaEls = root.querySelectorAll('[data-i18n-aria-label]');
  for (const el of ariaEls) {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key) {
      const val = t(key);
      if (val !== key) {
        el.setAttribute('aria-label', val);
      }
    }
  }
}

/**
 * Subscribe to language changes. Returns an unsubscribe function.
 * @param {(lang: string, dict: object) => void} callback
 * @returns {() => void}
 */
export function onLanguageChange(callback) {
  if (typeof callback === 'function') {
    listeners.add(callback);
  }
  return () => {
    listeners.delete(callback);
  };
}
