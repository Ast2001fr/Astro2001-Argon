/**
 * scripts/check-measure.mjs
 * Automated verification suite for js/astro/measure.js (ETUDE-REGLE-REPERES.md §6):
 * - Known star pairs: Mizar–Alcor (11′ 48″, PA ≈ 71°), Dubhe–Merak (5° 22′, PA ≈ 181°)
 * - Edge cases: identical points (0°), antipodal points (180°), North Celestial Pole -> Polaris (no NaN)
 * - IAU Galactic Centre: (l=0°, b=0°) -> (RA ≈ 266.405°, Dec ≈ -28.936°) within 0.02°
 * - Carry-safe formatting: 59′ 59.99″ -> "1° 00′" (never "0° 60′")
 */

import {
  raDecToUnitVec,
  unitVecToRaDec,
  galacticToEquatorialUnitVec,
  angularSepDeg,
  positionAngleDeg,
  greatCircleArc,
  formatSeparation
} from '../js/astro/measure.js';

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`FAIL: ${msg}`);
  }
}

// 1. Mizar (J2000: 13h 23m 55.54s, +54° 55′ 31.3″) -> Alcor (13h 25m 13.54s, +54° 59′ 16.7″)
const mizarRA = (13 + 23 / 60 + 55.54 / 3600) * 15;
const mizarDec = 54 + 55 / 60 + 31.3 / 3600;
const alcorRA = (13 + 25 / 60 + 13.54 / 3600) * 15;
const alcorDec = 54 + 59 / 60 + 16.7 / 3600;
const uMizar = raDecToUnitVec(mizarRA, mizarDec);
const uAlcor = raDecToUnitVec(alcorRA, alcorDec);
const sepMA = angularSepDeg(uMizar, uAlcor);
const paMA = positionAngleDeg(uMizar, uAlcor, mizarRA);
assert(Math.abs(sepMA * 60 - 11.81) < 0.05, `Mizar–Alcor sep expected ~11.81′, got ${(sepMA * 60).toFixed(3)}′`);
assert(Math.abs(paMA - 71.1) < 0.8, `Mizar–Alcor PA expected ~71°, got ${paMA.toFixed(2)}°`);

// 2. Dubhe (11h 03m 43.67s, +61° 45′ 03.7″) -> Merak (11h 01m 50.48s, +56° 22′ 56.7″)
const dubheRA = (11 + 3 / 60 + 43.67 / 3600) * 15;
const dubheDec = 61 + 45 / 60 + 3.7 / 3600;
const merakRA = (11 + 1 / 60 + 50.48 / 3600) * 15;
const merakDec = 56 + 22 / 60 + 56.7 / 3600;
const uDubhe = raDecToUnitVec(dubheRA, dubheDec);
const uMerak = raDecToUnitVec(merakRA, merakDec);
const sepDM = angularSepDeg(uDubhe, uMerak);
const paDM = positionAngleDeg(uDubhe, uMerak, dubheRA);
assert(Math.abs(sepDM - 5.374) < 0.02, `Dubhe–Merak sep expected ~5.37°, got ${sepDM.toFixed(4)}°`);
assert(Math.abs(paDM - 182.6) < 2.0, `Dubhe–Merak PA expected ~182°, got ${paDM.toFixed(2)}°`);

// 3. Identical & Antipodal points (no NaN)
const sepSame = angularSepDeg(uMizar, uMizar);
const sepAnti = angularSepDeg(uMizar, [-uMizar[0], -uMizar[1], -uMizar[2]]);
assert(sepSame === 0 && Number.isFinite(sepSame), `Identical points expected 0, got ${sepSame}`);
assert(Math.abs(sepAnti - 180) < 1e-9, `Antipodal points expected 180, got ${sepAnti}`);
const antiArc = greatCircleArc(uMizar, [-uMizar[0], -uMizar[1], -uMizar[2]]);
assert(antiArc.length >= 2 && antiArc.every(p => p.every(Number.isFinite)), 'Antipodal arc must be finite');

// 4. North Celestial Pole -> Polaris (no division by zero in PA)
const uNCP = raDecToUnitVec(0, 90);
const uPolaris = raDecToUnitVec(37.9545, 89.2641);
const sepPol = angularSepDeg(uNCP, uPolaris);
const paPol = positionAngleDeg(uNCP, uPolaris, 0);
assert(Math.abs(sepPol - (90 - 89.2641)) < 1e-4, `NCP->Polaris sep failed: ${sepPol}`);
assert(Number.isFinite(paPol) && paPol >= 0 && paPol < 360, `NCP->Polaris PA must be finite: ${paPol}`);

// 5. Galactic Centre (l=0°, b=0°) -> IAU (RA ≈ 266.405°, Dec ≈ -28.936°) within 0.02°
const uGC = galacticToEquatorialUnitVec(0, 0);
const gc = unitVecToRaDec(uGC);
assert(Math.abs(gc.ra - 266.405) < 0.02, `GC RA expected ~266.405°, got ${gc.ra.toFixed(4)}°`);
assert(Math.abs(gc.dec - (-28.936)) < 0.02, `GC Dec expected ~-28.936°, got ${gc.dec.toFixed(4)}°`);

// 6. Formatting & carry rounding
assert(formatSeparation(59 / 60 + 59.99 / 3600) === '1° 00′', `Carry failed: ${formatSeparation(59 / 60 + 59.99 / 3600)}`);
assert(formatSeparation(59.99 / 3600) === '1′ 00″', `Arcsec carry failed: ${formatSeparation(59.99 / 3600)}`);
assert(formatSeparation(42.3 / 3600) === '42.3″', `Sub-arcmin failed: ${formatSeparation(42.3 / 3600)}`);
assert(formatSeparation(sepMA) === '11′ 48″' || formatSeparation(sepMA) === '11′ 49″', `Mizar-Alcor format: ${formatSeparation(sepMA)}`);
assert(formatSeparation(sepDM) === '5° 22′', `Dubhe-Merak format: ${formatSeparation(sepDM)}`);

const out = `ALL MEASURE CHECKS PASSED: Mizar-Alcor=${formatSeparation(sepMA)} (PA ${paMA.toFixed(1)}°), Dubhe-Merak=${formatSeparation(sepDM)} (PA ${paDM.toFixed(1)}°), GC=(RA ${gc.ra.toFixed(3)}°, Dec ${gc.dec.toFixed(3)}°)`;
if (typeof console !== 'undefined' && console.log) console.log(out);
else if (typeof print === 'function') print(out);
