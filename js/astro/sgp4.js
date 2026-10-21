/**
 * @fileoverview Self-contained NORAD SGP4 near-Earth satellite orbital propagator,
 * topocentric coordinate converter, cylindrical/conical Earth shadow eclipse detector,
 * visual magnitude estimator, 4-day pass predictor, and CelesTrak live TLE fetcher.
 * Reference: Hoots & Roehrich (1980) Spacetrack Report #3 / Vallado et al. (2006) AIAA 2006-6753.
 */

import {
  DEG2RAD,
  RAD2DEG,
  AU_KM,
  EARTH_RADIUS_KM,
  EARTH_FLATTENING,
  degToRad,
  radToDeg,
  normalizeDeg,
  normalizeDegSigned,
  clamp,
  getGMST,
  getLST,
  equatorialToHorizontal,
  applyRefraction
} from './time.js';
import { computeSun } from './solar-system.js';

// WGS-72 / WGS-84 SGP4 Gravitational & Earth constants
const MU = 398600.8; // km^3 / s^2
const XKMPER = 6378.135; // Earth equatorial radius in km (SGP4 standard)
const XKE = 0.07436691613317342; // sqrt(GM) in earth-radii^(3/2) / min
const J2 = 0.001082616;
const J3 = -0.00000253881;
const J4 = -0.00000165597;
const CK2 = 0.5 * J2;
const CK4 = -0.375 * J4;
const A3OVK2 = -J3 / CK2;
const QO = 120.0 / XKMPER + 1.0;
const SO = 78.0 / XKMPER + 1.0;
const QOMS2T = Math.pow(QO - SO, 4);
const MIN_PER_DAY = 1440.0;
const TWO_PI = 2.0 * Math.PI;

/**
 * Default bright Earth satellites (ISS, HST, Tiangong, etc.) as fallback TLE catalog.
 */
export const DEFAULT_SATELLITES = [
  {
    id: 'iss',
    noradId: 25544,
    name: 'ISS (ZARYA)',
    category: 'stations',
    stdMag: -1.8,
    line1: '1 25544U 98067A   25080.51234567  .00016717  00000-0  10270-3 0  9993',
    line2: '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50103472412345'
  },
  {
    id: 'tiangong',
    noradId: 48274,
    name: 'CSS (TIANGONG)',
    category: 'stations',
    stdMag: 0.0,
    line1: '1 48274U 21035A   25080.45000000  .00021000  00000-0  24500-3 0  9991',
    line2: '2 48274  41.4742 312.1850 0005120 278.4100  81.6500 15.60542110214567'
  },
  {
    id: 'hst',
    noradId: 20580,
    name: 'HST (Hubble)',
    category: 'science',
    stdMag: 2.2,
    line1: '1 20580U 90037B   25080.32000000  .00001850  00000-0  85000-4 0  9995',
    line2: '2 20580  28.4698 118.5234 0002640  64.2150 295.9120 15.14256310654321'
  },
  {
    id: 'ajisai',
    noradId: 16908,
    name: 'AJISAI (EGS)',
    category: 'geodetic',
    stdMag: 3.0,
    line1: '1 16908U 86061A   25080.12000000 -.00000080  00000-0  00000+0 0  9992',
    line2: '2 16908  50.0085  42.1120 0011250 185.4000 174.7000 12.44478120712340'
  }
];

/**
 * Parse a TLE exponential decimal field like " 10270-3" or "-11606-4".
 * @param {string} str
 * @returns {number}
 */
function parseTLEExponential(str) {
  const s = str.trim();
  if (!s || s === '00000-0' || s === '00000+0') return 0.0;
  const sign = s[0] === '-' ? -1.0 : 1.0;
  const body = s[0] === '-' || s[0] === '+' ? s.slice(1) : s;
  const match = body.match(/^(\d+)([+-]\d+)$/);
  if (!match) return 0.0;
  const mantissa = parseFloat('0.' + match[1]);
  const exp = parseInt(match[2], 10);
  return sign * mantissa * Math.pow(10, exp);
}

/**
 * Convert TLE epoch (2-digit year + day of year with fraction) to Julian Date.
 * @param {number} epochYear2 - 00..99
 * @param {number} epochDays - 1.0 .. 366.99999999
 * @returns {number} Julian Date
 */
export function tleEpochToJD(epochYear2, epochDays) {
  const year = epochYear2 < 57 ? 2000 + epochYear2 : 1900 + epochYear2;
  const jan1Ms = Date.UTC(year, 0, 1, 0, 0, 0);
  const jan1JD = jan1Ms / 86400000.0 + 2440587.5;
  return jan1JD + (epochDays - 1.0);
}

