# Enllaç punt a punt — simulador d'enllaços de microones

Aplicació web educativa per al mòdul **0365 – Radiocomunicacions** (grau mitjà de telecomunicacions).
Tres simuladors que comparteixen els mateixos paràmetres:

1. **Balanç de potències** — esquema animat de l'enllaç (TX → cable → antena → espai lliure → antena → cable → RX),
   diagrama de nivells alineat amb l'esquema, cascada del balanç, corbes PRX–distància i PRX–freqüència,
   indicador de marge i explicació matemàtica pas a pas.
2. **Antenes i orientació** — vista en planta i vista lateral interactives (les antenes es giren arrossegant-les),
   diagrames polars horitzontal i vertical, guanys nominals i efectius, pèrdues per desalineació i botó
   «Alinear antenes».
3. **Visibilitat i Fresnel** — mapa interactiu per situar els dos extrems, perfil d'elevació real del terreny,
   línia de visió, 1a zona de Fresnel, curvatura terrestre (factor k), obstacles afegits per l'usuari,
   estimació de la pèrdua per difracció i altura d'antena necessària.

També inclou escenaris didàctics, comparació amb una configuració de referència, missatges de variació
generats a partir dels càlculs, mode explicació, tooltips de conceptes i tema clar/fosc.

## Publicació

`index.html` (a l'arrel) és la pàgina final: un sol fitxer autònom que es genera amb `npm run build`.
Per publicar-la a GitHub Pages: *Settings → Pages → Deploy from a branch → `main` / (root)*.
Quedarà a `https://ddelapaz1.github.io/calcul_puntapunt/`.

També funciona obrint `index.html` directament amb el navegador. Els simuladors 1 i 2 no necessiten
connexió; el 3 la necessita per al mapa i les cotes del terreny (té un mode «terreny d'exemple» sense connexió).

### Serveis externs del simulador 3

| Ús | Servei |
| --- | --- |
| Mapa de fons | OpenTopoMap, OpenStreetMap, Esri World Imagery |
| Cotes del terreny | Open-Meteo Elevation API (Copernicus DEM GLO-90); alternativa OpenTopoData (SRTM 90 m) |
| Cerca de llocs | Nominatim (OpenStreetMap) |

La biblioteca de mapes [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2-Clause) s'inclou a `src/vendor/leaflet/`.

## Desenvolupament

Requereix Node.js 18 o superior (no hi ha dependències npm).

```bash
npm test          # proves automàtiques dels càlculs
npm run build     # regenera index.html a partir de src/
npm run serve     # serveix src/ a http://localhost:8080 per treballar amb el codi font
```

### Estructura

```
src/
  index.html, css/styles.css, vendor/leaflet/
  js/engine/        Càlculs (sense DOM, provats amb node --test)
    linkBudget.js   FSPL, PIRE, potència rebuda, marge, cascada
    antennas.js     Models didàctics de radiació (parabòlica, panell, Yagi, omni)
    fresnel.js      Zona de Fresnel, curvatura terrestre, difracció, anàlisi del perfil
    geo.js          Distància, rumb i punts intermedis sobre la Terra
    geometry.js     Geometria de l'enllaç i coordenades locals de les antenes
    model.js        Estat per defecte i avaluació completa (un sol estat compartit)
    messages.js     Missatges de variació generats a partir dels càlculs
  js/state.js       Estat únic + subscripció
  js/scenarios.js   Escenaris i trajectes d'exemple
  js/ui/            Vistes: esquema, gràfiques, planta, vista lateral, polars, mapa, perfil…
tests/
build.mjs           Empaqueta src/ en index.html
```

## Model físic

* FSPL = 32,45 + 20·log₁₀(d km) + 20·log₁₀(f MHz) — només depèn de d i f.
* P_RX = P_TX − L_TX + G_TX,ef − FSPL − L_obs + G_RX,ef − L_RX ; M = P_RX − S_RX ; PIRE = P_TX − L_TX + G_TX.
* Antenes: ample de feix derivat del guany (aproximació de Kraus) i diagrama d'obertura calibrat perquè el
  punt de −3 dB hi coincideixi; la pèrdua per desalineació surt sempre del diagrama.
* Fresnel: r₁ = √(λ·d₁·d₂/d); protuberància terrestre h = d₁·d₂/(2·k·R); criteri per defecte: 60 % de r₁ lliure.
* Difracció (L_obs): una sola aresta de ganivet sobre l'obstacle dominant, J(v) segons ITU-R P.526.
  Només s'aplica si el perfil correspon a la distància actual de l'enllaç.
* Són **models didàctics**. No es consideren difraccions múltiples, reflexions, multitrajecte, pluja ni soroll.

### Cas de referència validat per les proves

PTX 20 dBm, 5,8 GHz, 2 km, cables 2 dB, antenes 20 dBi, sensibilitat −80 dBm →
FSPL 113,74 dB · PRX −57,74 dBm · marge 22,26 dB.
