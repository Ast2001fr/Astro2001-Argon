/**
 * js/astro/measure.js
 * Pure spherical geometry for the Angular Measurement Ruler and Celestial Reference Lines.
 * Implements ETUDE-REGLE-REPERES.md (§3.1, §3.2, §5, §6):
 * - Numerically stable great-circle separation via atan2(||u1 × u2||, u1 · u2)
 * - Position Angle (PA) from Celestial North through East in [0°, 360°), pole-safe
 * - Spherical Linear Interpolation (SLERP) great-circle arc sampling
 * - Exact IAU 1958 / Hipparcos Galactic -> J2000 Equatorial transform
 * - Carry-safe DMS/arcmin/arcsec formatting + Moon-diameter / eyepiece-field equivalents
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// J2000 Equatorial -> Galactic orthogonal matrix (IAU 1958 / Hipparcos, same as webgl-sky.js)
// Rows are Galactic X (l=0,b=0), Y (l=90,b=0), Z (NGP b=+90) expressed in J2000 Equatorial!
const R_EQ_TO_GAL_0 = [-0.0548755604, -0.8734370902, -0.4838350155];
const R_EQ_TO_GAL_1 = [ 0.4941094279, -0.4448296300,  0.7469822445];
const R_EQ_TO_GAL_2 = [-0.8676661490, -0.1980763734,  0.4559837762];

/**
 * Convert Equatorial (raDeg, decDeg) to a 3D unit vector [x, y, z].
 */
export function raDecToUnitVec(raDeg, decDeg) {
  const ra = raDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  const cosD = Math.cos(dec);
  return [cosD * Math.cos(ra), cosD * Math.sin(ra), Math.sin(dec)];
}

/**
 * Convert a 3D unit vector [x, y, z] to Equatorial { ra, dec } in degrees.
 */
export function unitVecToRaDec(u) {
  const z = Math.max(-1, Math.min(1, u[2]));
  const dec = Math.asin(z) * RAD2DEG;
  const ra = ((Math.atan2(u[1], u[0]) * RAD2DEG) % 360 + 360) % 360;
  return { ra, dec };
}

/**
 * Transform Galactic coordinates (lDeg, bDeg) to J2000 Equatorial unit vector [x, y, z]
 * via the transpose of the orthogonal IAU 1958 / Hipparcos matrix.
 */
export function galacticToEquatorialUnitVec(lDeg, bDeg = 0) {
  const l = lDeg * DEG2RAD;
  const b = bDeg * DEG2RAD;
  const cosB = Math.cos(b);
  const gx = cosB * Math.cos(l);
  const gy = cosB * Math.sin(l);
  const gz = Math.sin(b);

  // M^T * v_gal
  return [
    R_EQ_TO_GAL_0[0] * gx + R_EQ_TO_GAL_1[0] * gy + R_EQ_TO_GAL_2[0] * gz,
    R_EQ_TO_GAL_0[1] * gx + R_EQ_TO_GAL_1[1] * gy + R_EQ_TO_GAL_2[1] * gz,
    R_EQ_TO_GAL_0[2] * gx + R_EQ_TO_GAL_1[2] * gy + R_EQ_TO_GAL_2[2] * gz
  ];
}

/**
 * Numerically stable angular separation in radians between two unit vectors u1, u2.
 * Handles sub-arcsecond, identical (0), and antipodal (π) pairs with zero NaN.
 */
export function angularSepRad(u1, u2) {
  const dot = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2]));
  const cx = u1[1] * u2[2] - u1[2] * u2[1];
  const cy = u1[2] * u2[0] - u1[0] * u2[2];
  const cz = u1[0] * u2[1] - u1[1] * u2[0];
  const crossNorm = Math.hypot(cx, cy, cz);
  return Math.atan2(crossNorm, dot);
}

/**
 * Angular separation in degrees between two unit vectors u1, u2.
 */
export function angularSepDeg(u1, u2) {
  return angularSepRad(u1, u2) * RAD2DEG;
}