/**
 * Parse a Two-Line Element set (`line1`, `line2`) and initialize SGP4 secular constants.
 * @param {string|object} nameOrObj - Satellite name or object `{ name, line1, line2, id, stdMag }`
 * @param {string} [line1]
 * @param {string} [line2]
 * @returns {object} Initialized `satrec`
 */
export function parseTLE(nameOrObj, line1, line2) {
  let name = 'SAT';
  let l1 = line1;
  let l2 = line2;
  let id = null;
  let stdMag = null;
  let category = 'satellite';

  if (typeof nameOrObj === 'object' && nameOrObj !== null) {
    if (nameOrObj.satrec) return nameOrObj.satrec;
    if (nameOrObj.a0dp !== undefined && nameOrObj.epochJD !== undefined) return nameOrObj;
    name = nameOrObj.name || nameOrObj.title || 'SAT';
    l1 = nameOrObj.line1 || nameOrObj.tle1;
    l2 = nameOrObj.line2 || nameOrObj.tle2;
    id = nameOrObj.id;
    stdMag = nameOrObj.stdMag;
    category = nameOrObj.category || 'satellite';
  } else if (typeof nameOrObj === 'string') {
    name = nameOrObj.trim();
  }

  if (!l1 || !l2) {
    throw new Error(`Invalid TLE for ${name}`);
  }

  const noradId = parseInt(l1.substring(2, 7).trim(), 10) || 0;
  const intlDesig = l1.substring(9, 17).trim();
  const epochYear2 = parseInt(l1.substring(18, 20).trim(), 10);
  const epochDays = parseFloat(l1.substring(20, 32).trim());
  const epochJD = tleEpochToJD(epochYear2, epochDays);

  const ndot = parseFloat(l1.substring(33, 43).trim()) || 0.0;
  const nddot = parseTLEExponential(l1.substring(44, 52));
  const bstar = parseTLEExponential(l1.substring(53, 61));

  const inclDeg = parseFloat(l2.substring(8, 16).trim());
  const raanDeg = parseFloat(l2.substring(17, 25).trim());
  const ecc = parseFloat('0.' + l2.substring(26, 33).trim());
  const argpDeg = parseFloat(l2.substring(34, 42).trim());
  const maDeg = parseFloat(l2.substring(43, 51).trim());
  const meanMotionRevPerDay = parseFloat(l2.substring(52, 63).trim());
  const revNum = parseInt(l2.substring(63, 68).trim(), 10) || 0;

  // Convert to SGP4 internal units (radians, radians/minute, Earth radii)
  const xincl = inclDeg * DEG2RAD;
  const xnodeo = raanDeg * DEG2RAD;
  const eo = clamp(ecc, 1e-6, 0.999);
  const omegao = argpDeg * DEG2RAD;
  const xmo = maDeg * DEG2RAD;
  const xno = (meanMotionRevPerDay * TWO_PI) / MIN_PER_DAY; // rad / min

  // Recover original mean motion (xnodp) and semi-major axis (aodp) from Kozai mean motion
  const a1 = Math.pow(XKE / xno, 2.0 / 3.0);
  const cosio = Math.cos(xincl);
  const theta2 = cosio * cosio;
  const x3thm1 = 3.0 * theta2 - 1.0;
  const eosq = eo * eo;
  const betao2 = 1.0 - eosq;
  const betao = Math.sqrt(betao2);
  const del1 = (1.5 * CK2 * x3thm1) / (a1 * a1 * betao * betao2);
  const ao = a1 * (1.0 - del1 * (1.0 / 3.0 + del1 * (1.0 + (134.0 / 81.0) * del1)));
  const delo = (1.5 * CK2 * x3thm1) / (ao * ao * betao * betao2);
  const xnodp = xno / (1.0 + delo);
  const aodp = ao / (1.0 - delo);

  // Secular rate coefficients due to J2 and J4
  const sinio = Math.sin(xincl);
  const pinvsq = 1.0 / (aodp * aodp * betao2 * betao2);
  const xi = 1.0 / (aodp - SO);
  const eta = aodp * eo * xi;
  const etasq = eta * eta;
  const eeta = eo * eta;
  const psisq = Math.abs(1.0 - etasq);
  const coef = QOMS2T * Math.pow(xi, 4);
  const coef1 = coef / Math.pow(psisq, 3.5);

  const c2 =
    coef1 *
    xnodp *
    (aodp * (1.0 + 1.5 * etasq + eeta * (4.0 + etasq)) +
      0.75 * CK2 * xi / psisq * x3thm1 * (8.0 + 3.0 * etasq * (8.0 + etasq)));
  const c1 = bstar * c2;
  const c4 =
    2.0 *
    xnodp *
    coef1 *
    aodp *
    betao2 *
    (eta * (2.0 + 0.5 * etasq) +
      eo * (0.5 + 2.0 * etasq) -
      (2.0 * CK2 * xi) /
        (aodp * psisq) *
        (-3.0 * x3thm1 * (1.0 - 2.0 * eeta + etasq * (1.5 - 0.5 * eeta)) +
          0.75 * (1.0 - theta2) * (2.0 * etasq - eeta * (1.0 + etasq)) * Math.cos(2.0 * omegao)));

  const temp1 = 3.0 * CK2 * pinvsq * xnodp;
  const temp2 = temp1 * CK2 * pinvsq;
  const temp3 = 1.25 * CK4 * pinvsq * pinvsq * xnodp;

  const xmdot =
    xnodp +
    0.5 * temp1 * betao * x3thm1 +
    0.0625 * temp2 * betao * (13.0 - 78.0 * theta2 + 137.0 * theta2 * theta2);
  const x1m5th = 1.0 - 5.0 * theta2;
  const omgdot =
    -0.5 * temp1 * x1m5th +
    0.0625 * temp2 * (7.0 - 114.0 * theta2 + 395.0 * theta2 * theta2) +
    temp3 * (3.0 - 36.0 * theta2 + 49.0 * theta2 * theta2);
  const xhdot1 = -temp1 * cosio;
  const xnodot =
    xhdot1 + (0.5 * temp2 * (4.0 - 19.0 * theta2) + 2.0 * temp3 * (3.0 - 7.0 * theta2)) * cosio;

  const xlcof = 0.125 * A3OVK2 * sinio * (3.0 + 5.0 * cosio) / (1.0 + cosio);
  const aycof = 0.25 * A3OVK2 * sinio;
  const x1mth2 = 1.0 - theta2;
  const x7thm1 = 7.0 * theta2 - 1.0;

  // Intrinsic visual magnitude at 1000 km range & 50% phase
  const defaultMag =
    stdMag !== null && stdMag !== undefined
      ? stdMag
      : noradId === 25544
        ? -1.8
        : noradId === 48274
          ? 0.0
          : noradId === 20580
            ? 2.2
            : 3.5;

  return {
    id: id || (noradId === 25544 ? 'iss' : `sat_${noradId}`),
    noradId,
    intlDesig,
    name,
    category,
    stdMag: defaultMag,
    line1: l1,
    line2: l2,
    epochJD,
    inclDeg,
    raanDeg,
    ecc: eo,
    argpDeg,
    maDeg,
    meanMotionRevPerDay,
    periodMinutes: MIN_PER_DAY / meanMotionRevPerDay,
    revNum,
    ndot,
    nddot,
    bstar,
    xincl,
    xnodeo,
    eo,
    omegao,
    xmo,
    xno,
    xnodp,
    aodp,
    cosio,
    sinio,
    theta2,
    x3thm1,
    x1mth2,
    x7thm1,
    c1,
    c4,
    xmdot,
    omgdot,
    xnodot,
    xlcof,
    aycof
  };
}

