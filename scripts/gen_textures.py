#!/usr/bin/env python3
"""
Generate high-quality equirectangular planetary textures and Milky Way panorama in assets/textures/,
plus PWA icons in assets/icons/icon-192.png and assets/icons/icon-512.png.
"""
import math
import os
import random
from png_writer import write_png


def fbm2d(x, y, seed=0):
    """Fast deterministic trigonometric multi-octave turbulence in 2D."""
    v = (
        0.50 * math.sin(x * 2.1 + y * 1.7 + seed) * math.cos(x * 1.3 - y * 2.3 + seed * 0.7)
        + 0.25 * math.sin(x * 4.7 - y * 3.9 + seed * 1.3) * math.cos(x * 3.8 + y * 4.2 - seed)
        + 0.15 * math.sin(x * 9.3 + y * 8.1 - seed * 2.1) * math.cos(x * 7.9 - y * 9.7 + seed)
        + 0.10 * math.sin(x * 18.7 - y * 17.3 + seed * 3.1)
    )
    return v


def gen_sun(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    spots = [(1.8, 0.28, 0.08), (3.9, -0.22, 0.065), (5.1, 0.18, 0.05)]
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (y / (H - 1) - 0.5) * math.pi
        cos_lat = math.cos(lat)
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            n = fbm2d(lon * 4.0 * cos_lat, lat * 8.0, 11)
            gran = math.sin(lon * 36.0 * cos_lat + n * 4.0) * math.cos(lat * 36.0 - n * 4.0)
            val = 0.86 + 0.10 * n + 0.06 * gran
            # Sunspots
            for slon, slat, srad in spots:
                d = math.hypot((lon - slon) * cos_lat, lat - slat)
                if d < srad * 2.2:
                    umbra = math.exp(-(d / (srad * 0.55)) ** 2) * 0.72
                    penumbra = math.exp(-(d / srad) ** 2) * 0.35
                    val -= max(umbra, penumbra)
            val = max(0.15, min(1.15, val))
            r = min(255, int(255 * min(1.0, val * 1.08)))
            g = min(255, int(210 * (val ** 1.15)))
            b = min(255, int(95 * (val ** 1.8)))
            p = off + 1 + x * 3
            raw[p], raw[p + 1], raw[p + 2] = r, g, b
    write_png(filepath, W, H, raw, color_type=2)


def gen_moon(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    # Lunar maria: (lon_rad, lat_rad, rx, ry, darkness)
    maria = [
        (2.80, 0.58, 0.52, 0.36, 0.42),   # Mare Imbrium
        (3.45, 0.48, 0.32, 0.28, 0.40),   # Mare Serenitatis
        (3.65, 0.15, 0.38, 0.26, 0.38),   # Mare Tranquillitatis
        (4.12, 0.29, 0.22, 0.20, 0.40),   # Mare Crisium
        (2.15, 0.18, 0.65, 0.52, 0.36),   # Oceanus Procellarum
        (2.85, -0.32, 0.35, 0.25, 0.32),  # Mare Nubium
        (3.95, -0.15, 0.28, 0.22, 0.34),  # Mare Fecunditatis
    ]
    craters = [
        (2.94, -0.75, 0.14, 0.38),  # Tycho with bright rays
        (2.79, 0.17, 0.12, 0.32),   # Copernicus
        (2.48, 0.14, 0.09, 0.26),   # Kepler
        (4.05, -0.45, 0.11, 0.20),
        (1.45, 0.52, 0.13, 0.18),
    ]
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        cos_lat = max(0.05, math.cos(lat))
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            n = fbm2d(lon * 3.5 * cos_lat, lat * 7.0, 23)
            c_small = math.sin(lon * 28.0 * cos_lat + n * 3.0) * math.cos(lat * 28.0 - n * 2.0)
            alb = 0.68 + 0.12 * n + 0.05 * c_small
            for mlon, mlat, rx, ry, dark in maria:
                dx = ((lon - mlon + math.pi) % (2 * math.pi) - math.pi) * cos_lat / rx
                dy = (lat - mlat) / ry
                d2 = dx * dx + dy * dy
                if d2 < 2.5:
                    alb -= dark * math.exp(-d2 * 1.2)
            for clon, clat, crad, cbr in craters:
                dx = ((lon - clon + math.pi) % (2 * math.pi) - math.pi) * cos_lat
                dy = lat - clat
                d = math.hypot(dx, dy)
                if d < crad * 4.5:
                    ang = math.atan2(dy, dx)
                    rays = max(0.0, math.cos(ang * 7.0)) * math.exp(-d / (crad * 2.2))
                    rim = math.exp(-((d - crad * 0.45) / (crad * 0.18)) ** 2)
                    alb += cbr * (0.65 * rim + 0.45 * rays)
            alb = max(0.18, min(0.96, alb))
            r = int(alb * 242)
            g = int(alb * 238)
            b = int(alb * 230)
            p = off + 1 + x * 3
            raw[p], raw[p + 1], raw[p + 2] = r, g, b
    write_png(filepath, W, H, raw, color_type=2)


def gen_mercury(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        cos_lat = max(0.05, math.cos(lat))
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            n = fbm2d(lon * 4.2 * cos_lat, lat * 8.4, 37)
            cr = math.sin(lon * 22.0 * cos_lat + n * 2.5) * math.cos(lat * 22.0 - n * 2.5)
            # Caloris Basin near lon=2.8, lat=0.5
            d_cal = math.hypot((lon - 2.8) * cos_lat, lat - 0.52)
            cal = 0.14 * math.exp(-(d_cal / 0.45) ** 2) * math.cos(d_cal * 18.0)
            v = max(0.22, min(0.92, 0.56 + 0.14 * n + 0.08 * cr + cal))
            p = off + 1 + x * 3
            raw[p] = int(v * 218)
            raw[p + 1] = int(v * 204)
            raw[p + 2] = int(v * 188)
    write_png(filepath, W, H, raw, color_type=2)


def gen_venus(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            # V-shaped super-rotation cloud bands
            chevron = lon + 1.4 * math.cosh(lat * 1.4)
            band = math.sin(chevron * 2.0 + fbm2d(lon * 2.0, lat * 4.0, 41) * 1.8)
            v = 0.78 + 0.12 * band + 0.06 * math.cos(lat * 3.0)
            v = max(0.35, min(1.0, v))
            p = off + 1 + x * 3
            raw[p] = min(255, int(v * 252))
            raw[p + 1] = min(255, int(v * 218))
            raw[p + 2] = min(255, int(v * 148))
    write_png(filepath, W, H, raw, color_type=2)


def gen_earth(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    # Approximate continental blobs (lon_deg, lat_deg, rx_deg, ry_deg)
    continents = [
        (-100, 42, 32, 22), (-60, -18, 20, 28), (15, 48, 24, 16),
        (20, 5, 24, 28), (85, 38, 48, 24), (135, -25, 18, 12)
    ]
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat_deg = (0.5 - y / (H - 1)) * 180.0
        lat = math.radians(lat_deg)
        for x in range(W):
            lon_deg = (x / W) * 360.0 - 180.0
            lon = math.radians(lon_deg)
            n = fbm2d(lon * 3.0, lat * 6.0, 53)
            land = 0.0
            for clon, clat, rx, ry in continents:
                d2 = ((lon_deg - clon) / rx) ** 2 + ((lat_deg - clat) / ry) ** 2
                land = max(land, math.exp(-d2 * 1.35) + 0.32 * n)
            # Polar ice caps
            if abs(lat_deg) > 72.0 + 6.0 * n:
                r, g, b = 240, 246, 252
            elif land > 0.58:
                # Forest / desert / mountain gradient
                arid = max(0.0, min(1.0, 1.0 - abs(abs(lat_deg) - 24.0) / 18.0 + 0.3 * n))
                r = int(55 + arid * 135)
                g = int(125 + arid * 45)
                b = int(48 + arid * 35)
            else:
                # Deep ocean + coastal shelf
                shelf = max(0.0, land - 0.35) * 2.2
                r = int(18 + shelf * 30)
                g = int(58 + shelf * 85)
                b = int(138 + shelf * 65)
            # Cloud swirls
            clouds = max(0.0, fbm2d(lon * 4.5 + 1.2, lat * 8.0, 99) - 0.12) * 1.4
            if clouds > 0.0:
                c = min(0.85, clouds)
                r = int(r * (1.0 - c) + 250 * c)
                g = int(g * (1.0 - c) + 252 * c)
                b = int(b * (1.0 - c) + 255 * c)
            p = off + 1 + x * 3
            raw[p], raw[p + 1], raw[p + 2] = min(255, r), min(255, g), min(255, b)
    write_png(filepath, W, H, raw, color_type=2)


def gen_mars(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    # Albedo features: Syrtis Major, Mare Acidalium, Hellas Basin, Tharsis/Olympus
    dark_features = [
        (1.22, 0.16, 0.25, 0.35, 0.38),   # Syrtis Major
        (5.75, 0.68, 0.45, 0.28, 0.30),   # Mare Acidalium
        (4.80, -0.38, 0.55, 0.22, 0.28),  # Mare Sirenum / Cimmerium
    ]
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        cos_lat = max(0.05, math.cos(lat))
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            n = fbm2d(lon * 3.5 * cos_lat, lat * 7.0, 67)
            # Polar CO2/water ice caps
            if abs(lat) > 1.34 + 0.06 * n:
                p = off + 1 + x * 3
                raw[p], raw[p + 1], raw[p + 2] = 245, 240, 235
                continue
            v = 0.78 + 0.14 * n
            for flon, flat, rx, ry, dark in dark_features:
                dx = ((lon - flon + math.pi) % (2 * math.pi) - math.pi) * cos_lat / rx
                dy = (lat - flat) / ry
                d2 = dx * dx + dy * dy
                if d2 < 2.5:
                    v -= dark * math.exp(-d2 * 1.1)
            # Valles Marineris canyon near lon=5.0, lat=-0.12
            if abs(lon - 5.0) < 0.55 and abs(lat + 0.12 + 0.04 * math.sin(lon * 8.0)) < 0.045:
                v -= 0.26
            # Hellas bright impact basin near lon=1.2, lat=-0.72
            d_hel = math.hypot((lon - 1.22) * cos_lat, lat + 0.72)
            if d_hel < 0.38:
                v += 0.18 * math.exp(-(d_hel / 0.25) ** 2)
            v = max(0.22, min(1.05, v))
            p = off + 1 + x * 3
            raw[p] = min(255, int(v * 226))
            raw[p + 1] = min(255, int((v ** 1.25) * 124))
            raw[p + 2] = min(255, int((v ** 1.55) * 76))
    write_png(filepath, W, H, raw, color_type=2)


def gen_jupiter(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    # Great Red Spot at lon = 3.6 rad, lat = -0.38 rad (-22 deg)
    grs_lon, grs_lat = 3.60, -0.38
    grs_rx, grs_ry = 0.34, 0.18

    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            # Zonal bands (EZ, NEB, SEB, NTB, STB, polar hoods)
            turb = 0.035 * math.sin(lon * 9.0 + math.sin(lat * 14.0) * 2.5)
            lat_eff = lat + turb

            # Multi-frequency atmospheric belts and zones
            b1 = math.cos(lat_eff * 11.5)
            b2 = math.sin(lat_eff * 23.0 + 0.6)
            festoon = math.sin(lon * 14.0 + lat_eff * 18.0) * math.exp(-((lat_eff - 0.14) / 0.12) ** 2)

            # Base color interpolation between cream zones and rust-brown belts
            zone_w = 0.5 + 0.35 * b1 + 0.15 * b2
            zone_w = max(0.0, min(1.0, zone_w))
            r = 168 + zone_w * 78 - festoon * 18
            g = 118 + zone_w * 98 - festoon * 10
            b = 82 + zone_w * 92 + festoon * 14

            # Polar darkening
            polar = math.exp(-((abs(lat) - 1.45) / 0.35) ** 2) if abs(lat) > 1.1 else 0.0
            r = r * (1.0 - 0.32 * polar) + 115 * 0.32 * polar
            g = g * (1.0 - 0.32 * polar) + 110 * 0.32 * polar
            b = b * (1.0 - 0.32 * polar) + 105 * 0.32 * polar

            # Great Red Spot anticyclone
            dx = ((lon - grs_lon + math.pi) % (2 * math.pi) - math.pi) / grs_rx
            dy = (lat - grs_lat) / grs_ry
            d2 = dx * dx + dy * dy
            if d2 < 2.2:
                swirl = math.sin(math.sqrt(d2) * 8.0 + math.atan2(dy, dx) * 2.0)
                w = math.exp(-d2 * 1.4)
                ring = math.exp(-((math.sqrt(d2) - 0.95) / 0.22) ** 2)
                r = r * (1.0 - w) + (228 + 16 * swirl) * w + 25 * ring
                g = g * (1.0 - w) + (92 + 14 * swirl) * w + 20 * ring
                b = b * (1.0 - w) + (64 + 10 * swirl) * w + 18 * ring

            p = off + 1 + x * 3
            raw[p] = min(255, max(0, int(r)))
            raw[p + 1] = min(255, max(0, int(g)))
            raw[p + 2] = min(255, max(0, int(b)))
    write_png(filepath, W, H, raw, color_type=2)


def gen_saturn(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            ripple = 0.012 * math.sin(lon * 6.0 + lat * 12.0)
            le = lat + ripple
            band = 0.55 + 0.28 * math.cos(le * 9.5) + 0.12 * math.sin(le * 19.0)
            # North polar hexagon near lat = +1.35 rad
            hex_mod = 0.04 * math.cos(6.0 * lon) if abs(lat) > 1.22 else 0.0
            polar = max(0.0, (abs(lat) - 1.15) / 0.42)
            r = (195 + 52 * band) * (1.0 - 0.28 * polar)
            g = (172 + 48 * band) * (1.0 - 0.22 * polar)
            b = (122 + 38 * (band + hex_mod)) * (1.0 - 0.10 * polar)
            p = off + 1 + x * 3
            raw[p] = min(255, max(0, int(r)))
            raw[p + 1] = min(255, max(0, int(g)))
            raw[p + 2] = min(255, max(0, int(b)))
    write_png(filepath, W, H, raw, color_type=2)


def gen_saturn_rings(filepath, W=512, H=64):
    """
    Generate radial RGBA strip for Saturn's rings (u=0 inner edge -> u=1 outer edge):
    - C Ring (0.05..0.28): faint translucent slate-gold
    - B Ring (0.28..0.62): dense bright cream-gold with fine ringlets
    - Cassini Division (0.62..0.68): dark gap
    - A Ring (0.68..0.92): medium-bright gold-ivory with Encke gap at 0.86
    - F Ring (0.95..0.97): narrow outer strand
    """
    raw = bytearray(H * (1 + W * 4))
    stride = 1 + W * 4
    row_pixels = bytearray(W * 4)
    for x in range(W):
        u = x / (W - 1)
        ringlet = 0.06 * math.sin(u * 240.0) + 0.04 * math.cos(u * 95.0)
        if u < 0.05:
            r, g, b, a = 0, 0, 0, 0
        elif u < 0.28:
            # C Ring (Crepe ring)
            t = (u - 0.05) / 0.23
            alpha = (0.14 + 0.18 * t + 0.03 * math.sin(u * 160.0))
            r, g, b, a = 185, 172, 148, int(alpha * 255)
        elif u < 0.62:
            # B Ring (brightest, highest optical depth)
            t = (u - 0.28) / 0.34
            bright = 0.88 + 0.10 * math.sin(t * math.pi) + ringlet
            alpha = min(0.95, max(0.65, 0.78 + 0.16 * math.sin(t * math.pi) + ringlet))
            r = min(255, int(242 * bright))
            g = min(255, int(224 * bright))
            b = min(255, int(186 * bright))
            a = int(alpha * 255)
        elif u < 0.68:
            # Cassini Division
            r, g, b, a = 120, 110, 95, 18
        elif u < 0.92:
            # A Ring with Encke Gap at u=0.86
            if 0.852 <= u <= 0.868:
                r, g, b, a = 110, 100, 88, 12
            else:
                bright = 0.78 + 0.5 * ringlet
                r = min(255, int(228 * bright))
                g = min(255, int(212 * bright))
                b = min(255, int(182 * bright))
                a = int(0.68 * 255)
        elif 0.95 <= u <= 0.968:
            # F Ring
            r, g, b, a = 220, 205, 175, 95
        else:
            r, g, b, a = 0, 0, 0, 0
        p = x * 4
        row_pixels[p : p + 4] = bytes((r, g, b, max(0, min(255, a))))

    for y in range(H):
        off = y * stride
        raw[off] = 0
        raw[off + 1 : off + stride] = row_pixels
    write_png(filepath, W, H, raw, color_type=6)


def gen_uranus(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        band = 0.90 + 0.06 * math.cos(lat * 6.0) + 0.04 * math.sin(lat * 3.0)
        hood = max(0.0, (lat - 0.6) / 0.95) * 0.12
        r = min(255, int((158 + 30 * hood) * band))
        g = min(255, int((224 + 18 * hood) * band))
        b = min(255, int((236 + 12 * hood) * band))
        for x in range(W):
            p = off + 1 + x * 3
            raw[p], raw[p + 1], raw[p + 2] = r, g, b
    write_png(filepath, W, H, raw, color_type=2)


def gen_neptune(filepath, W=512, H=256):
    raw = bytearray(H * (1 + W * 3))
    stride = 1 + W * 3
    for y in range(H):
        off = y * stride
        raw[off] = 0
        lat = (0.5 - y / (H - 1)) * math.pi
        for x in range(W):
            lon = (x / W) * 2.0 * math.pi
            band = 0.85 + 0.12 * math.cos(lat * 8.0) + 0.04 * math.sin(lon * 3.0 + lat * 10.0)
            # Great Dark Spot at lon=2.4, lat=-0.36
            dx = ((lon - 2.4 + math.pi) % (2 * math.pi) - math.pi) / 0.28
            dy = (lat + 0.36) / 0.16
            d2 = dx * dx + dy * dy
            gds = math.exp(-d2 * 1.5) * 0.32 if d2 < 2.2 else 0.0
            # Companion white methane cirrus clouds near edge of GDS
            cirrus = math.exp(-((dx - 0.35) ** 2 + (dy - 0.85) ** 2) * 6.0) * 0.45
            v = band - gds
            r = min(255, max(0, int(52 * v + 190 * cirrus)))
            g = min(255, max(0, int(108 * v + 215 * cirrus)))
            b = min(255, max(0, int(232 * v + 250 * cirrus)))
            p = off + 1 + x * 3
            raw[p], raw[p + 1], raw[p + 2] = r, g, b
    write_png(filepath, W, H, raw, color_type=2)


def gen_milkyway(filepath, W=1024, H=512):
    """
    Generate an equirectangular J2000 (RA 0..360 deg, Dec -90..+90 deg) Milky Way panorama
    with Galactic Center bulge in Sagittarius/Scorpius, Great Rift / Coalsack dark dust lanes,
    Carina/Cygnus star clouds, H-alpha emission knots, and Large & Small Magellanic Clouds.
    """
    raw = bytearray(H * (1 + W * 4))
    stride = 1 + W * 4

    # J2000 Galactic North Pole
    ra_gp = math.radians(192.85948)
    dec_gp = math.radians(27.12825)
    sin_dgp = math.sin(dec_gp)
    cos_dgp = math.cos(dec_gp)
    l_ncp = math.radians(122.93192)

    # Precompute RA trig table
    cos_dra = [0.0] * W
    sin_dra = [0.0] * W
    ra_rads = [0.0] * W
    for x in range(W):
        ra = (x / W) * 2.0 * math.pi
        ra_rads[x] = ra
        cos_dra[x] = math.cos(ra - ra_gp)
        sin_dra[x] = math.sin(ra - ra_gp)

    # LMC (RA 80.9 deg, Dec -69.8 deg) and SMC (RA 13.2 deg, Dec -72.8 deg)
    lmc_ra, lmc_dec = math.radians(80.89), math.radians(-69.76)
    smc_ra, smc_dec = math.radians(13.16), math.radians(-72.80)

    for y in range(H):
        off = y * stride
        raw[off] = 0
        dec = (0.5 - y / (H - 1)) * math.pi
        sin_dec = math.sin(dec)
        cos_dec = math.cos(dec)

        for x in range(W):
            # Convert equatorial (ra, dec) -> galactic (l, b)
            sin_b = sin_dec * sin_dgp + cos_dec * cos_dgp * cos_dra[x]
            sin_b = max(-1.0, min(1.0, sin_b))
            b = math.asin(sin_b)

            yy = cos_dec * sin_dra[x]
            xx = sin_dec * cos_dgp - cos_dec * sin_dgp * cos_dra[x]
            l = (l_ncp - math.atan2(yy, xx)) % (2.0 * math.pi)
            # Signed galactic longitude in [-pi, +pi] (0 = Galactic Center in Sgr)
            l_sym = ((l + math.pi) % (2.0 * math.pi)) - math.pi

            # Galactic disk + central bulge profile
            disk_width = 0.14 + 0.16 * math.exp(-(l_sym / 0.68) ** 2)
            disk = math.exp(-(b / disk_width) ** 2) * (0.35 + 0.65 * math.exp(-(l_sym / 2.1) ** 2))
            bulge = math.exp(-((l_sym / 0.42) ** 2 + (b / 0.24) ** 2)) * 0.95

            # Star clouds in Cygnus (l~1.35 rad), Carina (l~-1.35 rad), Scutum (l~0.48 rad)
            clouds = (
                0.32 * math.exp(-(((l_sym - 1.35) / 0.28) ** 2 + (b / 0.11) ** 2))
                + 0.38 * math.exp(-(((l_sym + 1.32) / 0.30) ** 2 + (b / 0.10) ** 2))
                + 0.35 * math.exp(-(((l_sym - 0.48) / 0.22) ** 2 + (b / 0.09) ** 2))
            )

            # Fine multi-scale structure along the galactic plane
            turb = fbm2d(l_sym * 3.5, b * 14.0, 77)
            intensity = max(0.0, (disk + bulge + clouds) * (0.78 + 0.32 * turb))

            # Great Rift dark dust lane running from Cygnus through Aquila to Sagittarius/Centaurus
            rift_center = 0.025 * math.sin(l_sym * 3.2)
            rift_w = 0.042 + 0.018 * math.cos(l_sym * 5.0)
            if abs(l_sym) < 1.85:
                rift = math.exp(-((b - rift_center) / rift_w) ** 2) * (0.68 + 0.25 * math.sin(l_sym * 9.0))
                intensity *= max(0.18, 1.0 - rift)

            # Check LMC / SMC
            ra = ra_rads[x]
            if dec < -0.95:
                dlmc = math.hypot((ra - lmc_ra) * cos_dec, dec - lmc_dec)
                dsmc = math.hypot((ra - smc_ra) * cos_dec, dec - smc_dec)
                if dlmc < 0.22:
                    intensity += 0.62 * math.exp(-(dlmc / 0.075) ** 2)
                if dsmc < 0.15:
                    intensity += 0.48 * math.exp(-(dsmc / 0.048) ** 2)

            if intensity < 0.015:
                continue

            intensity = min(1.0, intensity)
            # Warm golden-amber core blending into cool silvery-blue outer disk
            core_w = math.exp(-((l_sym / 0.55) ** 2 + (b / 0.22) ** 2))
            r = int(intensity * (155 + 95 * core_w))
            g = int(intensity * (172 + 48 * core_w))
            b_col = int(intensity * (225 - 45 * core_w))
            a = int((intensity ** 0.85) * 235)

            p = off + 1 + x * 4
            raw[p] = min(255, r)
            raw[p + 1] = min(255, g)
            raw[p + 2] = min(255, b_col)
            raw[p + 3] = min(255, a)

    write_png(filepath, W, H, raw, color_type=6)


def gen_pwa_icon(filepath, size):
    """Render a crisp astronomical planetarium PWA icon (size x size RGBA)."""
    raw = bytearray(size * (1 + size * 4))
    stride = 1 + size * 4
    cx = cy = size * 0.5
    rad_max = size * 0.46

    for y in range(size):
        off = y * stride
        raw[off] = 0
        dy = (y - cy) / rad_max
        for x in range(size):
            dx = (x - cx) / rad_max
            r2 = dx * dx + dy * dy
            if r2 > 1.08:
                continue
            r = math.sqrt(r2)
            # Deep space midnight gradient background inside rounded badge
            edge_aa = max(0.0, min(1.0, (1.04 - r) * 18.0))
            bg_r = int(10 + 18 * (1.0 - r))
            bg_g = int(16 + 28 * (1.0 - r))
            bg_b = int(38 + 64 * (1.0 - r))

            # Central golden-blue planet sphere (r < 0.42)
            pr = math.hypot(dx - 0.02, dy + 0.02) / 0.40
            # Tilted ring ellipse
            rx = dx * 0.88 - dy * 0.47
            ry = (dx * 0.47 + dy * 0.88) * 2.8
            ring_r = math.hypot(rx, ry)
            in_ring = 0.52 <= ring_r <= 0.86

            col_r, col_g, col_b = bg_r, bg_g, bg_b

            # Back half of ring (dy < 0)
            if in_ring and (dx * 0.47 + dy * 0.88) < 0:
                w = math.sin((ring_r - 0.52) / 0.34 * math.pi)
                col_r = int(col_r * (1 - 0.75 * w) + 235 * 0.75 * w)
                col_g = int(col_g * (1 - 0.75 * w) + 195 * 0.75 * w)
                col_b = int(col_b * (1 - 0.75 * w) + 125 * 0.75 * w)

            # Planet body
            if pr <= 1.0:
                pz = math.sqrt(max(0.0, 1.0 - pr * pr))
                illum = max(0.18, (-0.45 * dx - 0.55 * dy + 0.70 * pz))
                col_r = min(255, int(75 + 165 * illum))
                col_g = min(255, int(125 + 115 * illum))
                col_b = min(255, int(195 + 60 * illum))

            # Front half of ring
            if in_ring and (dx * 0.47 + dy * 0.88) >= 0:
                w = math.sin((ring_r - 0.52) / 0.34 * math.pi)
                col_r = int(col_r * (1 - 0.88 * w) + 248 * 0.88 * w)
                col_g = int(col_g * (1 - 0.88 * w) + 212 * 0.88 * w)
                col_b = int(col_b * (1 - 0.88 * w) + 142 * 0.88 * w)

            # Bright 4-pointed star in upper left (-0.52, -0.48)
            sdx, sdy = abs(dx + 0.52), abs(dy + 0.48)
            star_glow = math.exp(-(sdx * sdx + sdy * sdy) * 90.0) + math.exp(-sdx * 45.0) * math.exp(-sdy * 8.0) + math.exp(-sdy * 45.0) * math.exp(-sdx * 8.0)
            if star_glow > 0.02:
                sw = min(1.0, star_glow)
                col_r = min(255, int(col_r + 255 * sw))
                col_g = min(255, int(col_g + 248 * sw))
                col_b = min(255, int(col_b + 220 * sw))

            p = off + 1 + x * 4
            raw[p] = col_r
            raw[p + 1] = col_g
            raw[p + 2] = col_b
            raw[p + 3] = int(edge_aa * 255)

    write_png(filepath, size, size, raw, color_type=6)


def main():
    os.makedirs("assets/textures", exist_ok=True)
    os.makedirs("assets/icons", exist_ok=True)

    tasks = [
        ("assets/textures/sun.png", gen_sun),
        ("assets/textures/moon.png", gen_moon),
        ("assets/textures/mercury.png", gen_mercury),
        ("assets/textures/venus.png", gen_venus),
        ("assets/textures/earth.png", gen_earth),
        ("assets/textures/mars.png", gen_mars),
        ("assets/textures/jupiter.png", gen_jupiter),
        ("assets/textures/saturn.png", gen_saturn),
        ("assets/textures/saturn_rings.png", gen_saturn_rings),
        ("assets/textures/uranus.png", gen_uranus),
        ("assets/textures/neptune.png", gen_neptune),
        ("assets/textures/milkyway.png", gen_milkyway),
    ]
    for path, fn in tasks:
        fn(path)
        print(f"Generated {path} ({os.path.getsize(path)} bytes)")

    gen_pwa_icon("assets/icons/icon-192.png", 192)
    gen_pwa_icon("assets/icons/icon-512.png", 512)
    print("Generated PWA icons assets/icons/icon-192.png and assets/icons/icon-512.png.")


if __name__ == "__main__":
    main()