/**
 * Position Angle (PA) in degrees [0, 360) from u1 toward u2,
 * measured from Celestial North through East.
 * Handles the Celestial Poles safely via the ra1Deg meridian fallback.
 */
export function positionAngleDeg(u1, u2, ra1Deg = 0) {
  const dot = u1[0] * u2[0] + u1[1] * u2[1] + u1[2] * u2[2];
  // Tangent vector at u1 pointing toward u2: t = u2 - (u1 · u2) u1
  const tx = u2[0] - dot * u1[0];
  const ty = u2[1] - dot * u1[1];
  const tz = u2[2] - dot * u1[2];
  const tNorm = Math.hypot(tx, ty, tz);
  if (tNorm < 1e-12) return 0;

  // Local East e = (z × u1) / ||z × u1|| where z = (0, 0, 1) -> z × u1 = (-u1.y, u1.x, 0)
  let ex = -u1[1];
  let ey = u1[0];
  let ez = 0;
  const eNorm = Math.hypot(ex, ey);
  if (eNorm < 1e-10) {
    // At North or South Celestial Pole: fall back to ra1Deg meridian
    const raRad = (ra1Deg || 0) * DEG2RAD;
    ex = -Math.sin(raRad);
    ey = Math.cos(raRad);
    ez = 0;
  } else {
    ex /= eNorm;
    ey /= eNorm;
  }

  // Local North n = u1 × e (since u1 × e points toward +z in right-handed RA/Dec)
  // Verify: at RA=0, Dec=0: u1=(1,0,0), e=(0,1,0) -> u1 × e = (0,0,1) = North!
  const nx = u1[1] * ez - u1[2] * ey;
  const ny = u1[2] * ex - u1[0] * ez;
  const nz = u1[0] * ey - u1[1] * ex;

  const tDotE = tx * ex + ty * ey + tz * ez;
  const tDotN = tx * nx + ty * ny + tz * nz;
  return ((Math.atan2(tDotE, tDotN) * RAD2DEG) % 360 + 360) % 360;
}

/**
 * Sample a true great-circle geodesic between unit vectors u1 and u2 via SLERP.
 * Step size = min(maxStepDeg, theta / 8), clamped to [2, 90] points.
 * Returns an array of Equatorial unit vectors [[x, y, z], ...].
 */
export function greatCircleArc(u1, u2, maxStepDeg = 2) {
  const theta = angularSepRad(u1, u2);
  if (theta < 1e-7) {
    return [u1.slice(), u2.slice()];
  }
  const thetaDeg = theta * RAD2DEG;
  const stepDeg = Math.min(maxStepDeg, thetaDeg / 8);
  const segments = Math.max(1, Math.min(89, Math.ceil(thetaDeg / Math.max(0.05, stepDeg))));
  const sinT = Math.sin(theta);

  // Near-antipodal fallback: pick an orthogonal midpoint axis to avoid sin(pi) == 0
  if (Math.abs(sinT) < 1e-6) {
    const ref = Math.abs(u1[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let ox = u1[1] * ref[2] - u1[2] * ref[1];
    let oy = u1[2] * ref[0] - u1[0] * ref[2];
    let oz = u1[0] * ref[1] - u1[1] * ref[0];
    const oNorm = Math.hypot(ox, oy, oz) || 1;
    ox /= oNorm; oy /= oNorm; oz /= oNorm;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const ang = (i / segments) * Math.PI;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      pts.push([ca * u1[0] + sa * ox, ca * u1[1] + sa * oy, ca * u1[2] + sa * oz]);
    }
    return pts;
  }

  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const w1 = Math.sin((1 - f) * theta) / sinT;
    const w2 = Math.sin(f * theta) / sinT;
    pts.push([
      w1 * u1[0] + w2 * u2[0],
      w1 * u1[1] + w2 * u2[1],
      w1 * u1[2] + w2 * u2[2]
    ]);
  }
  return pts;
}

