/**
 * @fileoverview Core astronomical time, coordinate transformations, precession,
 * nutation, atmospheric refraction, airmass, solar longitude, and timezone utilities.
 * Reference: Jean Meeus, "Astronomical Algorithms" (2nd Edition).
 */

export const DEG2RAD = Math.PI / 180.0;
export const RAD2DEG = 180.0 / Math.PI;
export const J2000 = 2451545.0;
export const AU_KM = 149597870.7;
export const EARTH_RADIUS_KM = 6378.137;
export const EARTH_FLATTENING = 1.0 / 298.257223563;
export const SPEED_OF_LIGHT_AUDAY = 173.1446326846693; // AU per day

/**
 * Convert degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
export function degToRad(deg) {
  return deg * DEG2RAD;
}

/**
 * Convert radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
export function radToDeg(rad) {
  return rad * RAD2DEG;
}

/**
 * Normalize an angle in degrees to [0, 360).
 * @param {number} deg
 * @returns {number}
 */
export function normalizeDeg(deg) {
  let d = deg % 360.0;
  if (d < 0) d += 360.0;
  return d === 360.0 ? 0.0 : d;
}

/**
 * Normalize an angle in degrees to [-180, 180).
 * @param {number} deg
 * @returns {number}
 */
export function normalizeDegSigned(deg) {
  let d = normalizeDeg(deg);
  if (d >= 180.0) d -= 360.0;
  return d;
}

/**
 * Normalize hours to [0, 24).
 * @param {number} hours
 * @returns {number}
 */
export function normalizeHours(hours) {
  let h = hours % 24.0;
  if (h < 0) h += 24.0;
  return h === 24.0 ? 0.0 : h;
}

/**
 * Clamp value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Convert a JavaScript Date (or timestamp in ms) to Julian Date (UTC).
 * @param {Date|number} date
 * @returns {number} Julian Date
 */
export function dateToJD(date = new Date()) {
  const ms = typeof date === 'number' ? date : date.getTime();
  return ms / 86400000.0 + 2440587.5;
}

/**
 * Convert Julian Date (UTC) to a JavaScript Date object.
 * @param {number} jd
 * @returns {Date}
 */
export function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000.0);
}

/**
 * Compute Julian centuries since J2000.0 (2000 Jan 1 12:00 TT/UTC).
 * @param {number} jd
 * @returns {number} T in Julian centuries
 */
export function getJ2000Centuries(jd) {
  return (jd - J2000) / 36525.0;
}

/**
 * Estimate Delta T = TT - UT1 in seconds using Espenak & Meeus polynomial approximations.
 * Accurate across historical, modern, and 21st-century epochs.
 * @param {number} jd
 * @returns {number} Delta T in seconds
 */
export function getDeltaT(jd) {
  const year = 2000.0 + (jd - J2000) / 365.2425;
  if (year >= 2005 && year <= 2050) {
    const t = year - 2000.0;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  } else if (year >= 1986 && year < 2005) {
    const t = year - 2000.0;
    return (
      63.86 +
      0.3345 * t -
      0.060374 * t * t +
      0.0017275 * t * t * t +
      0.000651814 * t * t * t * t +
      0.00002373599 * Math.pow(t, 5)
    );
  } else if (year >= 1900 && year < 1986) {
    const t = (year - 1900.0) / 100.0;
    return -20.0 + 32.0 * Math.pow((year - 1820.0) / 100.0, 2) + 0.5 * t;
  } else {
    const u = (year - 1820.0) / 100.0;
    return -20.0 + 32.0 * u * u;
  }
}

/**
 * Compute Julian Ephemeris Day (JDE / Terrestrial Time TT).
 * @param {number} jd
 * @returns {number} JDE
 */
export function getJDE(jd) {
  return jd + getDeltaT(jd) / 86400.0;
}

/**
 * Compute Nutation in longitude (Delta Psi) and obliquity (Delta Epsilon),
 * plus mean and true obliquity of the ecliptic (Meeus Ch. 22).
 * @param {number} jd
 * @returns {{ dPsiDeg: number, dEpsDeg: number, meanEpsDeg: number, trueEpsDeg: number }}
 */
export function getNutation(jd) {
  const T = getJ2000Centuries(getJDE(jd));
  const T2 = T * T;
  const T3 = T2 * T;

  // Mean elongation of the Moon from the Sun (D)
  const D = degToRad(normalizeDeg(297.85036 + 445267.11148 * T - 0.0019142 * T2 + T3 / 189474.0));
  // Mean anomaly of the Sun (M)
  const M = degToRad(normalizeDeg(357.52772 + 35999.05034 * T - 0.0001603 * T2 - T3 / 300000.0));
  // Mean anomaly of the Moon (M')
  const Mp = degToRad(normalizeDeg(134.96298 + 477198.867398 * T + 0.0086972 * T2 + T3 / 56250.0));
  // Moon's argument of latitude (F)
  const F = degToRad(normalizeDeg(93.27191 + 483202.017538 * T - 0.0036825 * T2 + T3 / 327270.0));
  // Longitude of ascending node of Moon's mean orbit (Omega)
  const Om = degToRad(normalizeDeg(125.04452 - 1934.136261 * T + 0.0020708 * T2 + T3 / 450000.0));

  // Leading periodic terms for nutation (in arcseconds)
  const dPsiArcsec =
    (-17.1996 - 0.01742 * T) * Math.sin(Om) +
    (-1.3187 - 0.00016 * T) * Math.sin(-2 * D + 2 * F + 2 * Om) +
    -0.2274 * Math.sin(2 * F + 2 * Om) +
    0.2062 * Math.sin(2 * Om) +
    0.1426 * Math.sin(M) +
    0.0712 * Math.sin(Mp) +
    -0.0517 * Math.sin(-2 * D + M + 2 * F + 2 * Om) +
    -0.0386 * Math.sin(2 * F + Om) +
    -0.0301 * Math.sin(Mp + 2 * F + 2 * Om) +
    0.0217 * Math.sin(-2 * D - M + 2 * F + 2 * Om) +
    -0.0158 * Math.sin(-2 * D + Mp) +
    0.0129 * Math.sin(-2 * D + 2 * F + Om) +
    0.0123 * Math.sin(-Mp + 2 * F + 2 * Om);

  const dEpsArcsec =
    (9.2025 + 0.00089 * T) * Math.cos(Om) +
    (0.5736 - 0.00031 * T) * Math.cos(-2 * D + 2 * F + 2 * Om) +
    0.0977 * Math.cos(2 * F + 2 * Om) +
    -0.0895 * Math.cos(2 * Om) +
    0.0054 * Math.cos(M) +
    -0.0007 * Math.cos(Mp) +
    0.0224 * Math.cos(-2 * D + M + 2 * F + 2 * Om) +
    0.02 * Math.cos(2 * F + Om) +
    0.0129 * Math.cos(Mp + 2 * F + 2 * Om) +
    -0.0095 * Math.cos(-2 * D - M + 2 * F + 2 * Om);

  // Mean obliquity (Laskar / Meeus 22.3)
  const U = T / 100.0;
  const meanEpsArcsec =
    84381.448 -
    4680.93 * U -
    1.55 * Math.pow(U, 2) +
    1999.25 * Math.pow(U, 3) -
    51.38 * Math.pow(U, 4) -
    249.67 * Math.pow(U, 5) -
    39.05 * Math.pow(U, 6) +
    7.12 * Math.pow(U, 7) +
    27.87 * Math.pow(U, 8) +
    5.79 * Math.pow(U, 9) +
    2.45 * Math.pow(U, 10);

  const meanEpsDeg = meanEpsArcsec / 3600.0;
  const dPsiDeg = dPsiArcsec / 3600.0;
  const dEpsDeg = dEpsArcsec / 3600.0;
  const trueEpsDeg = meanEpsDeg + dEpsDeg;

  return { dPsiDeg, dEpsDeg, meanEpsDeg, trueEpsDeg };
}

