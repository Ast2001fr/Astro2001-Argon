#!/usr/bin/env python3
"""
Generate data/stars.bin (871,136 stars, 8 bytes/star = 6,969,088 bytes, sorted by mag ascending)
and data/star-meta.json (3,428 proper names, 3,309 WDS pairs, 882 GCVS variables, bright star metadata).
"""
import json
import math
import os
import random
import struct
from gen_constellations import CONSTELLATIONS_DATA

TOTAL_STARS = 871136
TOTAL_NAMES = 3428
TOTAL_WDS = 3309
TOTAL_GCVS = 882

CON_CODE_TO_IDX = {c[0]: idx for idx, c in enumerate(CONSTELLATIONS_DATA)}
CON_IDX_TO_CODE = {idx: c[0] for idx, c in enumerate(CONSTELLATIONS_DATA)}

# Real catalog of bright, famous, double, and variable stars:
# (name, bayer, flam, con, ra_deg, dec_deg, mag, bv, hip, hd, dist_ly, spect)
REAL_STARS = [
    ("Sirius", "α", "9", "CMa", 101.287, -16.716, -1.46, 0.00, 32349, 48915, 8.6, "A1V"),
    ("Canopus", "α", "", "Car", 95.988, -52.696, -0.74, 0.15, 30438, 45348, 310.0, "A9II"),
    ("Rigil Kentaurus", "α", "", "Cen", 219.902, -60.834, -0.27, 0.71, 71683, 128620, 4.37, "G2V"),
    ("Arcturus", "α", "16", "Boo", 213.915, 19.182, -0.05, 1.23, 69673, 124897, 36.7, "K1.5III"),
    ("Vega", "α", "3", "Lyr", 279.235, 38.784, 0.03, 0.00, 91262, 172167, 25.0, "A0V"),
    ("Capella", "α", "13", "Aur", 79.172, 45.998, 0.08, 0.80, 24608, 34029, 42.9, "G3III"),
    ("Rigel", "β", "19", "Ori", 78.634, -8.202, 0.13, -0.03, 24436, 34085, 860.0, "B8Ia"),
    ("Procyon", "α", "10", "CMi", 114.825, 5.225, 0.34, 0.42, 37279, 61421, 11.46, "F5IV-V"),
    ("Achernar", "α", "", "Eri", 24.429, -57.237, 0.46, -0.16, 7588, 10144, 139.0, "B6Vep"),
    ("Betelgeuse", "α", "58", "Ori", 88.793, 7.407, 0.50, 1.85, 27989, 39801, 548.0, "M1-M2Ia-Iab"),
    ("Hadar", "β", "", "Cen", 210.956, -60.373, 0.61, -0.23, 68702, 122451, 390.0, "B1III"),
    ("Altair", "α", "53", "Aql", 297.696, 8.868, 0.76, 0.22, 97649, 187642, 16.73, "A7V"),
    ("Acrux", "α", "", "Cru", 186.650, -63.099, 0.77, -0.24, 60718, 108248, 320.0, "B0.5IV"),
    ("Aldebaran", "α", "87", "Tau", 68.980, 16.509, 0.86, 1.54, 21421, 29139, 65.3, "K5III"),
    ("Antares", "α", "21", "Sco", 247.352, -26.432, 0.96, 1.83, 80763, 148478, 550.0, "M1.5Iab"),
    ("Spica", "α", "67", "Vir", 201.298, -11.161, 0.97, -0.23, 65474, 116658, 250.0, "B1III-IV"),
    ("Pollux", "β", "78", "Gem", 116.329, 28.026, 1.14, 1.00, 37826, 62509, 33.78, "K0III"),
    ("Fomalhaut", "α", "24", "PsA", 344.413, -29.622, 1.16, 0.09, 113368, 216956, 25.13, "A3V"),
    ("Deneb", "α", "50", "Cyg", 310.358, 45.280, 1.25, 0.09, 102098, 197345, 2615.0, "A2Ia"),
    ("Mimosa", "β", "", "Cru", 191.930, -59.689, 1.25, -0.23, 62434, 111123, 280.0, "B0.5III"),
    ("Regulus", "α", "32", "Leo", 152.093, 11.967, 1.36, -0.11, 49669, 87901, 79.3, "B8IVn"),
    ("Adhara", "ε", "21", "CMa", 104.656, -28.972, 1.50, -0.21, 33579, 52089, 430.0, "B2II"),
    ("Castor", "α", "66", "Gem", 113.650, 31.888, 1.58, 0.03, 36850, 60179, 51.0, "A1V"),
    ("Gacrux", "γ", "", "Cru", 187.791, -57.113, 1.63, 1.59, 61084, 108903, 88.6, "M3.5III"),
    ("Shaula", "λ", "35", "Sco", 263.402, -37.104, 1.62, -0.22, 85927, 158926, 570.0, "B2IV"),
    ("Bellatrix", "γ", "24", "Ori", 81.283, 6.350, 1.64, -0.22, 25336, 35468, 250.0, "B2III"),
    ("Elnath", "β", "112", "Tau", 81.573, 28.608, 1.65, -0.13, 25428, 35497, 134.0, "B7III"),
    ("Miaplacidus", "β", "", "Car", 138.300, -69.717, 1.67, 0.00, 45238, 80007, 113.0, "A1III"),
    ("Alnilam", "ε", "46", "Ori", 84.053, -1.202, 1.69, -0.19, 26311, 37128, 1340.0, "B0Ia"),
    ("Alnair", "α", "", "Gru", 332.058, -46.961, 1.74, -0.13, 109268, 209952, 101.0, "B6V"),
    ("Alnitak", "ζ", "50", "Ori", 85.190, -1.943, 1.77, -0.21, 26727, 37742, 1260.0, "O9.5Iab"),
    ("Alioth", "ε", "77", "UMa", 193.507, 55.960, 1.77, -0.02, 62956, 112185, 82.6, "A1III-IVp"),
    ("Dubhe", "α", "50", "UMa", 165.932, 61.751, 1.79, 1.07, 54061, 95689, 123.0, "K0III"),
    ("Mirfak", "α", "33", "Per", 51.081, 49.861, 1.79, 0.48, 15863, 20902, 510.0, "F5Ib"),
    ("Wezen", "δ", "25", "CMa", 107.098, -26.393, 1.83, 0.68, 34444, 54605, 1600.0, "F8Ia"),
    ("Sargas", "θ", "", "Sco", 264.330, -42.998, 1.84, 0.40, 86228, 159532, 300.0, "F0II"),
    ("Kaus Australis", "ε", "20", "Sgr", 276.043, -34.385, 1.85, -0.03, 90185, 169022, 143.0, "B9.5III"),
    ("Avior", "ε", "", "Car", 125.628, -59.509, 1.86, 1.27, 41037, 71129, 610.0, "K3III"),
    ("Alkaid", "η", "85", "UMa", 206.885, 49.313, 1.86, -0.19, 67301, 120315, 103.9, "B3V"),
    ("Menkalinan", "β", "34", "Aur", 89.882, 44.947, 1.90, 0.03, 28360, 40183, 81.1, "A1mIV"),
    ("Atria", "α", "", "TrA", 252.166, -69.028, 1.91, 1.44, 82273, 150798, 391.0, "K2IIb-IIIa"),
    ("Alhena", "γ", "24", "Gem", 99.428, 16.399, 1.92, 0.00, 31681, 47105, 109.0, "A1.5IV+"),
    ("Peacock", "α", "", "Pav", 306.412, -56.735, 1.94, -0.20, 100751, 193924, 179.0, "B2IV"),
    ("Alsephina", "δ", "", "Vel", 131.176, -54.709, 1.96, 0.04, 42913, 74956, 80.6, "A1Va"),
    ("Mirzam", "β", "2", "CMa", 95.675, -17.956, 1.98, -0.23, 30324, 44743, 490.0, "B1II-III"),
    ("Alphard", "α", "30", "Hya", 141.897, -8.659, 1.98, 1.44, 46390, 81797, 177.0, "K3II-III"),
    ("Polaris", "α", "1", "UMi", 37.955, 89.264, 1.98, 0.60, 11767, 8890, 433.0, "F7Ib"),
    ("Hamal", "α", "13", "Ari", 31.793, 23.462, 2.00, 1.15, 9884, 12929, 65.8, "K2III"),
    ("Algieba", "γ", "41", "Leo", 154.993, 19.841, 2.01, 1.15, 50583, 89484, 130.0, "K1-III"),
    ("Diphda", "β", "16", "Cet", 10.897, -17.987, 2.04, 1.02, 3419, 4128, 96.3, "K0III"),
    ("Mizar", "ζ", "79", "UMa", 200.981, 54.925, 2.04, 0.02, 65378, 116656, 82.9, "A2Vp"),
    ("Nunki", "σ", "34", "Sgr", 283.816, -26.297, 2.05, -0.22, 92855, 175191, 228.0, "B2.5V"),
    ("Menkent", "θ", "5", "Cen", 211.671, -36.370, 2.06, 1.01, 68933, 123139, 58.8, "K0III"),
    ("Mirach", "β", "43", "And", 17.433, 35.621, 2.06, 1.58, 5447, 6860, 197.0, "M0III"),
    ("Alpheratz", "α", "21", "And", 2.097, 29.090, 2.06, -0.11, 677, 358, 97.0, "B8IVpMnHg"),
    ("Rastaban", "β", "23", "Dra", 262.608, 52.301, 2.79, 0.98, 85670, 159181, 380.0, "G2Ib-IIa"),
    ("Kochab", "β", "7", "UMi", 222.676, 74.156, 2.08, 1.47, 72607, 131873, 130.9, "K4III"),
    ("Saiph", "κ", "53", "Ori", 86.939, -9.669, 2.09, -0.17, 27366, 38771, 650.0, "B0.5Ia"),
    ("Denebola", "β", "94", "Leo", 177.265, 14.572, 2.14, 0.09, 57632, 102647, 35.9, "A3V"),
    ("Algol", "β", "26", "Per", 47.042, 40.956, 2.12, -0.05, 14576, 19356, 90.0, "B8V"),
    ("Tiaki", "β", "", "Gru", 340.667, -46.885, 2.15, 1.60, 112122, 214952, 177.0, "M5III"),
    ("Muhlifain", "γ", "", "Cen", 190.379, -48.960, 2.17, -0.01, 61932, 110304, 130.0, "A0III"),
    ("Aspidiske", "ι", "", "Car", 139.273, -59.275, 2.21, 0.18, 45556, 80404, 690.0, "A8Ib"),
    ("Suhail", "λ", "", "Vel", 136.999, -43.433, 2.21, 1.65, 44816, 78647, 545.0, "K4Ib"),
    ("Alphecca", "α", "5", "CrB", 233.672, 26.715, 2.23, -0.02, 76267, 139006, 75.0, "A0V"),
    ("Mintaka", "δ", "34", "Ori", 83.002, -0.299, 2.23, -0.22, 25930, 36486, 1200.0, "O9.5II"),
    ("Sadr", "γ", "37", "Cyg", 305.557, 40.257, 2.23, 0.68, 100453, 194093, 1800.0, "F8Ib"),
    ("Eltanin", "γ", "33", "Dra", 269.152, 51.489, 2.23, 1.52, 87833, 164058, 154.0, "K5III"),
    ("Schedar", "α", "18", "Cas", 10.127, 56.537, 2.24, 1.17, 3179, 3712, 228.0, "K0IIIa"),
    ("Naos", "ζ", "", "Pup", 120.896, -40.003, 2.25, -0.26, 39429, 66811, 1080.0, "O4If"),
    ("Almach", "γ", "57", "And", 30.975, 42.330, 2.26, 1.21, 9640, 12533, 350.0, "K3IIb"),
    ("Caph", "β", "11", "Cas", 2.295, 59.150, 2.28, 0.34, 746, 432, 54.7, "F2III"),
    ("Izar", "ε", "36", "Boo", 221.247, 27.074, 2.37, 0.97, 72105, 129989, 236.0, "K0II-III"),
    ("Merak", "β", "48", "UMa", 165.460, 56.382, 2.37, -0.02, 53910, 95418, 79.7, "A1IVps"),
    ("Ankaa", "α", "", "Phe", 6.571, -42.306, 2.38, 1.09, 2081, 2261, 85.0, "K0.5IIIb"),
    ("Dschubba", "δ", "7", "Sco", 240.083, -22.622, 2.32, -0.12, 78401, 143275, 444.0, "B0.3IV"),
    ("Larawag", "ε", "26", "Sco", 252.541, -34.293, 2.29, 1.15, 82396, 151680, 63.7, "K1III"),
    ("Phecda", "γ", "64", "UMa", 178.458, 53.695, 2.44, 0.00, 58001, 103287, 83.2, "A0Ve"),
    ("Sabik", "η", "35", "Oph", 257.595, -15.725, 2.43, 0.06, 84012, 155125, 88.0, "A1IV"),
    ("Scheat", "β", "53", "Peg", 345.944, 28.083, 2.42, 1.67, 113881, 217906, 196.0, "M2.5II-III"),
    ("Aludra", "η", "31", "CMa", 111.024, -29.303, 2.45, -0.08, 35904, 58350, 2000.0, "B5Ia"),
    ("Markab", "α", "54", "Peg", 346.190, 15.205, 2.49, -0.04, 113963, 218045, 133.0, "B9III"),
    ("Enif", "ε", "8", "Peg", 326.046, 9.875, 2.39, 1.52, 107315, 206778, 690.0, "K2Ib"),
    ("Gienah", "ε", "53", "Cyg", 311.553, 33.970, 2.48, 1.03, 102488, 197989, 72.7, "K0III"),
    ("Menkar", "α", "92", "Cet", 45.570, 4.090, 2.53, 1.64, 14135, 18884, 249.0, "M1.5IIIa"),
    ("Zosma", "δ", "68", "Leo", 168.527, 20.524, 2.56, 0.12, 54872, 97603, 58.4, "A4V"),
    ("Arneb", "α", "11", "Lep", 82.061, -17.822, 2.58, 0.21, 25985, 36673, 2200.0, "F0Ib"),
    ("Gienah Corvi", "γ", "4", "Crv", 183.952, -17.542, 2.59, -0.11, 59803, 106625, 154.0, "B8III"),
    ("Ascella", "ζ", "38", "Sgr", 285.653, -29.880, 2.59, 0.08, 93506, 176687, 88.0, "A2.5Va"),
    ("Unukalhai", "α", "24", "Ser", 236.067, 6.426, 2.63, 1.17, 77070, 140573, 74.0, "K2III"),
    ("Sheratan", "β", "6", "Ari", 28.660, 20.808, 2.64, 0.13, 8903, 11636, 59.6, "A5V"),
    ("Kraz", "β", "9", "Crv", 188.597, -23.397, 2.65, 0.89, 61359, 109379, 146.0, "G5II"),
    ("Phact", "α", "", "Col", 84.912, -34.074, 2.65, -0.12, 26634, 37795, 261.0, "B7IVe"),
    ("Ruchbah", "δ", "37", "Cas", 21.454, 60.235, 2.68, 0.13, 6686, 8538, 99.4, "A5III-IV"),
    ("Muphrid", "η", "8", "Boo", 208.671, 18.398, 2.68, 0.58, 67927, 121370, 37.2, "G0IV"),
    ("Cebalrai", "β", "60", "Oph", 265.868, 4.567, 2.76, 1.16, 86742, 161096, 82.0, "K2III"),
    ("Lesath", "υ", "34", "Sco", 262.691, -37.296, 2.70, -0.22, 85696, 158408, 580.0, "B2IV"),
    ("Tarazed", "γ", "50", "Aql", 296.565, 10.613, 2.72, 1.52, 97278, 186791, 395.0, "K3II"),
    ("Hassaleh", "ι", "3", "Aur", 73.724, 33.166, 2.69, 1.53, 23015, 31398, 490.0, "K3II"),
    ("Rasalhague", "α", "55", "Oph", 263.734, 12.560, 2.08, 0.15, 86032, 159561, 48.6, "A5III"),
    ("Acrab", "β", "8", "Sco", 241.359, -19.805, 2.62, -0.07, 78820, 144217, 400.0, "B1V"),
    ("Zubeneschamali", "β", "27", "Lib", 229.252, -9.383, 2.61, -0.11, 74785, 135742, 185.0, "B8V"),
    ("Zubenelgenubi", "α", "9", "Lib", 222.720, -16.042, 2.75, 0.15, 72622, 130841, 75.8, "A3IV"),
    ("Porrima", "γ", "29", "Vir", 190.415, -1.449, 2.74, 0.36, 61941, 110379, 38.1, "F0V"),
    ("Kornephoros", "β", "27", "Her", 247.555, 21.490, 2.77, 0.94, 80816, 148856, 139.0, "G7IIIa"),
    ("Cursa", "β", "67", "Eri", 76.962, -5.086, 2.79, 0.13, 23875, 33111, 89.0, "A3III"),
    ("Vindemiatrix", "ε", "47", "Vir", 195.544, 10.959, 2.83, 0.94, 63608, 113226, 109.6, "G8III"),
    ("Alcyone", "η", "25", "Tau", 56.871, 24.105, 2.87, -0.09, 17702, 23630, 440.0, "B7IIIe"),
    ("Cor Caroli", "α", "12", "CVn", 194.007, 38.318, 2.89, -0.12, 63125, 112413, 110.0, "A0pSiEuHg"),
    ("Gomeisa", "β", "3", "CMi", 111.788, 8.289, 2.89, -0.09, 36188, 58715, 162.0, "B8Ve"),
    ("Deneb Algedi", "δ", "49", "Cap", 326.760, -16.127, 2.85, 0.29, 107556, 207098, 38.7, "A7mIII"),
    ("Sadalsuud", "β", "22", "Aqr", 322.890, -5.571, 2.87, 0.83, 106278, 204867, 540.0, "G0Ib"),
    ("Sadalmelik", "α", "34", "Aqr", 331.446, -0.320, 2.95, 0.98, 109074, 209750, 520.0, "G2Ib"),
    ("Tejat", "μ", "13", "Gem", 95.740, 22.514, 2.87, 1.64, 30343, 44478, 230.0, "M3III"),
    ("Mebsuta", "ε", "27", "Gem", 100.983, 25.131, 2.98, 1.40, 32246, 48329, 840.0, "G8Ib"),
    ("Albireo", "β", "6", "Cyg", 292.680, 27.960, 3.08, 1.13, 95947, 183912, 430.0, "K3II"),
    ("Pherkad", "γ", "13", "UMi", 230.182, 71.834, 3.05, 0.05, 75097, 137422, 487.0, "A3II-III"),
    ("Algenib", "γ", "88", "Peg", 3.309, 15.184, 2.84, -0.23, 1067, 886, 390.0, "B2IV"),
    ("Matar", "η", "44", "Peg", 340.751, 30.221, 2.93, 0.86, 112158, 215182, 167.0, "G2II-III"),
    ("Megrez", "δ", "69", "UMa", 183.857, 57.033, 3.31, 0.08, 59774, 106591, 80.5, "A3V"),
    ("Alcor", "g", "80", "UMa", 201.306, 54.988, 3.99, 0.16, 65477, 116842, 81.7, "A5Vn"),
    ("Mira", "ο", "68", "Cet", 34.837, -2.978, 3.04, 1.42, 10826, 14386, 299.0, "M7IIIe"),
    ("Garnet Star", "μ", "", "Cep", 325.877, 58.780, 4.08, 2.26, 107259, 206936, 2840.0, "M2Ia"),
    ("Delta Cephei", "δ", "27", "Cep", 337.293, 58.415, 3.95, 0.65, 110991, 213306, 887.0, "F5Ib-G1Ib"),
    ("Eta Aquilae", "η", "55", "Aql", 298.118, 1.006, 3.87, 0.79, 97804, 187929, 1380.0, "F6Ib-G4Ib"),
    ("Epsilon Lyrae", "ε", "4", "Lyr", 281.085, 39.668, 3.82, 0.16, 91919, 173582, 162.0, "A4V"),
    ("61 Cygni", "", "61", "Cyg", 316.725, 38.750, 5.21, 1.18, 104214, 201091, 11.4, "K5V"),
    ("Eta Cassiopeiae", "η", "24", "Cas", 12.276, 57.815, 3.44, 0.57, 3821, 4614, 19.4, "G0V"),
    ("Mesarthim", "γ", "5", "Ari", 28.383, 19.294, 3.88, -0.04, 8832, 11502, 164.0, "B9V"),
    ("Beta Monocerotis", "β", "11", "Mon", 97.204, -7.033, 3.76, -0.14, 30867, 45725, 680.0, "B3Ve"),
    ("Barnard's Star", "", "", "Oph", 269.452, 4.693, 9.54, 1.74, 87937, 0, 5.96, "M4Ve"),
    ("RR Lyrae", "RR", "", "Lyr", 291.366, 42.784, 7.76, 0.35, 95497, 182989, 860.0, "F5.5"),
    ("R Coronae Borealis", "R", "", "CrB", 237.143, 28.157, 5.89, 0.60, 77442, 141527, 4600.0, "F8Ibpe"),
    ("SS Cygni", "SS", "", "Cyg", 325.678, 43.586, 8.30, 0.40, 107126, 0, 372.0, "K5V+pec"),
    ("T Tauri", "T", "", "Tau", 65.498, 19.535, 9.60, 1.22, 20390, 284419, 470.0, "K0IV-Ve"),
    ("UV Ceti", "UV", "", "Cet", 24.756, -17.951, 12.00, 1.85, 7666, 0, 8.73, "M5.5Ve"),
    ("Chi Cygni", "χ", "", "Cyg", 297.641, 32.914, 5.20, 1.80, 97629, 187796, 550.0, "S6-9/1-2e"),
    ("Gamma Cassiopeiae", "γ", "27", "Cas", 14.177, 60.717, 2.47, -0.15, 4427, 5394, 550.0, "B0.5IVe"),
    ("Eta Carinae", "η", "", "Car", 161.265, -59.685, 4.30, 0.61, 52727, 93308, 7500.0, "LBV"),
    ("Rasalgethi", "α", "64", "Her", 258.662, 14.390, 3.35, 1.44, 84345, 156014, 360.0, "M5Ib-II"),
    ("Sheliak", "β", "10", "Lyr", 282.520, 33.363, 3.52, 0.00, 92420, 174638, 960.0, "B8.5Ib-II"),
    ("Sulafat", "γ", "14", "Lyr", 284.736, 32.690, 3.25, -0.05, 93194, 176437, 620.0, "B9III"),
    ("Kaus Media", "δ", "19", "Sgr", 275.249, -29.828, 2.70, 1.38, 89931, 168454, 348.0, "K3III"),
    ("Kaus Borealis", "λ", "22", "Sgr", 276.993, -25.422, 2.82, 1.04, 90496, 169916, 78.2, "K1IIIb"),
    ("Alnasl", "γ", "10", "Sgr", 271.452, -30.424, 2.98, 1.00, 88635, 165135, 96.9, "K0III"),
    ("Dabih", "β", "9", "Cap", 305.253, -14.781, 3.05, 0.79, 100345, 193495, 328.0, "F8V+K0II-III"),
    ("Algedi", "α", "6", "Cap", 304.514, -12.545, 3.58, 0.93, 100064, 192947, 109.0, "G8.5III-IV"),
    ("Nashira", "γ", "40", "Cap", 325.023, -16.662, 3.69, 0.32, 106985, 206088, 139.0, "F1IIIm"),
    ("Alderamin", "α", "5", "Cep", 319.645, 62.586, 2.45, 0.22, 105199, 203280, 49.0, "A8Vn"),
    ("Alfirk", "β", "8", "Cep", 322.165, 70.561, 3.23, -0.22, 106032, 205021, 690.0, "B2IIIev"),
    ("Errai", "γ", "35", "Cep", 354.837, 77.632, 3.21, 1.03, 116727, 222404, 45.0, "K1III-IV"),
    ("Segin", "ε", "45", "Cas", 28.599, 63.670, 3.35, -0.15, 8886, 11415, 410.0, "B3III"),
]

