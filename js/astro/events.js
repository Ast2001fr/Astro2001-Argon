/**
 * @fileoverview Astronomical events engine:
 * - Rise, Transit, Set with custom 360° user horizon profile (« Mon horizon »)
 * - Solar twilights (Civil -6°, Nautical -12°, Astronomical -18°, Sunrise/Sunset, Dark night duration)
 * - 13 Major Meteor Showers (exact J2000 solar longitude activity curve, radiant drift, peak JD for any year, ZHR & local rate)
 * - Complete Astronomical Events Calendar (Solar & Lunar Eclipses with geographic path coordinates,
 *   Lunar Phases, Perigee/Apogee, Planetary Oppositions, Greatest Elongations, Close Conjunctions, Seasons)
 * Reference: Jean Meeus, "Astronomical Algorithms" (2nd Edition), Chapters 15, 27, 49, 50, 54.
 */

import {
  DEG2RAD,
  RAD2DEG,
  J2000,
  AU_KM,
  degToRad,
  radToDeg,
  normalizeDeg,
  normalizeDegSigned,
  clamp,
  dateToJD,
  jdToDate,
  getJDE,
  getDeltaT,
  getLST,
  equatorialToHorizontal,
  angularSeparation,
  getSolarLongitudeJ2000,
  getSolarLongitudeOfDate,
  solarLongitudeToJD
} from './time.js';
import {
  computeSun,
  computeMoon,
  computePlanet,
  computeBody,
  getPlanetHeliocentric
} from './solar-system.js';

/**
 * Default 13 Major IMO Meteor Showers catalog.
 * Used when external meteorsData is not supplied or to enrich it.
 */
export const DEFAULT_METEOR_SHOWERS = [
  {
    id: 'quadrantids',
    code: 'QUA',
    name: 'Quadrantids',
    nameFr: 'Quadrantides',
    ra: 230.1,
    dec: 48.5,
    dRa: 0.6,
    dDec: -0.2,
    peakSolarLon: 283.15,
    fwhmDeg: 0.8,
    activeStartLon: 276.0,
    activeEndLon: 291.0,
    zhr: 110,
    vKmS: 41,
    rPop: 2.1,
    parentBody: '2003 EH1'
  },
  {
    id: 'alpha_centaurids',
    code: 'ACE',
    name: 'Alpha Centaurids',
    nameFr: 'Alpha Centaurides',
    ra: 210.0,
    dec: -59.0,
    dRa: 1.3,
    dDec: -0.3,
    peakSolarLon: 319.2,
    fwhmDeg: 1.5,
    activeStartLon: 308.0,
    activeEndLon: 331.0,
    zhr: 6,
    vKmS: 56,
    rPop: 2.0,
    parentBody: 'Unknown'
  },
  {
    id: 'lyrids',
    code: 'LYR',
    name: 'Lyrids',
    nameFr: 'Lyrides',
    ra: 271.4,
    dec: 33.6,
    dRa: 1.1,
    dDec: 0.0,
    peakSolarLon: 32.32,
    fwhmDeg: 1.2,
    activeStartLon: 24.0,
    activeEndLon: 39.0,
    zhr: 18,
    vKmS: 49,
    rPop: 2.1,
    parentBody: 'C/1861 G1 (Thatcher)'
  },
  {
    id: 'eta_aquariids',
    code: 'ETA',
    name: 'Eta Aquariids',
    nameFr: 'Êta Aquarides',
    ra: 338.0,
    dec: -1.0,
    dRa: 0.9,
    dDec: 0.4,
    peakSolarLon: 45.5,
    fwhmDeg: 4.5,
    activeStartLon: 29.0,
    activeEndLon: 67.0,
    zhr: 50,
    vKmS: 66,
    rPop: 2.4,
    parentBody: '1P/Halley'
  },
  {
    id: 'sda_aquariids',
    code: 'SDA',
    name: 'Southern Delta Aquariids',
    nameFr: 'Delta Aquarides Sud',
    ra: 340.0,
    dec: -16.0,
    dRa: 0.8,
    dDec: 0.2,
    peakSolarLon: 127.0,
    fwhmDeg: 6.0,
    activeStartLon: 110.0,
    activeEndLon: 150.0,
    zhr: 25,
    vKmS: 41,
    rPop: 2.5,
    parentBody: '96P/Machholz'
  },
  {
    id: 'perseids',
    code: 'PER',
    name: 'Perseids',
    nameFr: 'Perséides',
    ra: 48.0,
    dec: 58.0,
    dRa: 1.35,
    dDec: 0.12,
    peakSolarLon: 140.0,
    fwhmDeg: 2.8,
    activeStartLon: 114.0,
    activeEndLon: 152.0,
    zhr: 100,
    vKmS: 59,
    rPop: 2.2,
    parentBody: '109P/Swift-Tuttle'
  },
  {
    id: 'draconids',
    code: 'DRA',
    name: 'Draconids',
    nameFr: 'Draconides',
    ra: 262.0,
    dec: 54.0,
    dRa: 0.0,
    dDec: 0.0,
    peakSolarLon: 195.4,
    fwhmDeg: 0.6,
    activeStartLon: 193.0,
    activeEndLon: 198.0,
    zhr: 10,
    vKmS: 20,
    rPop: 2.6,
    parentBody: '21P/Giacobini-Zinner'
  },
  {
    id: 'orionids',
    code: 'ORI',
    name: 'Orionids',
    nameFr: 'Orionides',
    ra: 95.0,
    dec: 16.0,
    dRa: 0.7,
    dDec: 0.1,
    peakSolarLon: 208.0,
    fwhmDeg: 4.5,
    activeStartLon: 190.0,
    activeEndLon: 225.0,
    zhr: 20,
    vKmS: 66,
    rPop: 2.5,
    parentBody: '1P/Halley'
  },
  {
    id: 'southern_taurids',
    code: 'STA',
    name: 'Southern Taurids',
    nameFr: 'Taurides Sud',
    ra: 50.0,
    dec: 13.6,
    dRa: 0.8,
    dDec: 0.2,
    peakSolarLon: 223.0,
    fwhmDeg: 10.0,
    activeStartLon: 168.0,
    activeEndLon: 258.0,
    zhr: 5,
    vKmS: 27,
    rPop: 2.3,
    parentBody: '2P/Encke'
  },
  {
    id: 'northern_taurids',
    code: 'NTA',
    name: 'Northern Taurids',
    nameFr: 'Taurides Nord',
    ra: 58.0,
    dec: 22.0,
    dRa: 0.8,
    dDec: 0.2,
    peakSolarLon: 230.0,
    fwhmDeg: 10.0,
    activeStartLon: 206.0,
    activeEndLon: 268.0,
    zhr: 5,
    vKmS: 29,
    rPop: 2.3,
    parentBody: '2P/Encke'
  },
  {
    id: 'leonids',
    code: 'LEO',
    name: 'Leonids',
    nameFr: 'Léonides',
    ra: 152.0,
    dec: 22.0,
    dRa: 0.7,
    dDec: -0.4,
    peakSolarLon: 235.27,
    fwhmDeg: 1.5,
    activeStartLon: 224.0,
    activeEndLon: 248.0,
    zhr: 15,
    vKmS: 71,
    rPop: 2.5,
    parentBody: '55P/Tempel-Tuttle'
  },
  {
    id: 'geminids',
    code: 'GEM',
    name: 'Geminids',
    nameFr: 'Géminides',
    ra: 112.0,
    dec: 33.0,
    dRa: 1.0,
    dDec: -0.1,
    peakSolarLon: 262.2,
    fwhmDeg: 2.2,
    activeStartLon: 252.0,
    activeEndLon: 268.0,
    zhr: 150,
    vKmS: 35,
    rPop: 2.6,
    parentBody: '3200 Phaethon'
  },
  {
    id: 'ursids',
    code: 'URS',
    name: 'Ursids',
    nameFr: 'Ursides',
    ra: 217.0,
    dec: 76.0,
    dRa: 0.0,
    dDec: 0.0,
    peakSolarLon: 270.7,
    fwhmDeg: 1.0,
    activeStartLon: 265.0,
    activeEndLon: 275.0,
    zhr: 10,
    vKmS: 33,
    rPop: 3.0,
    parentBody: '8P/Tuttle'
  }
];