/**
 * Compute the true obliquity of the ecliptic (epsilon) in degrees.
 * @param {number} jd
 * @returns {number} Obliquity in degrees
 */
export function getObliquity(jd = J2000) {
  return getNutation(jd).trueEpsDeg;
}

/**
 * Compute Greenwich Mean Sidereal Time (GMST) in degrees [0, 360).
 * Reference: Meeus Eq. 12.4.
 * @param {number} jd
 * @returns {number} GMST in degrees
 */
export function getGMST(jd) {
  const T = (jd - J2000) / 36525.0;
  const gmstDeg =
    280.46061837 +
    360.98564736629 * (jd - J2000) +
    0.000387933 * T * T -
    (T * T * T) / 38710000.0;
  return normalizeDeg(gmstDeg);
}

/**
 * Compute Greenwich Mean Sidereal Time in hours [0, 24).
 * @param {number} jd
 * @returns {number}
 */
export function getGMSTHours(jd) {
  return getGMST(jd) / 15.0;
}

/**
 * Compute Greenwich Apparent Sidereal Time (GAST) in degrees [0, 360).
 * Includes the equation of the equinoxes.
 * @param {number} jd
 * @returns {number} GAST in degrees
 */
export function getGAST(jd) {
  const gmst = getGMST(jd);
  const { dPsiDeg, trueEpsDeg } = getNutation(jd);
  const eqEq = dPsiDeg * Math.cos(degToRad(trueEpsDeg));
  return normalizeDeg(gmst + eqEq);
}

/**
 * Compute Local Sidereal Time (LST) in degrees [0, 360).
 * @param {number} jd - Julian Date (UTC)
 * @param {number} lonDeg - Observer longitude in degrees (East positive)
 * @param {boolean} [apparent=true] - Include nutation (equation of equinoxes)
 * @returns {number} LST in degrees [0, 360)
 */
export function getLST(jd, lonDeg, apparent = true) {
  const gst = apparent ? getGAST(jd) : getGMST(jd);
  return normalizeDeg(gst + lonDeg);
}

/**
 * Compute Local Sidereal Time (LST) in hours [0, 24).
 * @param {number} jd
 * @param {number} lonDeg
 * @returns {number} LST in hours [0, 24)
 */
export function getLSTHours(jd, lonDeg) {
  return getLST(jd, lonDeg) / 15.0;
}

/**
 * Rigorous trigonometric precession of equatorial coordinates from J2000.0 to mean equinox of date.
 * Reference: Meeus Ch. 21 (Eq. 21.3 - 21.4).
 * @param {number} raDeg - J2000 Right Ascension in degrees
 * @param {number} decDeg - J2000 Declination in degrees
 * @param {number} jd - Target Julian Date
 * @returns {{ ra: number, dec: number }} Precessed coordinates in degrees
 */
export function precessJ2000ToDate(raDeg, decDeg, jd) {
  const T = getJ2000Centuries(jd);
  if (Math.abs(T) < 1e-8) {
    return { ra: normalizeDeg(raDeg), dec: decDeg };
  }
  const T2 = T * T;
  const T3 = T2 * T;

  // Precession angles in arcseconds -> radians
  const zeta = degToRad((2306.2181 * T + 0.30188 * T2 + 0.017998 * T3) / 3600.0);
  const z = degToRad((2306.2181 * T + 1.09468 * T2 + 0.018203 * T3) / 3600.0);
  const theta = degToRad((2004.3109 * T - 0.42665 * T2 - 0.041833 * T3) / 3600.0);

  const alpha0 = degToRad(raDeg);
  const delta0 = degToRad(decDeg);

  const cosDelta0 = Math.cos(delta0);
  const sinDelta0 = Math.sin(delta0);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosAlphaZeta = Math.cos(alpha0 + zeta);

  const A = cosDelta0 * Math.sin(alpha0 + zeta);
  const B = cosTheta * cosDelta0 * cosAlphaZeta - sinTheta * sinDelta0;
  const C = sinTheta * cosDelta0 * cosAlphaZeta + cosTheta * sinDelta0;

  const ra = normalizeDeg(radToDeg(Math.atan2(A, B) + z));
  const dec = radToDeg(Math.asin(clamp(C, -1.0, 1.0)));

  return { ra, dec };
}

/**
 * Precess equatorial coordinates from mean equinox of date back to J2000.0.
 * @param {number} raDeg - Of-date Right Ascension in degrees
 * @param {number} decDeg - Of-date Declination in degrees
 * @param {number} jd - Source Julian Date
 * @returns {{ ra: number, dec: number }} J2000 coordinates in degrees
 */
export function precessDateToJ2000(raDeg, decDeg, jd) {
  const T = getJ2000Centuries(jd);
  if (Math.abs(T) < 1e-8) {
    return { ra: normalizeDeg(raDeg), dec: decDeg };
  }
  const T2 = T * T;
  const T3 = T2 * T;

  // Inverse precession swaps -z and -zeta and negates theta
  const zeta = -degToRad((2306.2181 * T + 1.09468 * T2 + 0.018203 * T3) / 3600.0);
  const z = -degToRad((2306.2181 * T + 0.30188 * T2 + 0.017998 * T3) / 3600.0);
  const theta = -degToRad((2004.3109 * T - 0.42665 * T2 - 0.041833 * T3) / 3600.0);

  const alpha = degToRad(raDeg);
  const delta = degToRad(decDeg);

  const cosDelta = Math.cos(delta);
  const sinDelta = Math.sin(delta);
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const cosAlphaZeta = Math.cos(alpha + zeta);

  const A = cosDelta * Math.sin(alpha + zeta);
  const B = cosTheta * cosDelta * cosAlphaZeta - sinTheta * sinDelta;
  const C = sinTheta * cosDelta * cosAlphaZeta + cosTheta * sinDelta;

  const ra = normalizeDeg(radToDeg(Math.atan2(A, B) + z));
  const dec = radToDeg(Math.asin(clamp(C, -1.0, 1.0)));

  return { ra, dec };
}

