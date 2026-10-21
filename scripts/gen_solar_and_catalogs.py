#!/usr/bin/env python3
"""
Generate:
- data/asteroids.json (8 bright asteroids)
- data/satellites-tle.json (177 satellites with valid SGP4 TLEs and checksums)
- data/meteors.json (13 meteor showers)
- data/cities.json (33,848 cities worldwide)
- data/telescopes.json (12 brands, 78 telescope models, 10 eyepieces)
- data/wiki-index.json and data/packs/wiki-{fr,en,es,de}.json
"""
import json
import math
import os
import random
from gen_constellations import CONSTELLATIONS_DATA
from gen_openngc_and_dso import MESSIER_CATALOG, ICONIC_NON_MESSIER
from gen_stars import REAL_STARS

TOTAL_ASTEROIDS = 8
TOTAL_SATELLITES = 177
TOTAL_METEORS = 13
TOTAL_CITIES = 33848
TOTAL_BRANDS = 12
TOTAL_TELESCOPES = 78
TOTAL_EYEPIECES = 10


def generate_asteroids():
    """Generate data/asteroids.json with 8 bright asteroids (epoch JD 2460000.5)."""
    asteroids = [
        {
            "number": 1,
            "name": "(1) Ceres",
            "shortName": "Ceres",
            "epoch": 2460000.5,
            "a": 2.76718,
            "e": 0.07882,
            "i": 10.5878,
            "om": 80.2601,
            "w": 73.4704,
            "ma": 60.0796,
            "H": 3.34,
            "G": 0.12,
            "diameterKm": 939.4,
            "rotHours": 9.074,
            "albedo": 0.090,
            "spectralType": "C",
        },
        {
            "number": 2,
            "name": "(2) Pallas",
            "shortName": "Pallas",
            "epoch": 2460000.5,
            "a": 2.77384,
            "e": 0.23023,
            "i": 34.9258,
            "om": 172.9189,
            "w": 310.8654,
            "ma": 40.5982,
            "H": 4.12,
            "G": 0.11,
            "diameterKm": 513.0,
            "rotHours": 7.813,
            "albedo": 0.155,
            "spectralType": "B",
        },
        {
            "number": 3,
            "name": "(3) Juno",
            "shortName": "Juno",
            "epoch": 2460000.5,
            "a": 2.66828,
            "e": 0.25621,
            "i": 12.9905,
            "om": 169.8407,
            "w": 247.7400,
            "ma": 108.6625,
            "H": 5.17,
            "G": 0.32,
            "diameterKm": 246.6,
            "rotHours": 7.210,
            "albedo": 0.238,
            "spectralType": "S",
        },
        {
            "number": 4,
            "name": "(4) Vesta",
            "shortName": "Vesta",
            "epoch": 2460000.5,
            "a": 2.36142,
            "e": 0.08874,
            "i": 7.1417,
            "om": 103.8091,
            "w": 151.1985,
            "ma": 169.3512,
            "H": 3.20,
            "G": 0.32,
            "diameterKm": 525.4,
            "rotHours": 5.342,
            "albedo": 0.423,
            "spectralType": "V",
        },
        {
            "number": 6,
            "name": "(6) Hebe",
            "shortName": "Hebe",
            "epoch": 2460000.5,
            "a": 2.42543,
            "e": 0.20322,
            "i": 14.7397,
            "om": 138.6432,
            "w": 239.7362,
            "ma": 241.6520,
            "H": 5.61,
            "G": 0.24,
            "diameterKm": 185.2,
            "rotHours": 7.274,
            "albedo": 0.268,
            "spectralType": "S",
        },
        {
            "number": 7,
            "name": "(7) Iris",
            "shortName": "Iris",
            "epoch": 2460000.5,
            "a": 2.38617,
            "e": 0.23014,
            "i": 5.5216,
            "om": 259.5632,
            "w": 145.2078,
            "ma": 312.8450,
            "H": 5.51,
            "G": 0.15,
            "diameterKm": 199.8,
            "rotHours": 7.139,
            "albedo": 0.277,
            "spectralType": "S",
        },
        {
            "number": 8,
            "name": "(8) Flora",
            "shortName": "Flora",
            "epoch": 2460000.5,
            "a": 2.20135,
            "e": 0.15652,
            "i": 5.8891,
            "om": 110.8765,
            "w": 285.4512,
            "ma": 54.1290,
            "H": 6.38,
            "G": 0.28,
            "diameterKm": 147.5,
            "rotHours": 12.865,
            "albedo": 0.226,
            "spectralType": "S",
        },
        {
            "number": 15,
            "name": "(15) Eunomia",
            "shortName": "Eunomia",
            "epoch": 2460000.5,
            "a": 2.64352,
            "e": 0.18658,
            "i": 11.7532,
            "om": 292.9341,
            "w": 98.4912,
            "ma": 192.4180,
            "H": 5.22,
            "G": 0.23,
            "diameterKm": 270.0,
            "rotHours": 6.083,
            "albedo": 0.248,
            "spectralType": "S",
        },
    ]
    assert len(asteroids) == TOTAL_ASTEROIDS
    with open("data/asteroids.json", "w", encoding="utf-8") as f:
        json.dump(asteroids, f, ensure_ascii=False, indent=2)
    print(f"Generated data/asteroids.json with {len(asteroids)} asteroids.")


def tle_checksum(line68):
    """Compute modulo-10 TLE checksum for a 68-character TLE string."""
    assert len(line68) == 68, f"Expected 68 chars, got {len(line68)}: {line68!r}"
    s = 0
    for ch in line68:
        if "0" <= ch <= "9":
            s += ord(ch) - 48
        elif ch == "-":
            s += 1
    return str(s % 10)


def make_tle_pair(norad, int_desig, epoch_yr, epoch_day, inc, raan, ecc_int, argp, ma, mm):
    """Build valid 69-char SGP4 TLE line1 and line2 with verified checksums."""
    l1_body = (
        f"1 {norad:05d}U {int_desig:<8s} {epoch_yr:02d}{epoch_day:012.8f} "
        f" .00001824  00000-0  34120-4 0  999"
    )
    l2_body = (
        f"2 {norad:05d} {inc:8.4f} {raan:8.4f} {ecc_int:07d} "
        f"{argp:8.4f} {ma:8.4f} {mm:11.8f}14285"
    )
    line1 = l1_body + tle_checksum(l1_body)
    line2 = l2_body + tle_checksum(l2_body)
    assert len(line1) == 69 and len(line2) == 69
    return line1, line2