/**
 * Compute Rise, Transit (culmination), and Set times and azimuths/altitudes for any celestial object,
 * taking into account a custom azimuth-dependent 360° horizon elevation profile `targetAltFn(azDeg)`.
 *
 * When the user edits their « Mon horizon » profile (trees, buildings, mountains in N/E/S/W),
 * `targetAltFn(azDeg)` evaluates the obstacle altitude at the object's instantaneous azimuth,
 * shifting rise and set times and azimuths accurately!
 *
 * @param {function(number): {ra: number, dec: number} | {ra: number, dec: number} | string} getCoordsAtJD
 *   Function `(jd) => ({ ra, dec })`, static `{ ra, dec }` object, or body ID string (`'sun'`, `'moon'`, `'mars'`, etc.)
 * @param {number} jdRef - Reference Julian Date (e.g., local noon or current JD)
 * @param {number} latDeg - Observer latitude in degrees
 * @param {number} lonDeg - Observer longitude in degrees
 * @param {function(number): number | number} [targetAltFn=-0.5667]
 *   Either a function `(azDeg) => targetTrueAltDeg` or a constant threshold in degrees
 *   (default `-0.5667°` for stars/planets; use `-0.8333°` for Sun, `+0.125°` for Moon)
 * @returns {{
 *   riseJD: number|null,
 *   transitJD: number|null,
 *   setJD: number|null,
 *   riseAz: number|null,
 *   transitAlt: number,
 *   setAz: number|null,
 *   maxAlt: number,
 *   minAlt: number,
 *   isCircumpolar: boolean,
 *   neverRises: boolean,
 *   isAboveHorizon: boolean
 * }}
 */
export function computeRiseTransitSet(
  getCoordsAtJD,
  jdRef,
  latDeg,
  lonDeg,
  targetAltFn = -0.5667
) {
  const observer = { lat: latDeg, lon: lonDeg };

  // Normalize coordinate provider
  let coordFn;
  let defaultOffset = -0.5667;
  if (typeof getCoordsAtJD === 'function') {
    coordFn = getCoordsAtJD;
  } else if (typeof getCoordsAtJD === 'string') {
    const bodyId = getCoordsAtJD.toLowerCase();
    if (bodyId === 'sun') defaultOffset = -0.8333;
    else if (bodyId === 'moon') defaultOffset = 0.125;
    coordFn = (tJD) => computeBody(bodyId, tJD, observer);
  } else if (getCoordsAtJD && typeof getCoordsAtJD.ra === 'number') {
    const fixed = { ra: getCoordsAtJD.ra, dec: getCoordsAtJD.dec };
    coordFn = () => fixed;
  } else {
    throw new Error('Invalid getCoordsAtJD passed to computeRiseTransitSet');
  }

  // Normalize horizon threshold function
  const evalTargetAlt =
    typeof targetAltFn === 'function'
      ? (az) => targetAltFn(az)
      : typeof targetAltFn === 'number'
        ? () => targetAltFn
        : () => defaultOffset;

  function evalState(tJD) {
    const c = coordFn(tJD);
    const lst = getLST(tJD, lonDeg);
    const h = equatorialToHorizontal(c.ra, c.dec, lst, latDeg);
    const thresh = evalTargetAlt(h.az);
    return {
      jd: tJD,
      ra: c.ra,
      dec: c.dec,
      alt: h.alt,
      az: h.az,
      ha: h.ha,
      thresh,
      diff: h.alt - thresh
    };
  }

  // Center the 24-hour search window on the local civil day (00:00 to 24:00 local solar time)
  const localSolarDayOffset = lonDeg / 360.0;
  const startJD = Math.floor(jdRef + 0.5 + localSolarDayOffset) - 0.5 - localSolarDayOffset;
  const endJD = startJD + 1.0;

  // Sample 96 intervals (15-minute steps) across the 24-hour window
  const N = 96;
  const step = 1.0 / N;
  const samples = [];
  let maxAlt = -90.0;
  let minAlt = 90.0;
  let maxSampleIdx = 0;
  let aboveCount = 0;

  for (let i = 0; i <= N; i++) {
    const t = startJD + i * step;
    const s = evalState(t);
    samples.push(s);
    if (s.alt > maxAlt) {
      maxAlt = s.alt;
      maxSampleIdx = i;
    }
    if (s.alt < minAlt) {
      minAlt = s.alt;
    }
    if (s.diff >= 0) {
      aboveCount++;
    }
  }

  // Refine Transit (upper culmination where HA crosses 0 or altitude reaches maximum)
  let transitJD = samples[maxSampleIdx].jd;
  for (let i = 0; i < N; i++) {
    const h1 = samples[i].ha;
    const h2 = samples[i + 1].ha;
    // Upper culmination occurs when hour angle passes from negative (-15..0) to positive (0..+15)
    if (h1 <= 0 && h2 >= 0 && Math.abs(h2 - h1) < 40) {
      let a = samples[i].jd;
      let b = samples[i + 1].ha === 0 ? samples[i + 1].jd : samples[i + 1].jd;
      for (let iter = 0; iter < 10; iter++) {
        const mid = 0.5 * (a + b);
        const st = evalState(mid);
        if (st.ha < 0) a = mid;
        else b = mid;
      }
      transitJD = 0.5 * (a + b);
      break;
    }
  }
  const transitState = evalState(transitJD);
  const transitAlt = transitState.alt;
  if (transitAlt > maxAlt) maxAlt = transitAlt;

  // Bisection solver for horizon + obstacle crossing (diff == 0)
  function refineCrossing(t1, t2) {
    let a = t1;
    let b = t2;
    let fa = evalState(a).diff;
    for (let iter = 0; iter < 12; iter++) {
      const mid = 0.5 * (a + b);
      const fmid = evalState(mid).diff;
      if ((fa <= 0 && fmid <= 0) || (fa > 0 && fmid > 0)) {
        a = mid;
        fa = fmid;
      } else {
        b = mid;
      }
    }
    return evalState(0.5 * (a + b));
  }

  let riseState = null;
  let setState = null;

  for (let i = 0; i < N; i++) {
    const s1 = samples[i];
    const s2 = samples[i + 1];
    if (s1.diff < 0 && s2.diff >= 0 && !riseState) {
      riseState = refineCrossing(s1.jd, s2.jd);
    } else if (s1.diff >= 0 && s2.diff < 0 && !setState) {
      setState = refineCrossing(s1.jd, s2.jd);
    }
  }

  const isCircumpolar = !riseState && !setState && aboveCount === N + 1;
  const neverRises = !riseState && !setState && aboveCount === 0;
  const currentNow = evalState(jdRef);

  return {
    riseJD: riseState ? riseState.jd : null,
    transitJD,
    setJD: setState ? setState.jd : null,
    riseAz: riseState ? riseState.az : null,
    transitAlt,
    setAz: setState ? setState.az : null,
    maxAlt,
    minAlt,
    isCircumpolar,
    neverRises,
    isAboveHorizon: currentNow.diff >= 0
  };
}

/**
 * Compute all solar twilight times and true dark night duration for the night following local noon near `jd`.
 * Computes Sunset, Civil Dusk (-6°), Nautical Dusk (-12°), Astronomical Dusk (-18°),
 * Solar Midnight, Astronomical Dawn (-18°), Nautical Dawn (-12°), Civil Dawn (-6°), Sunrise, and Solar Noon.
 *
 * @param {number} jd - Reference Julian Date
 * @param {number} latDeg - Observer latitude in degrees
 * @param {number} lonDeg - Observer longitude in degrees
 * @param {function(number): number} [horizonFn=null] - Optional custom horizon elevation profile function(azDeg)
 * @returns {object}
 */