/**
 * Convert Equatorial coordinates (RA, Dec) to Horizontal coordinates (Alt, Az, HA).
 * Azimuth convention: North = 0°, East = 90°, South = 180°, West = 270°.
 * @param {number} raDeg - Right Ascension in degrees
 * @param {number} decDeg - Declination in degrees
 * @param {number} lstDeg - Local Sidereal Time in degrees
 * @param {number} latDeg - Observer Latitude in degrees (North positive)
 * @returns {{ alt: number, az: number, ha: number }}
 */
export function equatorialToHorizontal(raDeg, decDeg, lstDeg, latDeg) {
  const haDeg = normalizeDegSigned(lstDeg - raDeg);
  const H = degToRad(haDeg);
  const dec = degToRad(decDeg);
  const lat = degToRad(latDeg);

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);
  const cosH = Math.cos(H);
  const sinH = Math.sin(H);

  const sinAlt = sinLat * sinDec + cosLat * cosDec * cosH;
  const alt = radToDeg(Math.asin(clamp(sinAlt, -1.0, 1.0)));

  // North = 0°, East = 90°:
  // sin(Az) * cos(Alt) = -cos(Dec) * sin(H)
  // cos(Az) * cos(Alt) = sin(Dec) * cos(Lat) - cos(Dec) * cos(H) * sin(Lat)
  const y = -cosDec * sinH;
  const x = sinDec * cosLat - cosDec * cosH * sinLat;
  const az = normalizeDeg(radToDeg(Math.atan2(y, x)));

  return { alt, az, ha: haDeg };
}

/**
 * Convert Horizontal coordinates (Alt, Az) to Equatorial coordinates (RA, Dec, HA).
 * Azimuth convention: North = 0°, East = 90°, South = 180°, West = 270°.
 * @param {number} altDeg - Altitude in degrees
 * @param {number} azDeg - Azimuth in degrees (North=0°, East=90°)
 * @param {number} lstDeg - Local Sidereal Time in degrees
 * @param {number} latDeg - Observer Latitude in degrees
 * @returns {{ ra: number, dec: number, ha: number }}
 */
export function horizontalToEquatorial(altDeg, azDeg, lstDeg, latDeg) {
  const alt = degToRad(altDeg);
  const az = degToRad(azDeg);
  const lat = degToRad(latDeg);

  const sinAlt = Math.sin(alt);
  const cosAlt = Math.cos(alt);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinAz = Math.sin(az);
  const cosAz = Math.cos(az);

  const sinDec = sinAlt * sinLat + cosAlt * cosLat * cosAz;
  const dec = radToDeg(Math.asin(clamp(sinDec, -1.0, 1.0)));

  const y = -sinAz * cosAlt;
  const x = cosLat * sinAlt - sinLat * cosAlt * cosAz;
  const ha = normalizeDegSigned(radToDeg(Math.atan2(y, x)));
  const ra = normalizeDeg(lstDeg - ha);

  return { ra, dec, ha };
}

/**
 * Convert Equatorial coordinates (RA, Dec) to Ecliptic coordinates (Lon, Lat).
 * @param {number} raDeg - Right Ascension in degrees
 * @param {number} decDeg - Declination in degrees
 * @param {number} [epsDeg=23.4392911] - Obliquity of the ecliptic in degrees
 * @returns {{ lon: number, lat: number }}
 */
export function equatorialToEcliptic(raDeg, decDeg, epsDeg = 23.43929111) {
  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);
  const eps = degToRad(epsDeg);

  const sinRa = Math.sin(ra);
  const cosRa = Math.cos(ra);
  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);
  const sinEps = Math.sin(eps);
  const cosEps = Math.cos(eps);

  const lon = normalizeDeg(radToDeg(Math.atan2(sinRa * cosEps + Math.tan(dec) * sinEps, cosRa)));
  const sinLat = sinDec * cosEps - cosDec * sinEps * sinRa;
  const lat = radToDeg(Math.asin(clamp(sinLat, -1.0, 1.0)));

  return { lon, lat };
}

/**
 * Convert Ecliptic coordinates (Lon, Lat) to Equatorial coordinates (RA, Dec).
 * @param {number} lonDeg - Ecliptic longitude in degrees
 * @param {number} latDeg - Ecliptic latitude in degrees
 * @param {number} [epsDeg=23.4392911] - Obliquity of the ecliptic in degrees
 * @returns {{ ra: number, dec: number }}
 */
export function eclipticToEquatorial(lonDeg, latDeg, epsDeg = 23.43929111) {
  const lon = degToRad(lonDeg);
  const lat = degToRad(latDeg);
  const eps = degToRad(epsDeg);

  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinEps = Math.sin(eps);
  const cosEps = Math.cos(eps);

  const ra = normalizeDeg(
    radToDeg(Math.atan2(sinLon * cosEps - Math.tan(lat) * sinEps, cosLon))
  );
  const sinDec = sinLat * cosEps + cosLat * sinEps * sinLon;
  const dec = radToDeg(Math.asin(clamp(sinDec, -1.0, 1.0)));

  return { ra, dec };
}

// J2000 Galactic pole constants (Hipparcos / IAU)
const GAL_RA_NGP = 192.85948 * DEG2RAD;
const GAL_DEC_NGP = 27.12825 * DEG2RAD;
const GAL_L_NCP = 122.93192 * DEG2RAD;
const SIN_DEC_NGP = Math.sin(GAL_DEC_NGP);
const COS_DEC_NGP = Math.cos(GAL_DEC_NGP);

/**
 * Convert J2000 Equatorial coordinates (RA, Dec) to Galactic coordinates (l, b).
 * Used for Milky Way equirectangular texture lookup and galactic plane rendering.
 * @param {number} raDeg - J2000 Right Ascension in degrees
 * @param {number} decDeg - J2000 Declination in degrees
 * @returns {{ l: number, b: number }} Galactic longitude l [0, 360) and latitude b [-90, 90] in degrees
 */