/**
 * Propagate an initialized satellite record (`satrec`) to Julian Date `jd` using SGP4.
 * Returns TEME (True Equator Mean Equinox) position (km) and velocity (km/s).
 * Gracefully clamps atmospheric drag decay over long multi-month/year intervals so
 * interactive simulation at arbitrary dates always yields a clean, non-singular orbit.
 * @param {object} satOrRec
 * @param {number} jd
 * @returns {{
 *   positionTEME: { x: number, y: number, z: number },
 *   velocityTEME: { vx: number, vy: number, vz: number },
 *   rKm: number,
 *   vKmS: number,
 *   tsinceMin: number
 * }}
 */
export function propagateSGP4(satOrRec, jd) {
  const sat = satOrRec.aodp !== undefined ? satOrRec : parseTLE(satOrRec);
  const tsince = (jd - sat.epochJD) * MIN_PER_DAY;

  // Clamp drag time to +/- 14 days so multi-year simulations still apply exact J2 nodal
  // regression and apsidal precession without non-physical B* polynomial divergence.
  const tDrag = clamp(tsince, -20160.0, 20160.0);

  // Update for secular gravity and atmospheric drag
  const xmdf = sat.xmo + sat.xmdot * tsince;
  const omgadf = sat.omegao + sat.omgdot * tsince;
  const xnoddf = sat.xnodeo + sat.xnodot * tsince;

  const tsq = tDrag * tDrag;
  const xnode = xnoddf + sat.xnodcf * tsq || xnoddf;
  const tempa = clamp(1.0 - sat.c1 * tDrag, 0.85, 1.15);
  const tempe = sat.bstar * sat.c4 * tDrag;
  const templ = sat.c1 * 1.5 * tsq;

  const xmp = xmdf + sat.xnodp * templ;
  const omega = omgadf;

  const a = sat.aodp * tempa * tempa;
  const e = clamp(sat.eo - tempe, 1e-6, 0.999);
  const xl = xmp + omega + xnode;

  const beta = Math.sqrt(1.0 - e * e);
  const xn = XKE / Math.pow(a, 1.5);

  // Long-period periodics
  const axn = e * Math.cos(omega);
  const temp = 1.0 / (a * beta * beta);
  const xll = temp * sat.xlcof * axn;
  const aynl = temp * sat.aycof;
  const xlt = xl + xll;
  const ayn = e * Math.sin(omega) + aynl;

  // Solve Kepler's equation for capu = (xlt - xnode) mod 2pi
  let capu = (xlt - xnode) % TWO_PI;
  if (capu < 0) capu += TWO_PI;

  let epw = capu;
  let sinepw = 0;
  let cosepw = 0;
  let ecose = 0;
  let esine = 0;

  for (let i = 0; i < 10; i++) {
    sinepw = Math.sin(epw);
    cosepw = Math.cos(epw);
    ecose = axn * cosepw + ayn * sinepw;
    esine = axn * sinepw - ayn * cosepw;
    const f = capu - epw + esine;
    if (Math.abs(f) < 1e-12) break;
    const fdot = 1.0 - ecose;
    let deltaEpw = f / fdot;
    if (Math.abs(deltaEpw) > 0.95) {
      deltaEpw = deltaEpw > 0 ? 0.95 : -0.95;
    }
    epw += deltaEpw;
  }

  // Short-period preliminary quantities
  const elsq = axn * axn + ayn * ayn;
  const temp1 = 1.0 - elsq;
  const pl = a * temp1;
  const r = a * (1.0 - ecose);
  const temp2 = a / r;
  const betal = Math.sqrt(temp1);
  const temp3 = 1.0 / (1.0 + betal);
  const cosu = temp2 * (cosepw - axn + ayn * esine * temp3);
  const sinu = temp2 * (sinepw - ayn - axn * esine * temp3);
  const u = Math.atan2(sinu, cosu);
  const sin2u = 2.0 * sinu * cosu;
  const cos2u = 2.0 * cosu * cosu - 1.0;

  const temp4 = 1.0 / pl;
  const temp5 = CK2 * temp4;
  const temp6 = temp5 * temp4;

  // Update for short-period periodics
  const rk = r * (1.0 - 1.5 * temp6 * betal * sat.x3thm1) + 0.5 * temp5 * sat.x1mth2 * cos2u;
  const uk = u - 0.25 * temp6 * sat.x7thm1 * sin2u;
  const xnodek = xnode + 1.5 * temp6 * sat.cosio * sin2u;
  const xinck = sat.xincl + 1.5 * temp6 * sat.cosio * sat.sinio * cos2u;

  const rdot = (XKE * Math.sqrt(a) * esine) / r;
  const rfdot = (XKE * Math.sqrt(pl)) / r;
  const rdotk = rdot - xn * temp5 * sat.x1mth2 * sin2u;
  const rfdotk = rfdot + xn * temp5 * (sat.x1mth2 * cos2u + 1.5 * sat.x3thm1);

  // Orientation vectors
  const sinuk = Math.sin(uk);
  const cosuk = Math.cos(uk);
  const sinik = Math.sin(xinck);
  const cosik = Math.cos(xinck);
  const sinnok = Math.sin(xnodek);
  const cosnok = Math.cos(xnodek);

  const xmx = -sinnok * cosik;
  const xmy = cosnok * cosik;

  const ux = xmx * sinuk + cosnok * cosuk;
  const uy = xmy * sinuk + sinnok * cosuk;
  const uz = sinik * sinuk;

  const vx = xmx * cosuk - cosnok * sinuk;
  const vy = xmy * cosuk - sinnok * sinuk;
  const vz = sinik * cosuk;

  // Position (km) and velocity (km/s) in TEME frame
  const x = rk * ux * XKMPER;
  const y = rk * uy * XKMPER;
  const z = rk * uz * XKMPER;

  const vScale = XKMPER / 60.0;
  const xdot = (rdotk * ux + rfdotk * vx) * vScale;
  const ydot = (rdotk * uy + rfdotk * vy) * vScale;
  const zdot = (rdotk * uz + rfdotk * vz) * vScale;

  const rKm = Math.sqrt(x * x + y * y + z * z);
  const vKmS = Math.sqrt(xdot * xdot + ydot * ydot + zdot * zdot);

  return {
    positionTEME: { x, y, z },
    velocityTEME: { vx: xdot, vy: ydot, vz: zdot },
    rKm,
    vKmS,
    tsinceMin: tsince
  };
}