export function computeTwilights(jd, latDeg, lonDeg, horizonFn = null) {
  const observer = { lat: latDeg, lon: lonDeg };

  // In Julian Date, integer JD.0 is 12:00 UTC (noon).
  // So local noon is when (jd + lonDeg / 360) is an integer.
  const localSolarOffset = lonDeg / 360.0;
  const jdNoonStart = Math.floor(jd + localSolarOffset + 0.25) - localSolarOffset;
  const jdMidnight = jdNoonStart + 0.5;
  const jdNoonEnd = jdNoonStart + 1.0;

  function findSunCrossings(thresholdDeg, useHorizonProfile = false) {
    const targetFn = (az) => {
      const hCustom = useHorizonProfile && typeof horizonFn === 'function' ? Math.max(0, horizonFn(az)) : 0;
      return thresholdDeg + hCustom;
    };

    const N = 96;
    const step = 1.0 / N;
    let duskJD = null;
    let dawnJD = null;
    let minAlt = 90.0;
    let minJD = jdMidnight;
    let maxAlt = -90.0;
    let maxJD = jdNoonStart;

    let prevT = jdNoonStart;
    const prevSun = computeSun(prevT, observer);
    const prevH = equatorialToHorizontal(prevSun.ra, prevSun.dec, getLST(prevT, lonDeg), latDeg);
    let prevDiff = prevH.alt - targetFn(prevH.az);

    for (let i = 1; i <= N; i++) {
      const t = jdNoonStart + i * step;
      const s = computeSun(t, observer);
      const h = equatorialToHorizontal(s.ra, s.dec, getLST(t, lonDeg), latDeg);
      const curDiff = h.alt - targetFn(h.az);

      if (h.alt < minAlt) {
        minAlt = h.alt;
        minJD = t;
      }
      if (h.alt > maxAlt) {
        maxAlt = h.alt;
        maxJD = t;
      }

      // Evening crossing (going down)
      if (prevDiff >= 0 && curDiff < 0 && duskJD === null) {
        duskJD = refineSunCrossing(prevT, t, targetFn);
      }
      // Morning crossing (going up)
      if (prevDiff < 0 && curDiff >= 0 && dawnJD === null) {
        dawnJD = refineSunCrossing(prevT, t, targetFn);
      }

      prevT = t;
      prevDiff = curDiff;
    }

    return { duskJD, dawnJD, minAlt, minJD, maxAlt, maxJD };
  }

  function refineSunCrossing(t1, t2, targetFn) {
    let a = t1;
    let b = t2;
    const sA = computeSun(a, observer);
    const hA = equatorialToHorizontal(sA.ra, sA.dec, getLST(a, lonDeg), latDeg);
    let fa = hA.alt - targetFn(hA.az);

    for (let iter = 0; iter < 10; iter++) {
      const mid = 0.5 * (a + b);
      const sM = computeSun(mid, observer);
      const hM = equatorialToHorizontal(sM.ra, sM.dec, getLST(mid, lonDeg), latDeg);
      const fmid = hM.alt - targetFn(hM.az);
      if ((fa <= 0 && fmid <= 0) || (fa > 0 && fmid > 0)) {
        a = mid;
        fa = fmid;
      } else {
        b = mid;
      }
    }
    return 0.5 * (a + b);
  }

  const horizonSetRise = findSunCrossings(-0.8333, true);
  const civil = findSunCrossings(-6.0, false);
  const nautical = findSunCrossings(-12.0, false);
  const astro = findSunCrossings(-18.0, false);

  let darkNightDurationHours = 0.0;
  if (astro.duskJD !== null && astro.dawnJD !== null && astro.dawnJD > astro.duskJD) {
    darkNightDurationHours = (astro.dawnJD - astro.duskJD) * 24.0;
  } else if (astro.maxAlt < -18.0) {
    darkNightDurationHours = 24.0;
  }

  return {
    solarNoonJD: horizonSetRise.maxJD,
    sunsetJD: horizonSetRise.duskJD,
    civilDuskJD: civil.duskJD,
    nauticalDuskJD: nautical.duskJD,
    astronomicalDuskJD: astro.duskJD,
    solarMidnightJD: horizonSetRise.minJD,
    astronomicalDawnJD: astro.dawnJD,
    nauticalDawnJD: nautical.dawnJD,
    civilDawnJD: civil.dawnJD,
    sunriseJD: horizonSetRise.dawnJD,
    nextNoonJD: jdNoonEnd,
    minSunAlt: horizonSetRise.minAlt,
    maxSunAlt: horizonSetRise.maxAlt,
    darkNightDurationHours,
    darkNightMinutes: Math.round(darkNightDurationHours * 60.0),
    // Short aliases for UI convenience
    solarNoon: horizonSetRise.maxJD,
    sunset: horizonSetRise.duskJD,
    civilDusk: civil.duskJD,
    nauticalDusk: nautical.duskJD,
    astroDusk: astro.duskJD,
    solarMidnight: horizonSetRise.minJD,
    astroDawn: astro.dawnJD,
    nauticalDawn: nautical.dawnJD,
    civilDawn: civil.dawnJD,
    sunrise: horizonSetRise.dawnJD,
    darkHours: darkNightDurationHours
  };
}

/**
 * Compute activity, exact peak date for the current year, radiant drift, and local/zenithal hourly rate
 * for all 13 major meteor showers at Julian Date `jd`.
 * Uses exact J2000 solar longitude $\lambda_\odot(jd)$.
 *
 * @param {Array<object>} [meteorsData=DEFAULT_METEOR_SHOWERS]
 * @param {number} [jd=J2000]
 * @param {number} [lstDeg=0]
 * @param {number} [latDeg=45]
 * @returns {Array<object>}
 */
export function computeMeteorShowers(
  meteorsData = DEFAULT_METEOR_SHOWERS,
  jd = J2000,
  lstDeg = 0,
  latDeg = 45
) {
  const catalog =
    Array.isArray(meteorsData) && meteorsData.length > 0
      ? meteorsData
      : DEFAULT_METEOR_SHOWERS;

  const currentSolarLon = getSolarLongitudeJ2000(jd);

  return catalog.map((sh) => {
    const peakLon = Number(
      sh.peakSolarLon !== undefined
        ? sh.peakSolarLon
        : sh.solarLonPeak !== undefined
          ? sh.solarLonPeak
          : sh.solarLon || 140.0
    );
    const zhrMax = Number(sh.zhr !== undefined ? sh.zhr : sh.maxZHR || 20);
    const fwhmDeg = Number(sh.fwhmDeg || sh.fwhm || 2.0);
    const vKmS = Number(sh.vKmS || sh.velocity || sh.v || 45);
    const rPop = Number(sh.rPop || sh.r || 2.3);

    // Angular difference in solar longitude from peak (-180..+180)
    const dLon = normalizeDegSigned(currentSolarLon - peakLon);

    // Exact peak JD for the cycle nearest to `jd`
    const approxPeakJD = jd - dLon / 0.9856076686;
    const peakJD = solarLongitudeToJD(peakLon, approxPeakJD);
    const peakDate = jdToDate(peakJD);

    // Check active window in solar longitude
    let isActive = Math.abs(dLon) <= Math.max(8.0, fwhmDeg * 3.0);
    if (sh.activeStartLon !== undefined && sh.activeEndLon !== undefined) {
      const span = normalizeDeg(sh.activeEndLon - sh.activeStartLon);
      const pos = normalizeDeg(currentSolarLon - sh.activeStartLon);
      isActive = pos <= span;
    }

    // IMO Gaussian/Exponential activity profile: ZHR(lambda) = ZHR_max * 2^(- (dLon / (fwhm/2))^2 )
    const halfWidth = Math.max(0.25, fwhmDeg * 0.5);
    const profileFactor = Math.pow(2.0, -Math.pow(dLon / halfWidth, 2));
    const currentZHR = isActive ? Math.max(0.5, zhrMax * profileFactor) : 0.0;

    // Daily radiant drift around peak
    const ra0 = Number(sh.ra !== undefined ? sh.ra : sh.radiantRA || 0);
    const dec0 = Number(sh.dec !== undefined ? sh.dec : sh.radiantDec || 0);
    const dRa = Number(sh.dRa || 0);
    const dDec = Number(sh.dDec || 0);
    const driftDays = clamp(dLon, -15.0, 15.0);
    const ra = normalizeDeg(ra0 + dRa * driftDays);
    const dec = clamp(dec0 + dDec * driftDays, -90.0, 90.0);

    // Radiant horizontal coordinates
    const horiz = equatorialToHorizontal(ra, dec, lstDeg, latDeg);
    const alt = horiz.alt;
    const az = horiz.az;

    // Effective local hourly rate adjusted for radiant elevation (sin(alt))
    const sinAlt = alt > 0 ? Math.sin(degToRad(alt)) : 0.0;
    const effectiveHourlyRate = currentZHR * sinAlt;

    return {
      id: sh.id || sh.code || sh.name.toLowerCase().replace(/\s+/g, '_'),
      code: sh.code || sh.id?.slice(0, 3).toUpperCase() || 'MET',
      name: sh.name,
      nameFr: sh.nameFr || sh.name,
      parentBody: sh.parentBody || sh.parent || '',
      ra,
      dec,
      alt,
      az,
      ha: horiz.ha,
      peakSolarLon: peakLon,
      currentSolarLon,
      solarLonDiffDeg: dLon,
      peakJD,
      peakDate,
      daysToPeak: peakJD - jd,
      isActive,
      isNearPeak: Math.abs(dLon) <= fwhmDeg,
      zhrMax,
      currentZHR: Math.round(currentZHR * 10) / 10,
      effectiveHourlyRate: Math.round(effectiveHourlyRate * 10) / 10,
      localZHR: Math.round(effectiveHourlyRate * 10) / 10,
      vKmS,
      rPop
    };
  });
}