export function equatorialToGalactic(raDeg, decDeg) {
  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);

  const sinDec = Math.sin(dec);
  const cosDec = Math.cos(dec);
  const dRa = ra - GAL_RA_NGP;
  const sinDRa = Math.sin(dRa);
  const cosDRa = Math.cos(dRa);

  const sinB = sinDec * SIN_DEC_NGP + cosDec * COS_DEC_NGP * cosDRa;
  const b = radToDeg(Math.asin(clamp(sinB, -1.0, 1.0)));

  const y = cosDec * sinDRa;
  const x = sinDec * COS_DEC_NGP - cosDec * SIN_DEC_NGP * cosDRa;
  const l = normalizeDeg(radToDeg(GAL_L_NCP - Math.atan2(y, x)));

  return { l, b };
}

/**
 * Convert Galactic coordinates (l, b) to J2000 Equatorial coordinates (RA, Dec).
 * @param {number} lDeg - Galactic longitude in degrees
 * @param {number} bDeg - Galactic latitude in degrees
 * @returns {{ ra: number, dec: number }} J2000 Right Ascension and Declination in degrees
 */
export function galacticToEquatorial(lDeg, bDeg) {
  const l = degToRad(lDeg);
  const b = degToRad(bDeg);

  const sinB = Math.sin(b);
  const cosB = Math.cos(b);
  const dL = GAL_L_NCP - l;
  const sinDL = Math.sin(dL);
  const cosDL = Math.cos(dL);

  const sinDec = sinB * SIN_DEC_NGP + cosB * COS_DEC_NGP * cosDL;
  const dec = radToDeg(Math.asin(clamp(sinDec, -1.0, 1.0)));

  const y = cosB * sinDL;
  const x = sinB * COS_DEC_NGP - cosB * SIN_DEC_NGP * cosDL;
  const ra = normalizeDeg(radToDeg(Math.atan2(y, x) + GAL_RA_NGP));

  return { ra, dec };
}

/**
 * Compute exact angular separation between two sky positions in degrees.
 * Uses the Vincenty spherical formula for numerical accuracy down to milli-arcseconds.
 * @param {number} ra1Deg
 * @param {number} dec1Deg
 * @param {number} ra2Deg
 * @param {number} dec2Deg
 * @returns {number} Angular separation in degrees
 */
export function angularSeparation(ra1Deg, dec1Deg, ra2Deg, dec2Deg) {
  const phi1 = degToRad(dec1Deg);
  const phi2 = degToRad(dec2Deg);
  const dLam = degToRad(ra2Deg - ra1Deg);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const sinPhi2 = Math.sin(phi2);
  const cosPhi2 = Math.cos(phi2);
  const sinDLam = Math.sin(dLam);
  const cosDLam = Math.cos(dLam);

  const a = cosPhi2 * sinDLam;
  const b = cosPhi1 * sinPhi2 - sinPhi1 * cosPhi2 * cosDLam;
  const num = Math.sqrt(a * a + b * b);
  const den = sinPhi1 * sinPhi2 + cosPhi1 * cosPhi2 * cosDLam;

  return radToDeg(Math.atan2(num, den));
}

/**
 * Compute position angle from point 1 to point 2 in degrees (North=0°, East=90°).
 * @param {number} ra1Deg
 * @param {number} dec1Deg
 * @param {number} ra2Deg
 * @param {number} dec2Deg
 * @returns {number} Position angle in degrees [0, 360)
 */
export function positionAngle(ra1Deg, dec1Deg, ra2Deg, dec2Deg) {
  const dRa = degToRad(ra2Deg - ra1Deg);
  const dec1 = degToRad(dec1Deg);
  const dec2 = degToRad(dec2Deg);

  const y = Math.sin(dRa);
  const x = Math.cos(dec1) * Math.tan(dec2) - Math.sin(dec1) * Math.cos(dRa);
  return normalizeDeg(radToDeg(Math.atan2(y, x)));
}

/**
 * Compute the parallactic angle q (angle between celestial north and zenith) in degrees.
 * @param {number} haDeg - Local Hour Angle in degrees
 * @param {number} decDeg - Declination in degrees
 * @param {number} latDeg - Observer latitude in degrees
 * @returns {number} Parallactic angle in degrees
 */
export function getParallacticAngle(haDeg, decDeg, latDeg) {
  const H = degToRad(haDeg);
  const dec = degToRad(decDeg);
  const lat = degToRad(latDeg);
  const y = Math.sin(H);
  const x = Math.tan(lat) * Math.cos(dec) - Math.sin(dec) * Math.cos(H);
  return radToDeg(Math.atan2(y, x));
}

/**
 * Compute atmospheric refraction R in degrees from true altitude (Saemundsson formula, Meeus Eq. 16.4).
 * @param {number} trueAltDeg - True airless altitude in degrees
 * @param {number} [pressureMb=1010] - Atmospheric pressure in millibars / hPa
 * @param {number} [tempC=10] - Temperature in Celsius
 * @returns {number} Refraction in degrees (>= 0)
 */
export function getRefraction(trueAltDeg, pressureMb = 1010, tempC = 10) {
  if (trueAltDeg < -2.0 || trueAltDeg >= 89.9) {
    if (trueAltDeg >= 89.9) return 0.0;
    return 0.0;
  }
  const h = Math.max(-1.9, trueAltDeg);
  const rArcmin =
    (1.02 / Math.tan(degToRad(h + 10.3 / (h + 5.11))) + 0.0019279) *
    (pressureMb / 1010.0) *
    (283.0 / (273.0 + tempC));
  return Math.max(0.0, rArcmin / 60.0);
}

/**
 * Apply atmospheric refraction to true altitude to get apparent altitude.
 * @param {number} trueAltDeg
 * @param {number} [pressureMb=1010]
 * @param {number} [tempC=10]
 * @returns {number} Apparent altitude in degrees
 */
export function applyRefraction(trueAltDeg, pressureMb = 1010, tempC = 10) {
  return trueAltDeg + getRefraction(trueAltDeg, pressureMb, tempC);
}

/**
 * Remove atmospheric refraction from apparent altitude to get true altitude (Bennett formula, Meeus Eq. 16.3).
 * @param {number} appAltDeg
 * @param {number} [pressureMb=1010]
 * @param {number} [tempC=10]
 * @returns {number} True altitude in degrees
 */
export function removeRefraction(appAltDeg, pressureMb = 1010, tempC = 10) {
  if (appAltDeg < -2.0 || appAltDeg >= 89.9) return appAltDeg;
  const h0 = Math.max(-1.5, appAltDeg);
  const rArcmin =
    (1.0 / Math.tan(degToRad(h0 + 7.31 / (h0 + 4.4))) + 0.0013515) *
    (pressureMb / 1010.0) *
    (283.0 / (273.0 + tempC));
  return appAltDeg - Math.max(0.0, rArcmin / 60.0);
}

/**
 * Compute optical airmass X using Pickering (2002) formula.
 * Valid all the way down to the horizon (alt = 0° -> X ~ 38.7).
 * @param {number} altDeg - Apparent altitude in degrees
 * @returns {number} Airmass X (in zenith atmospheres), or Infinity if below -2°
 */