/**
 * Compute full topocentric & geocentric state of a satellite at Julian Date `jd` for `observer`.
 * Includes sub-satellite point (lat, lon, heightKm), topocentric RA/Dec/Alt/Az, range,
 * cylindrical/umbric Earth shadow eclipse check (`isSunlit`, `isEclipsed`), and visual magnitude.
 * @param {object} satOrTLE
 * @param {number} jd
 * @param {{ lat?: number, lon?: number, elevationM?: number, lstDeg?: number }} [observer]
 * @param {object} [sunState] - Optional precomputed sun object from computeSun(jd)
 * @returns {object}
 */
export function computeSatellite(satOrTLE, jd, observer = null, sunState = null) {
  const sat = satOrTLE.aodp !== undefined ? satOrTLE : parseTLE(satOrTLE);
  const sgp = propagateSGP4(sat, jd);
  const { x, y, z } = sgp.positionTEME;
  const { vx, vy, vz } = sgp.velocityTEME;

  const gmstDeg = getGMST(jd);
  const gmstRad = degToRad(gmstDeg);
  const cosG = Math.cos(gmstRad);
  const sinG = Math.sin(gmstRad);

  // Rotate TEME -> ECEF for sub-satellite point (latitude, longitude, altitude)
  const xEcef = x * cosG + y * sinG;
  const yEcef = -x * sinG + y * cosG;
  const zEcef = z;

  const subLon = normalizeDegSigned(radToDeg(Math.atan2(yEcef, xEcef)));
  const rXY = Math.sqrt(xEcef * xEcef + yEcef * yEcef);
  const e2 = 2.0 * EARTH_FLATTENING - EARTH_FLATTENING * EARTH_FLATTENING;

  let subLatRad = Math.atan2(zEcef, rXY);
  let C_earth = 1.0;
  for (let i = 0; i < 4; i++) {
    const sinLat = Math.sin(subLatRad);
    C_earth = 1.0 / Math.sqrt(1.0 - e2 * sinLat * sinLat);
    subLatRad = Math.atan2(zEcef + EARTH_RADIUS_KM * C_earth * e2 * sinLat, rXY);
  }
  const subLat = radToDeg(subLatRad);
  const heightKm = rXY / Math.cos(subLatRad) - EARTH_RADIUS_KM * C_earth;

  // Observer ECI/TEME position vector
  let obsX = 0;
  let obsY = 0;
  let obsZ = 0;
  let latDeg = 0;
  let lonDeg = 0;
  let lstDeg = gmstDeg;

  if (observer && typeof observer.lat === 'number' && typeof observer.lon === 'number') {
    latDeg = observer.lat;
    lonDeg = observer.lon;
    const elevKm = (observer.elevationM || 0) / 1000.0;
    lstDeg = normalizeDeg(gmstDeg + lonDeg);
    const lstRad = degToRad(lstDeg);
    const latRad = degToRad(latDeg);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);

    const cObs = 1.0 / Math.sqrt(1.0 - e2 * sinLat * sinLat);
    const sObs = cObs * (1.0 - e2);
    const achcp = (EARTH_RADIUS_KM * cObs + elevKm) * cosLat;
    obsX = achcp * Math.cos(lstRad);
    obsY = achcp * Math.sin(lstRad);
    obsZ = (EARTH_RADIUS_KM * sObs + elevKm) * sinLat;
  }

  // Topocentric vector from observer to satellite in ECI/TEME
  const rx = x - obsX;
  const ry = y - obsY;
  const rz = z - obsZ;
  const rangeKm = Math.sqrt(rx * rx + ry * ry + rz * rz);

  // Topocentric RA and Dec
  const ra = normalizeDeg(radToDeg(Math.atan2(ry, rx)));
  const dec = radToDeg(Math.asin(clamp(rz / rangeKm, -1.0, 1.0)));

  let alt = 0;
  let az = 0;
  let ha = 0;
  if (observer && typeof observer.lat === 'number') {
    // Topocentric SEZ / Horizontal coordinates directly from ECI range vector
    const lstRad = degToRad(lstDeg);
    const latRad = degToRad(latDeg);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLst = Math.sin(lstRad);
    const cosLst = Math.cos(lstRad);

    const topS = sinLat * cosLst * rx + sinLat * sinLst * ry - cosLat * rz;
    const topE = -sinLst * rx + cosLst * ry;
    const topZ = cosLat * cosLst * rx + cosLat * sinLst * ry + sinLat * rz;

    const trueAlt = radToDeg(Math.asin(clamp(topZ / rangeKm, -1.0, 1.0)));
    alt = applyRefraction(trueAlt);
    az = normalizeDeg(radToDeg(Math.atan2(topE, -topS)));
    ha = normalizeDegSigned(lstDeg - ra);
  }

  // Sun vector in ECI for Earth shadow eclipse test and phase angle
  const sun = sunState || computeSun(jd, observer);
  const sunRaRad = degToRad(sun.ra);
  const sunDecRad = degToRad(sun.dec);
  const sunDistKm = (sun.distAU || 1.0) * AU_KM;
  const sx = Math.cos(sunDecRad) * Math.cos(sunRaRad);
  const sy = Math.cos(sunDecRad) * Math.sin(sunRaRad);
  const sz = Math.sin(sunDecRad);

  // Projection of satellite ECI position onto Sun unit vector
  const dotSatSun = x * sx + y * sy + z * sz;
  let isEclipsed = false;
  if (dotSatSun < 0) {
    // Satellite is on the anti-sunward side of Earth; check perpendicular distance to shadow axis
    const perpSq = Math.max(0.0, sgp.rKm * sgp.rKm - dotSatSun * dotSatSun);
    const perpKm = Math.sqrt(perpSq);
    // Umbral + atmospheric refraction shadow radius at LEO altitude (~6371 km)
    if (perpKm < EARTH_RADIUS_KM - 12.0) {
      isEclipsed = true;
    }
  }
  const isSunlit = !isEclipsed;

  // Phase angle between Sun -> Satellite and Observer -> Satellite
  const obsUnitX = rx / rangeKm;
  const obsUnitY = ry / rangeKm;
  const obsUnitZ = rz / rangeKm;
  const cosPhase = clamp(-(sx * obsUnitX + sy * obsUnitY + sz * obsUnitZ), -1.0, 1.0);
  const phaseAngleRad = Math.acos(cosPhase);
  const phaseFraction = 0.5 * (1.0 + Math.cos(phaseAngleRad));

  // Apparent magnitude (McCants / standard range & diffuse sphere phase model)
  const phaseTerm = -2.5 * Math.log10(Math.max(0.05, phaseFraction));
  const mag = isEclipsed
    ? 12.5
    : sat.stdMag + 5.0 * Math.log10(rangeKm / 1000.0) + phaseTerm * 0.6;

  const isVisible = isSunlit && alt > 0 && sun.alt < -6.0;

  return {
    id: sat.id,
    noradId: sat.noradId,
    name: sat.name,
    category: sat.category,
    ra,
    dec,
    alt,
    az,
    ha,
    rangeKm,
    heightKm,
    velocityKmS: sgp.vKmS,
    periodMinutes: sat.periodMinutes,
    inclDeg: sat.inclDeg,
    subLat,
    subLon,
    isSunlit,
    isEclipsed,
    isVisible,
    mag,
    sunAlt: sun.alt,
    positionTEME: sgp.positionTEME,
    velocityTEME: { vx, vy, vz }
  };
}

