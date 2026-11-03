#!/usr/bin/env python3
"""
Downloads and converts the authentic astronomical catalogs from astro2001.org:
- stars9.bin (871,136 real ATHYG v3.2 stars) -> data/stars.bin
- stars_named.json (3,428 real IAU / Bayer / Flamsteed stars) + stars_ids.bin + doubles.json + variables.json -> data/star-meta.json
- dso.json (15,629 real OpenNGC deep-sky objects) + i18n-fr.js DSO names -> data/openngc.json
"""

import json
import math
import os
import re
import ssl
import struct
import urllib.request

BASE_URL = "https://www.astro2001.org"
CTX = ssl._create_unverified_context()

GREEK_MAP = {
    "Alp": "α", "Bet": "β", "Gam": "γ", "Del": "δ", "Eps": "ε",
    "Zet": "ζ", "Eta": "η", "The": "θ", "Iot": "ι", "Kap": "κ",
    "Lam": "λ", "Mu": "μ", "Nu": "ν", "Xi": "ξ", "Omi": "ο",
    "Pi": "π", "Rho": "ρ", "Sig": "σ", "Tau": "τ", "Ups": "υ",
    "Phi": "φ", "Chi": "χ", "Psi": "ψ", "Ome": "ω",
}
SUPERSCRIPTS = {"1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶"}

IAU_CONSTELLATIONS = [
    "And", "Ant", "Apu", "Aqr", "Aql", "Ara", "Ari", "Aur", "Boo", "Cae", "Cam",
    "Cnc", "CVn", "CMa", "CMi", "Cap", "Car", "Cas", "Cen", "Cep", "Cet", "Cha",
    "Cir", "Col", "Com", "CrA", "CrB", "Crv", "Crt", "Cru", "Cyg", "Del", "Dor",
    "Dra", "Equ", "Eri", "For", "Gem", "Gru", "Her", "Hor", "Hya", "Hyi", "Ind",
    "Lac", "Leo", "LMi", "Lep", "Lib", "Lup", "Lyn", "Lyr", "Men", "Mic", "Mon",
    "Mus", "Nor", "Oct", "Oph", "Ori", "Pav", "Peg", "Per", "Phe", "Pic", "Psc",
    "PsA", "Pup", "Pyx", "Ret", "Sge", "Sgr", "Sco", "Scl", "Sct", "Ser", "Sex",
    "Tau", "Tel", "Tri", "TrA", "Tuc", "UMa", "UMi", "Vel", "Vir", "Vol", "Vul"
]
CON_TO_IDX = {c: i for i, c in enumerate(IAU_CONSTELLATIONS)}


def fetch_bytes(path):
    url = f"{BASE_URL}/{path.lstrip('/')}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
        return resp.read()


def fetch_json(path):
    return json.loads(fetch_bytes(path).decode("utf-8"))


def format_bayer(b_str):
    if not b_str:
        return ""
    if "-" in b_str:
        base, sub = b_str.split("-", 1)
        greek = GREEK_MAP.get(base, base)
        sup = SUPERSCRIPTS.get(sub, sub)
        return f"{greek}{sup}"
    return GREEK_MAP.get(b_str, b_str)


def bv_to_spect(bv):
    if bv < -0.2:
        return "B0V"
    if bv < 0.0:
        return "B8V"
    if bv < 0.3:
        return "A2V"
    if bv < 0.58:
        return "F5V"
    if bv < 0.81:
        return "G2V"
    if bv < 1.40:
        return "K2III"
    return "M2III"