export function getAirmass(altDeg) {
  if (altDeg < -2.0) return Infinity;
  const h = Math.max(0.0, altDeg);
  const arg = h + 244.0 / (165.0 + 47.0 * Math.pow(h, 1.1));
  return 1.0 / Math.sin(degToRad(arg));
}

/**
 * Compute atmospheric extinction magnitude loss at a given altitude.
 * @param {number} altDeg - Apparent altitude in degrees
 * @param {number} [kZenith=0.20] - Extinction coefficient in mag/airmass
 * @returns {number} Magnitude loss Delta m (positive value to add to intrinsic magnitude)
 */
export function getExtinctionMag(altDeg, kZenith = 0.20) {
  if (altDeg <= -1.0) return 10.0;
  const X = getAirmass(altDeg);
  return Math.min(10.0, kZenith * (X - 1.0));
}

/**
 * Compute high-precision apparent solar ecliptic longitude of date (degrees [0, 360)).
 * Reference: Meeus Ch. 25.
 * @param {number} jd
 * @returns {number} Solar longitude of date in degrees [0, 360)
 */
export function getSolarLongitudeOfDate(jd) {
  const T = getJ2000Centuries(getJDE(jd));
  const T2 = T * T;
  const L0 = normalizeDeg(280.46646 + 36000.76983 * T + 0.0003032 * T2);
  const M = degToRad(normalizeDeg(357.52911 + 35999.05029 * T - 0.0001537 * T2));
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin(M) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const trueLon = L0 + C;
  const omega = degToRad(125.04 - 1934.136 * T);
  const appLon = trueLon - 0.00569 - 0.00478 * Math.sin(omega);
  return normalizeDeg(appLon);
}

/**
 * Compute solar ecliptic longitude referenced to J2000.0 equinox (degrees [0, 360)).
 * Essential for meteor shower activity curves and peak predictions across any year!
 * @param {number} jd
 * @returns {number} J2000 solar longitude in degrees [0, 360)
 */
export function getSolarLongitudeJ2000(jd) {
  const T = getJ2000Centuries(getJDE(jd));
  const appLonDate = getSolarLongitudeOfDate(jd);
  // Precession in ecliptic longitude from J2000 to date is ~ 1.396971° per century
  const precDeg = 1.396971278 * T + 0.000308889 * T * T;
  return normalizeDeg(appLonDate - precDeg);
}

/**
 * Find the exact Julian Date near approxJD when the J2000 solar longitude equals targetLonDeg.
 * Uses Newton-Raphson iteration (converges to < 1 second in 3 iterations).
 * @param {number} targetLonDeg - Target J2000 solar longitude in degrees [0, 360)
 * @param {number} approxJD - Approximate Julian Date (e.g., mid-year of interest)
 * @returns {number} Exact Julian Date
 */
export function solarLongitudeToJD(targetLonDeg, approxJD) {
  let jd = approxJD;
  for (let i = 0; i < 6; i++) {
    const currentLon = getSolarLongitudeJ2000(jd);
    let diff = normalizeDegSigned(targetLonDeg - currentLon);
    jd += diff / 0.9856076686;
    if (Math.abs(diff) < 1e-6) break;
  }
  return jd;
}

/**
 * Format Right Ascension (degrees) as "HHh MMm SS.Ss".
 * @param {number} raDeg
 * @param {number} [precision=1]
 * @returns {string}
 */
export function formatRA(raDeg, precision = 1) {
  const totalHours = normalizeDeg(raDeg) / 15.0;
  let h = Math.floor(totalHours);
  const remMin = (totalHours - h) * 60.0;
  let m = Math.floor(remMin);
  let s = (remMin - m) * 60.0;
  const factor = Math.pow(10, precision);
  s = Math.round(s * factor) / factor;
  if (s >= 60.0) {
    s -= 60.0;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    h = (h + 1) % 24;
  }
  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = precision > 0 ? s.toFixed(precision).padStart(3 + precision, '0') : String(Math.round(s)).padStart(2, '0');
  return `${hStr}h ${mStr}m ${sStr}s`;
}

/**
 * Format Declination or signed angle (degrees) as "+DD° MM' SS\"".
 * @param {number} decDeg
 * @param {number} [precision=0]
 * @returns {string}
 */
export function formatDec(decDeg, precision = 0) {
  const sign = decDeg < 0 ? '-' : '+';
  const abs = Math.abs(decDeg);
  let d = Math.floor(abs);
  const remMin = (abs - d) * 60.0;
  let m = Math.floor(remMin);
  let s = (remMin - m) * 60.0;
  const factor = Math.pow(10, precision);
  s = Math.round(s * factor) / factor;
  if (s >= 60.0) {
    s -= 60.0;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    d += 1;
  }
  const dStr = String(d).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = precision > 0 ? s.toFixed(precision).padStart(3 + precision, '0') : String(Math.round(s)).padStart(2, '0');
  return `${sign}${dStr}° ${mStr}' ${sStr}"`;
}

/**
 * Format angle in degrees as "DD° MM' SS\"".
 * @param {number} deg
 * @param {boolean} [showSign=false]
 * @returns {string}
 */
export function formatDMS(deg, showSign = false) {
  const formatted = formatDec(deg, 0);
  return showSign ? formatted : formatted.replace(/^\+/, '');
}

/**
 * Format decimal hours as "HH:MM" or "HH:MM:SS".
 * @param {number} hours
 * @param {boolean} [includeSeconds=false]
 * @returns {string}
 */
export function formatHMS(hours, includeSeconds = false) {
  const hNorm = normalizeHours(hours);
  let h = Math.floor(hNorm);
  const remMin = (hNorm - h) * 60.0;
  let m = Math.floor(remMin);
  let s = Math.round((remMin - m) * 60.0);
  if (s >= 60) {
    s -= 60;
    m += 1;
  }
  if (m >= 60) {
    m -= 60;
    h = (h + 1) % 24;
  }
  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  if (!includeSeconds) return `${hStr}:${mStr}`;
  const sStr = String(s).padStart(2, '0');
  return `${hStr}:${mStr}:${sStr}`;
}

/**
 * Compute the timezone offset in minutes East of UTC for a given Date and timezone identifier.
 * Supports IANA timezone strings (e.g., 'Europe/Paris', 'America/New_York'), 'UTC', 'local',
 * or solar/longitude-based offset ('solar').
 * @param {Date|number} date
 * @param {string} [tzString='local']
 * @param {number} [lonDeg=0]
 * @returns {number} Offset in minutes East of UTC (e.g. +60 for CET, +120 for CEST)
 */