/**
 * Compute all satellites in a catalog at Julian Date `jd`.
 * @param {Array<object>} [satellitesData=DEFAULT_SATELLITES]
 * @param {number} jd
 * @param {object} observer
 * @param {object} [sunState]
 * @returns {Array<object>}
 */
export function computeAllSatellites(
  satellitesData = DEFAULT_SATELLITES,
  jd,
  observer = null,
  sunState = null
) {
  const list =
    Array.isArray(satellitesData) && satellitesData.length > 0
      ? satellitesData
      : DEFAULT_SATELLITES;
  const sun = sunState || computeSun(jd, observer);
  return list.map((sat) => computeSatellite(sat, jd, observer, sun));
}

/**
 * Compute a continuous orbital track of `{ jd, ra, dec, alt, az, subLat, subLon, isSunlit }`
 * centered on or starting at `jd`.
 * @param {object} satOrTLE
 * @param {number} jd
 * @param {object} observer
 * @param {number} [durationMinutes=95]
 * @param {number} [stepMinutes=1]
 * @param {boolean} [centered=true]
 * @returns {Array<object>}
 */
export function computeSatelliteOrbitTrack(
  satOrTLE,
  jd,
  observer,
  durationMinutes = 95,
  stepMinutes = 1,
  centered = true
) {
  const sat = satOrTLE.aodp !== undefined ? satOrTLE : parseTLE(satOrTLE);
  const startOffset = centered ? -durationMinutes * 0.5 : 0;
  const points = [];
  for (let m = startOffset; m <= startOffset + durationMinutes; m += stepMinutes) {
    const tJD = jd + m / MIN_PER_DAY;
    const state = computeSatellite(sat, tJD, observer);
    points.push({
      jd: tJD,
      ra: state.ra,
      dec: state.dec,
      alt: state.alt,
      az: state.az,
      subLat: state.subLat,
      subLon: state.subLon,
      isSunlit: state.isSunlit,
      sunlit: state.isSunlit
    });
  }
  return points;
}