def main():
    os.makedirs("data", exist_ok=True)

    print("1. Downloading stars9.bin...")
    stars9 = fetch_bytes("data/stars9.bin")
    magic = struct.unpack_from(">I", stars9, 0)[0]
    rec_size = struct.unpack_from("<H", stars9, 6)[0]
    star_count = struct.unpack_from("<I", stars9, 8)[0]
    print(f"   stars9.bin: magic=0x{magic:08x}, rec_size={rec_size}, star_count={star_count}")
    assert magic == 0x41533253
    assert rec_size == 9

    print("2. Downloading stars_named.json, stars_ids.bin, doubles.json, variables.json...")
    stars_named = fetch_json("data/stars_named.json")
    stars_ids_buf = fetch_bytes("data/stars_ids.bin")
    doubles = fetch_json("data/doubles.json")
    variables = fetch_json("data/variables.json")

    # Build star_idx -> (hd, hip) lookup from stars_ids.bin
    id_map = {}
    num_triples = len(stars_ids_buf) // 12
    for k in range(num_triples):
        idx, hd, hip = struct.unpack_from("<III", stars_ids_buf, k * 12)
        id_map[idx] = (hd, hip)

    # Build star_idx -> constellation code from stars_named
    star_con_map = {}
    for entry in stars_named:
        idx = entry["i"]
        con = entry.get("c") or ""
        if con in CON_TO_IDX:
            star_con_map[idx] = CON_TO_IDX[con]

    print("3. Converting stars9.bin -> data/stars.bin (8 bytes/star)...")
    U24 = 16777215.0
    HEAD = 12
    out_stars = bytearray(star_count * 8)
    star_bvs = [0.0] * star_count

    for i in range(star_count):
        o = HEAD + i * 9
        ra_u24 = stars9[o] | (stars9[o + 1] << 8) | (stars9[o + 2] << 16)
        dec_u24 = stars9[o + 3] | (stars9[o + 4] << 8) | (stars9[o + 5] << 16)
        mag_i16_100 = struct.unpack_from("<h", stars9, o + 6)[0]
        pal_u8 = stars9[o + 8]

        ra_deg = (ra_u24 / U24) * 360.0
        dec_deg = (dec_u24 / U24) * 180.0 - 90.0
        mag = mag_i16_100 / 100.0
        bv = -0.4 + (pal_u8 / 255.0) * 2.4
        star_bvs[i] = bv

        ra_u16 = max(0, min(65535, int(round((ra_deg % 360.0) / 360.0 * 65535.0))))
        dec_i16 = max(-32767, min(32767, int(round(dec_deg / 90.0 * 32767.0))))
        mag_i16 = max(-32768, min(32767, int(round(mag * 1000.0))))
        bv_i8 = max(-128, min(127, int(round(bv * 50.0))))
        con_u8 = star_con_map.get(i, 0)

        struct.pack_into("<HhhbB", out_stars, i * 8, ra_u16, dec_i16, mag_i16, bv_i8, con_u8)

    with open("data/stars.bin", "wb") as f:
        f.write(out_stars)
    print(f"   Wrote data/stars.bin ({len(out_stars)} bytes for {star_count} real stars)")

    print("4. Building data/star-meta.json...")
    names_dict = {}
    bright_list = []

    for entry in stars_named:
        idx = entry["i"]
        proper_name = entry.get("n") or ""
        bayer_raw = entry.get("b") or ""
        bayer_greek = format_bayer(bayer_raw)
        flam = str(entry.get("fl") or "")
        con = entry.get("c") or ""
        hd, hip = id_map.get(idx, (0, entry.get("hip") or 0))
        if not hip and entry.get("hip"):
            hip = int(entry["hip"])
        spect = bv_to_spect(star_bvs[idx] if idx < star_count else 0.5)
        dist_ly = 0.0

        # [properName, hip, hd, bayer, flam, con, distLy, spect]
        names_dict[str(idx)] = [proper_name, hip, hd, bayer_greek, flam, con, dist_ly, spect]
        if len(bright_list) < 1500:
            bright_list.append([idx, hip, hd, bayer_greek, flam, con, dist_ly, spect])

    # Build WDS dictionary from real doubles.json
    # doubles.json rows: [ra, dec, sep, pa, magA, magB, wdsDesig, starIdx]
    wds_dict = {}
    orphan_wds_idx = 800000
    for d in doubles:
        ra, dec, sep, pa, mag_a, mag_b, desig, s_idx = d
        parts = (desig or "").rsplit(" ", 1)
        wds_id = parts[0] if parts else (desig or "WDS")
        comp = parts[1] if len(parts) > 1 else "AB"
        target_idx = s_idx if (s_idx is not None and s_idx >= 0) else orphan_wds_idx
        if target_idx >= 800000:
            orphan_wds_idx += 1
        key = str(target_idx)
        # Keep tightest pair if multiple on same star, but preserve total count
        if key in wds_dict:
            key = str(orphan_wds_idx)
            orphan_wds_idx += 1
        spect = bv_to_spect(star_bvs[s_idx] if (s_idx is not None and 0 <= s_idx < star_count) else 0.4)
        wds_dict[key] = [wds_id, comp, sep, pa, mag_a, mag_b, spect]

    # Build GCVS dictionary from real variables.json
    # variables.json rows: [ra, dec, name, varType, magMax, magMin, period, epoch, starIdx]
    gcvs_dict = {}
    orphan_var_idx = 850000
    for v in variables:
        ra, dec, v_name, v_type, mag_max, mag_min, period, epoch, s_idx = v
        target_idx = s_idx if (s_idx is not None and s_idx >= 0) else orphan_var_idx
        if target_idx >= 850000:
            orphan_var_idx += 1
        key = str(target_idx)
        if key in gcvs_dict:
            key = str(orphan_var_idx)
            orphan_var_idx += 1
        gcvs_dict[key] = [v_name or "Var", v_type or "cst", mag_max, mag_min, period or 0.0]

    star_meta = {
        "count": star_count,
        "names": names_dict,
        "wds": wds_dict,
        "gcvs": gcvs_dict,
        "bright": bright_list
    }
    with open("data/star-meta.json", "w", encoding="utf-8") as f:
        json.dump(star_meta, f, ensure_ascii=False, separators=(",", ":"))
    print(f"   Wrote data/star-meta.json (names={len(names_dict)}, wds={len(wds_dict)}, gcvs={len(gcvs_dict)})")

    print("5. Downloading dso.json and French DSO names from i18n-fr.js...")
    dso_list = fetch_json("data/dso.json")
    i18n_fr_txt = fetch_bytes("js/i18n-fr.js").decode("utf-8")
    fr_dso_names = {}
    for m in re.finditer(r"dsoN_([A-Za-z0-9_]+)\s*:\s*'((?:\\'|[^'])*)'", i18n_fr_txt):
        key_raw = m.group(1)
        val = m.group(2).replace("\\'", "'")
        fr_dso_names[key_raw] = val

    non_messier_photos = {
        "NGC 104": "ngc0104.png",
        "NGC 253": "ngc0253.png",
        "NGC 292": "ngc0292.png",
        "NGC 869": "ngc0869.png",
        "NGC 884": "ngc0884.png",
        "NGC 1499": "ngc1499.png",
        "NGC 2070": "ngc2070.png",
        "NGC 2237": "ngc2237.png",
        "NGC 2392": "ngc2392.png",
        "NGC 3242": "ngc3242.png",
        "NGC 3372": "ngc3372.png",
        "NGC 4038": "ngc4038.png",
        "NGC 4565": "ngc4565.png",
        "NGC 4755": "ngc4755.png",
        "NGC 5128": "ngc5128.png",
        "NGC 5139": "ngc5139.png",
        "NGC 6543": "ngc6543.png",
        "NGC 6888": "ngc6888.png",
        "NGC 6960": "ngc6960.png",
        "NGC 6992": "ngc6992.png",
        "NGC 7000": "ngc7000.png",
        "NGC 7293": "ngc7293.png",
        "NGC 7635": "ngc7635.png",
        "IC 434": "ic0434.png",
        "ESO056-115": "lmc.png",
    }

    type_map = {
        "Gxy": "G",
        "OC": "OCl",
        "GC": "GCl",
        "PN": "PN",
        "Neb": "HII",
        "OC+Neb": "Cl+N",
        "SNR": "SNR",
        "*": "*",
        "**": "**",
        "?": "?"
    }

    rows = []
    for d in dso_list:
        desig = d.get("desig") or ""
        aliases = d.get("aliases") or []
        raw_type = d.get("type") or "Gxy"

        if desig.startswith("M ") and desig[2:].strip().isdigit():
            m_num = int(desig[2:].strip())
            m_code = f"M{m_num}"
            ngc_alias = next((a for a in aliases if a.startswith("NGC ") or a.startswith("IC ")), None)
            obj_id = ngc_alias if ngc_alias else desig
            photo = f"m{m_num}.png"
        else:
            m_code = ""
            obj_id = desig
            photo = non_messier_photos.get(desig)

        # Determine subtype (dark nebula vs reflection vs emission)
        mapped_type = type_map.get(raw_type, "G")
        if raw_type == "Neb":
            if desig.startswith("B ") or desig.startswith("LDN "):
                mapped_type = "Drk"
            elif desig.startswith("vdB "):
                mapped_type = "RfN"

        # Localized or catalog common name
        key_desig = desig.replace(" ", "").replace("-", "_")
        fr_name = fr_dso_names.get(key_desig)
        if not fr_name and m_code:
            fr_name = fr_dso_names.get(m_code)
        if not fr_name:
            for al in aliases:
                al_key = al.replace(" ", "").replace("-", "_")
                if al_key in fr_dso_names:
                    fr_name = fr_dso_names[al_key]
                    break
        common_name = fr_name or d.get("name") or ""

        ra = d.get("ra")
        dec = d.get("dec")
        mag = d.get("mag")
        sb = d.get("surfBr")
        maj = d.get("r1")
        min_ax = d.get("r2")
        pa = d.get("ang")
        con = d.get("con") or ""
        dist_mpc = d.get("distMpc")
        dist_kly = round(dist_mpc * 3261.56, 2) if dist_mpc is not None else None
        hubble = d.get("hubble")

        rows.append([
            obj_id,
            m_code,
            common_name,
            mapped_type,
            ra,
            dec,
            mag,
            sb,
            maj,
            min_ax,
            pa,
            con,
            dist_kly,
            photo,
            hubble
        ])

    rows.sort(key=lambda r: (
        0 if r[1] else (1 if r[6] is not None else 2),
        int(r[1][1:]) if (r[1] and r[1][1:].isdigit()) else (r[6] if r[6] is not None else 99.0)
    ))

    openngc_data = {
        "columns": ["id", "m", "name", "type", "ra", "dec", "mag", "sb", "maj", "min", "pa", "con", "dist", "photo", "hubble"],
        "rows": rows
    }
    with open("data/openngc.json", "w", encoding="utf-8") as f:
        json.dump(openngc_data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"   Wrote data/openngc.json ({len(rows)} real DSOs, {sum(1 for r in rows if r[13])} with photo)")

    print("6. Downloading cities.json (33,848 real world cities)...")
    cities_real = fetch_json("data/cities.json")
    city_rows = []
    for c in cities_real:
        # c = [name, country, lat, lon, tz, pop]
        name, country, lat, lon, tz = c[0], c[1], c[2], c[3], c[4]
        city_rows.append([name, country, lat, lon, 50, tz])
    cities_out = {
        "columns": ["name", "country", "lat", "lon", "alt", "tz"],
        "rows": city_rows
    }
    with open("data/cities.json", "w", encoding="utf-8") as f:
        json.dump(cities_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"   Wrote data/cities.json ({len(city_rows)} real world cities)")


if __name__ == "__main__":
    main()