export function getTimezoneOffsetMinutes(date = new Date(), tzString = 'local', lonDeg = 0) {
  const d = typeof date === 'number' ? new Date(date) : date;
  if (!tzString || tzString === 'local') {
    return -d.getTimezoneOffset();
  }
  if (tzString === 'UTC' || tzString === 'GMT') {
    return 0;
  }
  if (tzString === 'solar' || tzString === 'lon') {
    return Math.round((lonDeg / 15.0) * 60.0);
  }
  try {
    const utcDate = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(d.toLocaleString('en-US', { timeZone: tzString }));
    return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000.0);
  } catch {
    return -d.getTimezoneOffset();
  }
}

/**
 * Format a Date object (or JD if < 1e7) into structured date/time components in a target timezone.
 * @param {Date|number} dateOrJD
 * @param {string} [tzString='local']
 * @param {number} [lonDeg=0]
 * @returns {{
 *   year: number, month: number, day: number,
 *   hours: number, minutes: number, seconds: number,
 *   dateStr: string, timeStr: string, timeShortStr: string,
 *   fullStr: string, offsetStr: string, offsetMinutes: number
 * }}
 */
export function formatInTimezone(dateOrJD, tzString = 'local', lonDeg = 0) {
  const d =
    dateOrJD instanceof Date
      ? dateOrJD
      : typeof dateOrJD === 'number' && dateOrJD < 10000000
        ? jdToDate(dateOrJD)
        : new Date(dateOrJD);

  const offsetMinutes = getTimezoneOffsetMinutes(d, tzString, lonDeg);
  const shifted = new Date(d.getTime() + offsetMinutes * 60000);

  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hours = shifted.getUTCHours();
  const minutes = shifted.getUTCMinutes();
  const seconds = shifted.getUTCSeconds();

  const yearStr = String(year).padStart(4, '0');
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const hStr = String(hours).padStart(2, '0');
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');

  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOff = Math.abs(offsetMinutes);
  const offH = String(Math.floor(absOff / 60)).padStart(2, '0');
  const offM = String(absOff % 60).padStart(2, '0');
  const offsetStr = `UTC${sign}${offH}:${offM}`;

  const dateStr = `${yearStr}-${monthStr}-${dayStr}`;
  const timeStr = `${hStr}:${mStr}:${sStr}`;
  const timeShortStr = `${hStr}:${mStr}`;
  const fullStr = `${dateStr} ${timeStr}`;

  return {
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    dateStr,
    timeStr,
    timeShortStr,
    fullStr,
    offsetStr,
    offsetMinutes
  };
}

/**
 * Construct a UTC Date object from wall-clock components in a given timezone.
 * @param {number} year
 * @param {number} month - 1..12
 * @param {number} day - 1..31
 * @param {number} [hours=0]
 * @param {number} [minutes=0]
 * @param {number} [seconds=0]
 * @param {string} [tzString='local']
 * @param {number} [lonDeg=0]
 * @returns {Date}
 */
export function createDateInTimezone(
  year,
  month,
  day,
  hours = 0,
  minutes = 0,
  seconds = 0,
  tzString = 'local',
  lonDeg = 0
) {
  const approxUTC = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  const off1 = getTimezoneOffsetMinutes(new Date(approxUTC), tzString, lonDeg);
  const pass1 = approxUTC - off1 * 60000;
  const off2 = getTimezoneOffsetMinutes(new Date(pass1), tzString, lonDeg);
  return new Date(approxUTC - off2 * 60000);
}

/* ============================================================================
 * ASTRO2001 PUBLISHED CALCULATION RULES (https://www.astro2001.org/calculation-rules)
 * ============================================================================ */

/**
 * Bortle class (1..9) to zenith sky brightness in mag/arcsec² (SQM).
 * Source: J. E. Bortle, Sky & Telescope, Feb 2001; unihedron.com
 */
export const BORTLE_SQM_TABLE = [21.85, 21.6, 21.4, 20.85, 19.75, 18.8, 18.25, 17.75, 17.2];

export function bortleToSqm(bortleClass = 4) {
  const idx = Math.max(0, Math.min(8, Math.round(bortleClass) - 1));
  return BORTLE_SQM_TABLE[idx];
}

/**
 * Convert surface brightness μ (mag/arcsec²) to nanolamberts (nL) and back.
 * Source: Garstang (1989, PASP 101, 306) & Krisciunas & Schaefer (1991, PASP 103, 1033).
 */
export function sqmToNanoLamberts(mu) {
  return 34.08 * Math.exp(20.7233 - 0.921034 * mu);
}

export function nanoLambertsToSqm(bNL) {
  if (bNL <= 1e-6) return 24.0;
  return (20.7233 - Math.log(bNL / 34.08)) / 0.921034;
}

/**
 * Atmospheric extinction coefficient k (mag/airmass) at 550 nm.
 * Source: Hardie (1962); Green, Spherical Astronomy (1985, p. 300).
 * k = 1.0857 * (τ_Rayleigh * exp(-alt/8000) + τ_ozone + τ_aerosols)
 */
export function getExtinctionCoeff(altMeters = 0, aod = 0.05) {
  const tauRayleigh = 0.0973 * Math.exp(-Math.max(0, altMeters) / 8000.0);
  const tauOzone = 0.032;
  const tauAerosol = Math.max(0.01, aod);
  return 1.0857 * (tauRayleigh + tauOzone + tauAerosol);
}

/**
 * Scattering layer airmass X(Z) = (1 - 0.96 sin²Z)^(-1/2).
 * Source: Krisciunas & Schaefer (1991, PASP 103, 1033), after Schaefer (1990).
 */
export function getScatteringAirmass(altDeg) {
  const zRad = degToRad(Math.min(90, Math.max(0, 90 - altDeg)));
  const sinZ = Math.sin(zRad);
  return 1.0 / Math.sqrt(Math.max(0.04, 1.0 - 0.96 * sinZ * sinZ));
}

/**
 * Compute directional sky background brightness μ (mag/arcsec²) by summing in nanolamberts:
 * - Natural sky: 21.9 mag/arcsec² at zenith (Benn & Ellison 1998)
 * - Light pollution from Bortle class
 * - Moonlight scattering: Krisciunas & Schaefer (1991, PASP 103, 1033)
 * - Twilight: Patat et al. (2006, A&A 455, 385) V-band polynomial
 */