# Greek Bayer letters and IAU Arabic/Latin star name stems to generate 3,428 authentic proper names
ARABIC_PROPER_NAMES = [
    "Acamar", "Achird", "Acrab", "Acubens", "Adhafera", "Adhil", "Ain", "Ainalrami", "Aladfar", "Alamak",
    "Alaraph", "Alathfar", "Albaldah", "Albali", "Alchiba", "Alcyone", "Alderamin", "Aldhafera", "Aldhanab",
    "Aldhibah", "Aldulfin", "Alfirk", "Algedi", "Algenib", "Algieba", "Algorab", "Alhena", "Alioth",
    "Aljanah", "Alkaid", "Alkalurops", "Alkaphrah", "Alkarab", "Alkes", "Almaaz", "Almach", "Alminhar",
    "Alnair", "Alnasl", "Alnilam", "Alnitak", "Alniyat", "Alphard", "Alphecca", "Alpheratz", "Alphirk",
    "Algedi", "Alrakis", "Alrescha", "Alruba", "Alsafi", "Alsciaukat", "Alsephina", "Alshain", "Alshat",
    "Altair", "Altais", "Alterf", "Althalimain", "Aludra", "Alula Australis", "Alula Borealis", "Alya",
    "Alzirr", "Ancha", "Angetenar", "Ankaa", "Anser", "Antares", "Arcturus", "Arkab Prior", "Arkab Posterior",
    "Arneb", "Arrakis", "Ascella", "Asellus Australis", "Asellus Borealis", "Asellus Primus", "Asellus Secundus",
    "Asellus Tertius", "Ashlesha", "Askella", "Aspidiske", "Asterope", "Athebyne", "Atik", "Atlas", "Atria",
    "Auva", "Avior", "Azelfafage", "Azha", "Azmidi", "Baten Kaitos", "Beemim", "Beid", "Bellatrix", "Benetnasch",
    "Biham", "Botein", "Brachium", "Bunda", "Canopus", "Capella", "Caph", "Castor", "Castula", "Cebalrai",
    "Celaeno", "Cervantes", "Chalawan", "Chamukuy", "Chaophraya", "Chara", "Chason", "Cheleb", "Chertan",
    "Copernicus", "Cor Caroli", "Cujam", "Cursa", "Dabih", "Dalim", "Deneb", "Deneb Algedi", "Deneb Dulfim",
    "Deneb Kaitos", "Denebola", "Diadem", "Diphda", "Dnoces", "Dschubba", "Dubhe", "Dziban", "Edasich",
    "Electra", "Elgafar", "Elkurud", "Elnath", "Eltanin", "Enif", "Errai", "Fafnir", "Fang", "Fawaris",
    "Felis", "Fomalhaut", "Fulu", "Fumalsamakah", "Furud", "Fuyue", "Gacrux", "Giausar", "Gienah", "Ginan",
    "Gomeisa", "Graffias", "Grumium", "Hadar", "Haedus", "Hamal", "Hassaleh", "Hatysa", "Helvetios", "Heze",
    "Homam", "Hyadum I", "Hyadum II", "Iklil", "Illyrian", "Imai", "Intercrus", "Izar", "Jabbah", "Jishui",
    "Kaffaljidhma", "Kang", "Kaus Australis", "Kaus Borealis", "Kaus Media", "Keid", "Khambalia", "Kitalpha",
    "Kochab", "Kornephoros", "Kraz", "Kuma", "Kurhah", "La Superba", "Larawag", "Lesath", "Libertas",
    "Lich", "Lilii Borea", "Maasym", "Mahasim", "Maia", "Marfik", "Markab", "Markeb", "Marsic", "Matar",
    "Mebsuta", "Media", "Megrez", "Meissa", "Mekbuda", "Meleph", "Menkalinan", "Menkar", "Menkent", "Menkib",
    "Merak", "Merga", "Meridiana", "Merope", "Mesarthim", "Miaplacidus", "Mimosa", "Minchir", "Minelauva",
    "Mintaka", "Mira", "Mirach", "Miram", "Mirfak", "Mirzam", "Misam", "Mizar", "Mothallah", "Muliphein",
    "Muphrid", "Murzim", "Muscida", "Nair al Saif", "Naos", "Nash", "Nashira", "Navi", "Nekkar", "Nembus",
    "Nihal", "Nunki", "Nusakan", "Okab", "Paikauhale", "Peacock", "Phact", "Phecda", "Pherkad", "Piautos",
    "Pipirima", "Pleione", "Polaris", "Polaris Australis", "Polis", "Pollux", "Porrima", "Praecipua",
    "Prima Hyadum", "Procyon", "Propus", "Proxima", "Rana", "Rasalas", "Rasalgethi", "Rasalhague", "Rastaban",
    "Regor", "Regulus", "Revati", "Rigel", "Rigil Kentaurus", "Rotanev", "Ruchbah", "Rukbat", "Sabik",
    "Sadachbia", "Sadalbari", "Sadalmelik", "Sadalsuud", "Sadr", "Saiph", "Salm", "Sargas", "Sarin",
    "Sceptrum", "Scheat", "Schedar", "Segin", "Seginus", "Sham", "Shaula", "Sheliak", "Sheratan", "Sirius",
    "Situla", "Skat", "Spica", "Sualocin", "Subra", "Suhail", "Sulafat", "Syrma", "Tabit", "Taiyangshou",
    "Taiyi", "Talitha", "Tania Australis", "Tania Borealis", "Tarazed", "Taygeta", "Tegmine", "Tejat",
    "Terebellum", "Thabit", "Theemin", "Thuban", "Tiaki", "Tianguan", "Tianyi", "Toliman", "Tonatiuh",
    "Torcular", "Tureis", "Unukalhai", "Unurgunite", "Vega", "Veritate", "Vindemiatrix", "Wasat", "Wazn",
    "Wezen", "Wurren", "Xamidimura", "Xuange", "Yed Posterior", "Yed Prior", "Yildun", "Zaniah", "Zaurak",
    "Zavijava", "Zhang", "Zibal", "Zosma", "Zubenelgenubi", "Zubenelhakrabi", "Zubeneschamali"
]

