#!/usr/bin/env python3
"""
Verify all generated data and asset files against the exact specification.
"""
import json
import os
import struct


def main():
    # 1. Verify data/stars.bin
    stars_bin = "data/stars.bin"
    assert os.path.isfile(stars_bin), "Missing data/stars.bin"
    sz = os.path.getsize(stars_bin)
    assert sz == 871136 * 8, f"Expected 6,969,088 bytes for stars.bin, got {sz}"
    with open(stars_bin, "rb") as f:
        buf = f.read()

    # Verify index 0 is Sirius at mag -1.46 (-1460) and sorted ascending up to index 871135 at mag 11.00 (11000)
    ra0, dec0, mag0, bv0, con0 = struct.unpack_from("<HhhbB", buf, 0)
    assert mag0 == -1460, f"Expected index 0 mag_i16 == -1460, got {mag0}"
    _, _, mag_last, _, _ = struct.unpack_from("<HhhbB", buf, (871136 - 1) * 8)
    assert mag_last == 11000, f"Expected last star mag_i16 == 11000, got {mag_last}"

    prev_mag = -32768
    for i in range(871136):
        _, _, m, _, c = struct.unpack_from("<HhhbB", buf, i * 8)
        assert m >= prev_mag, f"Non-monotonic magnitude at star {i}: {m} < {prev_mag}"
        assert 0 <= c <= 87, f"Invalid constellation index at star {i}: {c}"
        prev_mag = m

    # 2. Verify data/star-meta.json
    with open("data/star-meta.json", "r", encoding="utf-8") as f:
        smeta = json.load(f)
    assert len(smeta["names"]) == 3428, f"Expected 3428 names, got {len(smeta['names'])}"
    assert len(smeta["wds"]) == 3309, f"Expected 3309 WDS, got {len(smeta['wds'])}"
    assert len(smeta["gcvs"]) == 882, f"Expected 882 GCVS, got {len(smeta['gcvs'])}"
    assert smeta["names"]["0"][0] == "Sirius", f"Expected index 0 name Sirius, got {smeta['names']['0']}"

    # 3. Verify data/openngc.json and assets/dso/
    with open("data/openngc.json", "r", encoding="utf-8") as f:
        ngc = json.load(f)
    assert ngc["columns"] == ["id", "m", "name", "type", "ra", "dec", "mag", "sb", "maj", "min", "pa", "con", "dist", "photo"]
    assert len(ngc["rows"]) == 15618, f"Expected 15618 OpenNGC rows, got {len(ngc['rows'])}"
    photos = [r[13] for r in ngc["rows"] if r[13] is not None]
    assert len(photos) == 135, f"Expected 135 DSO photos in openngc.json, got {len(photos)}"
    for p in photos:
        p_path = os.path.join("assets/dso", p)
        assert os.path.isfile(p_path) and os.path.getsize(p_path) > 100, f"Missing or empty DSO photo: {p_path}"
    dso_files = [fn for fn in os.listdir("assets/dso") if fn.endswith(".png")]
    assert len(dso_files) == 135, f"Expected 135 PNG files in assets/dso/, got {len(dso_files)}"

    # 4. Verify data/constellations.json
    with open("data/constellations.json", "r", encoding="utf-8") as f:
        cons = json.load(f)
    assert len(cons) == 88, f"Expected 88 constellations, got {len(cons)}"

    # 5. Verify data/asteroids.json
    with open("data/asteroids.json", "r", encoding="utf-8") as f:
        asts = json.load(f)
    assert len(asts) == 8, f"Expected 8 asteroids, got {len(asts)}"

    # 6. Verify data/satellites-tle.json
    with open("data/satellites-tle.json", "r", encoding="utf-8") as f:
        sats = json.load(f)
    assert len(sats) == 177, f"Expected 177 satellites, got {len(sats)}"
    for s in sats:
        assert len(s["line1"]) == 69 and len(s["line2"]) == 69

    # 7. Verify data/meteors.json
    with open("data/meteors.json", "r", encoding="utf-8") as f:
        meteors = json.load(f)
    assert len(meteors) == 13, f"Expected 13 meteor showers, got {len(meteors)}"

    # 8. Verify data/cities.json
    with open("data/cities.json", "r", encoding="utf-8") as f:
        cities = json.load(f)
    assert cities["columns"] == ["name", "country", "lat", "lon", "alt", "tz"]
    assert len(cities["rows"]) == 33848, f"Expected 33848 cities, got {len(cities['rows'])}"

    # 9. Verify data/telescopes.json
    with open("data/telescopes.json", "r", encoding="utf-8") as f:
        tels = json.load(f)
    assert len(tels["brands"]) == 12, f"Expected 12 brands, got {len(tels['brands'])}"
    assert len(tels["telescopes"]) == 78, f"Expected 78 telescope models, got {len(tels['telescopes'])}"
    assert len(tels["eyepieces"]) == 10, f"Expected 10 eyepieces, got {len(tels['eyepieces'])}"

    # 10. Verify Wikipedia index & packs
    for p in ["data/wiki-index.json", "data/packs/wiki-fr.json", "data/packs/wiki-en.json", "data/packs/wiki-es.json", "data/packs/wiki-de.json"]:
        assert os.path.isfile(p) and os.path.getsize(p) > 1000, f"Missing or empty wiki file: {p}"

    # 11. Verify textures and PWA icons
    tex_names = ["sun.png", "moon.png", "mercury.png", "venus.png", "earth.png", "mars.png", "jupiter.png", "saturn.png", "saturn_rings.png", "uranus.png", "neptune.png", "milkyway.png"]
    for t in tex_names:
        tp = os.path.join("assets/textures", t)
        assert os.path.isfile(tp) and os.path.getsize(tp) > 500, f"Missing texture: {tp}"

    for ic in ["assets/icons/icon-192.png", "assets/icons/icon-512.png"]:
        assert os.path.isfile(ic) and os.path.getsize(ic) > 500, f"Missing icon: {ic}"

    print("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    main()