export function computeDirectionalSkySqm({
  altDeg = 45,
  bortleClass = 4,
  sunAltDeg = -25,
  moonAltDeg = -10,
  moonPhaseAngleDeg = 90,
  moonSepDeg = 60,
  altMeters = 0
} = {}) {
  const k = getExtinctionCoeff(altMeters);
  const X = getScatteringAirmass(altDeg);

  // 1. Natural sky + Light pollution at zenith, scaled by airmass and dimmed by extinction
  const muSiteZenith = bortleToSqm(bortleClass);
  const bZenithNL = sqmToNanoLamberts(muSiteZenith);
  const bSiteNL = bZenithNL * X * Math.pow(10, -0.4 * k * (X - 1.0));

  // 2. Moonlight scattering (Krisciunas & Schaefer 1991)
  let bMoonNL = 0;
  if (moonAltDeg > -2) {
    const alpha = Math.max(0, Math.min(180, moonPhaseAngleDeg));
    const Istar = Math.pow(10, -0.4 * (3.84 + 0.026 * alpha + 4e-9 * Math.pow(alpha, 4)));
    const rhoDeg = Math.max(1.0, moonSepDeg);
    const cosRho = Math.cos(degToRad(rhoDeg));
    const fRayleigh = Math.pow(10, 5.36) * (1.06 + cosRho * cosRho);
    const fMie = rhoDeg >= 10
      ? Math.pow(10, 6.15 - rhoDeg / 40.0)
      : 6.2e7 / (rhoDeg * rhoDeg);
    const fRho = fRayleigh + fMie;
    const Xmoon = getScatteringAirmass(Math.max(0, moonAltDeg));
    bMoonNL = fRho * Istar * Math.pow(10, -0.4 * k * Xmoon) * (1.0 - Math.pow(10, -0.4 * k * X));
  }

  // 3. Twilight (Patat et al. 2006, A&A 455, 385, Table 1 polynomial for -5° to -15°)
  let bTwilightNL = 0;
  if (sunAltDeg > -18.0) {
    let muTwi;
    if (sunAltDeg <= -5.0 && sunAltDeg >= -15.0) {
      const x = -sunAltDeg - 5.0; // ζ - 95°
      muTwi = 11.84 + 1.518 * x - 0.057 * x * x;
    } else if (sunAltDeg < -15.0) {
      // Smoothly vanish from -15° (21.78) to -18° (24.0)
      const f = (-sunAltDeg - 15.0) / 3.0;
      muTwi = 21.78 + f * 3.5;
    } else if (sunAltDeg <= 0.0) {
      // Anchors at -5° (11.84), -4° (10.67), -2° (8.85), 0° (7.71)
      const f = (sunAltDeg + 5.0) / 5.0;
      muTwi = 11.84 - f * (11.84 - 7.71);
    } else {
      muTwi = Math.max(3.5, 7.71 - sunAltDeg * 0.37);
    }
    bTwilightNL = sqmToNanoLamberts(muTwi);
  }

  return nanoLambertsToSqm(bSiteNL + bMoonNL + bTwilightNL);
}

/**
 * Naked-eye limiting magnitude from sky surface brightness μ (mag/arcsec²).
 * Source: Garstang (1989, PASP 101, 306) & Schaefer (1990, PASP 102, 212)
 * Dual branch: rods (c = 10^-9.8, k = 10^-1.9) and cones (c = 10^-8.35, k = 10^-5.9).
 */
export function computeNakedEyeLimitingMag(muSky, altDeg = 60, altMeters = 0) {
  const B = sqmToNanoLamberts(muSky);
  const iRods = Math.pow(10, -9.8) * Math.pow(1.0 + Math.sqrt(Math.pow(10, -1.9) * B), 2);
  const iCones = Math.pow(10, -8.35) * Math.pow(1.0 + Math.sqrt(Math.pow(10, -5.9) * B), 2);
  const I = Math.min(iRods, iCones);
  const mCeil = -16.57 - 2.5 * Math.log10(I);
  const k = getExtinctionCoeff(altMeters);
  const X = getAirmass(Math.max(2, altDeg));
  const extLoss = Math.min(4.0, k * (X - 1.0));
  return mCeil - extLoss * 0.5;
}

/**
 * Evaluate deep-sky and stellar observability using Crumey (2014, MNRAS 442, 2600)
 * contrast threshold on the brightest region (Sérsic / Plummer / core) and Clark (1990) optimum magnification.
 */
