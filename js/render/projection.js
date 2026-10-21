/**
 * js/render/projection.js
 * Stereographic, Orthographic, and 3D Heliocentric projections,
 * plus cursor-centered zoom, pan, and coordinate picking.
 */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Stereographic projection of a unit vector or spherical (az, alt) / (ra, dec)
 * centered at (centerAz, centerAlt) or (centerLon, centerLat).
 *
 * Conventions for Horizontal mode:
 *   lon = azimuth in radians (0 = North, PI/2 = East, PI = South, 3PI/2 = West)
 *   lat = altitude in radians (-PI/2 .. +PI/2)
 *
 * Conventions for Equatorial mode:
 *   lon = -RA in radians (since RA increases Eastward, looking from inside the sphere)
 *   lat = Dec in radians
 */
export class SkyViewport {
  constructor() {
    this.width = 1280;
    this.height = 800;
    this.dpr = 1;

    // View mode: 'terrestrial' | 'celestial' | 'telescope' | 'solarsystem'
    this.viewMode = 'terrestrial';

    // Horizontal camera center (degrees): South = 180, Alt = 35
    this.centerAz = 180;
    this.centerAlt = 35;

    // Equatorial / Celestial globe camera center (degrees)
    this.centerRA = 85;
    this.centerDec = 20;

    // Vertical field of view in degrees (from 0.04° in telescope up to 160° wide dome)
    this.fov = 90;
    this.minFov = 0.04;
    this.maxFov = 170;

    // Optical orientation in telescope view: 'erect' | 'inverted' (180°) | 'mirror' (H-flip)
    this.opticalOrientation = 'erect';

    // Heliocentric 3D camera (for 'solarsystem' view)
    this.helioYaw = -0.6;      // radians
    this.helioPitch = 0.68;    // radians (tilt above ecliptic)
    this.helioScale = 110;     // pixels per compressed AU unit
    this.helioPanX = 0;
    this.helioPanY = 0;

    this._updateCache();
  }

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = dpr;
    this._updateCache();
  }

  setFov(fovDeg) {
    this.fov = Math.max(this.minFov, Math.min(this.maxFov, fovDeg));
    this._updateCache();
  }

  _updateCache() {
    this.cx = this.width * 0.5;
    this.cy = this.height * 0.5;
    const minDim = Math.min(this.width, this.height);
    // Stereographic scale: r = 2 * f * tan(theta / 2)
    const halfFovRad = (this.fov * DEG2RAD) * 0.5;
    this.focal = (minDim * 0.5) / (2 * Math.tan(halfFovRad * 0.5));

    // Precompute trig for horizontal center
    this.az0 = this.centerAz * DEG2RAD;
    this.alt0 = this.centerAlt * DEG2RAD;
    this.sinAlt0 = Math.sin(this.alt0);
    this.cosAlt0 = Math.cos(this.alt0);

    // Precompute trig for equatorial center
    this.ra0 = this.centerRA * DEG2RAD;
    this.dec0 = this.centerDec * DEG2RAD;
    this.sinDec0 = Math.sin(this.dec0);
    this.cosDec0 = Math.cos(this.dec0);
  }

  /**
   * Project Horizontal coordinates (altDeg, azDeg) to screen { x, y, visible, rNorm }
   * Used in 'terrestrial' and 'telescope' views.
   */
  projectAltAz(altDeg, azDeg) {
    const alt = altDeg * DEG2RAD;
    const az = azDeg * DEG2RAD;
    const dAz = az - this.az0;

    const sinAlt = Math.sin(alt);
    const cosAlt = Math.cos(alt);
    const cosDAz = Math.cos(dAz);
    const sinDAz = Math.sin(dAz);

    // Cosine of angular distance from camera center
    const cosC = this.sinAlt0 * sinAlt + this.cosAlt0 * cosAlt * cosDAz;
    if (cosC <= -0.95) {
      return { x: -9999, y: -9999, visible: false, cosC };
    }

    const k = (2 * this.focal) / (1 + cosC);
    let dx = k * cosAlt * sinDAz;
    let dy = -k * (this.cosAlt0 * sinAlt - this.sinAlt0 * cosAlt * cosDAz);

    if (this.viewMode === 'telescope') {
      if (this.opticalOrientation === 'inverted') {
        dx = -dx;
        dy = -dy;
      } else if (this.opticalOrientation === 'mirror') {
        dx = -dx;
      }
    }

    const x = this.cx + dx;
    const y = this.cy + dy;
    const margin = Math.max(this.width, this.height) * 0.35;
    const visible =
      x >= -margin &&
      x <= this.width + margin &&
      y >= -margin &&
      y <= this.height + margin;

    return { x, y, visible, cosC, scale: k };
  }

  /**
   * Inverse stereographic projection: screen (x, y) -> { altDeg, azDeg }
   */
  unprojectAltAz(x, y) {
    let dx = x - this.cx;
    let dy = -(y - this.cy);

    if (this.viewMode === 'telescope') {
      if (this.opticalOrientation === 'inverted') {
        dx = -dx;
        dy = -dy;
      } else if (this.opticalOrientation === 'mirror') {
        dx = -dx;
      }
    }

    const rho = Math.hypot(dx, dy);
    if (rho < 1e-9) {
      return { altDeg: this.centerAlt, azDeg: this.centerAz };
    }

    const c = 2 * Math.atan2(rho, 2 * this.focal);
    const sinC = Math.sin(c);
    const cosC = Math.cos(c);

    const sinAlt = cosC * this.sinAlt0 + (dy * sinC * this.cosAlt0) / rho;
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

    const yAz = dx * sinC;
    const xAz = rho * this.cosAlt0 * cosC - dy * this.sinAlt0 * sinC;
    const az = this.az0 + Math.atan2(yAz, xAz);

    return {
      altDeg: alt * RAD2DEG,
      azDeg: ((az * RAD2DEG) % 360 + 360) % 360
    };
  }

  /**
   * Project Equatorial coordinates (raDeg, decDeg) for the 'celestial' sphere view.
   * Supports both orthographic outer globe when zoomed out and stereographic when zoomed in.
   */
  projectCelestialGlobe(raDeg, decDeg) {
    const ra = raDeg * DEG2RAD;
    const dec = decDeg * DEG2RAD;
    // On an external celestial globe, RA increases counter-clockwise looking from North pole,
    // or looking from inside the sphere RA increases to the left (East).
    // We use inside-out stereographic/orthographic smooth blend so constellations keep their familiar sky orientation.
    const dRA = -(ra - this.ra0);
    const sinDec = Math.sin(dec);
    const cosDec = Math.cos(dec);
    const cosDRA = Math.cos(dRA);
    const sinDRA = Math.sin(dRA);

    const cosC = this.sinDec0 * sinDec + this.cosDec0 * cosDec * cosDRA;
    const globeRadius = Math.min(this.width, this.height) * 0.44 * (90 / Math.max(25, this.fov));

    // In Celestial Sphere view, render as a 3D spherical globe (orthographic front hemisphere + faint back or clipped)
    if (this.fov >= 45) {
      if (cosC < 0) {
        return { x: -9999, y: -9999, visible: false, cosC, globeRadius };
      }
      const dx = globeRadius * cosDec * sinDRA;
      const dy = -globeRadius * (this.cosDec0 * sinDec - this.sinDec0 * cosDec * cosDRA);
      return {
        x: this.cx + dx,
        y: this.cy + dy,
        visible: true,
        cosC,
        globeRadius
      };
    } else {
      // Stereographic when zoomed deeply into the celestial sphere
      if (cosC <= -0.9) return { x: -9999, y: -9999, visible: false, cosC, globeRadius };
      const k = (2 * this.focal) / (1 + cosC);
      const dx = k * cosDec * sinDRA;
      const dy = -k * (this.cosDec0 * sinDec - this.sinDec0 * cosDec * cosDRA);
      return {
        x: this.cx + dx,
        y: this.cy + dy,
        visible: true,
        cosC,
        globeRadius
      };
    }
  }

  /**
   * Inverse projection for Celestial Sphere view: screen (x, y) -> { raDeg, decDeg } | null
   */
  unprojectCelestialGlobe(x, y) {
    const dx = x - this.cx;
    const dy = -(y - this.cy);
    const rho = Math.hypot(dx, dy);

    if (this.fov >= 45) {
      const globeRadius = Math.min(this.width, this.height) * 0.44 * (90 / Math.max(25, this.fov));
      if (rho > globeRadius) return null;
      const sinC = rho / globeRadius;
      const cosC = Math.sqrt(Math.max(0, 1 - sinC * sinC));
      if (rho < 1e-9) return { raDeg: this.centerRA, decDeg: this.centerDec };
      const sinDec = cosC * this.sinDec0 + (dy * sinC * this.cosDec0) / rho;
      const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
      const yRA = dx * sinC;
      const xRA = rho * this.cosDec0 * cosC - dy * this.sinDec0 * sinC;
      const ra = this.ra0 - Math.atan2(yRA, xRA);
      return {
        raDeg: ((ra * RAD2DEG) % 360 + 360) % 360,
        decDeg: dec * RAD2DEG
      };
    } else {
      if (rho < 1e-9) return { raDeg: this.centerRA, decDeg: this.centerDec };
      const c = 2 * Math.atan2(rho, 2 * this.focal);
      const sinC = Math.sin(c);
      const cosC = Math.cos(c);
      const sinDec = cosC * this.sinDec0 + (dy * sinC * this.cosDec0) / rho;
      const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
      const yRA = dx * sinC;
      const xRA = rho * this.cosDec0 * cosC - dy * this.sinDec0 * sinC;
      const ra = this.ra0 - Math.atan2(yRA, xRA);
      return {
        raDeg: ((ra * RAD2DEG) % 360 + 360) % 360,
        decDeg: dec * RAD2DEG
      };
    }
  }

  /**
   * Non-linear AU compression so both inner terrestrial planets (0.4..1.5 AU),
   * main-belt asteroids (2.2..3.2 AU), and outer giants (5..30 AU) are clearly spaced
   * while remaining true to heliocentric angles and relative order.
   */
  compressHelioDistance(rAU) {
    if (rAU <= 0) return 0;
    return Math.pow(rAU, 0.58);
  }

  /**
   * Project 3D Heliocentric ecliptic coordinates (x, y, z in AU) to screen { x, y, depth, scale }
   */
  projectHelio3D(xAU, yAU, zAU = 0) {
    const r = Math.hypot(xAU, yAU, zAU);
    const rScaled = r > 1e-8 ? (this.compressHelioDistance(r) / r) : 1;
    const vx = xAU * rScaled;
    const vy = yAU * rScaled;
    const vz = zAU * rScaled;

    // Rotate by yaw around Z, then pitch around X
    const cosY = Math.cos(this.helioYaw);
    const sinY = Math.sin(this.helioYaw);
    const cosP = Math.cos(this.helioPitch);
    const sinP = Math.sin(this.helioPitch);

    const rx = vx * cosY - vy * sinY;
    const ry = vx * sinY + vy * cosY;
    const rz = vz;

    const sx = rx;
    const sy = ry * sinP - rz * cosP;
    const depth = ry * cosP + rz * sinP;

    // Mild perspective factor
    const persp = 1 / Math.max(0.3, 1 + depth * 0.04);

    return {
      x: this.cx + this.helioPanX + sx * this.helioScale * persp,
      y: this.cy + this.helioPanY + sy * this.helioScale * persp,
      depth,
      scale: this.helioScale * persp,
      visible: true
    };
  }

  /**
   * Zoom toward the cursor position (mouseX, mouseY) preserving the sky point under the cursor!
   */
  zoomAtCursor(factor, mouseX, mouseY) {
    if (this.viewMode === 'solarsystem') {
      const prevScale = this.helioScale;
      this.helioScale = Math.max(18, Math.min(1800, this.helioScale * (1 / factor)));
      const ratio = this.helioScale / prevScale;
      const dx = mouseX - this.cx;
      const dy = mouseY - this.cy;
      this.helioPanX = dx - ratio * (dx - this.helioPanX);
      this.helioPanY = dy - ratio * (dy - this.helioPanY);
      return;
    }

    if (this.viewMode === 'celestial') {
      const before = this.unprojectCelestialGlobe(mouseX, mouseY);
      this.setFov(this.fov * factor);
      if (before) {
        const after = this.unprojectCelestialGlobe(mouseX, mouseY);
        if (after) {
          this.centerRA = ((this.centerRA + (before.raDeg - after.raDeg)) % 360 + 360) % 360;
          this.centerDec = Math.max(-89.9, Math.min(89.9, this.centerDec + (before.decDeg - after.decDeg)));
          this._updateCache();
        }
      }
      return;
    }

    // Terrestrial & Telescope views: keep (alt, az) under cursor stationary
    const before = this.unprojectAltAz(mouseX, mouseY);
    this.setFov(this.fov * factor);
    const after = this.unprojectAltAz(mouseX, mouseY);

    let dAz = before.azDeg - after.azDeg;
    if (dAz > 180) dAz -= 360;
    if (dAz < -180) dAz += 360;
    const dAlt = before.altDeg - after.altDeg;

    this.centerAz = ((this.centerAz + dAz) % 360 + 360) % 360;
    this.centerAlt = Math.max(-89.5, Math.min(89.9, this.centerAlt + dAlt));
    this._updateCache();
  }

  /**
   * Pan camera by pixel delta (dx, dy)
   */
  panByPixels(dx, dy) {
    if (this.viewMode === 'solarsystem') {
      this.helioYaw += dx * 0.0065;
      this.helioPitch = Math.max(0.08, Math.min(Math.PI * 0.49, this.helioPitch + dy * 0.0065));
      return;
    }

    const degPerPx = this.fov / Math.min(this.width, this.height);
    if (this.viewMode === 'celestial') {
      const cosFactor = Math.max(0.25, Math.cos(this.centerDec * DEG2RAD));
      this.centerRA = ((this.centerRA + (dx * degPerPx) / cosFactor) % 360 + 360) % 360;
      this.centerDec = Math.max(-89.9, Math.min(89.9, this.centerDec + dy * degPerPx));
      this._updateCache();
      return;
    }

    let effDx = dx;
    let effDy = dy;
    if (this.viewMode === 'telescope') {
      if (this.opticalOrientation === 'inverted') {
        effDx = -dx;
        effDy = -dy;
      } else if (this.opticalOrientation === 'mirror') {
        effDx = -dx;
      }
    }

    const cosFactor = Math.max(0.2, Math.cos(this.centerAlt * DEG2RAD));
    this.centerAz = ((this.centerAz - (effDx * degPerPx) / cosFactor) % 360 + 360) % 360;
    this.centerAlt = Math.max(-85, Math.min(89.9, this.centerAlt + effDy * degPerPx));
    this._updateCache();
  }

  /**
   * Center view on horizontal (altDeg, azDeg) and/or equatorial (raDeg, decDeg)
   */
  centerOn(coords) {
    if (coords.alt !== undefined && coords.az !== undefined) {
      this.centerAlt = Math.max(-85, Math.min(89.9, coords.alt));
      this.centerAz = ((coords.az % 360) + 360) % 360;
    }
    if (coords.ra !== undefined && coords.dec !== undefined) {
      this.centerRA = ((coords.ra % 360) + 360) % 360;
      this.centerDec = Math.max(-89.9, Math.min(89.9, coords.dec));
    }
    this._updateCache();
  }
}