// ============================================================================
// ECLIPSES, LUNAR PHASES, APSIDES & PLANETARY EVENTS (Meeus Ch. 49, 50, 54)
// ============================================================================

/**
 * Compute exact JDE of a lunar phase k (integer = New, +0.25 = First Quarter, +0.5 = Full, +0.75 = Last Quarter)
 * and evaluate whether a Solar or Lunar eclipse occurs at that syzygy (Meeus Ch. 49 & Ch. 54).
 * @param {number} k - Lunation index (0 = Jan 6, 2000 New Moon)
 * @returns {object}
 */
export function computeLunationSyzygy(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  // Mean time of phase (JDE)
  let jde =
    2451550.09766 +
    29.530588861 * k +
    0.00015437 * T2 -
    0.000000150 * T3 +
    0.00000000073 * T4;

  const E = 1.0 - 0.002516 * T - 0.0000074 * T2;

  // Sun's mean anomaly M
  const M = degToRad(
    normalizeDeg(2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3)
  );
  // Moon's mean anomaly M'
  const Mp = degToRad(
    normalizeDeg(201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4)
  );
  // Moon's argument of latitude F
  const F = degToRad(
    normalizeDeg(160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4)
  );
  // Longitude of ascending node Omega
  const Om = degToRad(
    normalizeDeg(124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3)
  );

  const frac = Math.round((k - Math.floor(k)) * 4) % 4; // 0=New, 1=FQ, 2=Full, 3=LQ

  if (frac === 0 || frac === 2) {
    // New or Full Moon correction (Meeus Table 49.A)
    const corr =
      -0.40720 * Math.sin(Mp) +
      0.17241 * E * Math.sin(M) +
      0.01608 * Math.sin(2 * Mp) +
      0.01039 * Math.sin(2 * F) +
      0.00739 * E * Math.sin(Mp - M) -
      0.00514 * E * Math.sin(Mp + M) +
      0.00208 * E * E * Math.sin(2 * M) -
      0.00111 * Math.sin(Mp - 2 * F) -
      0.00057 * Math.sin(Mp + 2 * F) +
      0.00056 * E * Math.sin(2 * Mp + M) -
      0.00042 * Math.sin(3 * Mp) +
      0.00042 * E * Math.sin(M + 2 * F) +
      0.00038 * E * Math.sin(M - 2 * F) -
      0.00024 * E * Math.sin(2 * Mp - M) -
      0.00017 * Math.sin(Om);
    jde += corr;
  } else {
    // First or Last Quarter correction (Meeus Table 49.B)
    let corr =
      -0.62801 * Math.sin(Mp) +
      0.17172 * E * Math.sin(M) -
      0.01183 * E * Math.sin(Mp + M) +
      0.00862 * Math.sin(2 * Mp) +
      0.00804 * Math.sin(2 * F) +
      0.00454 * E * Math.sin(Mp - M) +
      0.00204 * E * E * Math.sin(2 * M) -
      0.00180 * Math.sin(Mp - 2 * F);
    const W =
      0.00306 -
      0.00038 * E * Math.cos(M) +
      0.00026 * Math.cos(Mp) -
      0.00002 * Math.cos(Mp - M) +
      0.00002 * Math.cos(Mp + M) +
      0.00002 * Math.cos(2 * F);
    corr += frac === 1 ? W : -W;
    jde += corr;
  }

  const jd = jde - getDeltaT(jde) / 86400.0;

  return { k, frac, jd, jde, T, E, M, Mp, F, Om };
}

/**
 * Check if a New Moon (frac=0) or Full Moon (frac=2) produces a Solar or Lunar Eclipse (Meeus Ch. 54).
 * For Solar Eclipses, also computes the geographic coordinates `{ lat, lon, placeName }` of peak eclipse
 * so the « Simuler » button can teleport the observer directly into totality/annularity!
 * @param {number} k - Integer (New Moon) or half-integer (Full Moon) lunation index
 * @returns {object|null} Eclipse event descriptor or null if no eclipse occurs
 */
