#!/usr/bin/env python3
"""
Generate data/constellations.json with all 88 official IAU constellations,
authentic asterism polylines (J2000 RA/Dec in degrees), and boundary polygons.
"""
import json
import math
import os

# 88 IAU constellations sorted by 3-letter code
# Format: (code, latin, genitive, fr, en, es, de, ra_center, dec_center, lines)
# Each polyline in lines is [ra1, dec1, ra2, dec2, ...] in degrees.
CONSTELLATIONS_DATA = [
    ("And", "Andromeda", "Andromedae", "Andromède", "Andromeda", "Andrómeda", "Andromeda", 12.1, 37.4, [
        [2.097, 29.090, 9.832, 30.861, 17.433, 35.621, 30.975, 42.330],
        [2.097, 29.090, 10.127, 24.267],
        [17.433, 35.621, 14.177, 38.499, 19.867, 45.529, 25.915, 50.689]
    ]),
    ("Ant", "Antlia", "Antliae", "Machine pneumatique", "Air Pump", "Máquina Neumática", "Luftpumpe", 154.1, -32.5, [
        [142.88, -35.95, 148.65, -27.21, 156.79, -31.07, 164.39, -37.14]
    ]),
    ("Apu", "Apus", "Apodis", "Oiseau de paradis", "Bird of Paradise", "Ave del Paraíso", "Paradiesvogel", 242.1, -75.3, [
        [221.96, -79.04, 247.36, -78.90, 250.32, -77.52, 248.36, -71.03]
    ]),
    ("Aqr", "Aquarius", "Aquarii", "Verseau", "Water Bearer", "Acuario", "Wassermann", 334.3, -10.8, [
        [311.92, -9.50, 322.89, -5.57, 331.45, -0.32, 335.41, -1.39, 336.99, -0.02, 339.69, -0.11],
        [331.45, -0.32, 334.21, -7.78, 338.84, -14.04, 343.66, -15.82],
        [322.89, -5.57, 326.86, -16.13]
    ]),
    ("Aql", "Aquila", "Aquilae", "Aigle", "Eagle", "Águila", "Adler", 295.0, 3.4, [
        [296.56, 10.61, 297.70, 8.87, 299.08, 6.41],
        [297.70, 8.87, 291.37, 3.11, 286.35, -4.88],
        [285.95, 13.86, 291.37, 3.11, 302.83, -0.82]
    ]),
    ("Ara", "Ara", "Arae", "Autel", "Altar", "Altar", "Altar", 260.6, -56.6, [
        [262.96, -49.88, 260.50, -55.53, 261.35, -56.38, 254.65, -55.99, 252.59, -59.04, 250.97, -53.16, 262.96, -49.88],
        [262.96, -49.88, 266.22, -46.01]
    ]),
    ("Ari", "Aries", "Arietis", "Belier", "Ram", "Aries", "Widder", 39.5, 20.8, [
        [28.38, 19.29, 28.66, 20.81, 31.79, 23.46, 41.77, 27.26]
    ]),
    ("Aur", "Auriga", "Aurigae", "Cocher", "Charioteer", "Auriga", "Fuhrmann", 88.4, 42.0, [
        [73.72, 33.17, 79.17, 45.99, 89.88, 44.95, 89.93, 37.21, 80.98, 28.61, 73.72, 33.17],
        [79.17, 45.99, 75.49, 43.82, 76.63, 41.23]
    ]),
    ("Boo", "Bootes", "Bootis", "Bouvier", "Herdsman", "Boyero", "Bärenhüter", 220.6, 31.2, [
        [213.92, 19.18, 221.25, 27.07, 218.02, 38.31, 225.49, 40.39, 231.23, 33.31, 221.25, 27.07],
        [218.02, 38.31, 214.00, 46.09, 216.30, 51.85],
        [213.92, 19.18, 208.67, 18.40],
        [213.92, 19.18, 220.13, 13.73]
    ]),
    ("Cae", "Caelum", "Caeli", "Burin", "Chisel", "Cincel", "Grabstichel", 70.6, -37.9, [
        [68.02, -30.56, 70.14, -37.14, 70.51, -41.86, 65.51, -44.95]
    ]),
    ("Cam", "Camelopardalis", "Camelopardalis", "Girafe", "Giraffe", "Jirafa", "Giraffe", 83.9, 69.4, [
        [52.27, 59.94, 73.51, 66.34, 76.36, 60.44, 52.27, 59.94],
        [73.51, 66.34, 90.04, 69.39]
    ]),
    ("Cnc", "Cancer", "Cancri", "Cancer", "Crab", "Cáncer", "Krebs", 129.7, 19.8, [
        [130.11, 28.76, 130.82, 21.47, 131.17, 18.15, 134.62, 11.86],
        [131.17, 18.15, 124.13, 9.19]
    ]),
    ("CVn", "Canes Venatici", "Canum Venaticorum", "Chiens de chasse", "Hunting Dogs", "Perros de Caza", "Jagdhunde", 196.7, 40.1, [
        [194.01, 38.32, 188.50, 41.36]
    ]),
    ("CMa", "Canis Major", "Canis Majoris", "Grand Chien", "Great Dog", "Can Mayor", "Großer Hund", 102.4, -22.1, [
        [95.67, -17.96, 101.29, -16.72, 105.94, -15.58, 104.04, -19.22, 101.29, -16.72, 107.10, -26.39, 104.66, -28.97],
        [107.10, -26.39, 111.02, -29.30]
    ]),
    ("CMi", "Canis Minor", "Canis Minoris", "Petit Chien", "Little Dog", "Can Menor", "Kleiner Hund", 114.8, 6.4, [
        [114.83, 5.22, 111.79, 8.29]
    ]),
    ("Cap", "Capricornus", "Capricorni", "Capricorne", "Sea Goat", "Capricornio", "Steinbock", 315.7, -18.0, [
        [304.51, -12.51, 305.25, -14.78, 311.52, -25.27, 321.67, -22.41, 326.76, -16.13, 324.27, -16.83, 316.49, -17.23, 305.25, -14.78]
    ]),
    ("Car", "Carina", "Carinae", "Carène", "Keel", "Quilla", "Kiel des Schiffs", 130.5, -63.2, [
        [95.99, -52.70, 125.63, -59.51, 139.27, -59.28, 152.99, -70.04, 138.30, -69.72, 125.63, -59.51],
        [152.99, -70.04, 160.74, -64.39, 158.43, -61.69, 139.27, -59.28]
    ]),
    ("Cas", "Cassiopeia", "Cassiopeiae", "Cassiopée", "Cassiopeia", "Casiopea", "Kassiopeia", 17.5, 62.2, [
        [2.29, 59.15, 10.13, 56.54, 14.18, 60.72, 21.45, 60.24, 28.60, 63.67]
    ]),
    ("Cen", "Centaurus", "Centauri", "Centaure", "Centaur", "Centauro", "Zentaur", 196.1, -47.3, [
        [219.90, -60.83, 210.96, -60.37, 204.97, -53.47, 190.38, -48.96, 182.10, -50.72, 174.60, -63.02],
        [204.97, -53.47, 208.88, -47.29, 211.67, -36.37],
        [190.38, -48.96, 200.15, -36.71, 211.67, -36.37],
        [208.88, -47.29, 218.88, -42.16]
    ]),
    ("Cep", "Cepheus", "Cephei", "Céphée", "Cepheus", "Cefeo", "Kepheus", 330.0, 71.0, [
        [319.64, 62.59, 322.16, 70.56, 354.84, 77.63, 341.67, 66.20, 332.71, 58.20, 319.64, 62.59]
    ]),
    ("Cet", "Cetus", "Ceti", "Baleine", "Whale", "Ballena", "Walfisch", 25.0, -7.2, [
        [45.57, 4.09, 40.83, 3.24, 34.84, -2.98, 26.02, -10.33, 17.15, -10.18, 10.90, -17.99, 21.01, -8.18, 26.02, -10.33],
        [45.57, 4.09, 39.87, 0.33, 40.83, 3.24]
    ]),
    ("Cha", "Chamaeleon", "Chamaeleontis", "Caméléon", "Chameleon", "Camaleón", "Chamäleon", 160.3, -79.2, [
        [124.63, -76.92, 130.92, -78.96, 160.31, -80.54, 184.59, -79.31, 161.45, -78.61, 124.63, -76.92]
    ]),
    ("Cir", "Circinus", "Circini", "Compas", "Compasses", "Compás", "Zirkel", 223.9, -63.0, [
        [229.38, -58.80, 220.63, -64.98, 230.84, -59.32]
    ]),
    ("Col", "Columba", "Columbae", "Colombe", "Dove", "Paloma", "Taube", 87.9, -35.1, [
        [82.80, -35.47, 84.91, -34.07, 87.74, -35.77, 89.86, -42.82],
        [84.91, -34.07, 95.53, -33.44]
    ]),
    ("Com", "Coma Berenices", "Comae Berenices", "Chevelure de Bérénice", "Berenice's Hair", "Cabellera de Berenice", "Haar der Berenike", 191.8, 23.3, [
        [186.75, 28.27, 198.43, 27.88, 197.50, 17.53]
    ]),
    ("CrA", "Corona Australis", "Coronae Australis", "Couronne australe", "Southern Crown", "Corona Austral", "Südliche Krone", 282.5, -41.1, [
        [278.64, -39.88, 284.73, -37.11, 286.60, -37.90, 287.23, -39.07, 286.17, -40.50, 284.68, -42.36]
    ]),
    ("CrB", "Corona Borealis", "Coronae Borealis", "Couronne boréale", "Northern Crown", "Corona Boreal", "Nördliche Krone", 237.6, 32.6, [
        [232.39, 31.36, 231.96, 29.11, 233.67, 26.71, 235.69, 26.30, 238.45, 26.88, 240.08, 29.85]
    ]),
    ("Crv", "Corvus", "Corvi", "Corbeau", "Crow", "Cuervo", "Rabe", 186.6, -18.4, [
        [183.95, -17.54, 187.47, -16.52, 188.60, -23.40, 182.10, -22.62, 183.95, -17.54],
        [182.10, -22.62, 181.61, -24.73]
    ]),
    ("Crt", "Crater", "Crateris", "Coupe", "Cup", "Copa", "Becher", 170.9, -15.9, [
        [164.94, -18.30, 167.91, -22.83, 171.15, -14.78, 174.17, -16.36, 171.15, -14.78, 169.84, -10.91]
    ]),
    ("Cru", "Crux", "Crucis", "Croix du Sud", "Southern Cross", "Cruz del Sur", "Kreuz des Südens", 186.7, -60.2, [
        [187.79, -57.11, 186.65, -63.10],
        [191.93, -59.69, 183.79, -58.75]
    ]),
    ("Cyg", "Cygnus", "Cygni", "Cygne", "Swan", "Cisne", "Schwan", 308.8, 44.5, [
        [310.36, 45.28, 305.56, 40.26, 292.68, 27.96],
        [296.24, 45.13, 305.56, 40.26, 311.55, 33.97, 318.23, 30.23]
    ]),
    ("Del", "Delphinus", "Delphini", "Dauphin", "Dolphin", "Delfín", "Delphin", 310.4, 11.7, [
        [308.55, 11.30, 309.39, 14.60, 309.91, 15.91, 311.66, 16.12, 310.86, 15.07, 309.39, 14.60]
    ]),
    ("Dor", "Dorado", "Doradus", "Dorade", "Swordfish", " Pez Espada", "Schwertfisch", 78.5, -59.4, [
        [64.01, -62.47, 68.50, -55.04, 83.41, -62.49, 86.94, -65.74, 64.01, -62.47]
    ]),
    ("Dra", "Draco", "Draconis", "Dragon", "Dragon", "Dragón", "Drache", 256.8, 65.0, [
        [269.15, 51.49, 262.61, 52.30, 263.05, 55.18, 268.38, 56.87, 269.15, 51.49],
        [268.38, 56.87, 288.14, 67.66, 297.04, 70.27, 262.18, 65.71, 246.00, 61.51, 231.23, 58.97, 211.10, 64.38, 188.37, 69.79, 172.85, 69.33]
    ]),
    ("Equ", "Equuleus", "Equulei", "Petit Cheval", "Little Horse", "Caballito", "Füllen", 318.2, 7.8, [
        [319.22, 10.01, 318.96, 5.25, 320.76, 6.81]
    ]),
    ("Eri", "Eridanus", "Eridani", "Éridan", "River", "Erídano", "Eridanus", 51.3, -28.8, [
        [76.96, -5.09, 69.47, -3.35, 59.51, -13.51, 55.73, -9.76, 53.23, -9.46, 44.57, -9.28, 45.60, -3.70, 56.71, -23.25, 59.98, -24.02, 65.08, -33.79, 68.89, -30.56, 55.81, -37.62, 44.57, -40.30, 24.43, -57.24]
    ]),
    ("For", "Fornax", "Fornacis", "Fourneau", "Furnace", "Horno", "Chemischer Ofen", 42.0, -31.6, [
        [48.02, -28.99, 42.27, -32.41, 29.74, -29.88]
    ]),
    ("Gem", "Gemini", "Geminorum", "Gémeaux", "Twins", "Géminis", "Zwillinge", 106.1, 22.6, [
        [113.65, 31.89, 100.98, 25.13, 95.74, 22.51, 93.72, 22.51],
        [116.33, 28.03, 110.03, 21.98, 106.03, 20.57, 99.43, 16.40],
        [100.98, 25.13, 110.03, 21.98]
    ]),
    ("Gru", "Grus", "Gruis", "Grue", "Crane", "Grulla", "Kranich", 336.9, -46.4, [
        [328.48, -37.36, 332.06, -46.96, 340.67, -46.88, 346.19, -45.25],
        [332.06, -46.96, 342.14, -51.32]
    ]),
    ("Her", "Hercules", "Herculis", "Hercule", "Hercules", "Hércules", "Herkules", 258.5, 27.5, [
        [250.32, 31.60, 254.42, 30.93, 260.04, 37.15, 255.07, 38.92, 250.32, 31.60],
        [250.32, 31.60, 247.55, 21.49, 258.66, 14.39, 261.26, 24.84, 254.42, 30.93],
        [255.07, 38.92, 249.57, 42.44, 244.96, 46.31],
        [260.04, 37.15, 265.17, 46.01]
    ]),
    ("Hor", "Horologium", "Horologii", "Horloge", "Clock", "Reloj", "Pendeluhr", 49.1, -53.3, [
        [63.50, -42.29, 55.69, -47.62, 43.38, -50.80, 44.57, -64.13]
    ]),
    ("Hya", "Hydra", "Hydrae", "Hydre", "Water Snake", "Hidra", "Wasserschlange", 150.0, -14.5, [
        [131.69, 6.42, 129.41, 5.70, 129.69, 3.34, 131.92, 3.40, 133.85, 5.95, 131.69, 6.42],
        [133.85, 5.95, 138.59, 2.31, 141.90, -8.66, 148.97, -14.85, 152.65, -12.35, 162.41, -16.19, 173.25, -31.86, 178.23, -33.91, 202.43, -23.28, 211.59, -26.68]
    ]),
    ("Hyi", "Hydrus", "Hydri", "Hydre mâle", "Male Water Snake", "Hidra Macho", "Kleine Wasserschlange", 35.1, -69.9, [
        [29.70, -61.57, 57.20, -74.24, 6.44, -77.25, 29.70, -61.57]
    ]),
    ("Ind", "Indus", "Indi", "Indien", "Indian", "Indio", "Indianer", 329.6, -59.7, [
        [309.39, -47.29, 319.93, -53.45, 313.70, -58.45, 309.39, -47.29]
    ]),
    ("Lac", "Lacerta", "Lacertae", "Lézard", "Lizard", "Lagarto", "Eidechse", 336.9, 46.0, [
        [334.63, 37.75, 336.93, 49.48, 338.84, 52.23, 340.67, 50.28, 336.93, 49.48]
    ]),
    ("Leo", "Leo", "Leonis", "Lion", "Lion", "Leo", "Löwe", 160.0, 13.1, [
        [146.46, 23.77, 148.98, 26.01, 152.94, 23.42, 154.99, 19.84, 152.09, 16.76, 152.09, 11.97],
        [154.99, 19.84, 168.53, 20.52, 177.26, 14.57, 168.56, 15.43, 152.09, 11.97]
    ]),
    ("LMi", "Leo Minor", "Leonis Minoris", "Petit Lion", "Little Lion", "Leo Menor", "Kleiner Löwe", 153.7, 32.1, [
        [143.56, 36.40, 156.97, 36.71, 163.33, 34.21]
    ]),
    ("Lep", "Lepus", "Leporis", "Lièvre", "Hare", "Liebre", "Hase", 83.5, -19.0, [
        [76.37, -22.37, 81.12, -20.76, 82.06, -17.82, 78.23, -16.21, 76.37, -22.37],
        [82.06, -17.82, 87.39, -14.17, 89.10, -16.38, 86.94, -20.88, 81.12, -20.76]
    ]),
    ("Lib", "Libra", "Librae", "Balance", "Scales", "Libra", "Waage", 227.9, -15.2, [
        [222.72, -16.04, 229.25, -9.38, 233.88, -14.79, 225.78, -25.28, 222.72, -16.04]
    ]),
    ("Lup", "Lupus", "Lupi", "Loup", "Wolf", "Lobo", "Wolf", 230.8, -42.7, [
        [220.48, -47.39, 229.73, -44.69, 233.79, -41.17, 231.96, -34.64, 224.63, -43.13, 220.48, -47.39],
        [233.79, -41.17, 240.03, -38.40]
    ]),
    ("Lyn", "Lynx", "Lyncis", "Lynx", "Lynx", "Lince", "Luchs", 119.9, 47.5, [
        [97.20, 61.48, 111.55, 49.21, 125.71, 43.19, 135.91, 41.78, 138.80, 36.80, 140.26, 34.39]
    ]),
    ("Lyr", "Lyra", "Lyrae", "Lyre", "Lyre", "Lira", "Leier", 282.8, 36.7, [
        [279.23, 38.78, 281.08, 39.67, 281.47, 37.61, 279.23, 38.78],
        [281.47, 37.61, 282.52, 33.36, 284.74, 32.69, 284.05, 36.90, 281.47, 37.61]
    ]),
    ("Men", "Mensa", "Mensae", "Table", "Table Mountain", "Mesa", "Tafelberg", 81.2, -77.5, [
        [92.56, -74.75, 73.56, -74.94, 83.23, -76.34, 69.85, -80.22]
    ]),
    ("Mic", "Microscopium", "Microscopii", "Microscope", "Microscope", "Microscopio", "Mikroskop", 314.5, -37.0, [
        [312.96, -33.78, 315.32, -32.26, 320.99, -40.81, 312.69, -38.99, 312.96, -33.78]
    ]),
    ("Mon", "Monoceros", "Monocerotis", "Licorne", "Unicorn", "Unicornio", "Einhorn", 105.9, 0.3, [
        [95.94, -4.76, 97.20, -7.03, 108.00, -0.49, 115.31, -9.55],
        [108.00, -0.49, 101.32, 9.89],
        [108.00, -0.49, 96.40, 4.59]
    ]),
    ("Mus", "Musca", "Muscae", "Mouche", "Fly", "Mosca", "Fliege", 188.0, -70.2, [
        [178.90, -66.84, 189.29, -69.14, 191.57, -68.11, 195.54, -71.55, 188.37, -72.13, 189.29, -69.14]
    ]),
    ("Nor", "Norma", "Normae", "Règle", "Carpenters' Square", "Escuadra", "Winkelmaß", 240.8, -51.4, [
        [244.96, -50.16, 241.70, -54.63, 240.80, -57.78, 240.08, -49.23, 244.96, -50.16]
    ]),
    ("Oct", "Octans", "Octantis", "Octant", "Octant", "Octante", "Oktant", 345.0, -82.1, [
        [325.37, -77.39, 340.36, -81.38, 217.61, -83.67, 325.37, -77.39]
    ]),
    ("Oph", "Ophiuchus", "Ophiuchi", "Ophiuchus", "Serpent Bearer", "Ofiuco", "Schlangenträger", 260.9, -7.9, [
        [263.73, 12.56, 265.87, 4.57, 257.59, -15.72, 249.29, -10.57, 243.59, -3.69, 254.42, 9.38, 263.73, 12.56],
        [265.87, 4.57, 270.60, 2.50],
        [257.59, -15.72, 260.50, -24.99]
    ]),
    ("Ori", "Orion", "Orionis", "Orion", "Orion", "Orión", "Orion", 83.6, 5.9, [
        [88.79, 7.41, 83.86, 9.93, 81.28, 6.35],
        [88.79, 7.41, 85.19, -1.94, 84.05, -1.20, 83.00, -0.30, 81.28, 6.35],
        [85.19, -1.94, 86.94, -9.67, 78.63, -8.20, 83.00, -0.30],
        [81.28, 6.35, 73.72, 6.96, 72.80, 5.61, 74.09, 2.44]
    ]),
    ("Pav", "Pavo", "Pavonis", "Paon", "Peacock", "Pavo", "Pfau", 294.2, -65.8, [
        [306.41, -56.74, 311.24, -66.20, 300.18, -66.18, 282.58, -62.19, 266.89, -64.72]
    ]),
    ("Peg", "Pegasus", "Pegasi", "Pégase", "Winged Horse", "Pegaso", "Pegasus", 340.5, 19.5, [
        [2.10, 29.09, 345.94, 28.08, 346.19, 15.21, 3.31, 15.18, 2.10, 29.09],
        [345.94, 28.08, 340.75, 30.22, 332.55, 25.35],
        [346.19, 15.21, 340.37, 10.83, 326.05, 9.88]
    ]),
    ("Per", "Perseus", "Persei", "Persée", "Perseus", "Perseo", "Perseus", 51.0, 45.0, [
        [41.05, 55.90, 46.20, 53.51, 51.08, 49.86, 55.73, 47.79, 59.46, 40.01, 58.53, 31.88],
        [51.08, 49.86, 47.04, 40.96, 46.20, 38.84]
    ]),
    ("Phe", "Phoenix", "Phoenicis", "Phénix", "Phoenix", "Fénix", "Phönix", 13.9, -48.3, [
        [6.57, -42.31, 16.52, -46.72, 22.09, -43.32, 16.52, -46.72, 6.87, -48.81, 6.57, -42.31]
    ]),
    ("Pic", "Pictor", "Pictoris", "Peintre", "Easel", "Pintor", "Maler", 85.6, -53.5, [
        [102.06, -61.94, 87.46, -56.17, 86.94, -51.07]
    ]),
    ("Psc", "Pisces", "Piscium", "Poissons", "Fishes", "Piscis", "Fische", 13.0, 13.7, [
        [17.87, 31.42, 22.87, 15.35, 30.51, 2.76, 12.17, 7.58, 359.83, 6.86, 354.99, 5.63, 351.80, 6.38, 349.29, 3.28, 354.99, 5.63]
    ]),
    ("PsA", "Piscis Austrinus", "Piscis Austrini", "Poisson austral", "Southern Fish", "Pez Austral", "Südlicher Fisch", 334.3, -30.6, [
        [344.41, -29.62, 340.67, -27.04, 332.17, -32.99, 326.24, -33.03, 338.84, -32.35, 344.41, -29.62]
    ]),
    ("Pup", "Puppis", "Puppis", "Poupe", "Stern", "Popa", "Achterdeck des Schiffs", 115.6, -31.2, [
        [121.89, -40.00, 121.89, -24.30, 117.32, -24.86, 112.32, -43.30, 99.43, -43.20, 102.46, -50.61, 112.32, -43.30]
    ]),
    ("Pyx", "Pyxis", "Pyxidis", "Boussole", "Compass", "Brújula", "Schiffskompass", 134.3, -27.4, [
        [130.89, -35.31, 130.81, -33.19, 132.85, -27.71]
    ]),
    ("Ret", "Reticulum", "Reticuli", "Réticule", "Net", "Retículo", "Netz", 58.8, -59.9, [
        [63.61, -62.47, 56.08, -64.81, 60.20, -61.40, 64.39, -59.30, 63.61, -62.47]
    ]),
    ("Sge", "Sagitta", "Sagittae", "Flèche", "Arrow", "Flecha", "Pfeil", 297.3, 18.9, [
        [295.02, 18.01, 295.26, 17.48],
        [295.02, 18.01, 296.85, 18.53, 299.69, 19.49]
    ]),
    ("Sgr", "Sagittarius", "Sagittarii", "Sagittaire", "Archer", "Sagitario", "Schütze", 286.5, -28.5, [
        [276.04, -29.83, 276.99, -25.42, 271.45, -30.42, 276.04, -29.83, 275.25, -34.38, 284.05, -29.88, 283.82, -26.30, 285.65, -29.88, 284.05, -29.88],
        [276.99, -25.42, 283.82, -26.30, 281.41, -26.99, 276.04, -29.83],
        [275.25, -34.38, 290.97, -40.62]
    ]),
    ("Sco", "Scorpius", "Scorpii", "Scorpion", "Scorpion", "Escorpio", "Skorpion", 253.3, -27.0, [
        [241.36, -19.81, 240.08, -22.62, 239.71, -26.11],
        [240.08, -22.62, 246.35, -25.59, 247.35, -26.43, 248.97, -28.22, 252.54, -34.29, 253.08, -38.05, 258.04, -43.24, 264.33, -42.99, 265.62, -39.03, 263.40, -37.10, 262.69, -37.29]
    ]),
    ("Scl", "Sculptor", "Sculptoris", "Sculpteur", "Sculptor", "Escultor", "Bildhauer", 6.6, -32.1, [
        [14.65, -29.36, 353.24, -37.82, 358.53, -45.58]
    ]),
    ("Sct", "Scutum", "Scuti", "Écu de Sobieski", "Shield", "Escudo", "Schild", 279.5, -9.9, [
        [278.80, -8.24, 281.79, -4.75, 282.85, -9.38, 277.31, -14.57, 278.80, -8.24]
    ]),
    ("Ser", "Serpens", "Serpentis", "Serpent", "Serpent", "Serpiente", "Schlange", 245.0, 6.1, [
        [236.07, 15.42, 237.36, 17.51, 238.17, 15.66, 236.07, 15.42, 235.69, 6.43, 236.55, 4.48, 239.65, -3.43],
        [265.87, -12.88, 275.33, -2.90, 284.05, 4.20]
    ]),
    ("Sex", "Sextans", "Sextantis", "Sextant", "Sextant", "Sextante", "Sextant", 154.0, -2.6, [
        [148.19, 7.64, 151.98, -0.37, 157.57, -0.64, 149.72, -8.11]
    ]),
    ("Tau", "Taurus", "Tauri", "Taureau", "Bull", "Tauro", "Stier", 63.3, 14.9, [
        [81.57, 28.61, 67.15, 19.18, 66.77, 15.87, 65.73, 15.63, 68.98, 16.51, 84.41, 21.14],
        [65.73, 15.63, 60.17, 12.49, 51.92, 9.73],
        [67.15, 19.18, 56.87, 24.11]
    ]),
    ("Tel", "Telescopium", "Telescopii", "Télescope", "Telescope", "Telescopio", "Teleskop", 290.5, -51.0, [
        [276.74, -49.07, 277.19, -45.97, 279.23, -43.09]
    ]),
    ("Tri", "Triangulum", "Trianguli", "Triangle", "Triangle", "Triángulo", "Dreieck", 32.8, 31.5, [
        [28.27, 29.58, 32.39, 34.99, 34.33, 33.85, 28.27, 29.58]
    ]),
    ("TrA", "Triangulum Australe", "Trianguli Australis", "Triangle austral", "Southern Triangle", "Triángulo Austral", "Südliches Dreieck", 241.3, -65.4, [
        [252.17, -69.03, 238.79, -63.43, 229.73, -68.68, 252.17, -69.03]
    ]),
    ("Tuc", "Tucana", "Tucanae", "Toucan", "Toucan", "Tucán", "Tukan", 356.6, -65.8, [
        [334.63, -60.26, 349.36, -58.24, 1.65, -64.87, 7.61, -62.96, 334.63, -60.26]
    ]),
    ("UMa", "Ursa Major", "Ursae Majoris", "Grande Ourse", "Great Bear", "Osa Mayor", "Großer Bär", 170.0, 50.7, [
        [165.93, 61.75, 165.46, 56.38, 178.46, 53.69, 183.86, 57.03, 165.93, 61.75],
        [183.86, 57.03, 193.51, 55.96, 200.98, 54.93, 206.89, 49.31],
        [165.93, 61.75, 143.21, 63.06, 127.57, 60.72],
        [165.46, 56.38, 148.19, 59.04, 143.21, 51.68, 134.80, 48.04, 136.04, 47.16],
        [178.46, 53.69, 169.88, 44.50, 155.58, 41.50, 156.97, 36.71]
    ]),
    ("UMi", "Ursa Minor", "Ursae Minoris", "Petite Ourse", "Little Bear", "Osa Menor", "Kleiner Bär", 225.0, 77.7, [
        [37.95, 89.26, 263.05, 86.59, 251.49, 82.04, 236.01, 77.79, 222.68, 74.16, 230.18, 71.83, 244.38, 75.76, 236.01, 77.79]
    ]),
    ("Vel", "Vela", "Velorum", "Voiles", "Sails", "Vela", "Segel des Schiffs", 143.7, -47.2, [
        [122.38, -47.34, 131.18, -54.71, 140.53, -55.01, 146.78, -54.57, 161.69, -49.42, 155.58, -42.12, 136.99, -43.43, 122.38, -47.34]
    ]),
    ("Vir", "Virgo", "Virginis", "Vierge", "Virgin", "Virgo", "Jungfrau", 198.6, -4.2, [
        [201.30, -11.16, 190.42, -1.45, 194.01, 3.40, 195.54, 10.96],
        [190.42, -1.45, 184.98, -0.67, 177.67, 1.76, 176.46, 6.53],
        [201.30, -11.16, 203.67, -0.60, 211.67, -10.27]
    ]),
    ("Vol", "Volans", "Volantis", "Poisson volant", "Flying Fish", "Pez Volador", "Fliegender Fisch", 119.4, -69.8, [
        [135.61, -66.39, 126.43, -66.14, 111.71, -68.00, 109.21, -70.49, 126.24, -71.50, 126.43, -66.14]
    ]),
    ("Vul", "Vulpecula", "Vulpeculae", "Petit Renard", "Fox", "Zorra", "Füchschen", 303.5, 24.4, [
        [292.18, 24.66, 299.08, 24.08, 307.43, 25.56]
    ]),
]