/**
 * Format an angular separation in degrees with carry-safe rounding:
 * - θ >= 1°       : "12° 34′" (or "12.57°" if opts.decimal)
 * - 1′ <= θ < 1°  : "24′ 18″"
 * - θ < 1′        : "42.3″"
 * Guarantees rounding carry (e.g. 59′ 59.99″ -> "1° 00′", never "0° 60′").
 */
export function formatSeparation(deg, opts = {}) {
  const absDeg = Math.max(0, Number(deg) || 0);
  if (opts.decimal && absDeg >= 1) {
    return `${absDeg.toFixed(2)}°`;
  }

  const totalArcsec = absDeg * 3600;
  if (totalArcsec < 59.95) {
    return `${totalArcsec.toFixed(1)}″`;
  }

  // Round to nearest whole arcsecond to check carry into 1° (3600″)
  const roundedSec = Math.round(totalArcsec);
  if (roundedSec < 3600) {
    const m = Math.floor(roundedSec / 60);
    const s = roundedSec % 60;
    return `${m}′ ${String(s).padStart(2, '0')}″`;
  }

  // >= 1°: round to nearest whole arcminute with clean carry into degrees
  const roundedMin = Math.round(absDeg * 60);
  const d = Math.floor(roundedMin / 60);
  const m = roundedMin % 60;
  return `${d}° ${String(m).padStart(2, '0')}′`;
}

/**
 * Return a visual scale equivalent string:
 * - Moon diameters (31′ mean) when 0.25° <= θ <= 15°
 * - Eyepiece field multiple when tfovDeg is provided and meaningful
 */
export function formatVisualScaleEquiv(deg, tfovDeg = null) {
  const parts = [];
  if (deg >= 0.25 && deg <= 15) {
    const moons = deg / (31 / 60);
    parts.push(`≈ ${moons.toFixed(1)}× ☾`);
  }
  if (tfovDeg && tfovDeg > 0 && deg >= tfovDeg * 0.15 && deg <= tfovDeg * 20) {
    const fields = deg / tfovDeg;
    parts.push(`${fields.toFixed(1)}× champ`);
  }
  return parts.join(' · ');
}

/**
 * Format signed Δα (in shortest-wrap hours/minutes) and Δδ (degrees/minutes).
 */
export function formatDeltaRaDec(ra1Deg, dec1Deg, ra2Deg, dec2Deg) {
  let dRaDeg = ((ra2Deg - ra1Deg + 540) % 360) - 180;
  const raSign = dRaDeg >= 0 ? '+' : '−';
  const raMinTotal = Math.round((Math.abs(dRaDeg) / 15) * 60);
  const rh = Math.floor(raMinTotal / 60);
  const rm = raMinTotal % 60;
  const dRaStr = rh > 0 ? `${raSign}${rh}h ${String(rm).padStart(2, '0')}m` : `${raSign}${rm}m`;

  const dDecDeg = dec2Deg - dec1Deg;
  const decSign = dDecDeg >= 0 ? '+' : '−';
  const decMinTotal = Math.round(Math.abs(dDecDeg) * 60);
  const dd = Math.floor(decMinTotal / 60);
  const dm = decMinTotal % 60;
  const dDecStr = `${decSign}${dd}° ${String(dm).padStart(2, '0')}′`;

  return `Δα ${dRaStr} · Δδ ${dDecStr}`;
}

/**
 * Format signed Δh (altitude) and Δaz (shortest-wrap azimuth).
 */
export function formatDeltaAltAz(alt1Deg, az1Deg, alt2Deg, az2Deg) {
  const dAlt = alt2Deg - alt1Deg;
  const dAz = ((az2Deg - az1Deg + 540) % 360) - 180;
  const altS = `${dAlt >= 0 ? '+' : '−'}${Math.abs(dAlt).toFixed(1)}°`;
  const azS = `${dAz >= 0 ? '+' : '−'}${Math.abs(dAz).toFixed(1)}°`;
  return `Δh ${altS} · Δaz ${azS}`;
}