export function computeEclipseAtSyzygy(k) {
  const syz = computeLunationSyzygy(k);
  const { frac, T, E, M, Mp, F, Om } = syz;
  if (frac !== 0 && frac !== 2) return null;

  // Check argument of latitude F proximity to nodes (0° or 180°)
  const sinF = Math.abs(Math.sin(F));
  if (sinF > 0.36) return null; // Outside eclipse limit (~21°)

  const F1 = F - degToRad(0.02665 * Math.sin(Om));
  const A1 = degToRad(299.77 + 0.107408 * k - 0.009173 * T * T);

  // Maximum eclipse time correction (Meeus Eq. 54.1)
  const dJdeMax =
    (frac === 0 ? -0.4075 : -0.4065) * Math.sin(Mp) +
    (frac === 0 ? 0.1721 : 0.1727) * E * Math.sin(M) +
    0.0161 * Math.sin(2 * Mp) -
    0.0097 * Math.sin(2 * F1) +
    0.0073 * E * Math.sin(Mp - M) -
    0.0050 * E * Math.sin(Mp + M) -
    0.0023 * Math.sin(Mp - 2 * F1) +
    0.0021 * E * Math.sin(2 * M) +
    0.0012 * Math.sin(Mp + 2 * F1) +
    0.0006 * E * Math.sin(2 * Mp + M) -
    0.0004 * Math.sin(3 * Mp) -
    0.0003 * E * Math.sin(M + 2 * F1) +
    0.0003 * Math.sin(A1) -
    0.0002 * E * Math.sin(M - 2 * F1) -
    0.0002 * E * Math.sin(2 * Mp - M) -
    0.0002 * Math.sin(Om);

  // Recompute base mean syzygy + eclipse max correction
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;
  const jdeMean =
    2451550.09766 +
    29.530588861 * k +
    0.00015437 * T2 -
    0.000000150 * T3 +
    0.00000000073 * T4;
  const jdeMax = jdeMean + dJdeMax;
  const jdMax = jdeMax - getDeltaT(jdeMax) / 86400.0;

  // Fundamental Besselian quantities P, Q, W, gamma, u (Meeus Eq. 54.2)
  const P =
    0.2070 * E * Math.sin(M) +
    0.0024 * E * Math.sin(2 * M) -
    0.0392 * Math.sin(Mp) +
    0.0116 * Math.sin(2 * Mp) -
    0.0073 * E * Math.sin(Mp + M) +
    0.0067 * E * Math.sin(Mp - M) +
    0.0118 * Math.sin(2 * F1);

  const Q =
    5.2207 -
    0.0048 * E * Math.cos(M) +
    0.0020 * E * Math.cos(2 * M) -
    0.3299 * Math.cos(Mp) -
    0.0060 * E * Math.cos(Mp + M) +
    0.0041 * E * Math.cos(Mp - M);

  const W = Math.abs(Math.cos(F1));
  const gamma = (P * Math.cos(F1) + Q * Math.sin(F1)) * (1.0 - 0.0048 * W);
  const u =
    0.0059 +
    0.0046 * E * Math.cos(M) -
    0.0182 * Math.cos(Mp) +
    0.0004 * Math.cos(2 * Mp) -
    0.0005 * Math.cos(M + Mp);

  const absGamma = Math.abs(gamma);

  if (frac === 0) {
    // SOLAR ECLIPSE
    if (absGamma > 1.5433 + u) return null;

    let subtype = 'partial';
    let mag = 0.0;
    if (absGamma < 0.9972) {
      if (u < 0) subtype = 'total';
      else if (u > 0.0047) subtype = 'annular';
      else if (u < 0.00464 * Math.sqrt(1.0 - gamma * gamma)) subtype = 'hybrid';
      else subtype = 'annular';
      mag = (1.5433 + u - absGamma) / (0.5461 + 2.0 * u);
      if (subtype === 'total' || subtype === 'hybrid') {
        mag = Math.max(1.005, 1.0 - u / 0.273);
      } else {
        mag = Math.min(0.995, 1.0 - u / 0.273);
      }
    } else {
      subtype = 'partial';
      mag = (1.5433 + u - absGamma) / (0.5461 + 2.0 * u);
    }

    // Compute exact 3D Moon-Sun shadow ray intersection with Earth around jdMax
    // so clicking « Simuler » places the observer directly in totality/annularity with Moon centered on the Sun!
    const shadowGeo = computeExactShadowAxisIntersection(jdMax, gamma);
    const jdExact = shadowGeo.jd;
    const bestLat = shadowGeo.lat;
    const bestLon = shadowGeo.lon;

    const placeLabel = formatGeoCoordsLabel(bestLat, bestLon);
    const typeNameFr =
      subtype === 'total'
        ? 'Éclipse solaire totale'
        : subtype === 'annular'
          ? 'Éclipse solaire annulaire'
          : subtype === 'hybrid'
            ? 'Éclipse solaire hybride'
            : 'Éclipse solaire partielle';
    const typeNameEn =
      subtype === 'total'
        ? 'Total Solar Eclipse'
        : subtype === 'annular'
          ? 'Annular Solar Eclipse'
          : subtype === 'hybrid'
            ? 'Hybrid Solar Eclipse'
            : 'Partial Solar Eclipse';

    return {
      id: `solar_eclipse_${Math.round(k)}`,
      type: 'solar_eclipse',
      subtype,
      category: 'eclipse',
      titleKey: `events.solar_eclipse_${subtype}`,
      title: typeNameEn,
      titleFr: typeNameFr,
      jd: jdExact,
      date: jdToDate(jdExact),
      targetId: 'sun',
      secondaryTargetId: 'moon',
      magnitude: Math.round(mag * 1000) / 1000,
      gamma: Math.round(gamma * 10000) / 10000,
      recommendedLocation: {
        lat: Math.round(bestLat * 100) / 100,
        lon: Math.round(bestLon * 100) / 100,
        name: `Max Eclipse (${placeLabel})`,
        placeName: `Zone de maximum (${placeLabel})`
      },
      params: {
        subtype,
        mag: (Math.round(mag * 100) / 100).toFixed(2),
        location: placeLabel
      },
      description: `${typeNameEn} (mag ${mag.toFixed(2)}) — Max at ${placeLabel}`,
      descriptionFr: `${typeNameFr} (mag ${mag.toFixed(2)}) — Maximum à ${placeLabel}`
    };
  } else {
    // LUNAR ECLIPSE
    const rho = 1.2848 + u; // Penumbral radius in Earth radii
    const sigma = 0.7403 - u; // Umbral radius in Earth radii
    const penumbralMag = (1.5573 + u - absGamma) / 0.5450;
    const umbralMag = (1.0128 - u - absGamma) / 0.5450;

    if (penumbralMag <= 0) return null;

    let subtype = 'penumbral';
    if (umbralMag >= 1.0) subtype = 'total';
    else if (umbralMag > 0.0) subtype = 'partial';

    // Semi-durations in days (Meeus Eq. 54.6)
    const n = 0.5458 + 0.0400 * Math.cos(Mp);
    const sdPenDays =
      rho * rho > gamma * gamma
        ? Math.sqrt(rho * rho - gamma * gamma) / n / 24.0
        : 0;
    const sdUmbDays =
      umbralMag > 0 && sigma * sigma > gamma * gamma
        ? Math.sqrt(sigma * sigma - gamma * gamma) / n / 24.0
        : 0;
    const totR = 0.4678 - u;
    const sdTotDays =
      subtype === 'total' && totR * totR > gamma * gamma
        ? Math.sqrt(totR * totR - gamma * gamma) / n / 24.0
        : 0;

    const p1JD = jdMax - sdPenDays;
    const u1JD = umbralMag > 0 ? jdMax - sdUmbDays : null;
    const u2JD = subtype === 'total' ? jdMax - sdTotDays : null;
    const u3JD = subtype === 'total' ? jdMax + sdTotDays : null;
    const u4JD = umbralMag > 0 ? jdMax + sdUmbDays : null;
    const p4JD = jdMax + sdPenDays;

    // Sub-lunar point on Earth at maximum eclipse (where Moon is at zenith!)
    const moon = computeMoon(jdMax);
    const gmst = getLST(jdMax, 0);
    const subLunarLon = normalizeDegSigned(moon.ra - gmst);
    const subLunarLat = moon.dec;
    const placeLabel = formatGeoCoordsLabel(subLunarLat, subLunarLon);

    const typeNameFr =
      subtype === 'total'
        ? 'Éclipse lunaire totale'
        : subtype === 'partial'
          ? 'Éclipse lunaire partielle'
          : 'Éclipse lunaire pénombrale';
    const typeNameEn =
      subtype === 'total'
        ? 'Total Lunar Eclipse'
        : subtype === 'partial'
          ? 'Partial Lunar Eclipse'
          : 'Penumbral Lunar Eclipse';

    const displayMag = subtype === 'penumbral' ? penumbralMag : umbralMag;

    return {
      id: `lunar_eclipse_${Math.round(k * 2)}`,
      type: 'lunar_eclipse',
      subtype,
      category: 'eclipse',
      titleKey: `events.lunar_eclipse_${subtype}`,
      title: typeNameEn,
      titleFr: typeNameFr,
      jd: jdMax,
      date: jdToDate(jdMax),
      targetId: 'moon',
      umbralMag: Math.round(umbralMag * 1000) / 1000,
      penumbralMag: Math.round(penumbralMag * 1000) / 1000,
      magnitude: Math.round(displayMag * 1000) / 1000,
      contacts: {
        p1JD,
        u1JD,
        u2JD,
        maxJD: jdMax,
        u3JD,
        u4JD,
        p4JD
      },
      recommendedLocation: {
        lat: Math.round(subLunarLat * 100) / 100,
        lon: Math.round(subLunarLon * 100) / 100,
        name: `Zenith (${placeLabel})`,
        placeName: `Zénith (${placeLabel})`
      },
      params: {
        subtype,
        mag: displayMag.toFixed(2)
      },
      description: `${typeNameEn} (umbral mag ${umbralMag.toFixed(2)})`,
      descriptionFr: `${typeNameFr} (mag ombrale ${umbralMag.toFixed(2)})`
    };
  }
}

/**
 * Compute the exact instant and geographic location `{ jd, lat, lon }` where the 3D shadow ray
 * from the Sun through the Moon intersects (or passes closest to) the Earth's surface.
 * Ensures that when the user simulates the solar eclipse at `{ jd, lat, lon }`,
 * the topocentric Moon is aligned concentrically over the Sun!
 * @param {number} jdApprox
 * @param {number} fallbackGamma
 * @returns {{ jd: number, lat: number, lon: number, dPerpKm: number }}
 */