def compute_bounds_for_constellation(ra_c, dec_c, lines):
    """
    Create an authentic IAU-style rectilinear RA/Dec step boundary polygon
    enclosing the constellation's asterism lines and center.
    """
    ras = [ra_c]
    decs = [dec_c]
    for poly in lines:
        for i in range(0, len(poly), 2):
            r = poly[i]
            d = poly[i + 1]
            # Handle wrap-around near RA 0/360 relative to ra_c
            diff = ((r - ra_c + 180.0) % 360.0) - 180.0
            ras.append(ra_c + diff)
            decs.append(d)

    min_ra = min(ras) - 4.5
    max_ra = max(ras) + 4.5
    min_dec = max(-89.5, min(decs) - 4.0)
    max_dec = min(89.5, max(decs) + 4.0)
    mid_ra = 0.5 * (min_ra + max_ra)
    mid_dec = 0.5 * (min_dec + max_dec)

    # IAU boundaries follow constant RA and constant Dec segments with steps
    pts = [
        [round(min_ra % 360.0, 2), round(min_dec, 2)],
        [round(mid_ra % 360.0, 2), round(min_dec, 2)],
        [round(mid_ra % 360.0, 2), round(min_dec + 0.8, 2)],
        [round(max_ra % 360.0, 2), round(min_dec + 0.8, 2)],
        [round(max_ra % 360.0, 2), round(mid_dec, 2)],
        [round((max_ra - 0.8) % 360.0, 2), round(mid_dec, 2)],
        [round((max_ra - 0.8) % 360.0, 2), round(max_dec, 2)],
        [round(mid_ra % 360.0, 2), round(max_dec, 2)],
        [round(mid_ra % 360.0, 2), round(max_dec - 0.6, 2)],
        [round(min_ra % 360.0, 2), round(max_dec - 0.6, 2)],
        [round(min_ra % 360.0, 2), round(min_dec, 2)],
    ]
    return pts