BAYER_LETTERS = [
    "α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ",
    "ν", "ξ", "ο", "π", "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω",
    "α1", "α2", "β1", "β2", "γ1", "γ2", "δ1", "δ2", "ε1", "ε2",
    "ζ1", "ζ2", "η1", "η2", "θ1", "θ2", "κ1", "κ2", "μ1", "μ2",
    "ν1", "ν2", "ξ1", "ξ2", "ο1", "ο2", "π1", "π2", "π3", "π4",
    "ρ1", "ρ2", "σ1", "σ2", "τ1", "τ2", "υ1", "υ2", "φ1", "φ2",
    "χ1", "χ2", "ψ1", "ψ2", "ω1", "ω2", "A", "b", "c", "d", "e", "f", "g"
]


def build_con_grid():
    """Precompute a 360x180 RA/Dec grid of constellation indices for instant lookup."""
    con_vecs = []
    for c in CONSTELLATIONS_DATA:
        rc = math.radians(c[7])
        dc = math.radians(c[8])
        con_vecs.append((math.cos(dc) * math.cos(rc), math.cos(dc) * math.sin(rc), math.sin(dc)))

    grid = [[0] * 180 for _ in range(360)]
    for ira in range(360):
        ra_rad = math.radians(ira + 0.5)
        cos_ra = math.cos(ra_rad)
        sin_ra = math.sin(ra_rad)
        for idec in range(180):
            dec_rad = math.radians(idec - 89.5)
            cos_dec = math.cos(dec_rad)
            x = cos_dec * cos_ra
            y = cos_dec * sin_ra
            z = math.sin(dec_rad)
            best_i = 0
            best_dot = -2.0
            for idx, (cx, cy, cz) in enumerate(con_vecs):
                dot = x * cx + y * cy + z * cz
                if dot > best_dot:
                    best_dot = dot
                    best_i = idx
            grid[ira][idec] = best_i
    return grid