function computeExactShadowAxisIntersection(jdApprox, fallbackGamma = 0) {
  const R_EARTH = 6378.137;

  function evalShadowAt(tJD) {
    const sun = computeSun(tJD);
    const moon = computeMoon(tJD, null, sun);

    const sRa = degToRad(sun.ra);
    const sDec = degToRad(sun.dec);
    const sDist = sun.distKm;
    const sx = sDist * Math.cos(sDec) * Math.cos(sRa);
    const sy = sDist * Math.cos(sDec) * Math.sin(sRa);
    const sz = sDist * Math.sin(sDec);

    const mRa = degToRad(moon.raGeo);
    const mDec = degToRad(moon.decGeo);
    const mDist = moon.distGeoKm;
    const mx = mDist * Math.cos(mDec) * Math.cos(mRa);
    const my = mDist * Math.cos(mDec) * Math.sin(mRa);
    const mz = mDist * Math.sin(mDec);

    // Shadow unit vector from Sun through Moon toward Earth: u = normalize(r_M - r_S)
    const vx = mx - sx;
    const vy = my - sy;
    const vz = mz - sz;
    const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const ux = vx / vLen;
    const uy = vy / vLen;
    const uz = vz / vLen;

    // Closest point on ray P(s) = r_M + s * u to Earth center (0,0,0) occurs at s = - (r_M . u)
    const b = -(mx * ux + my * uy + mz * uz);
    const cx = mx + b * ux;
    const cy = my + b * uy;
    const cz = mz + b * uz;
    const dPerp = Math.sqrt(cx * cx + cy * cy + cz * cz);

    let px, py, pz;
    if (dPerp < R_EARTH * 0.995) {
      // Ray intersects Earth sphere on the sunlit side: s = b - sqrt(R^2 - dPerp^2)
      const sHit = b - Math.sqrt(R_EARTH * R_EARTH - dPerp * dPerp);
      px = mx + sHit * ux;
      py = my + sHit * uy;
      pz = mz + sHit * uz;
    } else if (dPerp > 1e-3) {
      // Ray misses or grazes Earth limb (partial eclipse): take closest point on Earth surface slightly sunlit
      const scale = R_EARTH / dPerp;
      px = cx * scale - ux * 500.0;
      py = cy * scale - uy * 500.0;
      pz = cz * scale - uz * 500.0;
      const pNorm = Math.sqrt(px * px + py * py + pz * pz);
      px = (px / pNorm) * R_EARTH;
      py = (py / pNorm) * R_EARTH;
      pz = (pz / pNorm) * R_EARTH;
    } else {
      px = -ux * R_EARTH;
      py = -uy * R_EARTH;
      pz = -uz * R_EARTH;
    }

    const pRaDeg = normalizeDeg(radToDeg(Math.atan2(py, px)));
    const pDecDeg = radToDeg(Math.asin(clamp(pz / R_EARTH, -1.0, 1.0)));
    const gmst = getLST(tJD, 0);
    const lon = normalizeDegSigned(pRaDeg - gmst);
    // Convert geocentric latitude pDecDeg to geodetic latitude
    const lat = radToDeg(Math.atan(Math.tan(degToRad(pDecDeg)) / 0.99330562));

    return { jd: tJD, lat: clamp(lat, -89.0, 89.0), lon, dPerpKm: dPerp };
  }

  // Golden-section search in [jdApprox - 0.08, jdApprox + 0.08] (~ +/- 2 hours) to minimize dPerpKm
  let left = jdApprox - 0.06;
  let right = jdApprox + 0.06;
  for (let iter = 0; iter < 14; iter++) {
    const m1 = left + (right - left) / 3.0;
    const m2 = right - (right - left) / 3.0;
    if (evalShadowAt(m1).dPerpKm < evalShadowAt(m2).dPerpKm) {
      right = m2;
    } else {
      left = m1;
    }
  }
  return evalShadowAt(0.5 * (left + right));
}