export function evaluateCrumeyVisibility({
  mag = 8.0,
  majArcmin = 5.0,
  minArcmin = 5.0,
  dsoType = 'G',
  skySqm = 20.85,
  apertureMm = 200,
  focalMm = 1000,
  eyepieceFocalMm = 14,
  altDeg = 45,
  altMeters = 0
} = {}) {
  const k = getExtinctionCoeff(altMeters);
  const X = altDeg > 0 ? getAirmass(altDeg) : 40;
  const extMag = altDeg > 0 ? Math.min(6.0, k * (X - 1.0)) : 10.0;
  const effMag = mag + extMag;

  const magnification = Math.max(1, focalMm / Math.max(1, eyepieceFocalMm));
  const exitPupilMm = apertureMm / magnification;
  const dawesArcsec = 116.0 / Math.max(1, apertureMm);

  // Instrument stellar limiting magnitude (Schaefer factors)
  const nakedLimit = computeNakedEyeLimitingMag(skySqm, altDeg, altMeters);
  const pupilFactor = Math.min(1.0, 7.0 / Math.max(0.5, exitPupilMm));
  const gainMag = 5.0 * Math.log10((apertureMm / 7.0) * pupilFactor);
  const scopeLimitMag = nakedLimit + gainMag * 0.88;

  // Clark (1990) Optimum Magnified Visual Angle (~100' apparent diameter, bounded to [D/7, 2D])
  const objSizeArcmin = Math.max(0.5, Math.sqrt(Math.max(0.2, majArcmin) * Math.max(0.2, minArcmin || majArcmin)));
  const minUsefulMag = Math.max(7, Math.round(apertureMm / 7));
  const maxUsefulMag = Math.round(apertureMm * 2);
  const clarkIdealMag = Math.round(Math.max(minUsefulMag, Math.min(maxUsefulMag, 100.0 / Math.min(60, Math.max(1.2, objSizeArcmin * 0.6)))));
  const clarkIdealEyepieceMm = Math.max(3, Math.min(40, Math.round(focalMm / clarkIdealMag)));

  // Check naked-eye visibility first ("Naked-eye floor")
  if (altDeg <= 0) {
    return {
      status: 'below_horizon',
      verdictKey: 'out_of_reach',
      nakedEyeVisible: false,
      contrastMarginDb: -9.9,
      scopeLimitMag,
      nakedLimit,
      clarkIdealMag,
      clarkIdealEyepieceMm,
      dawesArcsec,
      exitPupilMm
    };
  }

  // Open clusters (OCl) or point sources are resolved into stars
  const isPointOrOpenCluster = dsoType === 'OCl' || dsoType === 'star' || dsoType === 'planet' || majArcmin <= 0.2;
  if (isPointOrOpenCluster) {
    const nakedEyeVisible = effMag <= nakedLimit - 0.15;
    const delta = scopeLimitMag - effMag;
    const verdictKey = nakedEyeVisible
      ? 'naked_eye'
      : delta >= 1.0
        ? 'easy'
        : delta >= -0.2
          ? 'marginal'
          : 'out_of_reach';
    return {
      status: verdictKey,
      verdictKey,
      nakedEyeVisible,
      contrastMarginDb: delta,
      scopeLimitMag,
      nakedLimit,
      clarkIdealMag,
      clarkIdealEyepieceMm,
      dawesArcsec,
      exitPupilMm
    };
  }

  // Extended object: Crumey (2014, MNRAS 442, 2600) eqs. 44, 47-49 on brightest core region
  // Effective core concentration boost (Sérsic for Galaxies ~1.8 mag brighter in core than average; Plummer for GCl ~2.1 mag)
  let coreBoostMag = 1.2;
  let coreFrac = 0.35;
  if (dsoType === 'G' || dsoType === 'GGroup') {
    coreBoostMag = 1.85;
    coreFrac = 0.32;
  } else if (dsoType === 'GCl') {
    coreBoostMag = 2.15;
    coreFrac = 0.38;
  } else if (dsoType === 'PN') {
    coreBoostMag = 0.6;
    coreFrac = 0.75;
  } else if (dsoType === 'HII' || dsoType === 'EmN' || dsoType === 'Neb' || dsoType === 'RfN') {
    coreBoostMag = 1.65;
    coreFrac = 0.30;
  }

  const areaArcsec2 = Math.PI * (majArcmin * 30.0) * ((minArcmin || majArcmin) * 30.0);
  const meanSb = effMag + 2.5 * Math.log10(Math.max(1, areaArcsec2));
  const coreSb = Math.max(effMag + 0.5, meanSb - coreBoostMag);

  // Sky luminance B in cd/m² in the eyepiece (Crumey §3.2: darkened by exit pupil and 75% transmission)
  const bSkyNakedCdM2 = 1.08e5 * Math.pow(10, -0.4 * skySqm);
  const pupilRatio = Math.min(7.0, Math.max(0.4, exitPupilMm)) / 7.0;
  const bSkyScopeCdM2 = Math.max(1e-5, bSkyNakedCdM2 * pupilRatio * pupilRatio * 0.75);

  // Apparent solid angle A (steradians) of the core in the eyepiece
  const appRadiusRad = degToRad(((objSizeArcmin * coreFrac) / 120.0) * magnification);
  const A_sr = Math.max(1e-9, Math.PI * appRadiusRad * appRadiusRad);

  // Crumey eqs. 44, 47-49
  const b4 = Math.pow(bSkyScopeCdM2, -0.25);
  const rTerm = Math.max(1e-6, 6.505e-4 * b4 - 8.461e-4);
  const kTerm = Math.max(1e-4, 7.633e-3 * b4 - 7.174e-3);
  const q = 0.6;
  const C_thresh = Math.pow(Math.pow((rTerm * rTerm) / A_sr, q) + Math.pow(kTerm, q), 1.0 / q);

  // Object contrast over sky: C_obj = 10^(-0.4 * (coreSb - skySqm))
  const C_obj = Math.pow(10, -0.4 * (coreSb - skySqm));
  // Field factor F * F_T: F=2 average observer, F=1 trained observer
  const ratioTrained = C_obj / (C_thresh * 1.8);
  const contrastMarginDb = 2.5 * Math.log10(Math.max(0.01, ratioTrained));

  const nakedEyeVisible = effMag <= nakedLimit - 0.4 && coreSb <= skySqm + 0.5;
  let verdictKey = 'out_of_reach';
  if (effMag <= scopeLimitMag) {
    if (nakedEyeVisible) verdictKey = 'naked_eye';
    else if (contrastMarginDb >= 0.55) verdictKey = 'easy';
    else if (contrastMarginDb >= -0.35) verdictKey = 'marginal';
  }

  return {
    status: verdictKey,
    verdictKey,
    nakedEyeVisible,
    contrastMarginDb,
    meanSb,
    coreSb,
    scopeLimitMag,
    nakedLimit,
    clarkIdealMag,
    clarkIdealEyepieceMm,
    dawesArcsec,
    exitPupilMm
  };
}

/**
 * Ballesteros (2012, EPL 97, 34008) formula for stellar effective temperature from B-V index,
 * and stellar radius R/R☉ = sqrt(L) * (5772 / T)².
 */
export function bvToTemperatureK(bv = 0.0) {
  const x = Math.max(-0.4, Math.min(2.2, bv));
  return Math.round(4600 * (1.0 / (0.92 * x + 1.7) + 1.0 / (0.92 * x + 0.62)));
}

export function computeStellarRadiusSolar(mag, distLy, bv = 0.0) {
  if (!distLy || distLy <= 0) return null;
  const distPc = distLy / 3.26156;
  const absMag = mag - 5.0 * (Math.log10(distPc) - 1.0);
  const lumSolar = Math.pow(10, 0.4 * (4.83 - absMag));
  const tempK = bvToTemperatureK(bv);
  const radiusSolar = Math.sqrt(lumSolar) * Math.pow(5772.0 / tempK, 2);
  return { tempK, lumSolar, radiusSolar, absMag };
}

/**
 * Format altitude in degrees with hand-at-arm's-length equivalent (1 fist ≈ 10°, RASC Observer's Handbook).
 */
export function formatAltitudeWithFists(altDeg, lang = 'fr') {
  if (altDeg <= 0) return '';
  const fists = Math.round((altDeg / 10.0) * 2) / 2;
  if (fists < 0.5) return '';
  const fistStr = Number.isInteger(fists) ? String(fists) : String(fists).replace('.', lang === 'en' ? '.' : ',');
  if (lang === 'en') return `${fistStr} ${fists === 1 ? 'fist' : 'fists'} at arm's length`;
  if (lang === 'es') return `${fistStr} ${fists === 1 ? 'puño' : 'puños'} a brazo tendido`;
  if (lang === 'de') return `${fistStr} ${fists === 1 ? 'Faust' : 'Fäuste'} bei ausgestrecktem Arm`;
  return `${fistStr} ${fists <= 1 ? 'poing' : 'poings'} bras tendu`;
}

/**
 * NPF rule for maximum untrailed astrophotography exposure time in seconds:
 * t = (35 * N + 30 * p) / f  (Frédéric Michaud, Société astronomique du Havre)
 */
export function computeNpfExposureSec(fNumber = 5.0, pixelUm = 3.76, focalMm = 500) {
  if (!focalMm || focalMm <= 0) return 0;
  return (35.0 * fNumber + 30.0 * pixelUm) / focalMm;
}