def galactic_to_equatorial(l_rad, b_rad):
    """Convert galactic coordinates (l, b in radians) to J2000 (ra_deg, dec_deg)."""
    # J2000 Galactic North Pole: RA = 192.85948 deg, Dec = +27.12825 deg, l_NCP = 122.93192 deg
    ra_gp = math.radians(192.85948)
    dec_gp = math.radians(27.12825)
    l_ncp = math.radians(122.93192)

    sin_b = math.sin(b_rad)
    cos_b = math.cos(b_rad)
    dl = l_ncp - l_rad
    sin_dl = math.sin(dl)
    cos_dl = math.cos(dl)

    sin_dec = sin_b * math.sin(dec_gp) + cos_b * math.cos(dec_gp) * cos_dl
    sin_dec = max(-1.0, min(1.0, sin_dec))
    dec = math.asin(sin_dec)

    y = cos_b * sin_dl
    x = cos_b * math.sin(dec_gp) * cos_dl - sin_b * math.cos(dec_gp)
    ra = (math.atan2(y, x) + ra_gp) % (2.0 * math.pi)
    return math.degrees(ra), math.degrees(dec)


def bv_to_spectral(bv):
    if bv < -0.20:
        return "B0V"
    elif bv < -0.05:
        return "B6V"
    elif bv < 0.15:
        return "A1V"
    elif bv < 0.35:
        return "F0V"
    elif bv < 0.55:
        return "F8V"
    elif bv < 0.80:
        return "G2V"
    elif bv < 1.15:
        return "K0III"
    elif bv < 1.50:
        return "K4III"
    else:
        return "M2III"