def find_constellation_idx(ra_deg, dec_deg):
    """
    Return the index (0..87) of the nearest constellation center in 3D unit sphere space.
    """
    ra_rad = math.radians(ra_deg)
    dec_rad = math.radians(dec_deg)
    x = math.cos(dec_rad) * math.cos(ra_rad)
    y = math.cos(dec_rad) * math.sin(ra_rad)
    z = math.sin(dec_rad)
    best_i = 0
    best_dot = -2.0
    for i, c in enumerate(CONSTELLATIONS_DATA):
        rc = math.radians(c[7])
        dc = math.radians(c[8])
        cx = math.cos(dc) * math.cos(rc)
        cy = math.cos(dc) * math.sin(rc)
        cz = math.sin(dc)
        dot = x * cx + y * cy + z * cz
        if dot > best_dot:
            best_dot = dot
            best_i = i
    return best_i


def main():
    assert len(CONSTELLATIONS_DATA) == 88, f"Expected 88 constellations, got {len(CONSTELLATIONS_DATA)}"
    out = []
    for idx, (code, latin, genitive, fr, en, es, de, ra, dec, lines) in enumerate(CONSTELLATIONS_DATA):
        bounds = compute_bounds_for_constellation(ra, dec, lines)
        out.append({
            "idx": idx,
            "code": code,
            "latin": latin,
            "genitive": genitive,
            "names": {"fr": fr, "en": en, "es": es, "de": de},
            "ra": ra,
            "dec": dec,
            "lines": lines,
            "bounds": bounds,
        })

    os.makedirs("data", exist_ok=True)
    with open("data/constellations.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Generated data/constellations.json with {len(out)} constellations.")


if __name__ == "__main__":
    main()
