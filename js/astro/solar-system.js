/**
 * @fileoverview High-precision Solar System ephemeris engine:
 * - Sun, Moon, Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
 * - Heliocentric 3D coordinates & orbital paths for the 3D/orbitable Solar System view
 * - Geocentric & topocentric RA/Dec, Alt/Az, distance, angular diameter, visual magnitude,
 *   illuminated fraction, phase angle, bright limb position angle, solar elongation
 * - Physical ephemerides for orthographic disk rendering: Central Meridian (System I/II/III, GRS),
 *   sub-Earth & sub-Solar latitudes (De, Ds), North Pole position angle (P), Saturn ring geometry,
 *   and Lunar libration & phase cycle
 * - Galilean moons of Jupiter (Io, Europa, Ganymede, Callisto) with transits, shadow transits,
 *   occultations, and eclipses
 * - 7 major moons of Saturn (Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus)
 * - 8 Bright Asteroids (Keplerian propagation, HG phase magnitude, 3D orbital paths)
 */

import {
  DEG2RAD,
  RAD2DEG,
  J2000,
  AU_KM,
  EARTH_RADIUS_KM,
  SPEED_OF_LIGHT_AUDAY,
  degToRad,
  radToDeg,
  normalizeDeg,
  normalizeDegSigned,
  clamp,
  getJDE,
  getJ2000Centuries,
  getObliquity,
  getNutation,
  getLST,
  equatorialToHorizontal,
  eclipticToEquatorial,
  equatorialToEcliptic,
  angularSeparation,
  positionAngle,
  applyRefraction
} from './time.js';

/**
 * Orbital and physical metadata for the Sun, Moon, and Major Planets.
 * Secular Keplerian elements (Standish / JPL DE405 / Meeus Table 31.A) + major perturbations.
 */
export const PLANET_ELEMENTS = {
  mercury: {
    id: 'mercury',
    name: 'Mercury',
    nameFr: 'Mercure',
    color: '#b8b8b8',
    radiusKm: 2439.7,
    flattening: 0.0,
    periodDays: 87.9691,
    a0: 0.38709927, aDot: 0.00000037,
    e0: 0.20563593, eDot: 0.00001906,
    i0: 7.00497902, iDot: -0.00594749,
    L0: 252.25032350, LDot: 149472.67411175,
    wBar0: 77.45779628, wBarDot: 0.16047689,
    om0: 48.33076593, omDot: -0.12534081,
    poleRA0: 281.01, poleDec0: 61.45,
    w0: 329.548, wDot: 6.1385025
  },
  venus: {
    id: 'venus',
    name: 'Venus',
    nameFr: 'Vénus',
    color: '#f5e3b3',
    radiusKm: 6051.8,
    flattening: 0.0,
    periodDays: 224.701,
    a0: 0.72333566, aDot: 0.00000390,
    e0: 0.00677672, eDot: -0.00004107,
    i0: 3.39467605, iDot: -0.00078890,
    L0: 181.97909950, LDot: 58517.81538729,
    wBar0: 131.60246718, wBarDot: 0.00268329,
    om0: 76.67984255, omDot: -0.27769418,
    poleRA0: 272.76, poleDec0: 67.16,
    w0: 160.20, wDot: -1.4813688
  },
  earth: {
    id: 'earth',
    name: 'Earth',
    nameFr: 'Terre',
    color: '#4da6ff',
    radiusKm: 6378.137,
    flattening: 0.0033528,
    periodDays: 365.25636,
    a0: 1.00000261, aDot: 0.00000562,
    e0: 0.01671123, eDot: -0.00004392,
    i0: -0.00001531, iDot: -0.01294668,
    L0: 100.46457166, LDot: 35999.37244981,
    wBar0: 102.93768193, wBarDot: 0.32327364,
    om0: 0.0, omDot: 0.0,
    poleRA0: 0.0, poleDec0: 90.0,
    w0: 190.147, wDot: 360.9856235
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    nameFr: 'Mars',
    color: '#e06b43',
    radiusKm: 3396.19,
    flattening: 0.00589,
    periodDays: 686.980,
    a0: 1.52371034, aDot: 0.00001847,
    e0: 0.09339410, eDot: 0.00007882,
    i0: 1.84969142, iDot: -0.00813131,
    L0: -4.55343205, LDot: 19140.30268499,
    wBar0: -23.94362959, wBarDot: 0.44441088,
    om0: 49.55953891, omDot: -0.29257343,
    poleRA0: 317.68143, poleDec0: 52.88650,
    w0: 176.630, wDot: 350.89198226
  },
  jupiter: {
    id: 'jupiter',
    name: 'Jupiter',
    nameFr: 'Jupiter',
    color: '#e3b887',
    radiusKm: 71492.0,
    flattening: 0.06487,
    periodDays: 4332.589,
    a0: 5.20288700, aDot: -0.00011607,
    e0: 0.04838624, eDot: -0.00013253,
    i0: 1.30439695, iDot: -0.00183714,
    L0: 34.39644051, LDot: 3034.74612775,
    wBar0: 14.72847983, wBarDot: 0.21252668,
    om0: 100.47390909, omDot: 0.20469106,
    poleRA0: 268.056595, poleDec0: 64.495303,
    w0: 284.95, wDot: 870.536
  },
  saturn: {
    id: 'saturn',
    name: 'Saturn',
    nameFr: 'Saturne',
    color: '#ead69b',
    radiusKm: 60268.0,
    flattening: 0.09796,
    periodDays: 10759.22,
    a0: 9.53667594, aDot: -0.00125060,
    e0: 0.05386179, eDot: -0.00050991,
    i0: 2.48599187, iDot: 0.00193609,
    L0: 49.95424423, LDot: 1222.49362201,
    wBar0: 92.59887831, wBarDot: -0.41897216,
    om0: 113.66242448, omDot: -0.28867794,
    poleRA0: 40.589, poleDec0: 83.537,
    w0: 38.90, wDot: 810.7939024
  },
  uranus: {
    id: 'uranus',
    name: 'Uranus',
    nameFr: 'Uranus',
    color: '#9be3ea',
    radiusKm: 25559.0,
    flattening: 0.02293,
    periodDays: 30685.4,
    a0: 19.18916464, aDot: -0.00196176,
    e0: 0.04725744, eDot: -0.00004397,
    i0: 0.77263783, iDot: -0.00242939,
    L0: 313.23810451, LDot: 428.48202785,
    wBar0: 170.95427630, wBarDot: 0.40805281,
    om0: 74.01692503, omDot: 0.04240589,
    poleRA0: 257.311, poleDec0: -15.175,
    w0: 203.81, wDot: -501.1600928
  },
  neptune: {
    id: 'neptune',
    name: 'Neptune',
    nameFr: 'Neptune',
    color: '#5b82f6',
    radiusKm: 24764.0,
    flattening: 0.01708,
    periodDays: 60189.0,
    a0: 30.06992276, aDot: 0.00026291,
    e0: 0.00859048, eDot: 0.00005105,
    i0: 1.77004347, iDot: 0.00035372,
    L0: -55.12002969, LDot: 218.45945325,
    wBar0: 44.96476227, wBarDot: -0.32241464,
    om0: 131.78422574, omDot: -0.00508664,
    poleRA0: 299.36, poleDec0: 43.46,
    w0: 253.18, wDot: 536.3128492
  }
};

export const SOLAR_SYSTEM_BODIES = [
  { id: 'sun', name: 'Sun', nameFr: 'Soleil', type: 'star', color: '#ffcc33', radiusKm: 695700 },
  { id: 'moon', name: 'Moon', nameFr: 'Lune', type: 'moon', color: '#e0e0e0', radiusKm: 1737.4 },
  { id: 'mercury', name: 'Mercury', nameFr: 'Mercure', type: 'planet', color: '#b8b8b8', radiusKm: 2439.7 },
  { id: 'venus', name: 'Venus', nameFr: 'Vénus', type: 'planet', color: '#f5e3b3', radiusKm: 6051.8 },
  { id: 'mars', name: 'Mars', nameFr: 'Mars', type: 'planet', color: '#e06b43', radiusKm: 3396.19 },
  { id: 'jupiter', name: 'Jupiter', nameFr: 'Jupiter', type: 'planet', color: '#e3b887', radiusKm: 71492.0 },
  { id: 'saturn', name: 'Saturn', nameFr: 'Saturne', type: 'planet', color: '#ead69b', radiusKm: 60268.0 },
  { id: 'uranus', name: 'Uranus', nameFr: 'Uranus', type: 'planet', color: '#9be3ea', radiusKm: 25559.0 },
  { id: 'neptune', name: 'Neptune', nameFr: 'Neptune', type: 'planet', color: '#5b82f6', radiusKm: 24764.0 }
];

/**
 * Default 8 bright asteroids osculating elements (Epoch J2000 / 2459000.5 calibrated)
 * Used as fallback if external asteroids JSON is not provided.
 */
export const DEFAULT_ASTEROIDS = [
  { id: 'ceres', number: 1, name: 'Ceres', nameFr: 'Cérès', a: 2.7675, e: 0.07582, i: 10.593, om: 80.305, w: 73.597, ma: 95.989, epoch: 2451545.0, H: 3.34, G: 0.12 },
  { id: 'pallas', number: 2, name: 'Pallas', nameFr: 'Pallas', a: 2.7724, e: 0.23127, i: 34.841, om: 173.080, w: 310.049, ma: 78.229, epoch: 2451545.0, H: 4.13, G: 0.11 },
  { id: 'juno', number: 3, name: 'Juno', nameFr: 'Junon', a: 2.6691, e: 0.25694, i: 12.982, om: 169.851, w: 248.410, ma: 245.320, epoch: 2451545.0, ma0: 245.320, H: 5.33, G: 0.32 },
  { id: 'vesta', number: 4, name: 'Vesta', nameFr: 'Vesta', a: 2.3615, e: 0.08874, i: 7.140, om: 103.851, w: 150.728, ma: 20.864, epoch: 2451545.0, H: 3.20, G: 0.32 },
  { id: 'hebe', number: 6, name: 'Hebe', nameFr: 'Hébé', a: 2.4254, e: 0.20253, i: 14.749, om: 138.643, w: 239.507, ma: 142.658, epoch: 2451545.0, H: 5.71, G: 0.24 },
  { id: 'iris', number: 7, name: 'Iris', nameFr: 'Iris', a: 2.3862, e: 0.23085, i: 5.523, om: 259.563, w: 145.465, ma: 199.935, epoch: 2451545.0, H: 5.51, G: 0.15 },
  { id: 'flora', number: 8, name: 'Flora', nameFr: 'Flore', a: 2.2014, e: 0.15654, i: 5.889, om: 110.892, w: 285.308, ma: 314.823, epoch: 2451545.0, H: 6.49, G: 0.28 },
  { id: 'eunomia', number: 15, name: 'Eunomia', nameFr: 'Eunomie', a: 2.6436, e: 0.18661, i: 11.737, om: 293.208, w: 97.912, ma: 296.522, epoch: 2451545.0, H: 5.28, G: 0.23 }
];