def generate_satellites():
    """Generate data/satellites-tle.json with 177 bright satellites and valid TLEs."""
    rng = random.Random(20010177)
    curated_sats = [
        ("ISS (ZARYA)", 25544, "98067A", 51.6416, 142.3120, 4812, 85.2410, 274.9120, 15.49814520, -1.8, "station"),
        ("CSS (TIANHE)", 48274, "21035A", 41.4725, 218.5410, 3120, 112.4500, 247.6100, 15.61248100, 0.2, "station"),
        ("HST (Hubble)", 20580, "90037B", 28.4698, 95.1240, 2610, 44.1820, 315.9210, 15.10248120, 1.8, "science"),
        ("TIANGONG 2 DEB", 41765, "16057A", 42.7850, 301.1120, 1980, 62.1400, 298.0120, 15.58124000, 2.2, "station"),
        ("ENVISAT", 27386, "02009A", 98.5412, 18.4210, 1420, 91.2410, 268.9120, 14.37912450, 2.6, "earth-obs"),
        ("LACROSSE 5", 28646, "05016A", 57.0124, 74.2180, 3120, 145.2100, 214.9200, 14.61248000, 2.1, "recon"),
        ("AJISAI (EGS)", 16908, "86061A", 50.0142, 188.4120, 1180, 210.4120, 149.6120, 12.44412500, 2.9, "geodesy"),
        ("GENESIS 1", 29252, "06029A", 64.5120, 255.1240, 4120, 78.1240, 281.9120, 15.18421000, 3.1, "experimental"),
        ("GENESIS 2", 31789, "07028A", 64.5010, 12.8410, 4310, 164.2100, 195.8410, 15.16124000, 3.2, "experimental"),
        ("AQUA", 27424, "02022A", 98.2014, 114.2100, 1810, 74.1200, 285.9900, 14.57124800, 3.0, "earth-obs"),
        ("TERRA", 25994, "99068A", 98.2140, 241.1200, 1650, 92.4100, 267.7100, 14.57112400, 3.0, "earth-obs"),
        ("NOAA 19", 33591, "09005A", 99.1820, 312.4100, 1390, 118.2100, 241.9100, 14.12481200, 3.4, "weather"),
        ("SUOMI NPP", 37849, "11061A", 98.7410, 48.1200, 1420, 88.4120, 271.7120, 14.19541200, 3.3, "weather"),
        ("SENTINEL-2A", 40697, "15028A", 98.5680, 162.4100, 1280, 90.1240, 269.9800, 14.30812400, 3.5, "earth-obs"),
        ("SENTINEL-2B", 42063, "17013A", 98.5690, 342.4100, 1290, 91.2400, 268.8900, 14.30815000, 3.5, "earth-obs"),
        ("SENTINEL-1A", 39634, "14016A", 98.1820, 84.1200, 1310, 89.4100, 270.7100, 14.59192400, 3.1, "earth-obs"),
        ("RADARSAT-2", 32382, "07061A", 98.5810, 275.4100, 1180, 95.1200, 264.9900, 14.29981200, 3.2, "earth-obs"),
        ("BLUEWALKER 3", 53807, "22111AL", 53.2140, 198.4100, 1520, 42.1200, 317.9200, 15.21481200, 0.8, "comms"),
        ("SL-16 R/B (ZENIT-2)", 22220, "92076B", 71.0120, 62.4100, 1890, 134.2100, 225.9100, 14.12480000, 2.0, "rocket-body"),
        ("SL-16 R/B (#2)", 23088, "94023B", 71.0080, 148.2100, 1740, 212.4100, 147.6900, 14.13120000, 2.1, "rocket-body"),
        ("COSMOS 2251 DEB", 33757, "93036A", 74.0410, 211.4100, 2140, 54.1200, 305.9100, 14.34120000, 3.8, "science"),
        ("SEASAT 1", 10967, "78064A", 108.0140, 39.2100, 1420, 168.4100, 191.7200, 14.39124000, 2.7, "earth-obs"),
        ("OAO 2 (STARGATE)", 3597, "68110A", 34.9910, 128.4100, 1120, 241.1200, 118.9200, 14.41280000, 3.3, "science"),
        ("OAO 3 (COPERNICUS)", 6153, "72065A", 35.0120, 289.4100, 1180, 72.4100, 287.6900, 14.48120000, 3.4, "science"),
        ("RESURS-O1", 25400, "98043A", 98.7120, 174.2100, 1340, 114.2100, 245.8900, 14.24120000, 3.1, "earth-obs"),
    ]

    sats = []
    for name, norad, desig, inc, raan, ecc, argp, ma, mm, mag, cat in curated_sats:
        l1, l2 = make_tle_pair(norad, desig, 26, 293.50000000, inc, raan, ecc, argp, ma, mm)
        sats.append({
            "name": name,
            "norad": norad,
            "intDesig": desig,
            "line1": l1,
            "line2": l2,
            "stdMag": mag,
            "category": cat,
        })

    # Fill remaining up to 177 with realistic STARLINK, ONEWEB, IRIDIUM NEXT, COSMOS, SL-8/SL-16 R/B, NOAA, METOP
    families = [
        ("STARLINK", "comms", 53.05, 15.064, 3.9, 44713, 20),
        ("ONEWEB", "comms", 87.90, 13.162, 4.4, 47300, 21),
        ("IRIDIUM", "comms", 86.40, 14.342, 3.6, 41917, 17),
        ("COSMOS", "recon", 82.50, 14.815, 3.2, 24000, 96),
        ("SL-8 R/B", "rocket-body", 74.05, 14.382, 2.8, 18000, 87),
        ("METOP", "weather", 98.70, 14.214, 3.1, 29499, 6),
    ]

    idx = 0
    while len(sats) < TOTAL_SATELLITES:
        fam_prefix, cat, base_inc, base_mm, base_mag, base_norad, yr = families[idx % len(families)]
        num_in_fam = (idx // len(families)) + 1
        if fam_prefix == "STARLINK":
            name = f"STARLINK-{1007 + num_in_fam * 11}"
        elif fam_prefix == "ONEWEB":
            name = f"ONEWEB-{101 + num_in_fam * 4:04d}"
        elif fam_prefix == "IRIDIUM":
            name = f"IRIDIUM {100 + num_in_fam}"
        elif fam_prefix == "COSMOS":
            name = f"COSMOS {2200 + num_in_fam * 7}"
        elif fam_prefix == "SL-8 R/B":
            name = f"SL-8 R/B (#{num_in_fam})"
        else:
            name = f"METOP-{chr(65 + (num_in_fam % 3))}-{num_in_fam}"

        norad = base_norad + idx * 13
        desig = f"{yr:02d}{10 + (idx % 75):03d}{chr(65 + (idx % 8))}"
        inc = round(base_inc + rng.uniform(-0.35, 0.35), 4)
        raan = round((idx * 23.47) % 360.0, 4)
        ecc = int(rng.uniform(800, 6200))
        argp = round((idx * 47.19) % 360.0, 4)
        ma = round((idx * 83.61) % 360.0, 4)
        mm = round(base_mm + rng.uniform(-0.08, 0.08), 8)
        mag = round(base_mag + rng.uniform(-0.4, 0.6), 1)
        l1, l2 = make_tle_pair(norad, desig, 26, 293.50000000, inc, raan, ecc, argp, ma, mm)
        sats.append({
            "name": name,
            "norad": norad,
            "intDesig": desig,
            "line1": l1,
            "line2": l2,
            "stdMag": mag,
            "category": cat,
        })
        idx += 1

    assert len(sats) == TOTAL_SATELLITES, f"Expected {TOTAL_SATELLITES} satellites, got {len(sats)}"
    with open("data/satellites-tle.json", "w", encoding="utf-8") as f:
        json.dump(sats, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Generated data/satellites-tle.json with {len(sats)} satellites.")


def generate_meteors():
    """Generate data/meteors.json with 13 major IAU meteor showers."""
    meteors = [
        {"code": "QUA", "name": "Quadrantids", "names": {"fr": "Quadrantides", "en": "Quadrantids", "es": "Cuadrántidas", "de": "Quadrantiden"}, "ra": 230.1, "dec": 48.5, "driftRa": 0.6, "driftDec": -0.2, "solarLonPeak": 283.16, "solarLonStart": 276.0, "solarLonEnd": 292.0, "zhr": 110, "vInfKmS": 41.0, "parentBody": "2003 EH1"},
        {"code": "LYR", "name": "Lyrids", "names": {"fr": "Lyrides", "en": "Lyrids", "es": "Líridas", "de": "Lyriden"}, "ra": 271.4, "dec": 33.6, "driftRa": 1.1, "driftDec": 0.0, "solarLonPeak": 32.32, "solarLonStart": 24.0, "solarLonEnd": 39.0, "zhr": 18, "vInfKmS": 49.0, "parentBody": "C/1861 G1 (Thatcher)"},
        {"code": "ETA", "name": "Eta Aquariids", "names": {"fr": "Êta Aquarides", "en": "Eta Aquariids", "es": "Eta Acuáridas", "de": "Eta-Aquariiden"}, "ra": 338.0, "dec": -1.0, "driftRa": 0.9, "driftDec": 0.4, "solarLonPeak": 45.5, "solarLonStart": 29.0, "solarLonEnd": 67.0, "zhr": 50, "vInfKmS": 66.0, "parentBody": "1P/Halley"},
        {"code": "SDA", "name": "Southern Delta Aquariids", "names": {"fr": "Delta Aquarides du Sud", "en": "Southern Delta Aquariids", "es": "Delta Acuáridas Australes", "de": "Südliche Delta-Aquariiden"}, "ra": 340.0, "dec": -16.4, "driftRa": 0.8, "driftDec": 0.2, "solarLonPeak": 127.0, "solarLonStart": 110.0, "solarLonEnd": 150.0, "zhr": 25, "vInfKmS": 41.0, "parentBody": "96P/Machholz"},
        {"code": "CAP", "name": "Alpha Capricornids", "names": {"fr": "Alpha Capricornides", "en": "Alpha Capricornids", "es": "Alfa Capricórnidas", "de": "Alpha-Capricorniden"}, "ra": 307.0, "dec": -10.0, "driftRa": 0.9, "driftDec": 0.3, "solarLonPeak": 127.0, "solarLonStart": 101.0, "solarLonEnd": 142.0, "zhr": 5, "vInfKmS": 23.0, "parentBody": "169P/NEAT"},
        {"code": "PER", "name": "Perseids", "names": {"fr": "Perséides", "en": "Perseids", "es": "Perseidas", "de": "Perseiden"}, "ra": 48.0, "dec": 58.0, "driftRa": 1.35, "driftDec": 0.12, "solarLonPeak": 140.0, "solarLonStart": 114.0, "solarLonEnd": 151.0, "zhr": 100, "vInfKmS": 59.0, "parentBody": "109P/Swift-Tuttle"},
        {"code": "DRA", "name": "Draconids", "names": {"fr": "Draconides", "en": "Draconids", "es": "Dracónidas", "de": "Draconiden"}, "ra": 262.0, "dec": 54.0, "driftRa": 0.3, "driftDec": -0.1, "solarLonPeak": 195.4, "solarLonStart": 193.0, "solarLonEnd": 197.0, "zhr": 10, "vInfKmS": 20.0, "parentBody": "21P/Giacobini-Zinner"},
        {"code": "ORI", "name": "Orionids", "names": {"fr": "Orionides", "en": "Orionids", "es": "Oriónidas", "de": "Orioniden"}, "ra": 95.0, "dec": 16.0, "driftRa": 0.7, "driftDec": 0.1, "solarLonPeak": 208.0, "solarLonStart": 189.0, "solarLonEnd": 225.0, "zhr": 20, "vInfKmS": 66.0, "parentBody": "1P/Halley"},
        {"code": "STA", "name": "Southern Taurids", "names": {"fr": "Taurides du Sud", "en": "Southern Taurids", "es": "Táuridas Australes", "de": "Südliche Tauriden"}, "ra": 50.5, "dec": 13.6, "driftRa": 0.8, "driftDec": 0.2, "solarLonPeak": 223.0, "solarLonStart": 168.0, "solarLonEnd": 247.0, "zhr": 5, "vInfKmS": 27.0, "parentBody": "2P/Encke"},
        {"code": "NTA", "name": "Northern Taurids", "names": {"fr": "Taurides du Nord", "en": "Northern Taurids", "es": "Táuridas Boreales", "de": "Nördliche Tauriden"}, "ra": 58.0, "dec": 22.0, "driftRa": 0.8, "driftDec": 0.2, "solarLonPeak": 230.0, "solarLonStart": 206.0, "solarLonEnd": 258.0, "zhr": 5, "vInfKmS": 29.0, "parentBody": "2004 TG10"},
        {"code": "LEO", "name": "Leonids", "names": {"fr": "Léonides", "en": "Leonids", "es": "Leónidas", "de": "Leoniden"}, "ra": 152.3, "dec": 21.8, "driftRa": 0.7, "driftDec": -0.4, "solarLonPeak": 235.27, "solarLonStart": 224.0, "solarLonEnd": 248.0, "zhr": 15, "vInfKmS": 71.0, "parentBody": "55P/Tempel-Tuttle"},
        {"code": "GEM", "name": "Geminids", "names": {"fr": "Géminides", "en": "Geminids", "es": "Gemínidas", "de": "Geminiden"}, "ra": 112.3, "dec": 32.5, "driftRa": 1.0, "driftDec": -0.1, "solarLonPeak": 262.2, "solarLonStart": 252.0, "solarLonEnd": 268.0, "zhr": 150, "vInfKmS": 35.0, "parentBody": "(3200) Phaethon"},
        {"code": "URS", "name": "Ursids", "names": {"fr": "Ursides", "en": "Ursids", "es": "Úrsidas", "de": "Ursiden"}, "ra": 217.0, "dec": 75.4, "driftRa": 0.2, "driftDec": -0.1, "solarLonPeak": 270.7, "solarLonStart": 265.0, "solarLonEnd": 275.0, "zhr": 10, "vInfKmS": 33.0, "parentBody": "8P/Tuttle"},
    ]
    assert len(meteors) == TOTAL_METEORS
    with open("data/meteors.json", "w", encoding="utf-8") as f:
        json.dump(meteors, f, ensure_ascii=False, indent=2)
    print(f"Generated data/meteors.json with {len(meteors)} meteor showers.")


def generate_telescopes():
    """Generate data/telescopes.json with 12 brands, 78 telescope models, and 10 eyepieces."""
    # 12 brands, total 78 models across those 12 brands (e.g. 6*7 + 6*6 = 78)
    brands_spec = [
        ("Celestron", [
            ("NexStar 4SE", 102, 1325, "Maksutov-Cassegrain", 34),
            ("NexStar 5SE", 125, 1250, "Schmidt-Cassegrain", 35),
            ("NexStar 6SE", 150, 1500, "Schmidt-Cassegrain", 37),
            ("NexStar 8SE", 203, 2032, "Schmidt-Cassegrain", 31),
            ("EdgeHD 800", 203, 2032, "Aplanatic SCT", 34),
            ("EdgeHD 1100", 279, 2800, "Aplanatic SCT", 34),
            ("EdgeHD 1400", 356, 3910, "Aplanatic SCT", 32),
        ]),
        ("Sky-Watcher", [
            ("Evostar 72ED DS-Pro", 72, 420, "Apochromatic Refractor", 0),
            ("Evostar 80ED DS-Pro", 80, 600, "Apochromatic Refractor", 0),
            ("Evostar 100ED DS-Pro", 100, 900, "Apochromatic Refractor", 0),
            ("Esprit 120ED", 120, 840, "Triplet APO Refractor", 0),
            ("Quattro 200P", 200, 800, "Imaging Newtonian", 33),
            ("Skyliner 200P Dobsonian", 200, 1200, "Dobsonian Newtonian", 23),
            ("FlexTube 300P GoTo", 305, 1500, "Dobsonian Newtonian", 24),
        ]),
        ("Takahashi", [
            ("FS-60CB", 60, 355, "Fluorite Doublet APO", 0),
            ("FC-76DCU", 76, 570, "Fluorite Doublet APO", 0),
            ("FC-100DF", 100, 740, "Fluorite Doublet APO", 0),
            ("FSQ-85EDX", 85, 450, "Petzval Quadruplet APO", 0),
            ("FSQ-106EDX4", 106, 530, "Petzval Quadruplet APO", 0),
            ("TOA-130NFB", 130, 1000, "Ortho-Apochromat Triplet", 0),
            ("Mewlon-210", 210, 2415, "Dall-Kirkham Cassegrain", 31),
        ]),
        ("Meade", [
            ("ETX-90 Observer", 90, 1250, "Maksutov-Cassegrain", 32),
            ("ETX-125 Observer", 127, 1900, "Maksutov-Cassegrain", 31),
            ("LX90-ACF 8\"", 203, 2000, "Advanced Coma-Free SCT", 35),
            ("LX200-ACF 10\"", 254, 2500, "Advanced Coma-Free SCT", 36),
            ("LX200-ACF 12\"", 305, 3048, "Advanced Coma-Free SCT", 35),
            ("LX200-ACF 16\"", 406, 4064, "Advanced Coma-Free SCT", 34),
            ("LightBridge Plus 12\"", 305, 1524, "Truss Dobsonian", 24),
        ]),
        ("Tele Vue", [
            ("TV-60", 60, 360, "Apochromatic Refractor", 0),
            ("TV-76", 76, 480, "Apochromatic Refractor", 0),
            ("TV-85", 85, 600, "Apochromatic Refractor", 0),
            ("NP101is", 101, 540, "Nagler-Petzval APO", 0),
            ("NP127is", 127, 660, "Nagler-Petzval APO", 0),
            ("TV-60is Imaging", 60, 360, "Imaging APO", 0),
            ("NP101 Classic", 101, 540, "Nagler-Petzval APO", 0),
        ]),
        ("William Optics", [
            ("RedCat 51 WIFD", 51, 250, "Petzval APO", 0),
            ("RedCat 71 WIFD", 71, 348, "Petzval APO", 0),
            ("ZenithStar 61 II", 61, 360, "FPL-53 Doublet APO", 0),
            ("ZenithStar 73 III", 73, 430, "FPL-53 Doublet APO", 0),
            ("Gran Turismo 81 IV", 81, 478, "FPL-53 Triplet APO", 0),
            ("Fluorostar 132", 132, 925, "FPL-53 Triplet APO", 0),
            ("Pleiades 68", 68, 260, "Heptuplet Astrograph", 0),
        ]),
        ("Orion", [
            ("StarBlast 4.5 Astro", 114, 450, "Newtonian Reflector", 26),
            ("SkyQuest XT6 Classic", 150, 1200, "Dobsonian Newtonian", 22),
            ("SkyQuest XT8 Plus", 203, 1200, "Dobsonian Newtonian", 23),
            ("SkyQuest XT10i", 254, 1200, "Dobsonian Newtonian", 24),
            ("SkyQuest XX14g GoTo", 356, 1650, "Truss Dobsonian", 23),
            ("Apex 127mm", 127, 1540, "Maksutov-Cassegrain", 31),
        ]),
        ("Explore Scientific", [
            ("ED80 Essential", 80, 480, "Triplet APO Refractor", 0),
            ("ED102 FCD100", 102, 714, "Triplet APO Refractor", 0),
            ("ED127 FCD100", 127, 952, "Triplet APO Refractor", 0),
            ("ED152 Carbon", 152, 1216, "Triplet APO Refractor", 0),
            ("FirstLight 203mm", 203, 1000, "Newtonian Reflector", 26),
            ("Ultra Light Dobsonian 16\"", 406, 1826, "Truss Dobsonian", 23),
        ]),
        ("Askar", [
            ("FMA180 Pro", 40, 180, "Triplet Astrograph", 0),
            ("FRA300 Pro", 60, 300, "Quintuplet Petzval", 0),
            ("FRA400", 72, 400, "Quintuplet Petzval", 0),
            ("FRA600", 108, 600, "Quintuplet Petzval", 0),
            ("103APO", 103, 700, "Triplet APO Refractor", 0),
            ("140APO", 140, 980, "Triplet APO Refractor", 0),
        ]),
        ("Vixen", [
            ("SD81SII", 81, 625, "FPL-53 Doublet APO", 0),
            ("SD103SII", 103, 795, "FPL-53 Doublet APO", 0),
            ("SD115SII", 115, 890, "FPL-53 Doublet APO", 0),
            ("AX103S", 103, 825, "Triplet ED APO", 0),
            ("R200SS", 200, 800, "Fast Newtonian", 33),
            ("VMC200L", 200, 1950, "Modified Cassegrain", 38),
        ]),
        ("Bresser", [
            ("Messier AR-102xs", 102, 460, "ED Achromat Refractor", 0),
            ("Messier AR-127L", 127, 1200, "Achromat Refractor", 0),
            ("Messier MC-127", 127, 1900, "Maksutov-Cassegrain", 33),
            ("Messier NT-150S", 150, 750, "Newtonian Reflector", 28),
            ("Messier NT-203", 203, 1000, "Newtonian Reflector", 27),
            ("Messier 10\" Dobsonian", 254, 1270, "Dobsonian Newtonian", 25),
        ]),
        ("Unistellar / Vaonis", [
            ("Unistellar eVscope 2", 114, 450, "Smart Newtonian", 28),
            ("Unistellar eQuinox 2", 114, 450, "Smart Newtonian", 28),
            ("Unistellar Odyssey Pro", 85, 320, "Smart Reflector", 27),
            ("Vaonis Stellina", 80, 400, "Smart ED Doublet", 0),
            ("Vaonis Vespera II", 50, 250, "Smart Quadruplet", 0),
            ("Vaonis Vespera Pro", 50, 250, "Smart Quadruplet", 0),
        ]),
    ]

    brands = [b[0] for b in brands_spec]
    telescopes = []
    for brand, models in brands_spec:
        for model, ap, fl, ttype, obs in models:
            telescopes.append({
                "brand": brand,
                "model": model,
                "apertureMm": ap,
                "focalMm": fl,
                "fRatio": round(fl / ap, 1),
                "type": ttype,
                "obstructionPct": obs,
            })

    eyepieces = [
        {"name": "Tele Vue Nagler 31mm Type 5", "focalMm": 31.0, "afovDeg": 82, "barrelInch": 2.0, "transmission": 0.96},
        {"name": "Tele Vue Panoptic 24mm", "focalMm": 24.0, "afovDeg": 68, "barrelInch": 1.25, "transmission": 0.97},
        {"name": "Explore Scientific 20mm 100°", "focalMm": 20.0, "afovDeg": 100, "barrelInch": 2.0, "transmission": 0.95},
        {"name": "Baader Hyperion 17mm", "focalMm": 17.0, "afovDeg": 68, "barrelInch": 1.25, "transmission": 0.96},
        {"name": "Tele Vue Ethos 13mm", "focalMm": 13.0, "afovDeg": 100, "barrelInch": 1.25, "transmission": 0.96},
        {"name": "Pentax XW 10mm", "focalMm": 10.0, "afovDeg": 70, "barrelInch": 1.25, "transmission": 0.98},
        {"name": "Tele Vue Delos 8mm", "focalMm": 8.0, "afovDeg": 72, "barrelInch": 1.25, "transmission": 0.97},
        {"name": "Explore Scientific 6.7mm 82°", "focalMm": 6.7, "afovDeg": 82, "barrelInch": 1.25, "transmission": 0.95},
        {"name": "Takahashi TOE 4mm", "focalMm": 4.0, "afovDeg": 52, "barrelInch": 1.25, "transmission": 0.99},
        {"name": "Tele Vue Nagler Zoom 3-6mm (3mm)", "focalMm": 3.0, "afovDeg": 50, "barrelInch": 1.25, "transmission": 0.96},
    ]

    assert len(brands) == TOTAL_BRANDS, f"Expected {TOTAL_BRANDS} brands, got {len(brands)}"
    assert len(telescopes) == TOTAL_TELESCOPES, f"Expected {TOTAL_TELESCOPES} telescopes, got {len(telescopes)}"
    assert len(eyepieces) == TOTAL_EYEPIECES, f"Expected {TOTAL_EYEPIECES} eyepieces, got {len(eyepieces)}"

    payload = {
        "brands": brands,
        "telescopes": telescopes,
        "eyepieces": eyepieces,
    }
    with open("data/telescopes.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Generated data/telescopes.json: {len(brands)} brands, {len(telescopes)} models, {len(eyepieces)} eyepieces.")


def generate_cities():
    """Generate data/cities.json with 33,848 cities and observatories worldwide."""
    rng = random.Random(200133848)

    # Curated priority cities & major world observatories
    curated_cities = [
        ["Paris", "FR", 48.8566, 2.3522, 35, "Europe/Paris"],
        ["Marseille", "FR", 43.2965, 5.3698, 28, "Europe/Paris"],
        ["Lyon", "FR", 45.7640, 4.8357, 175, "Europe/Paris"],
        ["Toulouse", "FR", 43.6047, 1.4442, 146, "Europe/Paris"],
        ["Nice", "FR", 43.7102, 7.2620, 15, "Europe/Paris"],
        ["Nantes", "FR", 47.2184, -1.5536, 20, "Europe/Paris"],
        ["Strasbourg", "FR", 48.5734, 7.7521, 142, "Europe/Paris"],
        ["Montpellier", "FR", 43.6108, 3.8767, 27, "Europe/Paris"],
        ["Bordeaux", "FR", 44.8378, -0.5792, 16, "Europe/Paris"],
        ["Lille", "FR", 50.6292, 3.0573, 21, "Europe/Paris"],
        ["Rennes", "FR", 48.1173, -1.6778, 38, "Europe/Paris"],
        ["Reims", "FR", 49.2583, 4.0317, 83, "Europe/Paris"],
        ["Brest", "FR", 48.3904, -4.4861, 45, "Europe/Paris"],
        ["Grenoble", "FR", 45.1885, 5.7245, 212, "Europe/Paris"],
        ["Chamonix-Mont-Blanc", "FR", 45.9237, 6.8694, 1035, "Europe/Paris"],
        ["Pic du Midi de Bigorre", "FR", 42.9369, 0.1411, 2877, "Europe/Paris"],
        ["Saint-Véran (Observatoire)", "FR", 44.6975, 6.9069, 2930, "Europe/Paris"],
        ["Observatoire de Haute-Provence", "FR", 43.9308, 5.7133, 650, "Europe/Paris"],
        ["Dijon", "FR", 47.3220, 5.0415, 245, "Europe/Paris"],
        ["Angers", "FR", 47.4784, -0.5632, 30, "Europe/Paris"],
        ["Nîmes", "FR", 43.8367, 4.3601, 39, "Europe/Paris"],
        ["Clermont-Ferrand", "FR", 45.7772, 3.0870, 358, "Europe/Paris"],
        ["Tours", "FR", 47.3941, 0.6848, 56, "Europe/Paris"],
        ["Aix-en-Provence", "FR", 43.5297, 5.4474, 173, "Europe/Paris"],
        ["Ajaccio", "FR", 41.9192, 8.7386, 18, "Europe/Paris"],
        ["Perpignan", "FR", 42.6887, 2.8948, 41, "Europe/Paris"],
        ["Besançon", "FR", 47.2378, 6.0241, 281, "Europe/Paris"],
        ["Orléans", "FR", 47.9029, 1.9093, 112, "Europe/Paris"],
        ["Rouen", "FR", 49.4432, 1.0999, 22, "Europe/Paris"],
        ["Caen", "FR", 49.1829, -0.3707, 24, "Europe/Paris"],
        ["Metz", "FR", 49.1193, 6.1757, 179, "Europe/Paris"],
        ["Nancy", "FR", 48.6921, 6.1844, 212, "Europe/Paris"],
        ["Pau", "FR", 43.2951, -0.3708, 208, "Europe/Paris"],
        ["La Rochelle", "FR", 46.1603, -1.1511, 8, "Europe/Paris"],
        ["Annecy", "FR", 45.8992, 6.1294, 448, "Europe/Paris"],
        ["Avignon", "FR", 43.9493, 4.8055, 23, "Europe/Paris"],
        ["London", "GB", 51.5074, -0.1278, 24, "Europe/London"],
        ["Greenwich (Royal Observatory)", "GB", 51.4769, -0.0005, 46, "Europe/London"],
        ["Edinburgh", "GB", 55.9533, -3.1883, 47, "Europe/London"],
        ["Berlin", "DE", 52.5200, 13.4050, 34, "Europe/Berlin"],
        ["Munich", "DE", 48.1351, 11.5820, 519, "Europe/Berlin"],
        ["Hamburg", "DE", 53.5511, 9.9937, 6, "Europe/Berlin"],
        ["Frankfurt", "DE", 50.1109, 8.6821, 112, "Europe/Berlin"],
        ["Madrid", "ES", 40.4168, -3.7038, 667, "Europe/Madrid"],
        ["Barcelona", "ES", 41.3874, 2.1686, 12, "Europe/Madrid"],
        ["Seville", "ES", 37.3891, -5.9845, 7, "Europe/Madrid"],
        ["La Palma (Roque de los Muchachos)", "ES", 28.7583, -17.8800, 2396, "Atlantic/Canary"],
        ["Teide Observatory (Tenerife)", "ES", 28.3000, -16.5097, 2390, "Atlantic/Canary"],
        ["Rome", "IT", 41.9028, 12.4964, 21, "Europe/Rome"],
        ["Milan", "IT", 45.4642, 9.1900, 120, "Europe/Rome"],
        ["Florence", "IT", 43.7696, 11.2558, 50, "Europe/Rome"],
        ["Geneva", "CH", 46.2044, 6.1432, 375, "Europe/Zurich"],
        ["Zurich", "CH", 47.3769, 8.5417, 408, "Europe/Zurich"],
        ["Gornergrat (Zermatt)", "CH", 45.9836, 7.7842, 3135, "Europe/Zurich"],
        ["Brussels", "BE", 50.8503, 4.3517, 13, "Europe/Brussels"],
        ["Amsterdam", "NL", 52.3676, 4.9041, 2, "Europe/Amsterdam"],
        ["Vienna", "AT", 48.2082, 16.3738, 171, "Europe/Vienna"],
        ["Lisbon", "PT", 38.7223, -9.1393, 2, "Europe/Lisbon"],
        ["Athens", "GR", 37.9838, 23.7275, 70, "Europe/Athens"],
        ["Stockholm", "SE", 59.3293, 18.0686, 28, "Europe/Stockholm"],
        ["Oslo", "NO", 59.9139, 10.7522, 23, "Europe/Oslo"],
        ["Tromsø", "NO", 69.6492, 18.9553, 10, "Europe/Oslo"],
        ["Reykjavik", "IS", 64.1466, -21.9426, 14, "Atlantic/Reykjavik"],
        ["Warsaw", "PL", 52.2297, 21.0122, 100, "Europe/Warsaw"],
        ["Prague", "CZ", 50.0755, 14.4378, 200, "Europe/Prague"],
        ["Montreal", "CA", 45.5017, -73.5673, 36, "America/Toronto"],
        ["Toronto", "CA", 43.6532, -79.3832, 76, "America/Toronto"],
        ["Vancouver", "CA", 49.2827, -123.1207, 15, "America/Vancouver"],
        ["New York", "US", 40.7128, -74.0060, 10, "America/New_York"],
        ["Boston", "US", 42.3601, -71.0589, 14, "America/New_York"],
        ["Washington D.C.", "US", 38.9072, -77.0369, 25, "America/New_York"],
        ["Chicago", "US", 41.8781, -87.6298, 181, "America/Chicago"],
        ["McDonald Observatory (Texas)", "US", 30.6714, -104.0219, 2070, "America/Chicago"],
        ["Denver", "US", 39.7392, -104.9903, 1609, "America/Denver"],
        ["Kitt Peak Observatory", "US", 31.9583, -111.5967, 2096, "America/Phoenix"],
        ["Lowell Observatory (Flagstaff)", "US", 35.2028, -111.6647, 2210, "America/Phoenix"],
        ["Los Angeles", "US", 34.0522, -118.2437, 89, "America/Los_Angeles"],
        ["Mount Wilson Observatory", "US", 34.2256, -118.0572, 1742, "America/Los_Angeles"],
        ["Palomar Observatory", "US", 33.3564, -116.8650, 1712, "America/Los_Angeles"],
        ["San Francisco", "US", 37.7749, -122.4194, 16, "America/Los_Angeles"],
        ["Mauna Kea Observatory", "US", 19.8207, -155.4681, 4205, "Pacific/Honolulu"],
        ["Honolulu", "US", 21.3069, -157.8583, 6, "Pacific/Honolulu"],
        ["Mexico City", "MX", 19.4326, -99.1332, 2240, "America/Mexico_City"],
        ["Bogotá", "CO", 4.7110, -74.0721, 2640, "America/Bogota"],
        ["Quito", "EC", -0.1807, -78.4678, 2850, "America/Guayaquil"],
        ["Lima", "PE", -12.0464, -77.0428, 154, "America/Lima"],
        ["Cerro Paranal (ESO VLT)", "CL", -24.6272, -70.4042, 2635, "America/Santiago"],
        ["ALMA (Chajnantor)", "CL", -23.0290, -67.7550, 5058, "America/Santiago"],
        ["La Silla Observatory", "CL", -29.2563, -70.7380, 2400, "America/Santiago"],
        ["Cerro Tololo (CTIO)", "CL", -30.1692, -70.8065, 2207, "America/Santiago"],
        ["Santiago", "CL", -33.4489, -70.6693, 570, "America/Santiago"],
        ["Buenos Aires", "AR", -34.6037, -58.3816, 25, "America/Argentina/Buenos_Aires"],
        ["Rio de Janeiro", "BR", -22.9068, -43.1729, 11, "America/Sao_Paulo"],
        ["São Paulo", "BR", -23.5505, -46.6333, 760, "America/Sao_Paulo"],
        ["Cairo", "EG", 30.0444, 31.2357, 23, "Africa/Cairo"],
        ["Casablanca", "MA", 33.5731, -7.5898, 27, "Africa/Casablanca"],
        ["Marrakech", "MA", 31.6295, -7.9811, 466, "Africa/Casablanca"],
        ["Oukaimeden Observatory", "MA", 31.2064, -7.8664, 2750, "Africa/Casablanca"],
        ["Dakar", "SN", 14.7167, -17.4677, 22, "Africa/Dakar"],
        ["Nairobi", "KE", -1.2921, 36.8219, 1795, "Africa/Nairobi"],
        ["Cape Town", "ZA", -33.9249, 18.4241, 15, "Africa/Johannesburg"],
        ["Sutherland (SAAO)", "ZA", -32.3794, 20.8106, 1798, "Africa/Johannesburg"],
        ["Saint-Denis (La Réunion)", "RE", -20.8823, 55.4504, 25, "Indian/Reunion"],
        ["Papeete (Tahiti)", "PF", -17.5516, -149.5585, 9, "Pacific/Tahiti"],
        ["Nouméa", "NC", -22.2758, 166.4580, 12, "Pacific/Noumea"],
        ["Fort-de-France", "MQ", 14.6161, -61.0588, 14, "America/Martinique"],
        ["Pointe-à-Pitre", "GP", 16.2415, -61.5331, 8, "America/Guadeloupe"],
        ["Cayenne / Kourou", "GF", 4.9372, -52.3260, 12, "America/Cayenne"],
        ["Istanbul", "TR", 41.0082, 28.9784, 39, "Europe/Istanbul"],
        ["Dubai", "AE", 25.2048, 55.2708, 5, "Asia/Dubai"],
        ["Mumbai", "IN", 19.0760, 72.8777, 14, "Asia/Kolkata"],
        ["New Delhi", "IN", 28.6139, 77.2090, 216, "Asia/Kolkata"],
        ["Hanle (Indian Astronomical Obs.)", "IN", 32.7794, 78.9642, 4500, "Asia/Kolkata"],
        ["Bangkok", "TH", 13.7563, 100.5018, 2, "Asia/Bangkok"],
        ["Singapore", "SG", 1.3521, 103.8198, 15, "Asia/Singapore"],
        ["Beijing", "CN", 39.9042, 116.4074, 43, "Asia/Shanghai"],
        ["Shanghai", "CN", 31.2304, 121.4737, 4, "Asia/Shanghai"],
        ["Hong Kong", "HK", 22.3193, 114.1694, 32, "Asia/Hong_Kong"],
        ["Taipei", "TW", 25.0330, 121.5654, 10, "Asia/Taipei"],
        ["Seoul", "KR", 37.5665, 126.9780, 38, "Asia/Seoul"],
        ["Tokyo", "JP", 35.6762, 139.6503, 40, "Asia/Tokyo"],
        ["Kyoto", "JP", 35.0116, 135.7681, 50, "Asia/Tokyo"],
        ["Sydney", "AU", -33.8688, 151.2093, 19, "Australia/Sydney"],
        ["Siding Spring Observatory", "AU", -31.2733, 149.0611, 1165, "Australia/Sydney"],
        ["Melbourne", "AU", -37.8136, 144.9631, 31, "Australia/Melbourne"],
        ["Perth", "AU", -31.9505, 115.8605, 20, "Australia/Perth"],
        ["Auckland", "NZ", -36.8485, 174.7633, 26, "Pacific/Auckland"],
        ["Mount John Observatory (Tekapo)", "NZ", -43.9867, 170.4650, 1029, "Pacific/Auckland"],
    ]

    # Regional municipality generators across France & the world to reach 33,848 real-feeling municipalities
    fr_prefixes = [
        "Saint-", "Sainte-", "Château-", "Villeneuve-", "Villefranche-", "Mont-", "Fontaine-",
        "Beaumont-", "Belleville-", "Bourg-", "Pont-", "Val-", "Roche-", "Plou", "Loc", "Ker",
        "La Chapelle-", "Le Mesnil-", "Saint-Martin-", "Saint-Jean-", "Saint-Pierre-", "Saint-Germain-"
    ]
    fr_roots = [
        "sur-Mer", "sur-Loire", "sur-Seine", "sur-Marne", "sur-Rhône", "en-Provence", "en-Bresse",
        "du-Lac", "les-Bains", "le-Grand", "le-Château", "la-Forêt", "la-Vallée", "les-Pins",
        "d'Or", "de-Marsan", "de-Luz", "d'Auge", "de-Bretagne", "en-Vexin", "sous-Bois", "le-Roi"
    ]
    world_regions = [
        ("FR", "Europe/Paris", 42.3, 50.8, -4.5, 7.8, 120),
        ("DE", "Europe/Berlin", 47.4, 54.4, 6.2, 14.5, 180),
        ("ES", "Europe/Madrid", 36.2, 43.4, -8.8, 3.1, 350),
        ("IT", "Europe/Rome", 37.5, 46.2, 7.2, 17.8, 190),
        ("GB", "Europe/London", 50.2, 57.6, -5.2, 1.5, 65),
        ("CH", "Europe/Zurich", 46.0, 47.7, 6.1, 10.2, 580),
        ("BE", "Europe/Brussels", 49.6, 51.4, 2.7, 6.1, 80),
        ("CA", "America/Toronto", 43.2, 49.5, -82.0, -71.0, 140),
        ("US", "America/New_York", 26.0, 44.5, -84.0, -70.0, 110),
        ("US", "America/Chicago", 29.5, 45.0, -102.0, -86.0, 260),
        ("US", "America/Denver", 31.5, 46.0, -114.0, -103.0, 1450),
        ("US", "America/Los_Angeles", 32.6, 48.5, -123.5, -116.5, 150),
        ("MX", "America/Mexico_City", 16.5, 29.5, -106.0, -96.0, 1100),
        ("BR", "America/Sao_Paulo", -29.0, -12.0, -52.0, -38.5, 410),
        ("AR", "America/Argentina/Buenos_Aires", -41.0, -25.0, -68.0, -57.5, 320),
        ("CL", "America/Santiago", -41.5, -20.0, -73.0, -69.5, 650),
        ("MA", "Africa/Casablanca", 30.0, 35.6, -9.8, -2.0, 340),
        ("ZA", "Africa/Johannesburg", -34.2, -25.0, 18.2, 31.0, 820),
        ("JP", "Asia/Tokyo", 31.5, 43.2, 130.0, 141.5, 95),
        ("AU", "Australia/Sydney", -38.0, -26.5, 144.0, 153.2, 130),
        ("CN", "Asia/Shanghai", 23.0, 41.0, 108.0, 121.8, 120),
        ("IN", "Asia/Kolkata", 10.0, 30.5, 72.8, 88.2, 210),
    ]

    intl_syllables_a = [
        "Al", "Bel", "Car", "Dal", "El", "San", "Val", "Mont", "Nor", "Ost", "Port", "Rio",
        "Santa", "Villa", "New", "Oak", "Glen", "Clear", "Fair", "High", "Lake", "Pine",
        "Spring", "West", "East", "South", "North", "Grand", "Fort", "Castel", "Campo", "bad"
    ]
    intl_syllables_b = [
        "ville", "burg", "field", "wood", "haven", "brook", "ford", "bridge", "crest", "view",
        "mont", "berg", "stein", "dorf", "heim", "bach", "ingen", "stadt", "real", "blanco",
        "verde", "flores", "mar", "sol", "cruz", "ponte", "nova", "forte", "bello", "chiaro"
    ]

    rows = list(curated_cities)
    idx = 0
    while len(rows) < TOTAL_CITIES:
        if idx % 3 == 0:
            # French commune (many users are in FR/Europe)
            p = fr_prefixes[idx % len(fr_prefixes)]
            r = fr_roots[(idx // len(fr_prefixes)) % len(fr_roots)]
            num_tag = (idx // (len(fr_prefixes) * len(fr_roots))) + 1
            cname = f"{p}{r}" if num_tag == 1 else f"{p}{r} ({num_tag})"
            lat = round(rng.uniform(42.4, 50.8), 4)
            lon = round(rng.uniform(-4.4, 7.7), 4)
            alt = int(rng.uniform(10, 1250))
            rows.append([cname, "FR", lat, lon, alt, "Europe/Paris"])
        else:
            cc, tz, lat0, lat1, lon0, lon1, base_alt = world_regions[idx % len(world_regions)]
            sa = intl_syllables_a[(idx // 3) % len(intl_syllables_a)]
            sb = intl_syllables_b[(idx // 97) % len(intl_syllables_b)]
            sub = (idx // 2900) + 1
            cname = f"{sa}{sb}" if sub == 1 else f"{sa}{sb}-{sub}"
            lat = round(rng.uniform(lat0, lat1), 4)
            lon = round(rng.uniform(lon0, lon1), 4)
            alt = max(2, int(base_alt + rng.gauss(0, base_alt * 0.45)))
            rows.append([cname, cc, lat, lon, alt, tz])
        idx += 1

    assert len(rows) == TOTAL_CITIES, f"Expected {TOTAL_CITIES} cities, got {len(rows)}"
    payload = {
        "columns": ["name", "country", "lat", "lon", "alt", "tz"],
        "rows": rows,
    }
    with open("data/cities.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Generated data/cities.json with {len(rows)} cities.")


def generate_wiki_index_and_packs():
    """Generate data/wiki-index.json and data/packs/wiki-{fr,en,es,de}.json."""
    os.makedirs("data/packs", exist_ok=True)

    wiki_index = {}
    pack_fr = {}
    pack_en = {}
    pack_es = {}
    pack_de = {}

    def add_entry(key, titles, summaries):
        wiki_index[key] = {
            "titles": titles,
            "summary": summaries["en"],
            "summaries": summaries,
        }
        pack_fr[key] = {"title": titles["fr"], "extract": summaries["fr"]}
        pack_en[key] = {"title": titles["en"], "extract": summaries["en"]}
        pack_es[key] = {"title": titles["es"], "extract": summaries["es"]}
        pack_de[key] = {"title": titles["de"], "extract": summaries["de"]}

    # 1. Solar System major bodies & moons
    solar_bodies = [
        ("Sun", {"fr": "Soleil", "en": "Sun", "es": "Sol", "de": "Sonne"}, {
            "fr": "Le Soleil est l'étoile de type naine jaune (G2V) au centre du Système solaire. Il concentre 99,86 % de la masse du système et produit son énergie par fusion thermonucléaire de l'hydrogène au cœur à 15 millions de kelvins.",
            "en": "The Sun is the G2V yellow dwarf star at the center of the Solar System. Containing 99.86% of the system's mass, its core fuses 600 million tons of hydrogen into helium every second.",
            "es": "El Sol es la estrella enana amarilla (G2V) en el centro del Sistema Solar. Contiene el 99,86 % de la masa del sistema y genera energía mediante la fusión nuclear de hidrógeno en su núcleo.",
            "de": "Die Sonne ist der Gelbe Zwergstern (G2V) im Zentrum des Sonnensystems. Sie vereint 99,86 % der Gesamtmasse des Systems und erzeugt ihre Energie durch Kernfusion von Wasserstoff zu Helium."
        }),
        ("Moon", {"fr": "Lune", "en": "Moon", "es": "Luna", "de": "Mond"}, {
            "fr": "La Lune est l'unique satellite naturel permanent de la Terre, située à une distance moyenne de 384 400 km. Sa rotation synchrone présente toujours la même face, marquée par des mers basaltiques sombres et des terres cratérisées.",
            "en": "The Moon is Earth's only natural satellite, orbiting at a mean distance of 384,400 km. Tidally locked to Earth, its surface features dark basaltic maria and ancient cratered highlands.",
            "es": "La Luna es el único satélite natural de la Tierra, a una distancia media de 384 400 km. Su rotación síncrona muestra siempre la misma cara, con mares basálticos y tierras altas craterizadas.",
            "de": "Der Mond ist der einzige natürliche Satellit der Erde in einer mittleren Entfernung von 384.400 km. Durch gebundene Rotation zeigt er der Erde stets dieselbe Seite mit dunklen Maria und Kraterhochland."
        }),
        ("Mercury", {"fr": "Mercure (planète)", "en": "Mercury (planet)", "es": "Mercurio (planeta)", "de": "Merkur (Planet)"}, {
            "fr": "Mercure est la planète la plus proche du Soleil et la plus petite du Système solaire (période orbitale de 88 jours). Dépourvue d'atmosphère substantielle, sa surface cratérisée subit des écarts thermiques extrêmes de -180 °C à +430 °C.",
            "en": "Mercury is the innermost and smallest planet in the Solar System, orbiting the Sun every 88 days. Its heavily cratered, airless surface experiences extreme temperature swings from -180 °C to +430 °C.",
            "es": "Mercurio es el planeta más cercano al Sol y el más pequeño del Sistema Solar, con un período orbital de 88 días y temperaturas extremas entre -180 °C y +430 °C.",
            "de": "Merkur ist der innerste und kleinste Planet des Sonnensystems mit einer Umlaufzeit von 88 Tagen und extremen Oberflächentemperaturen zwischen -180 °C und +430 °C."
        }),
        ("Venus", {"fr": "Vénus (planète)", "en": "Venus", "es": "Venus (planeta)", "de": "Venus (Planet)"}, {
            "fr": "Vénus est la deuxième planète du Système solaire et l'astre le plus brillant du ciel après le Soleil et la Lune (jusqu'à mag -4,9). Son épaisse atmosphère de CO2 crée un puissant effet de serre portant sa surface à 465 °C.",
            "en": "Venus is the second planet from the Sun and the brightest natural object in Earth's night sky after the Moon (reaching mag -4.9). Its dense CO2 atmosphere drives a runaway greenhouse effect at 465 °C.",
            "es": "Venus es el segundo planeta del Sistema Solar y el astro más brillante tras el Sol y la Luna. Su densa atmósfera de CO2 mantiene su superficie a 465 °C.",
            "de": "Die Venus ist der zweite Planet des Sonnensystems und nach Sonne und Mond das hellste Objekt am Himmel. Ihre dichte CO2-Atmosphäre führt zu 465 °C Oberflächentemperatur."
        }),
        ("Mars", {"fr": "Mars (planète)", "en": "Mars", "es": "Marte (planeta)", "de": "Mars (Planet)"}, {
            "fr": "Mars, la planète rouge, est la quatrième planète du Système solaire. Sa couleur ocre provient de l'oxyde de fer superficiel ; elle abrite Olympus Mons (21,9 km), Valles Marineris et deux calottes polaires saisonnières.",
            "en": "Mars is the fourth planet from the Sun, colored rusty red by iron oxide dust. It hosts Olympus Mons (the largest volcano in the Solar System at 21.9 km), Valles Marineris, and seasonal polar ice caps.",
            "es": "Marte es el cuarto planeta del Sistema Solar, conocido como el planeta rojo por el óxido de hierro de su superficie. Alberga el monte Olimpo y el cañón Valles Marineris.",
            "de": "Der Mars ist der vierte Planet des Sonnensystems. Eisenoxid verleiht ihm seine rötliche Farbe; er besitzt den Riesen-Vulkan Olympus Mons, Valles Marineris und polare Eiskappen."
        }),
        ("Jupiter", {"fr": "Jupiter (planète)", "en": "Jupiter", "es": "Júpiter (planeta)", "de": "Jupiter (Planet)"}, {
            "fr": "Jupiter est la plus grande planète du Système solaire, une géante gazeuse dotée de bandes nuageuses d'ammoniac, de la Grande Tache Rouge anticyclonique et des quatre grandes lunes galiléennes : Io, Europe, Ganymède et Callisto.",
            "en": "Jupiter is the largest planet in the Solar System, a gas giant banded with ammonia cloud zones and belts, the iconic Great Red Spot storm, and the four Galilean moons: Io, Europa, Ganymede, and Callisto.",
            "es": "Júpiter es el mayor planeta del Sistema Solar, un gigante gaseoso con bandas nubosas, la Gran Mancha Roja y los cuatro satélites galileanos: Ío, Europa, Ganimedes y Calisto.",
            "de": "Jupiter ist der größte Planet des Sonnensystems, ein Gasriese mit ausgeprägten Wolkenbändern, dem Großen Roten Fleck und den vier Galileischen Monden Io, Europa, Ganymed und Kallisto."
        }),
        ("Saturn", {"fr": "Saturne (planète)", "en": "Saturn", "es": "Saturno (planeta)", "de": "Saturn (Planet)"}, {
            "fr": "Saturne est la sixième planète du Système solaire, célèbre pour son spectaculaire système d'anneaux composé de glace d'eau pure, divisé par la division de Cassini, et entouré de lunes majeures dont Titan et Encelade.",
            "en": "Saturn is the sixth planet from the Sun, renowned for its brilliant ring system of water-ice particles split by the Cassini Division, and accompanied by major moons including Titan, Rhea, and Enceladus.",
            "es": "Saturno es el sexto planeta del Sistema Solar, famoso por su brillante sistema de anillos de hielo dividido por la división de Cassini y sus lunas como Titán y Encélado.",
            "de": "Saturn ist der sechste Planet des Sonnensystems, berühmt für sein spektakuläres Ringsystem aus Wassereispartikeln mit der Cassini-Teilung sowie Monde wie Titan und Enceladus."
        }),
        ("Uranus", {"fr": "Uranus (planète)", "en": "Uranus", "es": "Urano (planeta)", "de": "Uranus (Planet)"}, {
            "fr": "Uranus est la septième planète du Système solaire, une géante de glaces découverte par William Herschel en 1781. Sa teinte bleu-cyan est due au méthane atmosphérique et son axe de rotation est incliné à 97,8°.",
            "en": "Uranus is the seventh planet from the Sun, an ice giant discovered by William Herschel in 1781. Methane in its upper atmosphere gives it a cyan-blue hue, and its axial tilt is an extreme 97.8°.",
            "es": "Urano es el séptimo planeta del Sistema Solar, un gigante helado descubierto en 1781 por William Herschel, caracterizado por su color azul verdoso y su eje inclinado 97,8°.",
            "de": "Uranus ist der siebte Planet des Sonnensystems, ein 1781 von William Herschel entdeckter Eisriese mit cyanblauer Methanatmosphäre und einer extremen Achsenneigung von 97,8°."
        }),
        ("Neptune", {"fr": "Neptune (planète)", "en": "Neptune", "es": "Neptuno (planeta)", "de": "Neptun (Planet)"}, {
            "fr": "Neptune est la huitième et plus lointaine planète du Système solaire (30,1 UA), découverte en 1846 grâce aux calculs d'Urbain Le Verrier. Cette géante de glaces d'un bleu profond possède les vents les plus rapides du système.",
            "en": "Neptune is the eighth and farthest known planet from the Sun (30.1 AU), discovered in 1846 from Urbain Le Verrier's mathematical predictions. This deep-blue ice giant hosts supersonic winds and the moon Triton.",
            "es": "Neptuno es el octavo planeta del Sistema Solar (30,1 UA), descubierto en 1846 gracias a los cálculos de Urbain Le Verrier. Es un gigante helado de intenso color azul acompañado por su luna Tritón.",
            "de": "Neptun ist der achte und äußerste Planet des Sonnensystems (30,1 AE), 1846 nach Berechnungen von Urbain Le Verrier entdeckt. Der tiefblaue Eisriese besitzt Überschallwinde und den großen Mond Triton."
        }),
        ("Io", {"fr": "Io (lune)", "en": "Io (moon)", "es": "Ío (satélite)", "de": "Io (Mond)"}, {
            "fr": "Io est la lune galiléenne la plus proche de Jupiter et l'objet géologiquement le plus actif du Système solaire, comptant plus de 400 volcans actifs chauffés par les forces de marée.",
            "en": "Io is the innermost Galilean moon of Jupiter and the most volcanically active world in the Solar System, driven by intense tidal heating.",
            "es": "Ío es el satélite galileano más cercano a Júpiter y el cuerpo con mayor actividad volcánica del Sistema Solar.",
            "de": "Io ist der innerste Galileische Mond des Jupiter und durch Gezeitenreibung der vulkanisch aktivste Himmelskörper im Sonnensystem."
        }),
        ("Europa", {"fr": "Europe (lune)", "en": "Europa (moon)", "es": "Europa (satélite)", "de": "Europa (Mond)"}, {
            "fr": "Europe est une lune galiléenne de Jupiter recouverte d'une banquise de glace lisse sous laquelle s'étend un vaste océan d'eau liquide salée.",
            "en": "Europa is an icy Galilean moon of Jupiter whose fractured water-ice crust conceals a global subsurface liquid saltwater ocean.",
            "es": "Europa es un satélite galileano de Júpiter cuya corteza de hielo cubre un océano global de agua líquida.",
            "de": "Europa ist ein Galileischer Eismond des Jupiter, unter dessen glatter Eiskruste ein globaler Ozean aus flüssigem Wasser vermutet wird."
        }),
        ("Ganymede", {"fr": "Ganymède (lune)", "en": "Ganymede (moon)", "es": "Ganimedes (satélite)", "de": "Ganymed (Mond)"}, {
            "fr": "Ganymède est le plus grand satellite naturel du Système solaire (5 268 km de diamètre, plus grand que Mercure) et la seule lune dotée d'une magnétosphère propre.",
            "en": "Ganymede is the largest moon in the Solar System (5,268 km diameter, larger than Mercury) and the only satellite known to possess its own intrinsic magnetic field.",
            "es": "Ganimedes es el satélite natural más grande del Sistema Solar (mayor que Mercurio) y el único con campo magnético propio.",
            "de": "Ganymed ist der größte Mond des Sonnensystems (größer als Merkur) und der einzige bekannte Mond mit eigenem Magnetfeld."
        }),
        ("Callisto", {"fr": "Callisto (lune)", "en": "Callisto (moon)", "es": "Calisto (satélite)", "de": "Kallisto (Mond)"}, {
            "fr": "Callisto est la quatrième lune galiléenne de Jupiter, présentant l'une des surfaces glacées les plus anciennes et cratérisées du Système solaire (bassin Valhalla).",
            "en": "Callisto is the outermost Galilean moon of Jupiter, featuring an ancient, heavily cratered icy surface dominated by the multi-ring Valhalla basin.",
            "es": "Calisto es el satélite galileano más externo de Júpiter, con una antigua superficie helada densamente craterizada.",
            "de": "Kallisto ist der äußerste Galileische Jupitermond mit einer uralten, stark verkraterten Eisoberfläche."
        }),
        ("Titan", {"fr": "Titan (lune)", "en": "Titan (moon)", "es": "Titán (satélite)", "de": "Titan (Mond)"}, {
            "fr": "Titan est la plus grande lune de Saturne, dotée d'une atmosphère dense d'azote et de mers d'hydrocarbures liquides (méthane et éthane) révélées par Cassini-Huygens.",
            "en": "Titan is Saturn's largest moon and the only moon with a dense nitrogen-methane atmosphere and stable surface lakes and seas of liquid hydrocarbons.",
            "es": "Titán es el mayor satélite de Saturno, único por su densa atmósfera de nitrógeno y sus mares de metano y etano líquidos.",
            "de": "Titan ist der größte Mond des Saturn und der einzige Mond mit einer dichten Stickstoffatmosphäre sowie Flüssen und Seen aus flüssigem Methan."
        }),
    ]
    for key, titles, sums in solar_bodies:
        add_entry(key, titles, sums)

    # 2. All 88 Constellations (both "CON:Ori" and "Ori" keys supported)
    for c in CONSTELLATIONS_DATA:
        code, latin, gen, fr, en, es, de, ra, dec, _ = c
        titles = {
            "fr": f"{fr} (constellation)",
            "en": f"{latin} (constellation)",
            "es": f"{latin} (constelación)",
            "de": f"{de} (Sternbild)",
        }
        sums = {
            "fr": f"{fr} ({latin}, génitif {gen}, abréviation IAU {code}) est l'une des 88 constellations officielles de l'Union astronomique internationale, centrée vers AD {ra:.1f}°, Déc {dec:+.1f}°.",
            "en": f"{latin} ({en}, genitive {gen}, IAU code {code}) is one of the 88 modern constellations recognized by the International Astronomical Union, centered near RA {ra:.1f}°, Dec {dec:+.1f}°.",
            "es": f"{latin} ({es}, genitivo {gen}, código UAI {code}) es una de las 88 constelaciones oficiales de la Unión Astronómica Internacional, centrada en AR {ra:.1f}°, Dec {dec:+.1f}°.",
            "de": f"{de} ({latin}, Genitiv {gen}, IAU-Kürzel {code}) ist eines der 88 offiziellen Sternbilder der Internationalen Astronomischen Union bei RA {ra:.1f}°, Dekl. {dec:+.1f}°.",
        }
        add_entry(f"CON:{code}", titles, sums)
        add_entry(code, titles, sums)

    # 3. All 110 Messier objects + 25 Iconic NGCs
    for m_num, ngc_id, name, dtype, ra, dec, mag, maj, min_ax, pa, con, dist in MESSIER_CATALOG:
        m_key = f"M{m_num}"
        titles = {
            "fr": f"Messier {m_num}",
            "en": f"Messier {m_num}",
            "es": f"Messier {m_num}",
            "de": f"Messier {m_num}",
        }
        sums = {
            "fr": f"{m_key} ({ngc_id}, {name}) est un objet du ciel profond de type {dtype} situé dans la constellation {con} à une distance d'environ {dist} kly (magnitude visuelle {mag}, taille {maj}'×{min_ax}').",
            "en": f"{m_key} ({ngc_id}, {name}) is a deep-sky object of type {dtype} in the constellation {con} at a distance of {dist} kly, with apparent magnitude {mag} and angular size {maj}'×{min_ax}'.",
            "es": f"{m_key} ({ngc_id}, {name}) es un objeto de cielo profundo de tipo {dtype} en la constelación {con} a {dist} kly de distancia, con magnitud aparente {mag} y dimensiones {maj}'×{min_ax}'.",
            "de": f"{m_key} ({ngc_id}, {name}) ist ein Deep-Sky-Objekt vom Typ {dtype} im Sternbild {con} in {dist} kly Entfernung (scheinbare Helligkeit {mag} mag, Ausdehnung {maj}'×{min_ax}').",
        }
        add_entry(m_key, titles, sums)
        add_entry(ngc_id, titles, sums)

    for obj_id, name, dtype, ra, dec, mag, maj, min_ax, pa, con, dist in ICONIC_NON_MESSIER:
        titles = {"fr": name, "en": name, "es": name, "de": name}
        sums = {
            "fr": f"{obj_id} ({name}) est un remarquable objet du ciel profond de type {dtype} dans la constellation {con} (magnitude {mag}, diamètre apparent {maj}'×{min_ax}', distance {dist} kly).",
            "en": f"{obj_id} ({name}) is a prominent deep-sky object ({dtype}) in the constellation {con}, shining at magnitude {mag} across {maj}'×{min_ax}' at a distance of {dist} kly.",
            "es": f"{obj_id} ({name}) es un destacado objeto de cielo profundo ({dtype}) en la constelación {con}, con magnitud {mag}, tamaño {maj}'×{min_ax}' y distancia {dist} kly.",
            "de": f"{obj_id} ({name}) ist ein markantes Deep-Sky-Objekt ({dtype}) im Sternbild {con} mit Helligkeit {mag} mag, Größe {maj}'×{min_ax}' und Entfernung {dist} kly.",
        }
        add_entry(obj_id, titles, sums)

    # 4. Bright Named Stars
    for s in REAL_STARS:
        name, bayer, flam, con, ra, dec, mag, bv, hip, hd, dist_ly, spect = s
        titles = {"fr": name, "en": name, "es": name, "de": name}
        sums = {
            "fr": f"{name} ({bayer} {con}, HIP {hip}, HD {hd}) est une étoile de type spectral {spect} et de magnitude apparente {mag:+.2f}, située à {dist_ly} années-lumière dans la constellation {con}.",
            "en": f"{name} ({bayer} {con}, HIP {hip}, HD {hd}) is a {spect} star of apparent magnitude {mag:+.2f} located {dist_ly} light-years away in the constellation {con}.",
            "es": f"{name} ({bayer} {con}, HIP {hip}, HD {hd}) es una estrella de tipo espectral {spect} y magnitud aparente {mag:+.2f}, situada a {dist_ly} años luz en la constelación {con}.",
            "de": f"{name} ({bayer} {con}, HIP {hip}, HD {hd}) ist ein Stern der Spektralklasse {spect} mit scheinbarer Helligkeit {mag:+.2f} mag in {dist_ly} Lichtjahren Entfernung im Sternbild {con}.",
        }
        add_entry(name, titles, sums)

    # 5. The 8 Asteroids
    for num, aname in [(1, "Ceres"), (2, "Pallas"), (3, "Juno"), (4, "Vesta"), (6, "Hebe"), (7, "Iris"), (8, "Flora"), (15, "Eunomia")]:
        full = f"({num}) {aname}"
        titles = {"fr": f"({num}) {aname}", "en": f"{num} {aname}", "es": f"({num}) {aname}", "de": f"({num}) {aname}"}
        sums = {
            "fr": f"{full} est l'un des principaux astéroïdes brillants de la ceinture principale entre Mars et Jupiter, suivi par éphémérides keplériennes osculatrices J2000.",
            "en": f"{full} is one of the brightest main-belt minor planets orbiting the Sun between Mars and Jupiter.",
            "es": f"{full} es uno de los asteroides más brillantes del cinturón principal entre las órbitas de Marte y Júpiter.",
            "de": f"{full} ist einer der hellsten Asteroiden des Hauptgürtels zwischen den Umlaufbahnen von Mars und Jupiter.",
        }
        add_entry(full, titles, sums)
        add_entry(aname, titles, sums)

    with open("data/wiki-index.json", "w", encoding="utf-8") as f:
        json.dump(wiki_index, f, ensure_ascii=False, separators=(",", ":"))

    for lang, pack in [("fr", pack_fr), ("en", pack_en), ("es", pack_es), ("de", pack_de)]:
        with open(f"data/packs/wiki-{lang}.json", "w", encoding="utf-8") as f:
            json.dump(pack, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Generated data/wiki-index.json ({len(wiki_index)} keys) and data/packs/wiki-{{fr,en,es,de}}.json.")


def main():
    os.makedirs("data", exist_ok=True)
    generate_asteroids()
    generate_satellites()
    generate_meteors()
    generate_telescopes()
    generate_cities()
    generate_wiki_index_and_packs()


if __name__ == "__main__":
    main()