/**
 * Predict all passes of a satellite over an observer for the next `days` (default 4 days).
 * Respects custom horizon profiles `horizonProfileFn(azDeg)` if provided!
 * Classifies each pass with `tag`:
 * - `'visible'`: Satellite is sunlit AND observer's Sun altitude < -6° (civil dusk/dawn or night) at some point during the pass
 * - `'daylight'`: Observer's Sun altitude >= -6° at max elevation
 * - `'eclipsed'`: Satellite remains in Earth's shadow throughout the night pass
 *
 * Returns full `trajectory` array of `{ jd, ra, dec, alt, az, sunlit }` for drawing the pass arc on the sky map.
 *
 * @param {object} satOrTLE - Satellite object or TLE record
 * @param {{ lat: number, lon: number, elevationM?: number }} observer - Observer location
 * @param {number} startJD - Starting Julian Date
 * @param {number} [days=4] - Number of days to scan (default 4)
 * @param {function(number): number} [horizonProfileFn=null] - Optional custom horizon elevation function(azDeg) -> minAltDeg
 * @param {number} [minMaxAlt=10] - Minimum peak altitude in degrees for a pass to be included
 * @returns {Array<object>}
 */
export function predictSatellitePasses(
  satOrTLE,
  observer,
  startJD,
  days = 4,
  horizonProfileFn = null,
  minMaxAlt = 10
) {
  const sat = satOrTLE.aodp !== undefined ? satOrTLE : parseTLE(satOrTLE);
  const endJD = startJD + days;
  // Coarse step = 60 seconds (1 minute)
  const coarseStepDays = 1.0 / MIN_PER_DAY;
  const fineStepDays = 10.0 / 86400.0; // 10-second resolution for trajectory and event refinement

  function getHorizonAtAz(azDeg) {
    if (typeof horizonProfileFn === 'function') {
      return Math.max(0.0, horizonProfileFn(azDeg));
    }
    return 0.0;
  }

  function evalSat(tJD) {
    const st = computeSatellite(sat, tJD, observer);
    const hFloor = getHorizonAtAz(st.az);
    return { ...st, effAlt: st.alt - hFloor, hFloor };
  }

  const passes = [];
  let inPass = false;
  let passStartGuess = startJD;

  let prevT = startJD;
  let prevState = evalSat(prevT);
  if (prevState.effAlt > 0) {
    inPass = true;
    passStartGuess = startJD;
  }

  for (let t = startJD + coarseStepDays; t <= endJD; t += coarseStepDays) {
    const curState = evalSat(t);
    if (!inPass && curState.effAlt > 0 && prevState.effAlt <= 0) {
      inPass = true;
      passStartGuess = prevT;
    } else if (inPass && curState.effAlt <= 0 && prevState.effAlt > 0) {
      inPass = false;
      const passEndGuess = t;
      const passObj = buildDetailedPass(passStartGuess, passEndGuess);
      if (passObj && passObj.maxAlt >= minMaxAlt) {
        passes.push(passObj);
      }
    }
    prevT = t;
    prevState = curState;
  }

  function refineHorizonCrossing(t1, t2) {
    let a = t1;
    let b = t2;
    let fa = evalSat(a).effAlt;
    for (let iter = 0; iter < 8; iter++) {
      const mid = 0.5 * (a + b);
      const fmid = evalSat(mid).effAlt;
      if ((fa <= 0 && fmid <= 0) || (fa > 0 && fmid > 0)) {
        a = mid;
        fa = fmid;
      } else {
        b = mid;
      }
    }
    return 0.5 * (a + b);
  }

  function buildDetailedPass(tRiseApprox, tSetApprox) {
    const startJDExact = refineHorizonCrossing(tRiseApprox, tRiseApprox + coarseStepDays);
    const endJDExact = refineHorizonCrossing(tSetApprox - coarseStepDays, tSetApprox);
    if (endJDExact <= startJDExact) return null;

    const trajectory = [];
    let maxAlt = -90.0;
    let maxJD = 0.5 * (startJDExact + endJDExact);
    let maxState = null;
    let minMag = 99.0;
    let hasVisibleSegment = false;
    let hasSunlitSegment = false;

    const numSteps = Math.max(8, Math.ceil((endJDExact - startJDExact) / fineStepDays));
    for (let k = 0; k <= numSteps; k++) {
      const tk = startJDExact + (k / numSteps) * (endJDExact - startJDExact);
      const st = evalSat(tk);
      if (st.alt > maxAlt) {
        maxAlt = st.alt;
        maxJD = tk;
        maxState = st;
      }
      if (st.isSunlit) {
        hasSunlitSegment = true;
        if (st.mag < minMag) minMag = st.mag;
        if (st.sunAlt < -6.0) {
          hasVisibleSegment = true;
        }
      }
      trajectory.push({
        jd: tk,
        ra: st.ra,
        dec: st.dec,
        alt: st.alt,
        az: st.az,
        rangeKm: st.rangeKm,
        sunlit: st.isSunlit,
        isSunlit: st.isSunlit,
        mag: st.mag
      });
    }

    // Golden-section / parabolic refinement around maxJD for exact culmination
    let left = Math.max(startJDExact, maxJD - fineStepDays);
    let right = Math.min(endJDExact, maxJD + fineStepDays);
    for (let iter = 0; iter < 6; iter++) {
      const m1 = left + (right - left) / 3.0;
      const m2 = right - (right - left) / 3.0;
      if (evalSat(m1).alt < evalSat(m2).alt) {
        left = m1;
      } else {
        right = m2;
      }
    }
    maxJD = 0.5 * (left + right);
    maxState = evalSat(maxJD);
    maxAlt = maxState.alt;

    const startState = trajectory[0];
    const endState = trajectory[trajectory.length - 1];

    // Tag determination: 'visible' | 'daylight' | 'eclipsed'
    let tag = 'eclipsed';
    if (hasVisibleSegment) {
      tag = 'visible';
    } else if (maxState.sunAlt >= -6.0) {
      tag = 'daylight';
    } else if (hasSunlitSegment) {
      tag = 'visible';
    } else {
      tag = 'eclipsed';
    }

    return {
      satId: sat.id,
      noradId: sat.noradId,
      satName: sat.name,
      startJD: startJDExact,
      maxJD,
      endJD: endJDExact,
      durationSec: Math.round((endJDExact - startJDExact) * 86400.0),
      startAz: startState.az,
      startAlt: startState.alt,
      maxAlt,
      maxAz: maxState.az,
      maxRa: maxState.ra,
      maxDec: maxState.dec,
      endAz: endState.az,
      endAlt: endState.alt,
      mag: minMag < 50 ? minMag : maxState.mag,
      isSunlitAtMax: maxState.isSunlit,
      sunAltAtMax: maxState.sunAlt,
      tag,
      trajectory
    };
  }

  return passes;
}

