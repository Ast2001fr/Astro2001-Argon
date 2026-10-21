# ✦ Uranométrie — Planétarium & Observatoire Web

Application web complète d'astronomie et de planétarium interactif, autonome et installable hors ligne (PWA), conçue en **ES Modules Vanilla JavaScript** sans dépendance externe pour un hébergement direct sur **GitHub Pages**.

---

## Fonctionnalités et Caractéristiques

| Domaine | État & Implémentation |
|---|---|
| **Quatre vues d'une même simulation** | ✅ **Vue terrestre** (dôme + sol + atmosphère), **Sphère céleste** (globe céleste), **Télescope** (champ circulaire à l'oculaire + chercheur 8×50), **Système solaire** (héliocentrique 3D orbitable) |
| **Ciel pour n'importe quel lieu et n'importe quelle date** | ✅ Fuseau horaire IANA du lieu, avance automatique du temps (pas et vitesse réglables de ×1 à ×3600), frise temporelle interactive sur 24 h |
| **Catalogue d'étoiles** | ✅ **ATHYG v3.2** (astronexus), **871 136** étoiles complètes jusqu'à la magnitude 11 (`data/stars.bin`), triées par magnitude ; **3 428** noms propres, puis désignation **HD / HIP / Bayer / Flamsteed** (`data/star-meta.json`) |
| **Catalogue d'objets du ciel profond** | ✅ **OpenNGC**, **15 618** objets (doublons Messier/NGC éliminés par construction, `data/openngc.json`) + **135 vraies photos** (`assets/dso/`) plaquées en fondu additif |
| **Relevé photographique du ciel** | ✅ Tuiles **HiPS DSS2 couleur** (CDS Strasbourg) chargées à la demande au fil de la navigation (indexation HEALPix nested), en alternative au fond intégré (Voie lactée + photos par objet, sans réseau) |
| **Voie lactée** | ✅ Panorama équirectangulaire (`assets/textures/milkyway.png`) plaqué par transformation inverse, luminosité réglable (0 % à 200 %) |
| **Étoiles doubles et variables** | ✅ **3 309** couples (**WDS**) et **882** variables (**GCVS**), rattachés directement à l'étoile du catalogue plutôt que dupliqués |
| **Constellations** | ✅ Lignes d'astérismes, noms traduits dans les 4 langues, **limites officielles UAI** (`data/constellations.json`) |
| **Fiche d'objet** | ✅ Six sections (**ce soir · physique · position · identité · à l'oculaire · en savoir plus**), échelle visuelle de magnitude, résumé **Wikipédia** (titre issu d'un index embarqué `data/wiki-index.json`, jamais deviné) |
| **Grilles de coordonnées** | ✅ **Azimutale (alt/az)** et **Équatoriale (AD/Déc)**, activables séparément, avec étiquettes + écliptique |
| **Planètes, Soleil, Lune** | ✅ **Vraies textures bitmap** (`assets/textures/*.png`) en projection orthographique, tailles angulaires réelles, phases, rotation axiale, anneaux de Saturne en 3D avec ombres |
| **Lunes** | ✅ Satellites galiléens de Jupiter (*Io, Europe, Ganymède, Callisto*) et lunes principales de Saturne (*Mimas, Encelade, Téthys, Dioné, Rhéa, Titan, Japet*), avec schéma « oculaire » dédié |
| **Astéroïdes** | ✅ **8** astéroïdes brillants (*Cérès, Pallas, Junon, Vesta, Hébé, Iris, Flora, Eunomia*), propagés depuis leurs éléments osculateurs (JPL SBDB, `data/asteroids.json`) |
| **ISS et satellites** | ✅ Passages sur 4 jours (heure, élévation max, trajectoire tracée, tag `visible`/`jour`/`éclipsé`) + simulation ; **177** satellites brillants en **SGP4**, TLE embarqué (`data/satellites-tle.json`) et actualisable depuis Celestrak |
| **Essaims de météores** | ✅ **13** essaims (`data/meteors.json`), radiant et taux horaire attendu (ZHR) ; pics calés sur la **longitude solaire ($\lambda_\odot$)** (valable pour n'importe quelle année) |
| **Éclipses et calendrier d'événements** | ✅ Éclipses de Lune et de Soleil, phases, périgée/apogée, oppositions, conjonctions, élongations — le bouton **« Simuler »** place la date, le lieu optimal et centre l'objet |
| **Panneau « Visibilité — nuit prochaine »** | ✅ Courbes de hauteur (bascule **Frise / Tableau**), bandeau résumé, bande de vraie nuit, repère « maintenant », navigation nuit précédente/suivante |
| **Crépuscules** | ✅ Panneau dédié (civil $-6^\circ$, nautique $-12^\circ$, astronomique $-18^\circ$, minuit solaire, durée de nuit noire) |
| **Météo** | ✅ Nébulosité horaire **Open-Meteo** (aujourd'hui + demain, totale / basse / moyenne / haute) pour le lieu observé ; se tait proprement hors ligne |
| **Choix du lieu** | ✅ **33 848** villes (`data/cities.json`), GPS, coordonnées manuelles, altitude |
| **« Mon horizon »** | ✅ Profil de ce qui bouche la vue dans les quatre directions (N, E, S, O + intercardinaux) : décale les heures de lever/coucher **et** dessine le relief |
| **Télescope et oculaires** | ✅ **12** marques / **78** modèles, **10** oculaires (`data/telescopes.json`), ou focales saisies à la main ; grossissement, champ réel (TFOV), pupille de sortie, détectabilité en brillance de surface |
| **Sélection, zoom, suivi** | ✅ Projection stéréographique, zoom molette vers le curseur, pan, clic ; centrer / suivre / tracer un objet |
| **Palette de commandes** | ✅ `⌘K` / `Ctrl-K` — objets et actions ; raccourcis clavier engendrés depuis le registre `js/features.js` |
| **Thèmes** | ✅ **Méridien**, **Classique**, **Observatoire**, **Céleste**, **Almanach**, **Vision nocturne** |
| **Hors ligne** | ✅ Service Worker (`sw.js`, installable en PWA) + **paquets optionnels** téléchargeables (`data/packs/wiki-<lang>.json`), avec vérification du quota disque |
| **Multilingue** | ✅ **Français, anglais, espagnol, allemand** (`js/i18n-<langue>.js`, un fichier par langue, seul celui de la langue affichée est chargé) |

---

## Structure du Dépôt

```text
├── index.html                  # Point d'entrée principal
├── manifest.json               # Manifeste PWA
├── sw.js                       # Service Worker hors-ligne & cache des paquets
├── css/
│   └── styles.css              # Feuille de style et 6 thèmes
├── js/
│   ├── app.js                  # Contrôleur principal de l'application
│   ├── features.js             # Registre central des vues, bascules, panneaux et raccourcis
│   ├── i18n.js                 # Chargeur dynamique exclusif de la langue active
│   ├── i18n-fr.js              # Français (par défaut)
│   ├── i18n-en.js              # Anglais
│   ├── i18n-es.js              # Espagnol
│   ├── i18n-de.js              # Allemand
│   ├── astro/
│   │   ├── time.js             # Jour Julien, ΔT, TSL, précession, réfraction, masse d'air
│   │   ├── solar-system.js     # Soleil, Lune, planètes, lunes de Jupiter/Saturne, 8 astéroïdes
│   │   ├── sgp4.js             # Propagateur orbital SGP4 et prédiction de passages sur 4 jours
│   │   └── events.js           # Éclipses, calendrier, 13 essaims (λ☉), crépuscules, lever/coucher
│   ├── render/
│   │   ├── projection.js       # Projections stéréographique, orthographique et 3D héliocentrique
│   │   ├── planet-shader.js    # Rendu orthographique des textures bitmap, phases et anneaux
│   │   ├── milkyway-hips.js    # Transformation inverse Voie lactée & tuiles HiPS DSS2 couleur
│   │   └── sky-renderer.js     # Moteur de rendu unifié des 4 vues
│   └── ui/
│       ├── object-card.js      # Fiche d'objet à 6 sections, échelle de magnitude, schéma lunes, Wikipédia
│       ├── panels.js           # Panneaux spécialisés (Nuit prochaine, Crépuscules, Météo, Satellites, etc.)
│       └── command-palette.js  # Palette de commandes ⌘K / Ctrl-K
├── data/
│   ├── stars.bin               # 871 136 étoiles ATHYG v3.2 triées par magnitude (binaire 8 octets/étoile)
│   ├── star-meta.json          # 3 428 noms propres, 3 309 couples WDS, 882 variables GCVS
│   ├── openngc.json            # 15 618 objets du ciel profond OpenNGC (sans doublons M/NGC)
│   ├── constellations.json     # 88 constellations UAI (lignes + limites officielles UAI)
│   ├── asteroids.json          # 8 astéroïdes brillants (éléments osculateurs JPL SBDB)
│   ├── satellites-tle.json     # 177 satellites brillants (TLE SGP4)
│   ├── meteors.json            # 13 essaims de météores
│   ├── cities.json             # 33 848 villes avec coordonnées, altitude et fuseau horaire
│   ├── telescopes.json         # 12 marques, 78 modèles de télescopes et 10 oculaires
│   ├── wiki-index.json         # Index embarqué des titres Wikipédia (FR, EN, ES, DE)
│   └── packs/                  # Paquets optionnels de résumés Wikipédia hors ligne
└── assets/
    ├── textures/               # Textures bitmap (Soleil, Lune, Planètes, Anneaux, Voie lactée)
    ├── dso/                    # 135 vraies photos d'objets du ciel profond
    └── icons/                  # Icônes PWA (192x192, 512x512)
```

---

## Lancement en local ou sur GitHub Pages

Aucun outil de build n'est requis. Pour tester localement :

```bash
python3 -m http.server 8080
```

Puis ouvrez `http://localhost:8080` dans votre navigateur.
