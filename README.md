# CAD VR Viewer

Przeglądarka modeli CAD (STEP / IGES, np. eksport z SolidWorksa) w przeglądarce PC i w goglach Meta Quest (VR oraz AR/passthrough). Działa w całości w przeglądarce, bez instalacji. Pliki modeli nie są nigdzie wysyłane: plik jest odczytywany lokalnie na urządzeniu.

**Uruchom:** https://tevenenrk.github.io/VR-CAD-viewer/

**Model testowy od razu po otwarciu:** https://tevenenrk.github.io/VR-CAD-viewer/?model=test/test_zlozenie.step
(po wczytaniu przestaw w panelu „Góra: Z”).

## Sterowanie

**PC:** lewy przycisk myszy – obrót, prawy – przesuw, kółko – zoom, klik – nazwa części.

**Meta Quest:**

| Przycisk | Działanie |
|---|---|
| Grip (boczny) | chwyć i obracaj cały model |
| Spust | wskaż część, pokaże nazwę |
| Prawa gałka góra/dół | powiększ / pomniejsz |
| A / X | przełącz: „na stole” ↔ skala 1:1 |
| B / Y | reset pozycji modelu |

## Stan

v0.1: wczytanie STEP, drzewo części z nazwami, kolory, wskazywanie części, wymiary, wejście w VR/AR.
Tryb VR/AR i kontrolery czekają na test na goglach.

## Pliki

- `index.html` – cały program.
- `test/test_zlozenie.step` – małe złożenie testowe (własne, wygenerowane skryptem).
- `test/make_test_step.py` – generator złożenia testowego (CadQuery).
- `test/run_headless.py` – automatyczny test w Chrome bez okna (Playwright). Przed pierwszym uruchomieniem:
  `pip install playwright` oraz w folderze projektu `npm install --no-save three@0.187.0 occt-import-js@0.0.23`.

## Uwaga

Repozytorium jest publiczne. Pliki STEP klientów nie trafiają do repozytorium: blokuje je `.gitignore`.

Biblioteki: [three.js](https://threejs.org/) 0.187.0, [occt-import-js](https://github.com/kovacsv/occt-import-js) 0.0.23 (OpenCascade).