/**
 * Parse raw multi-line 3LE / TLE text into an array of satellite objects.
 * @param {string} rawText
 * @returns {Array<object>}
 */
export function parseTLEText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && i + 1 < lines.length && lines[i + 1].startsWith('2 ')) {
      const name = i > 0 && !lines[i - 1].startsWith('1 ') && !lines[i - 1].startsWith('2 ')
        ? lines[i - 1]
        : `SAT ${lines[i].substring(2, 7).trim()}`;
      try {
        results.push(parseTLE(name, lines[i], lines[i + 1]));
      } catch {
        // Ignore malformed entry
      }
      i += 1;
    }
  }
  return results;
}

/**
 * Fetch live TLEs from CelesTrak (defaulting to bright stations / visual satellites)
 * and return parsed satellite records. Falls back to `DEFAULT_SATELLITES` if offline.
 * @param {string} [group='stations'] - CelesTrak group name ('stations', 'visual', 'active') or full URL
 * @returns {Promise<Array<object>>}
 */
export async function fetchCelestrakTLEs(group = 'stations') {
  const url = group.startsWith('http')
    ? group
    : `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;

  try {
    const response = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    const parsed = parseTLEText(text);
    if (parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fallback to built-in catalog when offline or blocked
  }
  return DEFAULT_SATELLITES.map((s) => parseTLE(s));
}