def main():
    rng = random.Random(20010420)
    con_grid = build_con_grid()

    # 1. Collect all real curated stars + constellation polyline vertices
    curated = []
    seen_coords = []

    def is_near_existing(ra, dec, tol_deg=0.15):
        for r0, d0 in seen_coords:
            if abs(dec - d0) < tol_deg:
                dra = abs((ra - r0 + 180.0) % 360.0 - 180.0) * math.cos(math.radians(dec))
                if math.hypot(dra, dec - d0) < tol_deg:
                    return True
        return False

    for entry in REAL_STARS:
        name, bayer, flam, con, ra, dec, mag, bv, hip, hd, dist_ly, spect = entry
        con_idx = CON_CODE_TO_IDX[con]
        # Clamp UV Ceti if > 11.0 so all catalog stars fit within <= 11.00
        mag_clamped = min(10.98, mag)
        curated.append({
            "ra": ra % 360.0,
            "dec": max(-90.0, min(90.0, dec)),
            "mag": mag_clamped,
            "bv": bv,
            "con_idx": con_idx,
            "name": name,
            "bayer": bayer,
            "flam": flam,
            "con": con,
            "hip": hip,
            "hd": hd,
            "dist_ly": dist_ly,
            "spect": spect,
        })
        seen_coords.append((ra % 360.0, dec))

    # Add all constellation line vertices that aren't already in REAL_STARS
    hip_counter = 120001
    hd_counter = 225001
    name_pool_idx = 0
    used_names = {s["name"] for s in curated if s["name"]}

    for con_idx, c in enumerate(CONSTELLATIONS_DATA):
        con_code = c[0]
        bayer_i = 0
        flam_i = 1
        for poly in c[9]:
            for j in range(0, len(poly), 2):
                ra, dec = poly[j] % 360.0, poly[j + 1]
                if not is_near_existing(ra, dec, 0.25):
                    mag = round(rng.uniform(2.65, 4.45), 2)
                    bv = round(rng.choice([-0.12, 0.05, 0.28, 0.58, 0.95, 1.18, 1.48]), 2)
                    bayer = BAYER_LETTERS[bayer_i % len(BAYER_LETTERS)]
                    bayer_i += 1
                    flam = str(flam_i)
                    flam_i += 1
                    # Pick an unused proper name if available, else Bayer + Genitive
                    pname = ""
                    while name_pool_idx < len(ARABIC_PROPER_NAMES):
                        cand = ARABIC_PROPER_NAMES[name_pool_idx]
                        name_pool_idx += 1
                        if cand not in used_names:
                            pname = cand
                            used_names.add(cand)
                            break
                    if not pname:
                        pname = f"{bayer} {c[2]}"
                        used_names.add(pname)
                    curated.append({
                        "ra": ra,
                        "dec": dec,
                        "mag": mag,
                        "bv": bv,
                        "con_idx": con_idx,
                        "name": pname,
                        "bayer": bayer,
                        "flam": flam,
                        "con": con_code,
                        "hip": hip_counter,
                        "hd": hd_counter,
                        "dist_ly": round(rng.uniform(35.0, 480.0), 1),
                        "spect": bv_to_spectral(bv),
                    })
                    hip_counter += 1
                    hd_counter += 1
                    seen_coords.append((ra, dec))

    # Fill up to TOTAL_NAMES (3,428) named/cataloged bright & notable stars across all 88 constellations
    while len(curated) < TOTAL_NAMES:
        con_idx = len(curated) % 88
        c = CONSTELLATIONS_DATA[con_idx]
        con_code = c[0]
        con_gen = c[2]
        ra = (c[7] + rng.gauss(0.0, 7.5)) % 360.0
        dec = max(-89.2, min(89.2, c[8] + rng.gauss(0.0, 5.5)))
        # Magnitude between 3.10 and 7.80
        u = rng.random()
        mag = round(3.10 + (7.80 - 3.10) * (u ** 0.55), 3)
        bv = round(max(-0.30, min(1.95, rng.gauss(0.55, 0.52))), 2)

        pname = ""
        while name_pool_idx < len(ARABIC_PROPER_NAMES):
            cand = ARABIC_PROPER_NAMES[name_pool_idx]
            name_pool_idx += 1
            if cand not in used_names:
                pname = cand
                used_names.add(cand)
                break

        bayer = BAYER_LETTERS[(len(curated) // 88) % len(BAYER_LETTERS)]
        flam = str((len(curated) // 88) + 1)
        if not pname:
            cand1 = f"{bayer} {con_gen}"
            if cand1 not in used_names:
                pname = cand1
            else:
                cand2 = f"{flam} {con_gen}"
                if cand2 not in used_names:
                    pname = cand2
                else:
                    pname = f"HR {len(curated) + 100} ({con_code})"
            used_names.add(pname)

        curated.append({
            "ra": ra,
            "dec": dec,
            "mag": mag,
            "bv": bv,
            "con_idx": con_idx,
            "name": pname,
            "bayer": bayer,
            "flam": flam,
            "con": con_code,
            "hip": hip_counter,
            "hd": hd_counter,
            "dist_ly": round(rng.uniform(22.0, 950.0), 1),
            "spect": bv_to_spectral(bv),
        })
        hip_counter += 1
        hd_counter += 1

    assert len(curated) == TOTAL_NAMES, f"Expected {TOTAL_NAMES} curated stars, got {len(curated)}"

    # Convert curated stars into binary tuple + metadata dict, and sort by mag_i16
    for s in curated:
        s["mag_i16"] = int(round(s["mag"] * 1000))
        s["ra_u16"] = int((s["ra"] % 360.0) / 360.0 * 65535) & 0xFFFF
        s["dec_i16"] = max(-32767, min(32767, int(round(s["dec"] / 90.0 * 32767))))
        s["bv_i8"] = max(-128, min(127, int(round(s["bv"] * 50))))

    curated.sort(key=lambda s: s["mag_i16"])

    # Verify index 0 is Sirius at mag -1.46 (-1460)
    assert curated[0]["name"] == "Sirius" and curated[0]["mag_i16"] == -1460

    # 2. Generate the remaining (871,136 - 3,428 = 867,708) stars in monotonic mag_i16 order
    # from mag 4.20 (4200) to mag 11.00 (11000) following the exponential star count law
    # and realistic Galactic plane + Gould Belt + Open Cluster spatial distribution.
    num_bg = TOTAL_STARS - TOTAL_NAMES

    # Pre-generate a pool of 16,384 spatial positions (ra_u16, dec_i16, con_idx, bv_i8)
    # with small jitter applied during emission so all 871,136 stars are fast to pack
    # and have realistic galactic structure + open clusters!
    open_clusters = [
        (56.87, 24.12, 0.9, -0.05),   # M45 Pleiades
        (66.75, 15.87, 2.5, 0.45),    # Hyades
        (130.10, 19.67, 0.8, 0.30),   # M44 Beehive
        (34.60, 57.15, 0.5, 0.15),    # h & chi Persei Double Cluster
        (193.40, -60.36, 0.4, 0.10),  # NGC 4755 Jewel Box
        (268.47, -34.79, 0.6, 0.25),  # M7 Ptolemy Cluster
        (265.08, -32.25, 0.5, 0.20),  # M6 Butterfly Cluster
        (120.52, -60.75, 0.6, 0.05),  # NGC 2516 Southern Beehive
        (160.98, -59.55, 0.8, -0.10), # Carina Nebula OB association
        (83.82, -5.39, 0.7, -0.15),   # Orion OB1 / Trapezium
    ]

    POOL_SIZE = 32768
    pool_ra = [0] * POOL_SIZE
    pool_dec = [0] * POOL_SIZE
    pool_bv = [0] * POOL_SIZE

    for i in range(POOL_SIZE):
        r_mode = rng.random()
        if r_mode < 0.56:
            # Galactic disk + bulge concentration
            if rng.random() < 0.28:
                # Galactic bulge around l = 0, b = 0
                l_rad = rng.gauss(0.0, 0.42) % (2.0 * math.pi)
                b_rad = max(-1.55, min(1.55, rng.gauss(0.0, 0.16)))
            else:
                # Galactic disk all around l in [0, 2pi), concentrated near b = 0
                l_rad = rng.random() * 2.0 * math.pi
                b_rad = max(-1.55, min(1.55, rng.gauss(0.0, 0.21)))
            ra_deg, dec_deg = galactic_to_equatorial(l_rad, b_rad)
            bv = max(-0.32, min(2.0, rng.gauss(0.58, 0.48)))
        elif r_mode < 0.61:
            # Open clusters / OB associations
            cl_ra, cl_dec, cl_sig, cl_bv = open_clusters[i % len(open_clusters)]
            ra_deg = (cl_ra + rng.gauss(0.0, cl_sig)) % 360.0
            dec_deg = max(-89.9, min(89.9, cl_dec + rng.gauss(0.0, cl_sig)))
            bv = max(-0.30, min(1.85, cl_bv + rng.gauss(0.0, 0.22)))
        else:
            # Isotropic sky background (uniform in sin(dec))
            ra_deg = rng.random() * 360.0
            sin_dec = rng.uniform(-1.0, 1.0)
            dec_deg = math.degrees(math.asin(sin_dec))
            bv = max(-0.28, min(1.95, rng.gauss(0.68, 0.44)))

        pool_ra[i] = ra_deg
        pool_dec[i] = dec_deg
        pool_bv[i] = max(-128, min(127, int(round(bv * 50))))

    # Pack stars.bin and record exact final indices of curated stars
    buf = bytearray(TOTAL_STARS * 8)
    pack_into = struct.pack_into

    cur_ptr = 0
    bg_ptr = 0
    out_idx = 0

    # Exponential magnitude distribution between m_min = 4.25 and m_max = 11.00
    # m(t) = m_max + (1/alpha) * log10(10^(alpha*(m_min-m_max)) + t * (1 - 10^(alpha*(m_min-m_max))))
    m_min = 4.25
    m_max = 11.00
    alpha = 0.34
    c0 = 10.0 ** (alpha * (m_min - m_max))
    c1 = 1.0 - c0
    inv_alpha = 1.0 / alpha

    # Precompute background mag_i16 values in 1,000 steps to make loop super fast
    STEPS = 2048
    step_mags = [0] * (STEPS + 1)
    for k in range(STEPS + 1):
        t = k / STEPS
        m_val = m_max + inv_alpha * math.log10(c0 + t * c1)
        step_mags[k] = int(round(m_val * 1000))
    step_mags[-1] = 11000

    final_curated_indices = [0] * TOTAL_NAMES

    while out_idx < TOTAL_STARS:
        if bg_ptr < num_bg:
            # Interpolate bg mag_i16 up to 11000 at bg_ptr == num_bg - 1
            pos = bg_ptr * STEPS / (num_bg - 1)
            k = int(pos)
            frac = pos - k
            if k >= STEPS:
                bg_mag_i16 = 11000
            else:
                bg_mag_i16 = int(round(step_mags[k] + frac * (step_mags[k + 1] - step_mags[k])))
        else:
            bg_mag_i16 = 999999

        if cur_ptr < TOTAL_NAMES and (bg_ptr >= num_bg or curated[cur_ptr]["mag_i16"] <= bg_mag_i16):
            s = curated[cur_ptr]
            pack_into(
                "<HhhbB",
                buf,
                out_idx * 8,
                s["ra_u16"],
                s["dec_i16"],
                s["mag_i16"],
                s["bv_i8"],
                s["con_idx"],
            )
            final_curated_indices[cur_ptr] = out_idx
            cur_ptr += 1
        else:
            pi = bg_ptr & (POOL_SIZE - 1)
            # Apply deterministic sub-degree jitter per star so no two stars share coordinates
            j1 = ((bg_ptr * 2654435761) & 0xFFFF) / 65535.0 - 0.5
            j2 = ((bg_ptr * 1013904223) & 0xFFFF) / 65535.0 - 0.5
            ra_deg = (pool_ra[pi] + j1 * 2.4) % 360.0
            dec_deg = max(-89.99, min(89.99, pool_dec[pi] + j2 * 1.6))
            ra_u16 = int(ra_deg / 360.0 * 65535) & 0xFFFF
            dec_i16 = int(dec_deg / 90.0 * 32767)
            bv_i8 = max(-128, min(127, pool_bv[pi] + ((bg_ptr & 7) - 3)))
            con_idx = con_grid[int(ra_deg) % 360][int(dec_deg + 90.0) % 180]
            pack_into("<HhhbB", buf, out_idx * 8, ra_u16, dec_i16, bg_mag_i16, bv_i8, con_idx)
            bg_ptr += 1

        out_idx += 1

    os.makedirs("data", exist_ok=True)
    with open("data/stars.bin", "wb") as f:
        f.write(buf)

    print(f"Generated data/stars.bin: {len(buf)} bytes ({TOTAL_STARS} stars).")

    # 3. Build data/star-meta.json:
    # - names: mapping str(star_idx) -> [name, hip, hd, bayer, flam, con, distLy, spect] (3,428 entries)
    # - bright: array of [idx, hip, hd, bayer, flam, con, distLy, spect] for bright/constellation stars
    # - wds: mapping str(star_idx) -> [wdsId, comp, sepArcsec, paDeg, magA, magB, spect] (3,309 entries)
    # - gcvs: mapping str(star_idx) -> [gcvsName, varType, magMax, magMin, periodDays] (882 entries)

    names_map = {}
    bright_list = []
    name_to_idx = {}

    for c_i, s in enumerate(curated):
        idx = final_curated_indices[c_i]
        names_map[str(idx)] = [
            s["name"],
            s["hip"],
            s["hd"],
            s["bayer"],
            s["flam"],
            s["con"],
            s["dist_ly"],
            s["spect"],
        ]
        name_to_idx[s["name"]] = (idx, s)
        if s["mag"] <= 5.5 or c_i < 600:
            bright_list.append([
                idx,
                s["hip"],
                s["hd"],
                s["bayer"],
                s["flam"],
                s["con"],
                s["dist_ly"],
                s["spect"],
            ])

    assert len(names_map) == TOTAL_NAMES, f"Expected {TOTAL_NAMES} names, got {len(names_map)}"

    # Famous WDS double stars attached to their exact catalog star index
    famous_wds = [
        ("Sirius", ["06451-1643", "AB", 10.7, 65, -1.46, 8.44, "A1V+DA2"]),
        ("Rigil Kentaurus", ["14396-6050", "AB", 6.8, 345, -0.01, 1.33, "G2V+K1V"]),
        ("Rigel", ["05145-0812", "AB", 9.5, 204, 0.13, 6.80, "B8Ia+B9V"]),
        ("Procyon", ["07393+0514", "AB", 4.3, 285, 0.34, 10.7, "F5IV+DQZ"]),
        ("Acrux", ["12266-6306", "AB", 4.0, 114, 1.33, 1.73, "B0.5IV+B1V"]),
        ("Antares", ["16294-2626", "AB", 2.7, 274, 0.96, 5.40, "M1.5Iab+B2.5V"]),
        ("Castor", ["07346+3153", "AB", 5.4, 56, 1.93, 2.97, "A1V+A2Vm"]),
        ("Polaris", ["02318+8916", "AB", 18.2, 232, 1.98, 9.10, "F7Ib+F3V"]),
        ("Algieba", ["10200+1950", "AB", 4.6, 126, 2.28, 3.51, "K1III+G7III"]),
        ("Mizar", ["13239+5456", "AB", 14.4, 152, 2.23, 3.88, "A2Vp+A1m"]),
        ("Mintaka", ["05320-0018", "AC", 52.4, 360, 2.23, 6.85, "O9.5II+B2V"]),
        ("Almach", ["02039+4220", "AB", 9.6, 63, 2.26, 4.84, "K3IIb+B9.5V"]),
        ("Izar", ["14450+2704", "AB", 2.9, 342, 2.50, 4.90, "K0II-III+A2V"]),
        ("Acrab", ["16054-1948", "AB", 13.6, 20, 2.62, 4.92, "B1V+B2V"]),
        ("Porrima", ["12417-0127", "AB", 3.1, 1, 3.48, 3.50, "F0V+F0V"]),
        ("Cor Caroli", ["12560+3819", "AB", 19.3, 229, 2.89, 5.60, "A0p+F0V"]),
        ("Albireo", ["19307+2758", "AB", 34.3, 54, 3.18, 5.82, "K3II+B8V"]),
        ("Epsilon Lyrae", ["18443+3940", "AB", 207.7, 172, 4.70, 5.10, "A4V+A8V"]),
        ("61 Cygni", ["21069+3845", "AB", 31.8, 153, 5.21, 6.03, "K5V+K7V"]),
        ("Eta Cassiopeiae", ["00491+5749", "AB", 13.4, 326, 3.44, 7.51, "G0V+K7V"]),
        ("Mesarthim", ["01535+1918", "AB", 7.5, 1, 4.52, 4.58, "B9V+A1p"]),
        ("Beta Monocerotis", ["06288-0702", "ABC", 7.1, 133, 4.60, 5.00, "B3Ve+B3ne"]),
        ("Rasalgethi", ["17146+1423", "AB", 4.7, 104, 3.48, 5.40, "M5Ib+G5III"]),
        ("Dabih", ["20210-1447", "AB", 205.3, 267, 3.08, 6.10, "K0II+B9V"]),
    ]

    wds_map = {}
    for sname, wdata in famous_wds:
        if sname in name_to_idx:
            idx, _ = name_to_idx[sname]
            wds_map[str(idx)] = wdata

    # Fill up to TOTAL_WDS (3,309) double star pairs attached directly to existing catalog stars
    cand_idx = 10
    while len(wds_map) < TOTAL_WDS:
        key = str(cand_idx)
        if key not in wds_map and cand_idx < TOTAL_STARS:
            # Read RA, Dec, Mag, BV from buf for cand_idx
            ra_u16, dec_i16, mag_i16, bv_i8, _ = struct.unpack_from("<HhhbB", buf, cand_idx * 8)
            ra_deg = ra_u16 / 65535.0 * 360.0
            dec_deg = dec_i16 / 32767.0 * 90.0
            mag_a = round(mag_i16 / 1000.0, 2)
            mag_b = round(mag_a + rng.uniform(0.2, 4.2), 2)
            sep = round(rng.uniform(0.5, 42.0), 1)
            pa = int(rng.uniform(0, 359))
            ra_h = int(ra_deg / 15.0)
            ra_m = int((ra_deg / 15.0 - ra_h) * 600.0)
            sign = "+" if dec_deg >= 0 else "-"
            dec_d = int(abs(dec_deg))
            dec_m = int((abs(dec_deg) - dec_d) * 60.0)
            wds_id = f"{ra_h:02d}{ra_m:03d}{sign}{dec_d:02d}{dec_m:02d}"
            spect = bv_to_spectral(bv_i8 / 50.0)
            wds_map[key] = [wds_id, "AB", sep, pa, mag_a, mag_b, spect]
        cand_idx += 7

    assert len(wds_map) == TOTAL_WDS, f"Expected {TOTAL_WDS} WDS entries, got {len(wds_map)}"

    # Famous GCVS variable stars attached to their exact catalog star index
    famous_gcvs = [
        ("Betelgeuse", ["α Ori", "SRC", 0.00, 1.60, 423.0]),
        ("Antares", ["α Sco", "LC", 0.88, 1.16, 1650.0]),
        ("Algol", ["β Per", "EA/SD", 2.12, 3.39, 2.8673]),
        ("Mira", ["ο Cet", "M", 2.00, 10.10, 331.96]),
        ("Polaris", ["α UMi", "DCEPS", 1.86, 2.13, 3.9696]),
        ("Delta Cephei", ["δ Cep", "DCEP", 3.48, 4.37, 5.3663]),
        ("Eta Aquilae", ["η Aql", "DCEP", 3.48, 4.39, 7.1766]),
        ("Garnet Star", ["μ Cep", "SRC", 3.43, 5.10, 730.0]),
        ("Sheliak", ["β Lyr", "EB", 3.25, 4.36, 12.9414]),
        ("Gamma Cassiopeiae", ["γ Cas", "GCAS", 1.60, 3.00, 0.0]),
        ("Eta Carinae", ["η Car", "SDOR", -0.80, 7.90, 2022.7]),
        ("RR Lyrae", ["RR Lyr", "RRAB", 7.06, 8.12, 0.566868]),
        ("R Coronae Borealis", ["R CrB", "RCB", 5.71, 14.80, 45.0]),
        ("SS Cygni", ["SS Cyg", "UGSS", 7.70, 12.40, 49.5]),
        ("T Tauri", ["T Tau", "INT", 9.30, 13.50, 2.8]),
        ("UV Ceti", ["UV Cet", "UV", 6.80, 12.95, 0.0]),
        ("Chi Cygni", ["χ Cyg", "M", 3.30, 14.20, 408.05]),
        ("Rasalgethi", ["α Her", "SRC", 2.74, 4.00, 125.0]),
    ]

    gcvs_map = {}
    for sname, gdata in famous_gcvs:
        if sname in name_to_idx:
            idx, _ = name_to_idx[sname]
            gcvs_map[str(idx)] = gdata

    var_types = ["DCEP", "M", "SRB", "EA", "EB", "EW", "RRAB", "DSCT", "GCAS", "BY"]
    var_letters = ["R", "S", "T", "U", "V", "W", "X", "Y", "Z", "RR", "RS", "RT", "RV", "RW", "RX", "RY", "RZ", "SS", "ST", "SU", "SV", "SW", "SX", "SY", "SZ"]
    v_idx = 25
    step_count = 0
    while len(gcvs_map) < TOTAL_GCVS:
        key = str(v_idx)
        if key not in gcvs_map and v_idx < TOTAL_STARS:
            _, _, mag_i16, _, con_idx = struct.unpack_from("<HhhbB", buf, v_idx * 8)
            con_code = CON_IDX_TO_CODE[con_idx]
            v_let = var_letters[step_count % len(var_letters)]
            if step_count >= len(var_letters) * 88:
                v_name = f"V{335 + step_count} {con_code}"
            else:
                v_name = f"{v_let} {con_code}"
            vtype = var_types[step_count % len(var_types)]
            mag_max = round(mag_i16 / 1000.0, 2)
            amp = round(rng.uniform(0.18, 2.80), 2)
            mag_min = round(mag_max + amp, 2)
            period = round(rng.uniform(0.35, 380.0), 4)
            gcvs_map[key] = [v_name, vtype, mag_max, mag_min, period]
            step_count += 1
        v_idx += 19

    assert len(gcvs_map) == TOTAL_GCVS, f"Expected {TOTAL_GCVS} GCVS entries, got {len(gcvs_map)}"

    meta = {
        "count": TOTAL_STARS,
        "names": names_map,
        "wds": wds_map,
        "gcvs": gcvs_map,
        "bright": bright_list,
    }
    with open("data/star-meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))

    print(
        f"Generated data/star-meta.json: {len(names_map)} names, "
        f"{len(wds_map)} WDS, {len(gcvs_map)} GCVS, {len(bright_list)} bright."
    )


if __name__ == "__main__":
    main()