function formatGeoCoordsLabel(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lon).toFixed(1)}°${ew}`;
}

/**
 * Compute all Lunar Perigees and Apogees within `[startJD, endJD]`.
 * @param {number} startJD
 * @param {number} endJD
 * @returns {Array<object>}
 */
export function computeLunarApsides(startJD, endJD) {
  const events = [];
  const stepDays = 2.0; // Moon's anomalistic period is 27.55 days

  let tPrev = startJD - stepDays;
  let rPrev = computeMoon(tPrev).distGeoKm;
  let tCur = startJD;
  let rCur = computeMoon(tCur).distGeoKm;

  for (let tNext = startJD + stepDays; tNext <= endJD + stepDays; tNext += stepDays) {
    const rNext = computeMoon(tNext).distGeoKm;

    // Local minimum -> Perigee; Local maximum -> Apogee
    const isPerigee = rCur < rPrev && rCur <= rNext;
    const isApogee = rCur > rPrev && rCur >= rNext;

    if (isPerigee || isApogee) {
      // Golden section search to find exact extremum
      let a = tPrev;
      let b = tNext;
      for (let iter = 0; iter < 12; iter++) {
        const m1 = a + (b - a) / 3.0;
        const m2 = b - (b - a) / 3.0;
        const d1 = computeMoon(m1).distGeoKm;
        const d2 = computeMoon(m2).distGeoKm;
        if (isPerigee ? d1 < d2 : d1 > d2) {
          b = m2;
        } else {
          a = m1;
        }
      }
      const extJD = 0.5 * (a + b);
      if (extJD >= startJD && extJD <= endJD) {
        const mState = computeMoon(extJD);
        const distKm = Math.round(mState.distGeoKm);
        const isSupermoon = isPerigee && distKm < 360000 && mState.illum > 0.92;
        events.push({
          id: `moon_${isPerigee ? 'perigee' : 'apogee'}_${Math.round(extJD)}`,
          type: isPerigee ? 'lunar_perigee' : 'lunar_apogee',
          subtype: isSupermoon ? 'supermoon' : isPerigee ? 'perigee' : 'apogee',
          category: 'moon',
          titleKey: isSupermoon
            ? 'events.supermoon'
            : isPerigee
              ? 'events.lunar_perigee'
              : 'events.lunar_apogee',
          title: isSupermoon
            ? `Supermoon Perigee (${distKm.toLocaleString()} km)`
            : isPerigee
              ? `Lunar Perigee (${distKm.toLocaleString()} km)`
              : `Lunar Apogee (${distKm.toLocaleString()} km)`,
          titleFr: isSupermoon
            ? `Superlune au Périgée (${distKm.toLocaleString()} km)`
            : isPerigee
              ? `Périgée lunaire (${distKm.toLocaleString()} km)`
              : `Apogée lunaire (${distKm.toLocaleString()} km)`,
          jd: extJD,
          date: jdToDate(extJD),
          targetId: 'moon',
          distKm,
          params: { distKm },
          description: `Moon distance: ${distKm.toLocaleString()} km`,
          descriptionFr: `Distance Terre-Lune : ${distKm.toLocaleString()} km`
        });
      }
    }

    tPrev = tCur;
    rPrev = rCur;
    tCur = tNext;
    rCur = rNext;
  }

  return events;
}

/**
 * Compute Equinoxes and Solstices for a given year (Meeus Ch. 27).
 * @param {number} year
 * @returns {Array<object>}
 */
export function computeSeasons(year) {
  const approxJDs = [
    { key: 'spring_equinox', lon: 0, jd: dateToJD(new Date(Date.UTC(year, 2, 20, 12))) },
    { key: 'summer_solstice', lon: 90, jd: dateToJD(new Date(Date.UTC(year, 5, 21, 12))) },
    { key: 'autumn_equinox', lon: 180, jd: dateToJD(new Date(Date.UTC(year, 8, 22, 18))) },
    { key: 'winter_solstice', lon: 270, jd: dateToJD(new Date(Date.UTC(year, 11, 21, 12))) }
  ];

  const names = {
    spring_equinox: { en: 'March Equinox', fr: 'Équinoxe de printemps' },
    summer_solstice: { en: 'June Solstice', fr: 'Solstice d’été' },
    autumn_equinox: { en: 'September Equinox', fr: 'Équinoxe d’automne' },
    winter_solstice: { en: 'December Solstice', fr: 'Solstice d’hiver' }
  };

  return approxJDs.map((s) => {
    let jd = s.jd;
    for (let iter = 0; iter < 6; iter++) {
      const curLon = getSolarLongitudeOfDate(jd);
      const diff = normalizeDegSigned(s.lon - curLon);
      jd += diff / 0.9856076686;
    }
    return {
      id: `season_${s.key}_${year}`,
      type: 'season',
      subtype: s.key,
      category: 'season',
      titleKey: `events.${s.key}`,
      title: names[s.key].en,
      titleFr: names[s.key].fr,
      jd,
      date: jdToDate(jd),
      targetId: 'sun',
      params: { year },
      description: `${names[s.key].en} (${year})`,
      descriptionFr: `${names[s.key].fr} (${year})`
    };
  });
}

/**
 * Compute Planetary Oppositions (Mars, Jupiter, Saturn, Uranus, Neptune),
 * Greatest Elongations (Mercury, Venus), and Close Conjunctions (Planet-Planet & Moon-Planet)
 * in the interval `[startJD, endJD]`.
 * @param {number} startJD
 * @param {number} endJD
 * @returns {Array<object>}
 */
export function computePlanetaryEvents(startJD, endJD) {
  const events = [];

  // 1. Superior planet oppositions (Sun-Planet ecliptic longitude difference crosses 180°)
  const outerPlanets = [
    { id: 'mars', name: 'Mars', nameFr: 'Mars' },
    { id: 'jupiter', name: 'Jupiter', nameFr: 'Jupiter' },
    { id: 'saturn', name: 'Saturn', nameFr: 'Saturne' },
    { id: 'uranus', name: 'Uranus', nameFr: 'Uranus' },
    { id: 'neptune', name: 'Neptune', nameFr: 'Neptune' }
  ];

  const stepOpp = 4.0;
  for (const p of outerPlanets) {
    let tPrev = startJD;
    let eHPrev = getPlanetHeliocentric('earth', tPrev);
    let sunLonPrev = normalizeDeg(eHPrev.lon + 180.0);
    let pStatePrev = computePlanet(p.id, tPrev, null, eHPrev);
    let diffPrev = normalizeDegSigned(pStatePrev.lon - sunLonPrev - 180.0);

    for (let t = startJD + stepOpp; t <= endJD; t += stepOpp) {
      const eH = getPlanetHeliocentric('earth', t);
      const sunLon = normalizeDeg(eH.lon + 180.0);
      const pState = computePlanet(p.id, t, null, eH);
      const diff = normalizeDegSigned(pState.lon - sunLon - 180.0);

      if (diffPrev > 0 && diff <= 0 && Math.abs(diffPrev - diff) < 30.0) {
        // Bisect opposition JD
        let a = tPrev;
        let b = t;
        for (let iter = 0; iter < 10; iter++) {
          const mid = 0.5 * (a + b);
          const eHm = getPlanetHeliocentric('earth', mid);
          const sLonM = normalizeDeg(eHm.lon + 180.0);
          const pM = computePlanet(p.id, mid, null, eHm);
          const dm = normalizeDegSigned(pM.lon - sLonM - 180.0);
          if (dm > 0) a = mid;
          else b = mid;
        }
        const oppJD = 0.5 * (a + b);
        const oppState = computePlanet(p.id, oppJD);
        events.push({
          id: `opposition_${p.id}_${Math.round(oppJD)}`,
          type: 'opposition',
          subtype: p.id,
          category: 'planet',
          titleKey: 'events.planetary_opposition',
          title: `${p.name} at Opposition (mag ${oppState.mag.toFixed(1)})`,
          titleFr: `Opposition de ${p.nameFr} (mag ${oppState.mag.toFixed(1)})`,
          jd: oppJD,
          date: jdToDate(oppJD),
          targetId: p.id,
          mag: oppState.mag,
          distAU: oppState.distAU,
          params: {
            planet: p.nameFr,
            planetEn: p.name,
            mag: oppState.mag.toFixed(1),
            distAU: oppState.distAU.toFixed(2)
          },
          description: `${p.name} opposition — Distance ${oppState.distAU.toFixed(2)} AU, diameter ${oppState.angDiamArcsec.toFixed(1)}"`,
          descriptionFr: `Opposition de ${p.nameFr} — Distance ${oppState.distAU.toFixed(2)} UA, diamètre ${oppState.angDiamArcsec.toFixed(1)}"`
        });
      }

      tPrev = t;
      diffPrev = diff;
    }
  }

  // 2. Greatest Elongations of Mercury and Venus
  const innerPlanets = [
    { id: 'mercury', name: 'Mercury', nameFr: 'Mercure', step: 2.0 },
    { id: 'venus', name: 'Venus', nameFr: 'Vénus', step: 4.0 }
  ];

  for (const p of innerPlanets) {
    let tPrev = startJD - p.step;
    let elPrev = computePlanet(p.id, tPrev).elongDeg;
    let tCur = startJD;
    let elCur = computePlanet(p.id, tCur).elongDeg;

    for (let tNext = startJD + p.step; tNext <= endJD + p.step; tNext += p.step) {
      const elNext = computePlanet(p.id, tNext).elongDeg;
      if (elCur > elPrev && elCur >= elNext && elCur > 16.0) {
        // Golden section search for maximum elongation
        let a = tPrev;
        let b = tNext;
        for (let iter = 0; iter < 10; iter++) {
          const m1 = a + (b - a) / 3.0;
          const m2 = b - (b - a) / 3.0;
          if (computePlanet(p.id, m1).elongDeg < computePlanet(p.id, m2).elongDeg) {
            a = m1;
          } else {
            b = m2;
          }
        }
        const maxJD = 0.5 * (a + b);
        if (maxJD >= startJD && maxJD <= endJD) {
          const eH = getPlanetHeliocentric('earth', maxJD);
          const sunLon = normalizeDeg(eH.lon + 180.0);
          const st = computePlanet(p.id, maxJD, null, eH);
          const isEastern = normalizeDegSigned(st.lon - sunLon) > 0;
          const dirEn = isEastern ? 'Eastern (Evening)' : 'Western (Morning)';
          const dirFr = isEastern ? 'Est (Soir)' : 'Ouest (Matin)';

          events.push({
            id: `elongation_${p.id}_${Math.round(maxJD)}`,
            type: 'greatest_elongation',
            subtype: isEastern ? 'east' : 'west',
            category: 'planet',
            titleKey: isEastern ? 'events.elongation_east' : 'events.elongation_west',
            title: `${p.name} Greatest ${dirEn} Elongation (${st.elongDeg.toFixed(1)}°)`,
            titleFr: `Élongation maximale ${dirFr} de ${p.nameFr} (${st.elongDeg.toFixed(1)}°)`,
            jd: maxJD,
            date: jdToDate(maxJD),
            targetId: p.id,
            elongDeg: st.elongDeg,
            params: {
              planet: p.nameFr,
              planetEn: p.name,
              elongDeg: st.elongDeg.toFixed(1),
              direction: dirFr
            },
            description: `${p.name} at ${st.elongDeg.toFixed(1)}° ${isEastern ? 'East' : 'West'} of the Sun (mag ${st.mag.toFixed(1)})`,
            descriptionFr: `${p.nameFr} à ${st.elongDeg.toFixed(1)}° à l’${dirFr} du Soleil (mag ${st.mag.toFixed(1)})`
          });
        }
      }
      tPrev = tCur;
      elPrev = elCur;
      tCur = tNext;
      elCur = elNext;
    }
  }

  // 3. Close Planet-Planet Conjunctions (separation < 2.5° and elongation > 15° from Sun)
  const conjPlanets = [
    { id: 'mercury', name: 'Mercury', nameFr: 'Mercure' },
    { id: 'venus', name: 'Venus', nameFr: 'Vénus' },
    { id: 'mars', name: 'Mars', nameFr: 'Mars' },
    { id: 'jupiter', name: 'Jupiter', nameFr: 'Jupiter' },
    { id: 'saturn', name: 'Saturn', nameFr: 'Saturne' }
  ];

  const stepConj = 2.0;
  for (let i = 0; i < conjPlanets.length; i++) {
    for (let j = i + 1; j < conjPlanets.length; j++) {
      const p1 = conjPlanets[i];
      const p2 = conjPlanets[j];

      function sepAt(t) {
        const eH = getPlanetHeliocentric('earth', t);
        const s1 = computePlanet(p1.id, t, null, eH);
        const s2 = computePlanet(p2.id, t, null, eH);
        return {
          sep: angularSeparation(s1.ra, s1.dec, s2.ra, s2.dec),
          elong: Math.min(s1.elongDeg, s2.elongDeg)
        };
      }

      let tPrev = startJD;
      let dPrev = sepAt(tPrev).sep;
      let tCur = startJD + stepConj;
      let dCur = sepAt(tCur).sep;

      for (let tNext = startJD + 2 * stepConj; tNext <= endJD; tNext += stepConj) {
        const dNext = sepAt(tNext).sep;
        if (dCur < dPrev && dCur <= dNext && dCur < 3.0) {
          let a = tPrev;
          let b = tNext;
          for (let iter = 0; iter < 8; iter++) {
            const m1 = a + (b - a) / 3.0;
            const m2 = b - (b - a) / 3.0;
            if (sepAt(m1).sep < sepAt(m2).sep) b = m2;
            else a = m1;
          }
          const cJD = 0.5 * (a + b);
          const cInfo = sepAt(cJD);
          if (cInfo.sep <= 2.5 && cInfo.elong >= 15.0) {
            const sepStr =
              cInfo.sep < 1.0
                ? `${Math.round(cInfo.sep * 60)}'`
                : `${cInfo.sep.toFixed(1)}°`;
            events.push({
              id: `conj_${p1.id}_${p2.id}_${Math.round(cJD)}`,
              type: 'conjunction',
              subtype: 'planet_planet',
              category: 'conjunction',
              titleKey: 'events.planet_conjunction',
              title: `Conjunction: ${p1.name} & ${p2.name} (${sepStr})`,
              titleFr: `Conjonction ${p1.nameFr} – ${p2.nameFr} (${sepStr})`,
              jd: cJD,
              date: jdToDate(cJD),
              targetId: p1.id,
              secondaryTargetId: p2.id,
              separationDeg: cInfo.sep,
              params: {
                body1: p1.nameFr,
                body2: p2.nameFr,
                sep: sepStr
              },
              description: `Close approach of ${p1.name} and ${p2.name} (${sepStr})`,
              descriptionFr: `Rapprochement serré entre ${p1.nameFr} et ${p2.nameFr} (${sepStr})`
            });
          }
        }
        tPrev = tCur;
        dPrev = dCur;
        tCur = tNext;
        dCur = dNext;
      }
    }
  }

  return events;
}