/**
 * Solve Kepler's equation M = E - e * sin(E) for eccentric anomaly E in radians.
 * @param {number} MRad - Mean anomaly in radians
 * @param {number} e - Orbital eccentricity
 * @returns {number} Eccentric anomaly E in radians
 */
export function solveKepler(MRad, e) {
  let E = MRad + e * Math.sin(MRad) * (1.0 + e * Math.cos(MRad));
  for (let iter = 0; iter < 12; iter++) {
    const f = E - e * Math.sin(E) - MRad;
    const fPrime = 1.0 - e * Math.cos(E);
    const dE = f / fPrime;
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/**
 * Compute heliocentric J2000 ecliptic coordinates { x, y, z, r, lon, lat } in AU for any major planet.
 * Includes secular polynomial terms and analytical perturbation corrections (Standish / Meeus / Schlyter)
 * for Jupiter, Saturn, Uranus, Neptune, Mars, and Earth.
 * @param {string} planetId - 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune'
 * @param {number} jd - Julian Date
 * @returns {{ x: number, y: number, z: number, r: number, lon: number, lat: number, a: number, e: number }}
 */
export function getPlanetHeliocentric(planetId, jd) {
  const id = planetId.toLowerCase();
  if (id === 'sun') {
    return { x: 0, y: 0, z: 0, r: 0, lon: 0, lat: 0, a: 0, e: 0 };
  }
  const el = PLANET_ELEMENTS[id];
  if (!el) {
    throw new Error(`Unknown planet id: ${planetId}`);
  }

  const T = getJ2000Centuries(getJDE(jd));

  const a = el.a0 + el.aDot * T;
  const e = el.e0 + el.eDot * T;
  const iDeg = el.i0 + el.iDot * T;
  const L = normalizeDeg(el.L0 + el.LDot * T);
  const wBar = normalizeDeg(el.wBar0 + el.wBarDot * T);
  const omDeg = normalizeDeg(el.om0 + el.omDot * T);

  const wDeg = normalizeDeg(wBar - omDeg);
  let MDeg = normalizeDegSigned(L - wBar);

  // Additional secular/resonant terms for outer giants (Standish Table 2)
  if (id === 'jupiter') {
    MDeg += -0.00012452 * T * T + 0.06064060 * Math.cos(degToRad(38.35125 * T)) + -0.35635438 * Math.sin(degToRad(38.35125 * T));
  } else if (id === 'saturn') {
    MDeg += 0.00025899 * T * T + -0.13434469 * Math.cos(degToRad(38.35125 * T)) + 0.87320147 * Math.sin(degToRad(38.35125 * T));
  } else if (id === 'uranus') {
    MDeg += 0.00058331 * T * T + -0.97731848 * Math.cos(degToRad(7.67025 * T)) + 0.17689245 * Math.sin(degToRad(7.67025 * T));
  } else if (id === 'neptune') {
    MDeg += -0.00041348 * T * T + 0.68346318 * Math.cos(degToRad(7.67025 * T)) + -0.10162547 * Math.sin(degToRad(7.67025 * T));
  }

  const MRad = degToRad(MDeg);
  const E = solveKepler(MRad, e);

  // Coordinates in orbital plane
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(1.0 - e * e) * Math.sin(E);

  const r0 = Math.sqrt(xOrb * xOrb + yOrb * yOrb);
  const vRad = Math.atan2(yOrb, xOrb);

  const wRad = degToRad(wDeg);
  const omRad = degToRad(omDeg);
  const iRad = degToRad(iDeg);

  const u = vRad + wRad;
  const sinU = Math.sin(u);
  const cosU = Math.cos(u);
  const sinOm = Math.sin(omRad);
  const cosOm = Math.cos(omRad);
  const sinI = Math.sin(iRad);
  const cosI = Math.cos(iRad);

  let x = r0 * (cosOm * cosU - sinOm * sinU * cosI);
  let y = r0 * (sinOm * cosU + cosOm * sinU * cosI);
  let z = r0 * (sinU * sinI);

  let lon = normalizeDeg(radToDeg(Math.atan2(y, x)));
  let lat = radToDeg(Math.asin(clamp(z / r0, -1.0, 1.0)));
  let r = r0;

  // Mutual planetary perturbations (Jupiter - Saturn - Uranus great inequality)
  const d = getJDE(jd) - 2451543.5;
  const Mj = degToRad(normalizeDeg(19.8950 + 0.0830853001 * d));
  const Ms = degToRad(normalizeDeg(316.9670 + 0.0334442282 * d));
  const Mu = degToRad(normalizeDeg(142.5905 + 0.011725806 * d));

  if (id === 'jupiter') {
    const dLon =
      -0.332 * Math.sin(2 * Mj - 5 * Ms - 67.6 * DEG2RAD) -
      0.056 * Math.sin(2 * Mj - 2 * Ms + 21.0 * DEG2RAD) +
      0.042 * Math.sin(3 * Mj - 5 * Ms + 21.0 * DEG2RAD) -
      0.036 * Math.sin(Mj - 2 * Ms) +
      0.022 * Math.cos(Mj - Ms) +
      0.023 * Math.sin(2 * Mj - 3 * Ms + 52.0 * DEG2RAD) -
      0.016 * Math.sin(Mj - 5 * Ms - 69.0 * DEG2RAD);
    lon = normalizeDeg(lon + dLon * 0.15); // Residual on top of Standish resonance term
  } else if (id === 'saturn') {
    const dLon =
      0.812 * Math.sin(2 * Mj - 5 * Ms - 67.6 * DEG2RAD) -
      0.229 * Math.cos(2 * Mj - 4 * Ms - 2.0 * DEG2RAD) +
      0.119 * Math.sin(Mj - 2 * Ms - 3.0 * DEG2RAD) +
      0.046 * Math.sin(2 * Mj - 6 * Ms - 69.0 * DEG2RAD) +
      0.014 * Math.sin(Mj - 3 * Ms + 32.0 * DEG2RAD);
    const dLat =
      -0.020 * Math.cos(2 * Mj - 4 * Ms - 2.0 * DEG2RAD) +
      0.018 * Math.sin(2 * Mj - 6 * Ms - 49.0 * DEG2RAD);
    lon = normalizeDeg(lon + dLon * 0.15);
    lat += dLat;
  } else if (id === 'uranus') {
    const dLon =
      0.040 * Math.sin(Ms - 2 * Mu + 6.0 * DEG2RAD) +
      0.035 * Math.sin(Ms - 3 * Mu + 33.0 * DEG2RAD) -
      0.015 * Math.sin(Mj - Mu + 20.0 * DEG2RAD);
    lon = normalizeDeg(lon + dLon);
  }

  // Recompute Cartesian from corrected spherical
  const lonR = degToRad(lon);
  const latR = degToRad(lat);
  x = r * Math.cos(latR) * Math.cos(lonR);
  y = r * Math.cos(latR) * Math.sin(lonR);
  z = r * Math.sin(latR);

  return { x, y, z, r, lon, lat, a, e };
}

/**
 * Generate a 3D heliocentric orbit path (array of { x, y, z } in AU) for a planet.
 * @param {string} planetId
 * @param {number} [jd=J2000]
 * @param {number} [numPoints=128]
 * @returns {Array<{ x: number, y: number, z: number }>}
 */
export function computePlanetOrbitPath(planetId, jd = J2000, numPoints = 128) {
  const el = PLANET_ELEMENTS[planetId.toLowerCase()];
  if (!el) return [];
  const points = [];
  const step = el.periodDays / numPoints;
  for (let k = 0; k <= numPoints; k++) {
    const p = getPlanetHeliocentric(planetId, jd + k * step);
    points.push({ x: p.x, y: p.y, z: p.z });
  }
  return points;
}

/**
 * Compute high-precision Lunar ephemeris (Meeus Ch. 47, 60+ periodic terms for longitude,
 * latitude, and distance, plus optical & physical libration and topocentric parallax).
 * @param {number} jd - Julian Date
 * @param {{ lat?: number, lon?: number, elevationM?: number }} [observer]
 * @param {{ ra: number, dec: number, lon: number, distAU: number }} [sunGeo]
 * @returns {object} Complete Lunar state
 */
export function computeMoon(jd, observer = null, sunGeo = null) {
  const jde = getJDE(jd);
  const T = getJ2000Centuries(jde);
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  // Moon's mean longitude L'
  const Lp = normalizeDeg(
    218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841.0 - T4 / 65194000.0
  );
  // Mean elongation D
  const D = normalizeDeg(
    297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868.0 - T4 / 113065000.0
  );
  // Sun's mean anomaly M
  const M = normalizeDeg(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000.0
  );
  // Moon's mean anomaly M'
  const Mp = normalizeDeg(
    134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699.0 - T4 / 14712000.0
  );
  // Moon's argument of latitude F
  const F = normalizeDeg(
    93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000.0 + T4 / 863310000.0
  );

  // Additional arguments A1, A2, A3 (Venus, Jupiter, flattening)
  const A1 = degToRad(normalizeDeg(119.75 + 131.849 * T));
  const A2 = degToRad(normalizeDeg(53.09 + 479264.290 * T));
  const A3 = degToRad(normalizeDeg(313.45 + 481266.484 * T));

  const E = 1.0 - 0.002516 * T - 0.0000074 * T2;
  const E2 = E * E;

  const Dr = degToRad(D);
  const Mr = degToRad(M);
  const Mpr = degToRad(Mp);
  const Fr = degToRad(F);
  const Lpr = degToRad(Lp);

  // Periodic terms for longitude (Sigma l in 1e-6 deg) and distance (Sigma r in m)
  // [D, M, Mp, F, coeffLon, coeffDist]
  const lonDistTerms = [
    [0, 0, 1, 0, 6288774, -20905355],
    [2, 0, -1, 0, 1274027, -3699111],
    [2, 0, 0, 0, 658314, -2955968],
    [0, 0, 2, 0, 213618, -569925],
    [0, 1, 0, 0, -185116, 48888],
    [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158],
    [2, -1, -1, 0, 57066, -152138],
    [2, 0, 1, 0, 53322, -170733],
    [2, -1, 0, 0, 45758, -204586],
    [0, 1, -1, 0, -40923, -129620],
    [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755],
    [2, 0, 0, -2, 15327, 10321],
    [0, 0, 1, 2, -12528, 0],
    [0, 0, 1, -2, 10980, 79661],
    [4, 0, -1, 0, 10675, -34782],
    [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636],
    [2, 1, -1, 0, -7888, 24208],
    [2, 1, 0, 0, -6766, 30824],
    [1, 0, -1, 0, -5163, -8379],
    [1, 1, 0, 0, 4987, -16675],
    [2, -1, 1, 0, 4036, -12831],
    [2, 0, 2, 0, 3994, -10445],
    [4, 0, 0, 0, 3861, -11650],
    [2, 0, -3, 0, 3665, 14403],
    [0, 1, -2, 0, -2689, -7003],
    [2, 0, -1, 2, -2602, 0],
    [2, -1, -2, 0, 2390, 10056],
    [1, 0, 1, 0, -2348, 6322],
    [2, -2, 0, 0, 2236, -9884],
    [0, 1, 2, 0, -2120, 5751],
    [0, 2, 0, 0, -2069, 0],
    [2, -2, -1, 0, 2048, -4950],
    [2, 0, 1, -2, -1773, 4130],
    [2, 0, 0, 2, -1595, 0],
    [4, -1, -1, 0, 1215, -3958],
    [0, 0, 2, 2, -1110, 0],
    [3, 0, -1, 0, -892, 3258],
    [2, 1, 1, 0, -810, 2616],
    [4, -1, -2, 0, 759, -1897],
    [0, 2, -1, 0, -713, -2117],
    [2, 2, -1, 0, -700, 2354],
    [2, 1, -2, 0, 691, 0],
    [2, -1, 0, -2, 596, 0],
    [4, 0, 1, 0, 549, -1423],
    [0, 0, 4, 0, 537, -1117],
    [4, -1, 0, 0, 520, -1571],
    [1, 0, -2, 0, -487, -1739]
  ];

  let sumL = 0.0;
  let sumR = 0.0;
  for (let i = 0; i < lonDistTerms.length; i++) {
    const [d, m, mp, f, cl, cr] = lonDistTerms[i];
    const arg = d * Dr + m * Mr + mp * Mpr + f * Fr;
    const eFactor = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E2 : 1.0;
    sumL += cl * eFactor * Math.sin(arg);
    if (cr !== 0) sumR += cr * eFactor * Math.cos(arg);
  }
  sumL += 3958 * Math.sin(A1) + 1962 * Math.sin(Lpr - Fr) + 318 * Math.sin(A2);

  // Periodic terms for latitude (Sigma b in 1e-6 deg)
  const latTerms = [
    [0, 0, 0, 1, 5128122],
    [0, 0, 1, 1, 280602],
    [0, 0, 1, -1, 277693],
    [2, 0, 0, -1, 173237],
    [2, 0, -1, 1, 55413],
    [2, 0, -1, -1, 46271],
    [2, 0, 0, 1, 32573],
    [0, 0, 2, 1, 17198],
    [2, 0, 1, -1, 9266],
    [0, 0, 2, -1, 8822],
    [2, -1, 0, -1, 8216],
    [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200],
    [2, 1, 0, -1, -3359],
    [2, -1, -1, 1, 2463],
    [2, -1, 0, 1, 2211],
    [2, -1, -1, -1, 2065],
    [0, 1, -1, -1, -1870],
    [4, 0, -1, -1, 1828],
    [0, 1, 0, 1, -1794],
    [0, 0, 0, 3, -1749],
    [0, 1, -1, 1, -1565],
    [1, 0, 0, 1, -1491],
    [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410],
    [0, 1, 0, -1, -1344],
    [1, 0, 0, -1, -1335],
    [0, 0, 3, 1, 1107],
    [4, 0, 0, -1, 1021],
    [4, 0, -1, 1, 833]
  ];

  let sumB = 0.0;
  for (let i = 0; i < latTerms.length; i++) {
    const [d, m, mp, f, cb] = latTerms[i];
    const arg = d * Dr + m * Mr + mp * Mpr + f * Fr;
    const eFactor = Math.abs(m) === 1 ? E : Math.abs(m) === 2 ? E2 : 1.0;
    sumB += cb * eFactor * Math.sin(arg);
  }
  sumB +=
    -2235 * Math.sin(Lpr) +
    382 * Math.sin(A3) +
    175 * Math.sin(A1 - Fr) +
    175 * Math.sin(A1 + Fr) +
    127 * Math.sin(Lpr - Mpr) -
    115 * Math.sin(Lpr + Mpr);

  const { dPsiDeg, trueEpsDeg } = getNutation(jd);

  // Geocentric ecliptic longitude, latitude, and distance
  const lonDeg = normalizeDeg(Lp + sumL / 1000000.0 + dPsiDeg);
  const latDeg = sumB / 1000000.0;
  const distKm = 385000.56 + sumR / 1000.0;
  const distAU = distKm / AU_KM;

  // Geocentric equatorial coordinates
  const eqGeo = eclipticToEquatorial(lonDeg, latDeg, trueEpsDeg);
  let ra = eqGeo.ra;
  let dec = eqGeo.dec;
  let topoDistKm = distKm;
  let alt = 0;
  let az = 0;
  let ha = 0;

  // Topocentric parallax correction (Meeus Ch. 40) if observer is provided
  if (observer && typeof observer.lat === 'number' && typeof observer.lon === 'number') {
    const lstDeg = observer.lstDeg !== undefined ? observer.lstDeg : getLST(jd, observer.lon);
    const latRad = degToRad(observer.lat);
    const elevM = observer.elevationM || 0;

    // Geocentric latitude rho*sin(phi') and rho*cos(phi')
    const u = Math.atan(0.99664719 * Math.tan(latRad));
    const rhoSinPhi = 0.99664719 * Math.sin(u) + (elevM / 6378140.0) * Math.sin(latRad);
    const rhoCosPhi = Math.cos(u) + (elevM / 6378140.0) * Math.cos(latRad);

    // Equatorial horizontal parallax sin(pi)
    const sinPi = EARTH_RADIUS_KM / distKm;
    const H = degToRad(lstDeg - eqGeo.ra);
    const decRad = degToRad(eqGeo.dec);
    const cosDec = Math.cos(decRad);
    const sinDec = Math.sin(decRad);

    const dRaRad = Math.atan2(
      -rhoCosPhi * sinPi * Math.sin(H),
      cosDec - rhoCosPhi * sinPi * Math.cos(H)
    );
    ra = normalizeDeg(eqGeo.ra + radToDeg(dRaRad));
    dec = radToDeg(
      Math.atan2(
        (sinDec - rhoSinPhi * sinPi) * Math.cos(dRaRad),
        cosDec - rhoCosPhi * sinPi * Math.cos(H)
      )
    );

    // Topocentric distance
    const sinH = Math.sin(H);
    const cosH = Math.cos(H);
    const A = cosDec * sinH;
    const B = cosDec * cosH - rhoCosPhi * sinPi;
    const C = sinDec - rhoSinPhi * sinPi;
    topoDistKm = distKm * Math.sqrt(A * A + B * B + C * C);

    const horiz = equatorialToHorizontal(ra, dec, lstDeg, observer.lat);
    alt = applyRefraction(horiz.alt);
    az = horiz.az;
    ha = horiz.ha;
  }

  // Optical libration in longitude (l') and latitude (b') (Meeus Ch. 53)
  const I = degToRad(1.54242); // Inclination of mean lunar equator to ecliptic
  const Om = normalizeDeg(125.0445479 - 1934.1362891 * T + 0.0020754 * T2);
  const W = degToRad(normalizeDeg(lonDeg - dPsiDeg - Om));
  const sinW = Math.sin(W);
  const cosW = Math.cos(W);
  const latR = degToRad(latDeg);
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const cosI = Math.cos(I);
  const sinI = Math.sin(I);

  const A_lib = radToDeg(Math.atan2(sinW * cosLat * cosI - sinLat * sinI, cosW * cosLat));
  const librationLonDeg = normalizeDegSigned(A_lib - F);
  const librationLatDeg = radToDeg(
    Math.asin(clamp(-sinW * cosLat * sinI - sinLat * cosI, -1.0, 1.0))
  );

  // Position angle P of the Moon's axis of rotation
  const OmRad = degToRad(Om + dPsiDeg);
  const epsRad = degToRad(trueEpsDeg);
  const V = OmRad;
  const X_p = sinI * Math.sin(V);
  const Y_p = sinI * Math.cos(V) * Math.cos(epsRad) - cosI * Math.sin(epsRad);
  const omegaP = Math.atan2(X_p, Y_p);
  const raRad = degToRad(ra);
  const decRad = degToRad(dec);
  const polePADeg = radToDeg(
    Math.asin(
      clamp(
        (Math.sqrt(X_p * X_p + Y_p * Y_p) * Math.cos(raRad - omegaP)) /
          Math.cos(degToRad(librationLatDeg)),
        -1.0,
        1.0
      )
    )
  );

  // Phase, elongation, illuminated fraction, bright limb PA
  let sunLon = 0;
  let sunRa = 0;
  let sunDec = 0;
  let sunDistKm = AU_KM;
  if (sunGeo) {
    sunLon = sunGeo.lon;
    sunRa = sunGeo.ra;
    sunDec = sunGeo.dec;
    sunDistKm = (sunGeo.distAU || 1.0) * AU_KM;
  } else {
    const earthH = getPlanetHeliocentric('earth', jd);
    sunLon = normalizeDeg(earthH.lon + 180.0);
    const sEq = eclipticToEquatorial(sunLon, 0, trueEpsDeg);
    sunRa = sEq.ra;
    sunDec = sEq.dec;
    sunDistKm = earthH.r * AU_KM;
  }

  const elongDeg = angularSeparation(sunRa, sunDec, ra, dec);
  const elongRad = degToRad(elongDeg);
  const phaseAngleRad = Math.atan2(
    sunDistKm * Math.sin(elongRad),
    distKm - sunDistKm * Math.cos(elongRad)
  );
  const phaseAngleDeg = radToDeg(phaseAngleRad);
  const illum = 0.5 * (1.0 + Math.cos(phaseAngleRad));

  // Lunar phase cycle angle (0° = New, 90° = First Quarter, 180° = Full, 270° = Last Quarter)
  const phaseCycleDeg = normalizeDeg(lonDeg - sunLon);
  const SYNODIC_MONTH = 29.530588853;
  const ageDays = (phaseCycleDeg / 360.0) * SYNODIC_MONTH;
  const isWaxing = phaseCycleDeg < 180.0;

  let phaseKey = 'waxing_crescent';
  if (phaseCycleDeg < 6.5 || phaseCycleDeg >= 353.5) phaseKey = 'new_moon';
  else if (phaseCycleDeg < 83.5) phaseKey = 'waxing_crescent';
  else if (phaseCycleDeg < 96.5) phaseKey = 'first_quarter';
  else if (phaseCycleDeg < 173.5) phaseKey = 'waxing_gibbous';
  else if (phaseCycleDeg < 186.5) phaseKey = 'full_moon';
  else if (phaseCycleDeg < 263.5) phaseKey = 'waning_gibbous';
  else if (phaseCycleDeg < 276.5) phaseKey = 'last_quarter';
  else phaseKey = 'waning_crescent';

  // Position angle of the Moon's bright limb (Meeus Eq. 48.5)
  const paLimbDeg = positionAngle(ra, dec, sunRa, sunDec);

  // Apparent angular diameter in arcseconds (at mean distance 384400 km -> 1865.2")
  const angDiamArcsec = (2.0 * 1737.4 / topoDistKm) * 206264.806247;

  // Visual magnitude of the Moon (Allen / Krisciunas & Schaefer phase law)
  const alpha = phaseAngleDeg;
  const mag =
    -12.73 +
    0.026 * Math.abs(alpha) +
    4e-9 * Math.pow(alpha, 4) +
    5.0 * Math.log10(topoDistKm / 384400.0);

  return {
    id: 'moon',
    name: 'Moon',
    nameFr: 'Lune',
    type: 'moon',
    color: '#e0e0e0',
    ra,
    dec,
    raGeo: eqGeo.ra,
    decGeo: eqGeo.dec,
    alt,
    az,
    ha,
    lon: lonDeg,
    lat: latDeg,
    distKm: topoDistKm,
    distGeoKm: distKm,
    distAU: topoDistKm / AU_KM,
    rAU: 1.0,
    angDiamArcsec,
    mag,
    illum,
    phaseAngleDeg,
    phaseCycleDeg,
    ageDays,
    isWaxing,
    phaseKey,
    paLimbDeg,
    elongDeg,
    librationLonDeg,
    librationLatDeg,
    polePADeg,
    rotation: {
      cML: normalizeDeg(-librationLonDeg),
      subEarthLatDeg: librationLatDeg,
      subSolarLatDeg: 0,
      polePADeg,
      librationLonDeg,
      librationLatDeg
    }
  };
}

/**
 * Compute Jupiter physical ephemeris: System I, II, III Central Meridian longitudes,
 * Great Red Spot (GRS) position & transit, sub-Earth latitude De, sub-Solar latitude Ds,
 * and North Pole position angle P (Meeus Ch. 43).
 * @param {number} jd
 * @param {number} raDeg - Geocentric RA of Jupiter
 * @param {number} decDeg - Geocentric Dec of Jupiter
 * @param {number} distAU - Earth-Jupiter distance in AU
 * @param {number} rAU - Sun-Jupiter distance in AU
 * @param {{ x: number, y: number, z: number }} jupHelio
 * @param {number} epsDeg - Obliquity of the ecliptic
 * @returns {object}
 */
export function computeJupiterPhysical(jd, raDeg, decDeg, distAU, rAU, jupHelio, epsDeg) {
  const d = jd - 2451545.0;
  const T = d / 36525.0;
  const lightTimeDays = distAU / SPEED_OF_LIGHT_AUDAY;
  const dCorr = d - lightTimeDays;

  // IAU North Pole of Jupiter (J2000 precessed)
  const alpha0 = degToRad(268.056595 - 0.006499 * T);
  const delta0 = degToRad(64.495303 + 0.002413 * T);

  const alpha = degToRad(raDeg);
  const delta = degToRad(decDeg);

  // Sub-Earth latitude De (planetocentric declination of Earth)
  const sinDe =
    -Math.sin(delta0) * Math.sin(delta) -
    Math.cos(delta0) * Math.cos(delta) * Math.cos(alpha0 - alpha);
  const subEarthLatDeg = radToDeg(Math.asin(clamp(sinDe, -1.0, 1.0)));

  // Sub-Solar latitude Ds
  // Convert heliocentric ecliptic to heliocentric equatorial vector
  const epsR = degToRad(epsDeg);
  const hx = jupHelio.x;
  const hy = jupHelio.y * Math.cos(epsR) - jupHelio.z * Math.sin(epsR);
  const hz = jupHelio.y * Math.sin(epsR) + jupHelio.z * Math.cos(epsR);
  const alphaSun = Math.atan2(-hy, -hx);
  const deltaSun = Math.asin(clamp(-hz / rAU, -1.0, 1.0));
  const sinDs =
    Math.sin(delta0) * Math.sin(deltaSun) +
    Math.cos(delta0) * Math.cos(deltaSun) * Math.cos(alpha0 - alphaSun);
  const subSolarLatDeg = radToDeg(Math.asin(clamp(sinDs, -1.0, 1.0)));

  // Position angle of the North Pole (P)
  const yP = Math.cos(delta0) * Math.sin(alpha0 - alpha);
  const xP =
    Math.sin(delta0) * Math.cos(delta) -
    Math.cos(delta0) * Math.sin(delta) * Math.cos(alpha0 - alpha);
  const polePADeg = normalizeDeg(radToDeg(Math.atan2(yP, xP)));

  // Geometric phase correction to Central Meridian
  const yC = Math.sin(delta0) * Math.cos(delta) * Math.cos(alpha0 - alpha) - Math.sin(delta) * Math.cos(delta0);
  const xC = Math.cos(delta) * Math.sin(alpha0 - alpha);
  const xi = radToDeg(Math.atan2(yC, xC));

  // System I (equatorial belt), System II (temperate belts & GRS), System III (magnetosphere)
  // Calibrated to Meeus Ch. 43 / BAA / JUPOS reference epochs
  const sysI = normalizeDeg(67.1 + 877.90003539 * dCorr + xi);
  const sysII = normalizeDeg(43.3 + 870.27003539 * dCorr + xi);
  const sysIII = normalizeDeg(284.95 + 870.536 * dCorr + xi);

  // Great Red Spot (GRS) longitude in System II (drifts slowly ~1.5°/month; calibrated for 2020-2030)
  const grsLonSysII = normalizeDeg(35.0 + 0.048 * (jd - 2460310.5));
  const grsOffsetDeg = normalizeDegSigned(sysII - grsLonSysII);
  const grsVisible = Math.abs(grsOffsetDeg) <= 52.0;
  // Next/nearest GRS transit across Central Meridian
  let dToTransit = -grsOffsetDeg / 870.27003539;
  if (dToTransit < -0.2) dToTransit += 360.0 / 870.27003539;
  const grsTransitJD = jd + dToTransit;

  return {
    cML: sysII,
    sysI,
    sysII,
    sysIII,
    grsLon: grsLonSysII,
    grsOffsetDeg,
    grsVisible,
    grsTransitJD,
    subEarthLatDeg,
    subSolarLatDeg,
    polePADeg,
    De: subEarthLatDeg,
    Ds: subSolarLatDeg,
    P: polePADeg
  };
}

/**
 * Compute Saturn ring geometry and physical orientation (Meeus Ch. 45).
 * Returns Earth ring tilt B, Sun ring tilt B', North pole position angle P,
 * and ring ellipse major/minor axes in arcseconds and planet radii.
 * @param {number} jd
 * @param {number} lonGeoDeg - Geocentric ecliptic longitude of Saturn
 * @param {number} latGeoDeg - Geocentric ecliptic latitude of Saturn
 * @param {number} distAU - Earth-Saturn distance in AU
 * @param {{ lon: number, lat: number, r: number }} satHelio
 * @param {number} epsDeg - Obliquity of the ecliptic
 * @returns {object}
 */
export function computeSaturnRings(jd, lonGeoDeg, latGeoDeg, distAU, satHelio, epsDeg) {
  const T = getJ2000Centuries(getJDE(jd));

  // Inclination of ring plane to ecliptic (i) and longitude of ascending node (Omega) (Meeus Eq. 45.1)
  const iRingDeg = 28.075216 - 0.012998 * T + 0.000004 * T * T;
  const omRingDeg = 169.508470 + 1.394681 * T + 0.000412 * T * T;

  const iR = degToRad(iRingDeg);
  const omR = degToRad(omRingDeg);
  const lam = degToRad(lonGeoDeg);
  const beta = degToRad(latGeoDeg);

  // Saturnicentric latitude of Earth B referred to ring plane (positive = North face visible)
  const sinB =
    Math.sin(iR) * Math.cos(beta) * Math.sin(lam - omR) - Math.cos(iR) * Math.sin(beta);
  const B = radToDeg(Math.asin(clamp(sinB, -1.0, 1.0)));

  // Saturnicentric latitude of Sun B' referred to ring plane
  const lHelio = degToRad(satHelio.lon);
  const bHelio = degToRad(satHelio.lat);
  const sinBp =
    Math.sin(iR) * Math.cos(bHelio) * Math.sin(lHelio - omR) - Math.cos(iR) * Math.sin(bHelio);
  const Bprime = radToDeg(Math.asin(clamp(sinBp, -1.0, 1.0)));

  // Position angle P of Northern semi-minor axis of rings
  const lambda0 = omR - Math.PI / 2.0;
  const beta0 = Math.PI / 2.0 - iR;
  const poleEq = eclipticToEquatorial(radToDeg(lambda0), radToDeg(beta0), epsDeg);
  const satEq = eclipticToEquatorial(lonGeoDeg, latGeoDeg, epsDeg);
  const P = positionAngle(satEq.ra, satEq.dec, poleEq.ra, poleEq.dec);

  // Outer edge of A ring at 1 AU = 375.35" major axis
  const sinAbsB = Math.abs(Math.sin(degToRad(B)));
  const outerMajorArcsec = 375.35 / distAU;
  const outerMinorArcsec = outerMajorArcsec * sinAbsB;

  // Ring radii ratios relative to Saturn's equatorial radius (60,268 km):
  // Outer A ring: 136,775 km (2.2694 R_sat)
  // Cassini division: 117,580 - 122,170 km (1.9510 - 2.0271 R_sat)
  // Inner B ring: 92,000 km (1.5265 R_sat)
  // Inner C (crepe) ring: 74,658 km (1.2388 R_sat)
  const lightTimeDays = distAU / SPEED_OF_LIGHT_AUDAY;
  const cML = normalizeDeg(38.90 + 810.7939024 * (jd - J2000 - lightTimeDays));

  return {
    B,
    Bprime,
    tiltDeg: B,
    sunTiltDeg: Bprime,
    polePADeg: P,
    P,
    cML,
    subEarthLatDeg: B,
    subSolarLatDeg: Bprime,
    outerMajorArcsec,
    outerMinorArcsec,
    innerMajorArcsec: outerMajorArcsec * 0.665,
    innerMinorArcsec: outerMinorArcsec * 0.665,
    aOuterRatio: 2.2694,
    cassiniOuterRatio: 2.0271,
    cassiniInnerRatio: 1.9510,
    bInnerRatio: 1.5265,
    cInnerRatio: 1.2388,
    northFaceVisible: B > 0
  };
}

/**
 * Compute generic planet axial rotation parameters (Central Meridian cML, De, Ds, P)
 * using IAU cartographic pole coordinates.
 * @param {object} el - Planet element entry
 * @param {number} jd
 * @param {number} raDeg
 * @param {number} decDeg
 * @param {number} distAU
 * @returns {{ cML: number, subEarthLatDeg: number, subSolarLatDeg: number, polePADeg: number, De: number, Ds: number, P: number }}
 */
function computeGenericPlanetRotation(el, jd, raDeg, decDeg, distAU) {
  const lightTimeDays = distAU / SPEED_OF_LIGHT_AUDAY;
  const d = jd - J2000 - lightTimeDays;

  const alpha0 = degToRad(el.poleRA0);
  const delta0 = degToRad(el.poleDec0);
  const alpha = degToRad(raDeg);
  const delta = degToRad(decDeg);

  const sinDe =
    -Math.sin(delta0) * Math.sin(delta) -
    Math.cos(delta0) * Math.cos(delta) * Math.cos(alpha0 - alpha);
  const De = radToDeg(Math.asin(clamp(sinDe, -1.0, 1.0)));

  const yP = Math.cos(delta0) * Math.sin(alpha0 - alpha);
  const xP =
    Math.sin(delta0) * Math.cos(delta) -
    Math.cos(delta0) * Math.sin(delta) * Math.cos(alpha0 - alpha);
  const P = normalizeDeg(radToDeg(Math.atan2(yP, xP)));

  const cML = normalizeDeg(el.w0 + el.wDot * d);

  return {
    cML,
    subEarthLatDeg: De,
    subSolarLatDeg: De,
    polePADeg: P,
    De,
    Ds: De,
    P
  };
}

/**
 * Compute planetary visual magnitude using Mallama & Hilton (2018) / Meeus Ch. 41 phase laws.
 * @param {string} id - Planet identifier
 * @param {number} rAU - Heliocentric distance in AU
 * @param {number} distAU - Geocentric distance in AU
 * @param {number} phaseAngleDeg - Phase angle i in degrees
 * @param {object} [rings] - Saturn ring parameters
 * @returns {number} Visual magnitude V
 */
export function computePlanetMagnitude(id, rAU, distAU, phaseAngleDeg, rings = null) {
  const distTerm = 5.0 * Math.log10(rAU * distAU);
  const i = phaseAngleDeg;
  const i2 = i * i;
  const i3 = i2 * i;

  switch (id) {
    case 'mercury':
      return (
        -0.613 +
        distTerm +
        0.06328 * i -
        0.0016336 * i2 +
        0.000033644 * i3 -
        3.4265e-7 * i2 * i2 +
        1.6893e-9 * i2 * i3 -
        3.0334e-12 * i3 * i3
      );
    case 'venus':
      if (i < 163.7) {
        return -4.384 + distTerm - 0.001044 * i + 0.0003687 * i2 - 2.814e-6 * i3 + 8.938e-9 * i2 * i2;
      }
      return 240.44228 + distTerm - 2.81914 * i + 0.00839034 * i2;
    case 'mars':
      return -1.601 + distTerm + 0.02267 * i - 0.0001302 * i2;
    case 'jupiter':
      return -9.395 + distTerm - 0.00037 * i + 0.000616 * i2;
    case 'saturn': {
      let ringCorr = 0.0;
      if (rings) {
        const sinB = Math.abs(Math.sin(degToRad(rings.B)));
        ringCorr = -2.60 * sinB + 1.25 * sinB * sinB;
      }
      return -8.914 + distTerm + 0.044 * i + ringCorr;
    }
    case 'uranus':
      return -7.110 + distTerm + 0.0028 * i;
    case 'neptune':
      return -7.00 + distTerm;
    default:
      return 0.0;
  }
}

/**
 * Compute full ephemeris for the Sun at a given Julian Date.
 * @param {number} jd
 * @param {{ lat?: number, lon?: number, elevationM?: number }} [observer]
 * @param {{ x: number, y: number, z: number, r: number, lon: number, lat: number }} [earthHelio]
 * @returns {object}
 */
export function computeSun(jd, observer = null, earthHelio = null) {
  const eH = earthHelio || getPlanetHeliocentric('earth', jd);
  const { dPsiDeg, trueEpsDeg } = getNutation(jd);
  const T = getJ2000Centuries(getJDE(jd));

  // Geocentric ecliptic longitude of the Sun = Earth's heliocentric lon + 180° + aberration + nutation
  const aberrationDeg = -20.4898 / 3600.0 / eH.r;
  const lonDeg = normalizeDeg(eH.lon + 180.0 + dPsiDeg + aberrationDeg);
  const latDeg = -eH.lat;
  const distAU = eH.r;
  const distKm = distAU * AU_KM;

  const eq = eclipticToEquatorial(lonDeg, latDeg, trueEpsDeg);
  let alt = 0;
  let az = 0;
  let ha = 0;
  if (observer && typeof observer.lat === 'number' && typeof observer.lon === 'number') {
    const lstDeg = observer.lstDeg !== undefined ? observer.lstDeg : getLST(jd, observer.lon);
    const horiz = equatorialToHorizontal(eq.ra, eq.dec, lstDeg, observer.lat);
    alt = applyRefraction(horiz.alt);
    az = horiz.az;
    ha = horiz.ha;
  }

  // Solar physical ephemeris (Carrington rotation, B0, L0, P; Meeus Ch. 29)
  const theta = ((jd - 2398220.0) * 360.0) / 25.38;
  const incS = degToRad(7.25);
  const K = degToRad(73.6667 + 1.3958333 * ((jd - 2396758.0) / 36525.0));
  const lamR = degToRad(lonDeg - dPsiDeg);
  const epsR = degToRad(trueEpsDeg);

  const xP = Math.atan(-Math.cos(lamR) * Math.tan(epsR));
  const yP = Math.atan(-Math.cos(lamR - K) * Math.tan(incS));
  const polePADeg = radToDeg(xP + yP);
  const subEarthLatDeg = radToDeg(Math.asin(clamp(Math.sin(lamR - K) * Math.sin(incS), -1.0, 1.0)));
  const eta = radToDeg(Math.atan2(-Math.sin(lamR - K) * Math.cos(incS), -Math.cos(lamR - K)));
  const cML = normalizeDeg(eta - theta);

  const angDiamArcsec = 1919.26 / distAU;

  return {
    id: 'sun',
    name: 'Sun',
    nameFr: 'Soleil',
    type: 'star',
    color: '#ffcc33',
    helio: { x: 0, y: 0, z: 0, r: 0, lon: 0, lat: 0 },
    ra: eq.ra,
    dec: eq.dec,
    alt,
    az,
    ha,
    lon: lonDeg,
    lat: latDeg,
    distAU,
    distKm,
    rAU: 0,
    angDiamArcsec,
    mag: -26.74 + 5.0 * Math.log10(distAU),
    illum: 1.0,
    phaseAngleDeg: 0.0,
    paLimbDeg: 0.0,
    elongDeg: 0.0,
    rotation: {
      cML,
      subEarthLatDeg,
      subSolarLatDeg: subEarthLatDeg,
      polePADeg,
      De: subEarthLatDeg,
      Ds: subEarthLatDeg,
      P: polePADeg
    }
  };
}

/**
 * Compute full ephemeris for a major planet at a given Julian Date.
 * Includes light-time iteration, geocentric & topocentric coordinates, physical orientation,
 * Saturn ring parameters, and Jupiter GRS / System I-III longitudes.
 * @param {string} planetId
 * @param {number} jd
 * @param {{ lat?: number, lon?: number, elevationM?: number, lstDeg?: number }} [observer]
 * @param {{ x: number, y: number, z: number, r: number, lon: number, lat: number }} [earthHelio]
 * @param {{ ra: number, dec: number, lon: number, distAU: number }} [sunGeo]
 * @returns {object}
 */
export function computePlanet(planetId, jd, observer = null, earthHelio = null, sunGeo = null) {
  const id = planetId.toLowerCase();
  if (id === 'sun') return computeSun(jd, observer, earthHelio);
  if (id === 'moon') return computeMoon(jd, observer, sunGeo);

  const eH = earthHelio || getPlanetHeliocentric('earth', jd);
  const el = PLANET_ELEMENTS[id];
  if (!el) throw new Error(`Unknown planet: ${planetId}`);

  if (id === 'earth') {
    return {
      id: 'earth',
      name: 'Earth',
      nameFr: 'Terre',
      type: 'planet',
      color: el.color,
      helio: eH,
      ra: 0,
      dec: 0,
      alt: -90,
      az: 0,
      ha: 0,
      lon: eH.lon,
      lat: eH.lat,
      distAU: 0,
      distKm: 0,
      rAU: eH.r,
      angDiamArcsec: 0,
      mag: -3.99,
      illum: 1.0,
      phaseAngleDeg: 0,
      paLimbDeg: 0,
      elongDeg: 0
    };
  }

  // First pass heliocentric position + 1st-order light-time correction
  let pH = getPlanetHeliocentric(id, jd);
  let dx = pH.x - eH.x;
  let dy = pH.y - eH.y;
  let dz = pH.z - eH.z;
  let distAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const lightTimeDays = distAU / SPEED_OF_LIGHT_AUDAY;

  const pHApp = getPlanetHeliocentric(id, jd - lightTimeDays);
  dx = pHApp.x - eH.x;
  dy = pHApp.y - eH.y;
  dz = pHApp.z - eH.z;
  distAU = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const { dPsiDeg, trueEpsDeg } = getNutation(jd);

  // Geocentric ecliptic coordinates
  const lonGeoDeg = normalizeDeg(radToDeg(Math.atan2(dy, dx)) + dPsiDeg);
  const latGeoDeg = radToDeg(Math.asin(clamp(dz / distAU, -1.0, 1.0)));

  const eq = eclipticToEquatorial(lonGeoDeg, latGeoDeg, trueEpsDeg);
  let ra = eq.ra;
  let dec = eq.dec;
  let alt = 0;
  let az = 0;
  let ha = 0;

  if (observer && typeof observer.lat === 'number' && typeof observer.lon === 'number') {
    const lstDeg = observer.lstDeg !== undefined ? observer.lstDeg : getLST(jd, observer.lon);
    const horiz = equatorialToHorizontal(ra, dec, lstDeg, observer.lat);
    alt = applyRefraction(horiz.alt);
    az = horiz.az;
    ha = horiz.ha;
  }

  // Elongation from Sun & Phase Angle
  const R = eH.r; // Sun-Earth
  const r = pH.r; // Sun-Planet
  const delta = distAU; // Earth-Planet

  const cosPhase = clamp((r * r + delta * delta - R * R) / (2.0 * r * delta), -1.0, 1.0);
  const phaseAngleDeg = radToDeg(Math.acos(cosPhase));
  const illum = 0.5 * (1.0 + cosPhase);

  const cosElong = clamp((R * R + delta * delta - r * r) / (2.0 * R * delta), -1.0, 1.0);
  const elongDeg = radToDeg(Math.acos(cosElong));

  // Position angle of bright limb
  let sRa = 0;
  let sDec = 0;
  if (sunGeo) {
    sRa = sunGeo.ra;
    sDec = sunGeo.dec;
  } else {
    const sEq = eclipticToEquatorial(normalizeDeg(eH.lon + 180.0), -eH.lat, trueEpsDeg);
    sRa = sEq.ra;
    sDec = sEq.dec;
  }
  const paLimbDeg = positionAngle(ra, dec, sRa, sDec);

  // Apparent angular diameter in arcseconds
  const angDiamArcsec = ((2.0 * el.radiusKm) / (distAU * AU_KM)) * 206264.806247;

  // Physical orientation & rings
  let rotation = null;
  let rings = null;
  if (id === 'jupiter') {
    rotation = computeJupiterPhysical(jd, ra, dec, distAU, r, pH, trueEpsDeg);
  } else if (id === 'saturn') {
    rings = computeSaturnRings(jd, lonGeoDeg, latGeoDeg, distAU, pH, trueEpsDeg);
    rotation = {
      cML: rings.cML,
      subEarthLatDeg: rings.B,
      subSolarLatDeg: rings.Bprime,
      polePADeg: rings.P,
      De: rings.B,
      Ds: rings.Bprime,
      P: rings.P
    };
  } else {
    rotation = computeGenericPlanetRotation(el, jd, ra, dec, distAU);
  }

  const mag = computePlanetMagnitude(id, r, distAU, phaseAngleDeg, rings);

  return {
    id,
    name: el.name,
    nameFr: el.nameFr,
    type: 'planet',
    color: el.color,
    radiusKm: el.radiusKm,
    flattening: el.flattening,
    helio: pH,
    ra,
    dec,
    alt,
    az,
    ha,
    lon: lonGeoDeg,
    lat: latGeoDeg,
    distAU,
    distKm: distAU * AU_KM,
    rAU: r,
    angDiamArcsec,
    mag,
    illum,
    phaseAngleDeg,
    paLimbDeg,
    elongDeg,
    rotation,
    rings
  };
}

/**
 * Compute all Solar System primary bodies (Sun, Moon, and 8 planets) for a given Julian Date.
 * @param {number} jd
 * @param {{ lat?: number, lon?: number, elevationM?: number }} [observer]
 * @returns {{
 *   sun: object,
 *   moon: object,
 *   earthHelio: object,
 *   planets: Record<string, object>,
 *   planetList: Array<object>,
 *   allBodies: Array<object>
 * }}
 */
export function computeSolarSystem(jd, observer = null) {
  const obs =
    observer && typeof observer.lat === 'number' && typeof observer.lon === 'number'
      ? {
          ...observer,
          lstDeg: observer.lstDeg !== undefined ? observer.lstDeg : getLST(jd, observer.lon)
        }
      : null;

  const earthHelio = getPlanetHeliocentric('earth', jd);
  const sun = computeSun(jd, obs, earthHelio);
  const moon = computeMoon(jd, obs, sun);

  const planetIds = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const planets = {};
  const planetList = [];

  for (const pid of planetIds) {
    const p = computePlanet(pid, jd, obs, earthHelio, sun);
    planets[pid] = p;
    if (pid !== 'earth') {
      planetList.push(p);
    }
  }

  return {
    sun,
    moon,
    earthHelio,
    planets,
    planetList,
    allBodies: [sun, moon, ...planetList]
  };
}

/**
 * Compute any single Solar System body by id.
 * @param {string} bodyId
 * @param {number} jd
 * @param {object} [observer]
 * @param {object} [earthHelio]
 * @returns {object}
 */
export function computeBody(bodyId, jd, observer = null, earthHelio = null) {
  const id = bodyId.toLowerCase();
  const eH = earthHelio || getPlanetHeliocentric('earth', jd);
  if (id === 'sun') return computeSun(jd, observer, eH);
  const sun = computeSun(jd, observer, eH);
  if (id === 'moon') return computeMoon(jd, observer, sun);
  return computePlanet(id, jd, observer, eH, sun);
}

/**
 * Compute the moons of Jupiter (Io, Europa, Ganymede, Callisto) or Saturn
 * (Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus) at a given Julian Date.
 * Reference: Meeus Ch. 44 (Jupiter's Galilean satellites) & Dourneau / Meeus Ch. 46 (Saturn's satellites).
 *
 * Coordinate conventions for dx, dy, z:
 * - `dx`: Apparent offset in equatorial planetary radii (+West / -East in standard Meeus,
 *         plus explicit `dxEastArcsec`, `dyNorthArcsec`, `dxRadii`, `dyRadii`).
 *         Here `dx` is positive East (+RA direction) and `dy` is positive North (+Dec direction)
 *         so sky-map and canvas renderers can plot directly!
 * - `z`: Depth in planetary radii (`z < 0` or `inFront = true` when closer to Earth than the planet center,
 *        plus explicit booleans `inFront`, `inTransit`, `shadowTransit`, `occulted`, `eclipsed`).
 *
 * @param {string} planetId - 'jupiter' or 'saturn'
 * @param {number} jd - Julian Date
 * @param {object} [planetState] - Optional precomputed planet object from computePlanet
 * @returns {Array<object>}
 */
export function getPlanetMoons(planetId, jd, planetState = null) {
  const id = planetId.toLowerCase();
  if (id === 'jupiter') {
    return computeJupiterMoons(jd, planetState);
  }
  if (id === 'saturn') {
    return computeSaturnMoons(jd, planetState);
  }
  return [];
}

/**
 * Compute Galilean moons of Jupiter (Io, Europa, Ganymede, Callisto) with full mutual/planet phenomena:
 * Disk transits (`inTransit`), shadow transits (`shadowTransit`), occultations (`occulted`),
 * and eclipses (`eclipsed`).
 * Reference: Meeus Ch. 44.
 * @param {number} jd
 * @param {object} [jupState]
 * @returns {Array<object>}
 */
export function computeJupiterMoons(jd, jupState = null) {
  const jup = jupState || computePlanet('jupiter', jd);
  const distAU = jup.distAU;
  const rAU = jup.rAU;
  const lightTimeDays = distAU / SPEED_OF_LIGHT_AUDAY;
  const d = getJDE(jd) - 2451545.0 - lightTimeDays;

  // Fundamental arguments (Meeus Eq. 44.1)
  const V = normalizeDeg(172.74 + 0.00111588 * d);
  const M = normalizeDeg(357.529 + 0.9856003 * d);
  const N = normalizeDeg(20.020 + 0.0830853 * d + 0.329 * Math.sin(degToRad(V)));
  const J = normalizeDeg(66.115 + 0.9025179 * d - 0.329 * Math.sin(degToRad(V)));

  const A = 1.915 * Math.sin(degToRad(M)) + 0.020 * Math.sin(degToRad(2 * M));
  const B = 5.555 * Math.sin(degToRad(N)) + 0.168 * Math.sin(degToRad(2 * N));
  const K = J + A - B;
  const R = 1.00014 - 0.01671 * Math.cos(degToRad(M)) - 0.00014 * Math.cos(degToRad(2 * M));
  const r = 5.20872 - 0.25208 * Math.cos(degToRad(N)) - 0.00611 * Math.cos(degToRad(2 * N));
  const Delta = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(degToRad(K)));
  const psi = radToDeg(Math.asin(clamp((R / Delta) * Math.sin(degToRad(K)), -1.0, 1.0)));

  // Mean longitudes of the 4 Galilean moons (u1, u2, u3, u4) measured from inferior geocentric conjunction
  let u1 = normalizeDeg(163.8069 + 203.4058646 * d + psi - B);
  let u2 = normalizeDeg(358.4140 + 101.2916335 * d + psi - B);
  let u3 = normalizeDeg(5.7176 + 50.2345180 * d + psi - B);
  let u4 = normalizeDeg(224.8092 + 21.4879800 * d + psi - B);

  // Laplace resonance perturbations G and H
  const G = degToRad(normalizeDeg(331.18 + 50.310482 * d));
  const H = degToRad(normalizeDeg(87.45 + 21.569231 * d));

  const corr1 = 0.473 * Math.sin(2 * degToRad(u1 - u2));
  const corr2 = 1.065 * Math.sin(2 * degToRad(u2 - u3));
  const corr3 = 0.165 * Math.sin(G);
  const corr4 = 0.843 * Math.sin(H);

  u1 = normalizeDeg(u1 + corr1);
  u2 = normalizeDeg(u2 + corr2);
  u3 = normalizeDeg(u3 + corr3);
  u4 = normalizeDeg(u4 + corr4);

  // Orbital radii in Jupiter equatorial radii
  const r1 = 5.9057 - 0.0244 * Math.cos(2 * degToRad(u1 - u2));
  const r2 = 9.3966 - 0.0882 * Math.cos(2 * degToRad(u2 - u3));
  const r3 = 14.9883 - 0.0216 * Math.cos(G);
  const r4 = 26.3627 - 0.1939 * Math.cos(H);

  const De = degToRad(jup.rotation ? jup.rotation.subEarthLatDeg : -2.2);
  const Ds = degToRad(jup.rotation ? jup.rotation.subSolarLatDeg : -2.1);
  const psiRad = degToRad(psi); // Phase angle with sign (+ before opposition, - after opposition)

  const jupAngRadiusArcsec = jup.angDiamArcsec * 0.5;
  const pAngleRad = degToRad(jup.rotation ? jup.rotation.polePADeg : 0);
  const cosP = Math.cos(pAngleRad);
  const sinP = Math.sin(pAngleRad);
  const cosDec = Math.max(0.01, Math.cos(degToRad(jup.dec)));

  // Oblateness factor of Jupiter (polar radius = equatorial / 1.0693)
  const oblatenessScale = 1.0693;

  const moonDefs = [
    { id: 'io', name: 'Io', nameFr: 'Io', u: u1, r: r1, mag0: 5.02, color: '#ffcc55', periodDays: 1.769138 },
    { id: 'europa', name: 'Europa', nameFr: 'Europe', u: u2, r: r2, mag0: 5.29, color: '#e8e4d8', periodDays: 3.551181 },
    { id: 'ganymede', name: 'Ganymede', nameFr: 'Ganymède', u: u3, r: r3, mag0: 4.61, color: '#c4b7a6', periodDays: 7.154553 },
    { id: 'callisto', name: 'Callisto', nameFr: 'Callisto', u: u4, r: r4, mag0: 5.65, color: '#9a8f82', periodDays: 16.689018 }
  ];

  const distMagTerm = 5.0 * Math.log10((rAU * distAU) / (5.203 * 4.203));

  return moonDefs.map((m) => {
    const uRad = degToRad(m.u);
    // Earth-view coordinates (in Jupiter equatorial radii):
    // u = 0 is inferior conjunction (in front of Jupiter), u = 90 is West, u = 180 is behind, u = 270 is East
    // We define dx positive East (+RA) and dy positive North (+Dec):
    const dx = -m.r * Math.sin(uRad);
    const dy = -m.r * Math.cos(uRad) * Math.sin(De);
    // z > 0 means in front of Jupiter (closer to Earth), z < 0 means behind Jupiter
    const z = m.r * Math.cos(uRad) * Math.cos(De);
    const inFront = z > 0;

    // Apparent distance from Jupiter center normalized to elliptical disk
    const diskDist = Math.sqrt(dx * dx + Math.pow(dy * oblatenessScale, 2));
    const inTransit = inFront && diskDist < 1.0;
    const occulted = !inFront && diskDist < 1.0;

    // Heliocentric / Sun-view coordinates for shadow transits & eclipses
    // Heliocentric angle uSun = u - psi
    const uSunRad = degToRad(m.u - psi);
    const dxSun = -m.r * Math.sin(uSunRad);
    const dySun = -m.r * Math.cos(uSunRad) * Math.sin(Ds);
    const zSun = m.r * Math.cos(uSunRad) * Math.cos(Ds);
    const shadowDiskDist = Math.sqrt(dxSun * dxSun + Math.pow(dySun * oblatenessScale, 2));

    // When zSun > 0 (between Sun and Jupiter), its shadow falls onto Jupiter's cloud tops!
    const shadowTransit = zSun > 0 && shadowDiskDist < 1.0;
    // Project shadow position on Earth-facing hemisphere:
    const shadowDx = dx + z * Math.tan(psiRad);
    const shadowDy = dySun;

    // When zSun < 0 (behind Jupiter relative to the Sun), the moon enters Jupiter's umbra!
    const eclipsed = zSun < 0 && shadowDiskDist < 1.0;

    // Rotate (dx, dy) by Jupiter's North Pole position angle P to get sky RA/Dec offsets
    const dEastArcsec = (dx * cosP + dy * sinP) * jupAngRadiusArcsec;
    const dNorthArcsec = (-dx * sinP + dy * cosP) * jupAngRadiusArcsec;

    const ra = normalizeDeg(jup.ra + dEastArcsec / 3600.0 / cosDec);
    const dec = clamp(jup.dec + dNorthArcsec / 3600.0, -90.0, 90.0);

    return {
      id: m.id,
      name: m.name,
      nameFr: m.nameFr,
      parentId: 'jupiter',
      color: m.color,
      periodDays: m.periodDays,
      dx,
      dy,
      z,
      dxArcsec: dEastArcsec,
      dyArcsec: dNorthArcsec,
      inFront,
      inTransit,
      shadowTransit,
      shadowDx,
      shadowDy,
      occulted,
      eclipsed,
      isVisible: !occulted && !eclipsed,
      ra,
      dec,
      mag: m.mag0 + distMagTerm + (eclipsed ? 6.0 : 0.0)
    };
  });
}

/**
 * Compute the 7 major moons of Saturn:
 * Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus.
 * Reference: Meeus Ch. 46 / Dourneau elements.
 * @param {number} jd
 * @param {object} [satState]
 * @returns {Array<object>}
 */
export function computeSaturnMoons(jd, satState = null) {
  const sat = satState || computePlanet('saturn', jd);
  const distAU = sat.distAU;
  const lightTimeDays = distAU / SPEED_OF_LIGHT_AUDAY;
  const d = getJDE(jd) - 2451545.0 - lightTimeDays;

  const rings = sat.rings || { B: 10.0, P: 5.0 };
  const B = degToRad(rings.B);
  const sinB = Math.sin(B);
  const cosB = Math.cos(B);

  const satAngRadiusArcsec = sat.angDiamArcsec * 0.5;
  const pAngleRad = degToRad(rings.P || 0);
  const cosP = Math.cos(pAngleRad);
  const sinP = Math.sin(pAngleRad);
  const cosDec = Math.max(0.01, Math.cos(degToRad(sat.dec)));

  // Orbital parameters in Saturn equatorial radii (60,268 km)
  // u0 at J2000 (deg), n = mean daily motion (deg/day), a = semi-major axis in R_sat, e = eccentricity
  const satMoons = [
    { id: 'mimas', name: 'Mimas', nameFr: 'Mimas', a: 3.079, e: 0.0202, u0: 14.0, n: 381.9945, mag: 12.9, color: '#d0d0d0', iRel: 1.53 },
    { id: 'enceladus', name: 'Enceladus', nameFr: 'Encelade', a: 3.949, e: 0.0045, u0: 200.0, n: 262.7319, mag: 11.7, color: '#f0f8ff', iRel: 0.02 },
    { id: 'tethys', name: 'Tethys', nameFr: 'Téthys', a: 4.889, e: 0.0001, u0: 285.0, n: 190.6979, mag: 10.2, color: '#e8e8e8', iRel: 1.09 },
    { id: 'dione', name: 'Dione', nameFr: 'Dioné', a: 6.262, e: 0.0022, u0: 255.0, n: 131.5349, mag: 10.4, color: '#dcdcdc', iRel: 0.02 },
    { id: 'rhea', name: 'Rhea', nameFr: 'Rhéa', a: 8.746, e: 0.0010, u0: 350.0, n: 79.6900, mag: 9.7, color: '#d4cfc9', iRel: 0.35 },
    { id: 'titan', name: 'Titan', nameFr: 'Titan', a: 20.273, e: 0.0288, u0: 186.0, n: 22.5770, mag: 8.4, color: '#f0b865', iRel: 0.33 },
    { id: 'iapetus', name: 'Iapetus', nameFr: 'Japet', a: 59.091, e: 0.0283, u0: 356.0, n: 4.53795, mag: 11.0, color: '#b8b0a4', iRel: 14.72 }
  ];

  const oblatenessScale = 1.1086;

  return satMoons.map((m) => {
    const M = degToRad(normalizeDeg(m.u0 + m.n * d));
    const u = M + 2.0 * m.e * Math.sin(M);
    const r = m.a * (1.0 - m.e * Math.cos(M));

    // For Iapetus, account for its ~14.7° inclination to the ring plane
    const bEff = m.id === 'iapetus' ? B + degToRad(m.iRel * Math.sin(u * 0.5)) : B;
    const sinBeff = Math.sin(bEff);
    const cosBeff = Math.cos(bEff);

    const dx = -r * Math.sin(u);
    const dy = -r * Math.cos(u) * sinBeff;
    const z = r * Math.cos(u) * cosBeff;
    const inFront = z > 0;

    const diskDist = Math.sqrt(dx * dx + Math.pow(dy * oblatenessScale, 2));
    const inTransit = inFront && diskDist < 1.0;
    const occulted = !inFront && diskDist < 1.0;

    const dEastArcsec = (dx * cosP + dy * sinP) * satAngRadiusArcsec;
    const dNorthArcsec = (-dx * sinP + dy * cosP) * satAngRadiusArcsec;

    const ra = normalizeDeg(sat.ra + dEastArcsec / 3600.0 / cosDec);
    const dec = clamp(sat.dec + dNorthArcsec / 3600.0, -90.0, 90.0);

    return {
      id: m.id,
      name: m.name,
      nameFr: m.nameFr,
      parentId: 'saturn',
      color: m.color,
      periodDays: 360.0 / m.n,
      dx,
      dy,
      z,
      dxArcsec: dEastArcsec,
      dyArcsec: dNorthArcsec,
      inFront,
      inTransit,
      shadowTransit: false,
      occulted,
      eclipsed: false,
      isVisible: !occulted,
      ringInclinationDeg: radToDeg(bEff),
      ra,
      dec,
      mag: m.mag
    };
  });
}

/**
 * Compute IAU HG visual magnitude for an asteroid (Bowell et al. 1989).
 * @param {number} H - Absolute magnitude
 * @param {number} G - Slope parameter (typically 0.15)
 * @param {number} rAU - Heliocentric distance in AU
 * @param {number} distAU - Geocentric distance in AU
 * @param {number} phaseAngleDeg - Solar phase angle beta in degrees
 * @returns {number} Apparent visual magnitude V
 */
export function computeAsteroidHGMagnitude(H, G = 0.15, rAU, distAU, phaseAngleDeg) {
  const beta = degToRad(Math.max(0.0, phaseAngleDeg));
  const tanHalf = Math.tan(0.5 * beta);
  const phi1 = Math.exp(-3.33 * Math.pow(tanHalf, 0.63));
  const phi2 = Math.exp(-1.87 * Math.pow(tanHalf, 1.22));
  const phaseTerm = -2.5 * Math.log10(Math.max(1e-6, (1.0 - G) * phi1 + G * phi2));
  return H + 5.0 * Math.log10(rAU * distAU) + phaseTerm;
}

/**
 * Propagate a single asteroid's osculating Keplerian elements to Julian Date `jd`
 * and optionally generate its 3D orbital ellipse points.
 * @param {object} ast - Asteroid element object (`a`, `e`, `i`, `om`, `w`, `ma`, `epoch`, `H`, `G`)
 * @param {number} jd - Target Julian Date
 * @param {{ x: number, y: number, z: number, r: number }} [earthHelio]
 * @param {number} [lstDeg=0]
 * @param {number} [latDeg=45]
 * @param {boolean} [includeOrbit=true]
 * @returns {object}
 */
export function computeSingleAsteroid(
  ast,
  jd,
  earthHelio = null,
  lstDeg = 0,
  latDeg = 45,
  includeOrbit = true
) {
  const eH = earthHelio || getPlanetHeliocentric('earth', jd);
  const a = Number(ast.a);
  const e = Number(ast.e);
  const iDeg = Number(ast.i !== undefined ? ast.i : ast.inc || 0);
  const omDeg = Number(ast.om !== undefined ? ast.om : ast.node || ast.omega || 0);
  const wDeg = Number(ast.w !== undefined ? ast.w : ast.peri || ast.argPeri || 0);
  const ma0Deg = Number(ast.ma !== undefined ? ast.ma : ast.M !== undefined ? ast.M : ast.M0 || 0);
  const epochJD = Number(ast.epoch !== undefined ? ast.epoch : ast.epochJD || J2000);
  const H = Number(ast.H !== undefined ? ast.H : 5.0);
  const G = Number(ast.G !== undefined ? ast.G : 0.15);

  // Gaussian gravitational constant k = 0.01720209895 -> mean daily motion n = 0.9856076686 / a^(3/2)
  const nDegPerDay = 0.9856076686 / Math.pow(a, 1.5);
  const dDays = getJDE(jd) - epochJD;
  const MDeg = normalizeDeg(ma0Deg + nDegPerDay * dDays);
  const E = solveKepler(degToRad(MDeg), e);

  const wRad = degToRad(wDeg);
  const omRad = degToRad(omDeg);
  const iRad = degToRad(iDeg);
  const sinOm = Math.sin(omRad);
  const cosOm = Math.cos(omRad);
  const sinI = Math.sin(iRad);
  const cosI = Math.cos(iRad);

  function posFromEccentricAnomaly(E_rad) {
    const xOrb = a * (Math.cos(E_rad) - e);
    const yOrb = a * Math.sqrt(1.0 - e * e) * Math.sin(E_rad);
    const r = Math.sqrt(xOrb * xOrb + yOrb * yOrb);
    const v = Math.atan2(yOrb, xOrb);
    const u = v + wRad;
    const sinU = Math.sin(u);
    const cosU = Math.cos(u);
    const x = r * (cosOm * cosU - sinOm * sinU * cosI);
    const y = r * (sinOm * cosU + cosOm * sinU * cosI);
    const z = r * (sinU * sinI);
    return { x, y, z, r };
  }

  const helio = posFromEccentricAnomaly(E);
  const dx = helio.x - eH.x;
  const dy = helio.y - eH.y;
  const dz = helio.z - eH.z;
  const distAU = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const rAU = helio.r;

  const lonGeoDeg = normalizeDeg(radToDeg(Math.atan2(dy, dx)));
  const latGeoDeg = radToDeg(Math.asin(clamp(dz / distAU, -1.0, 1.0)));

  const epsDeg = getObliquity(jd);
  const eq = eclipticToEquatorial(lonGeoDeg, latGeoDeg, epsDeg);
  const horiz = equatorialToHorizontal(eq.ra, eq.dec, lstDeg, latDeg);
  const alt = applyRefraction(horiz.alt);

  const R = eH.r;
  const cosPhase = clamp((rAU * rAU + distAU * distAU - R * R) / (2.0 * rAU * distAU), -1.0, 1.0);
  const phaseAngleDeg = radToDeg(Math.acos(cosPhase));
  const cosElong = clamp((R * R + distAU * distAU - rAU * rAU) / (2.0 * R * distAU), -1.0, 1.0);
  const elongDeg = radToDeg(Math.acos(cosElong));

  const mag = computeAsteroidHGMagnitude(H, G, rAU, distAU, phaseAngleDeg);

  let orbitPoints = null;
  if (includeOrbit) {
    orbitPoints = [];
    const steps = 96;
    for (let k = 0; k <= steps; k++) {
      const Ek = (k / steps) * 2.0 * Math.PI;
      const pt = posFromEccentricAnomaly(Ek);
      orbitPoints.push({ x: pt.x, y: pt.y, z: pt.z });
    }
  }

  return {
    id: ast.id || `ast_${ast.number || ast.name}`.toLowerCase(),
    number: ast.number || 0,
    name: ast.name,
    nameFr: ast.nameFr || ast.name,
    type: 'asteroid',
    color: '#c8b8a0',
    a,
    e,
    i: iDeg,
    om: omDeg,
    w: wDeg,
    periodDays: 360.0 / nDegPerDay,
    helio,
    x: helio.x,
    y: helio.y,
    z: helio.z,
    ra: eq.ra,
    dec: eq.dec,
    alt,
    az: horiz.az,
    ha: horiz.ha,
    lon: lonGeoDeg,
    lat: latGeoDeg,
    distAU,
    distKm: distAU * AU_KM,
    rAU,
    mag,
    H,
    G,
    phaseAngleDeg,
    elongDeg,
    illum: 0.5 * (1.0 + cosPhase),
    orbitPoints
  };
}

/**
 * Propagate all 8 bright asteroids (from provided `asteroidsData` or `DEFAULT_ASTEROIDS`).
 * @param {Array<object>} [asteroidsData]
 * @param {number} [jd=J2000]
 * @param {{ x: number, y: number, z: number, r: number }} [earthHelio]
 * @param {number} [lstDeg=0]
 * @param {number} [latDeg=45]
 * @returns {Array<object>}
 */
export function computeAsteroids(
  asteroidsData = DEFAULT_ASTEROIDS,
  jd = J2000,
  earthHelio = null,
  lstDeg = 0,
  latDeg = 45
) {
  const list = Array.isArray(asteroidsData) && asteroidsData.length > 0 ? asteroidsData : DEFAULT_ASTEROIDS;
  const eH = earthHelio || getPlanetHeliocentric('earth', jd);
  return list.map((ast) => computeSingleAsteroid(ast, jd, eH, lstDeg, latDeg, true));
}