/**
 * Compute the complete Astronomical Events Calendar for a given `year` (and optional `month` 1..12).
 * Includes:
 * - Solar Eclipses (with peak JD, magnitude, and geographic path coordinates for « Simuler »)
 * - Lunar Eclipses (with contacts, umbral/penumbral magnitudes, and zenith location)
 * - Lunar Phases (New Moon, First Quarter, Full Moon, Last Quarter)
 * - Lunar Perigees / Apogees / Supermoons
 * - Planetary Oppositions, Greatest Elongations, Close Conjunctions
 * - Equinoxes & Solstices
 * - Major Meteor Shower Peaks for the year
 *
 * @param {number} year - Calendar year (e.g. 2025, 2026)
 * @param {number|null} [month=null] - Optional month 1..12 (if null or 0, returns full year)
 * @param {{ lat?: number, lon?: number }} [observer=null]
 * @returns {Array<object>} Chronologically sorted array of event objects
 */
export function computeEventsCalendar(year, month = null, observer = null) {
  const startDate =
    month && month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
      : new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const endDate =
    month && month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 1, 0, 0, 0))
      : new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

  const startJD = dateToJD(startDate);
  const endJD = dateToJD(endDate);

  const events = [];

  // 1. Lunations (Phases + Solar & Lunar Eclipses)
  const kStart = Math.floor((year - 2000.0) * 12.3685) - 2;
  const kEnd = Math.ceil((year + 1 - 2000.0) * 12.3685) + 2;

  const phaseMeta = [
    { key: 'new_moon', en: 'New Moon', fr: 'Nouvelle Lune' },
    { key: 'first_quarter', en: 'First Quarter', fr: 'Premier Quartier' },
    { key: 'full_moon', en: 'Full Moon', fr: 'Pleine Lune' },
    { key: 'last_quarter', en: 'Last Quarter', fr: 'Dernier Quartier' }
  ];

  for (let kInt = kStart; kInt <= kEnd; kInt++) {
    for (let q = 0; q < 4; q++) {
      const k = kInt + q * 0.25;
      const syz = computeLunationSyzygy(k);
      if (syz.jd >= startJD && syz.jd <= endJD) {
        const pm = phaseMeta[q];
        events.push({
          id: `phase_${pm.key}_${kInt}_${q}`,
          type: 'lunar_phase',
          subtype: pm.key,
          category: 'moon',
          titleKey: `events.${pm.key}`,
          title: pm.en,
          titleFr: pm.fr,
          jd: syz.jd,
          date: jdToDate(syz.jd),
          targetId: 'moon',
          params: { phase: pm.fr },
          description: pm.en,
          descriptionFr: pm.fr
        });

        // Check for Solar Eclipse (q === 0) or Lunar Eclipse (q === 2)
        if (q === 0 || q === 2) {
          const ecl = computeEclipseAtSyzygy(k);
          if (ecl && ecl.jd >= startJD && ecl.jd <= endJD) {
            events.push(ecl);
          }
        }
      }
    }
  }

  // 2. Lunar Perigees & Apogees
  const apsides = computeLunarApsides(startJD, endJD);
  events.push(...apsides);

  // 3. Seasons (Equinoxes & Solstices)
  const seasons = computeSeasons(year).filter((s) => s.jd >= startJD && s.jd <= endJD);
  events.push(...seasons);

  // 4. Planetary Oppositions, Greatest Elongations, and Close Conjunctions
  const planetEvents = computePlanetaryEvents(startJD, endJD);
  events.push(...planetEvents);

  // 5. Major Meteor Shower Peaks (ZHR >= 15)
  const midYearJD = dateToJD(new Date(Date.UTC(year, 6, 2, 0, 0, 0)));
  for (const sh of DEFAULT_METEOR_SHOWERS) {
    if (sh.zhr < 15) continue;
    // Quadrantids peak in early January, so check around Jan 4 of `year`
    const guessJD =
      sh.id === 'quadrantids'
        ? dateToJD(new Date(Date.UTC(year, 0, 4, 0, 0, 0)))
        : midYearJD;
    const peakJD = solarLongitudeToJD(sh.peakSolarLon, guessJD);
    if (peakJD >= startJD && peakJD <= endJD) {
      events.push({
        id: `meteor_${sh.id}_${year}`,
        type: 'meteor_shower',
        subtype: sh.id,
        category: 'meteor',
        titleKey: 'events.meteor_shower_peak',
        title: `${sh.name} Meteor Shower Peak (ZHR ~${sh.zhr})`,
        titleFr: `Maximum des ${sh.nameFr} (ZHR ~${sh.zhr})`,
        jd: peakJD,
        date: jdToDate(peakJD),
        targetId: sh.id,
        ra: sh.ra,
        dec: sh.dec,
        zhr: sh.zhr,
        params: {
          shower: sh.nameFr,
          showerEn: sh.name,
          zhr: sh.zhr
        },
        description: `Peak of ${sh.name} meteor shower (${sh.zhr}/hr, parent: ${sh.parentBody})`,
        descriptionFr: `Pic d’activité des ${sh.nameFr} (${sh.zhr} météores/h, corps parent : ${sh.parentBody})`
      });
    }
  }

  events.sort((a, b) => a.jd - b.jd);
  return events;
}
